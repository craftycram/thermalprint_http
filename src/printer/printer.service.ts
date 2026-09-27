import { access, constants } from 'fs/promises';
import {
  BadRequestException,
  BeforeApplicationShutdown,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThermalPrinter } from 'node-thermal-printer';
import { Env } from '../config';
import {
  Align,
  PrintCommand,
  PrinterStatusDto,
  PrintJobDto,
  PrintResultDto,
} from './print.dto';

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

/** The lib spreads settings over its defaults, so undefined keys would erase them. */
const defined = <T extends object>(o: T) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as Partial<T>;

@Injectable()
export class PrinterService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(PrinterService.name);
  // ponytail: single in-process queue so concurrent jobs never interleave on one printer
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly env: Env) {}

  /** Let the running/queued jobs finish so a SIGTERM never cuts a receipt in half. */
  async beforeApplicationShutdown() {
    await this.queue;
  }

  private create() {
    return new ThermalPrinter({
      type: this.env.PRINTER_TYPE,
      interface: this.env.PRINTER_INTERFACE,
      width: this.env.PRINTER_WIDTH,
      characterSet: this.env.PRINTER_CHARACTER_SET,
      removeSpecialCharacters: this.env.PRINTER_REMOVE_SPECIAL_CHARACTERS,
      lineCharacter: this.env.PRINTER_LINE_CHARACTER,
      breakLine: this.env.PRINTER_BREAK_LINE,
      options: { timeout: this.env.PRINTER_TIMEOUT },
    });
  }

  /** Returns why the printer can't be used, or undefined if it looks fine. */
  private async unavailableReason(): Promise<string | undefined> {
    const iface = this.env.PRINTER_INTERFACE;
    if (/^tcp:\/\//i.test(iface)) {
      return (await this.create().isPrinterConnected())
        ? undefined
        : `cannot connect to ${iface}`;
    }
    try {
      await access(iface, constants.W_OK);
    } catch (e) {
      return `cannot write to ${iface} (${(e as NodeJS.ErrnoException).code})`;
    }
  }

  async status(): Promise<PrinterStatusDto> {
    const reason = await this.unavailableReason();
    return {
      connected: !reason,
      error: reason,
      type: this.env.PRINTER_TYPE,
      interface: this.env.PRINTER_INTERFACE,
      width: this.env.PRINTER_WIDTH,
      characterSet: this.env.PRINTER_CHARACTER_SET,
    };
  }

  async print(job: PrintJobDto): Promise<PrintResultDto> {
    return this.send(await this.build(job));
  }

  printText(text: string, cut?: boolean) {
    return this.print({
      commands: text
        .split(/\r?\n/)
        .map((line) => ({ type: 'text', text: line })),
      cut,
    });
  }

  printImage(png: Buffer, cut?: boolean) {
    return this.print({
      commands: [{ type: 'image', data: png.toString('base64') }],
      cut,
    });
  }

  printTestPage() {
    return this.print({
      commands: [
        {
          type: 'text',
          text: 'TEST PAGE',
          align: 'center',
          bold: true,
          width: 2,
          height: 2,
        },
        { type: 'line' },
        { type: 'leftRight', left: 'Type', right: this.env.PRINTER_TYPE },
        {
          type: 'leftRight',
          left: 'Interface',
          right: this.env.PRINTER_INTERFACE,
        },
        {
          type: 'leftRight',
          left: 'Width',
          right: String(this.env.PRINTER_WIDTH),
        },
        {
          type: 'leftRight',
          left: 'Charset',
          right: this.env.PRINTER_CHARACTER_SET,
        },
        { type: 'line' },
        { type: 'text', text: 'Normal ' },
        { type: 'text', text: 'Bold', bold: true },
        { type: 'text', text: 'Underline', underline: true },
        { type: 'text', text: ' Inverted ', invert: true },
        { type: 'text', text: 'Font B', font: 'B' },
        { type: 'text', text: 'Right', align: 'right' },
        { type: 'text', text: 'Umlauts: äöüß € ñ é', align: 'center' },
        { type: 'newLine' },
        {
          type: 'qr',
          data: 'https://github.com/Klemen1337/node-thermal-printer',
        },
        { type: 'barcode', data: '123456789012' },
        { type: 'text', text: new Date().toISOString(), align: 'center' },
      ],
    });
  }

  printRaw(data: Buffer) {
    return this.send(data);
  }

  /** Renders commands into an ESC/POS buffer. Bad command content -> 400. */
  async build(job: PrintJobDto): Promise<Buffer> {
    const p = this.create();
    try {
      for (const cmd of job.commands) await this.apply(p, cmd);
      if (job.cut ?? this.env.PRINTER_CUT_AFTER_JOB) p.cut();
    } catch (e) {
      throw new BadRequestException(`Invalid print job: ${errorMessage(e)}`);
    }
    return p.getBuffer() ?? Buffer.alloc(0);
  }

  private async apply(p: ThermalPrinter, cmd: PrintCommand) {
    switch (cmd.type) {
      case 'text':
        this.align(p, cmd.align);
        if (cmd.bold) p.bold(true);
        if (cmd.underline) p.underline(true);
        if (cmd.invert) p.invert(true);
        if (cmd.upsideDown) p.upsideDown(true);
        if (cmd.font === 'B') p.setTypeFontB();
        if (cmd.width || cmd.height)
          p.setTextSize((cmd.height ?? 1) - 1, (cmd.width ?? 1) - 1);
        if (cmd.newLine === false) p.print(cmd.text);
        else p.println(cmd.text);
        this.reset(p);
        break;
      case 'newLine':
        for (let i = 0; i < (cmd.count ?? 1); i++) p.newLine();
        break;
      case 'line':
        p.drawLine(cmd.character);
        break;
      case 'leftRight':
        p.leftRight(cmd.left, cmd.right);
        break;
      case 'table':
        p.tableCustom(
          cmd.cells.map((c) => ({
            text: c.text,
            align: c.align?.toUpperCase() as 'LEFT' | 'CENTER' | 'RIGHT',
            width: c.width,
            bold: c.bold,
          })),
        );
        break;
      case 'qr':
        this.align(p, cmd.align ?? 'center');
        p.printQR(
          cmd.data,
          defined({ cellSize: cmd.cellSize, correction: cmd.correction }),
        );
        p.newLine();
        this.reset(p);
        break;
      case 'barcode':
        this.align(p, cmd.align ?? 'center');
        p.printBarcode(
          cmd.data,
          cmd.barcodeType ?? 73,
          defined({
            width: cmd.width,
            height: cmd.height,
            hriPos: cmd.hriPos ?? 2,
          }),
        );
        p.newLine();
        this.reset(p);
        break;
      case 'image':
        this.align(p, cmd.align ?? 'center');
        await p.printImageBuffer(Buffer.from(cmd.data, 'base64'));
        this.reset(p);
        break;
      case 'cut':
        if (cmd.partial) p.partialCut();
        else p.cut();
        break;
      case 'beep':
        p.beep(cmd.count ?? 1, cmd.duration ?? 1);
        break;
      case 'cashDrawer':
        p.openCashDrawer();
        break;
      case 'raw':
        p.add(Buffer.from(cmd.data, 'base64'));
        break;
    }
  }

  private align(p: ThermalPrinter, align?: Align) {
    if (align === 'center') p.alignCenter();
    else if (align === 'right') p.alignRight();
  }

  private reset(p: ThermalPrinter) {
    p.alignLeft();
    p.setTextNormal();
    p.setTypeFontA();
    p.bold(false);
    p.underline(false);
    p.invert(false);
    p.upsideDown(false);
  }

  /** Sends bytes to the printer, one job at a time. */
  private send(data: Buffer): Promise<PrintResultDto> {
    const run = async () => {
      const reason = await this.unavailableReason();
      if (reason)
        throw new ServiceUnavailableException(`Printer unavailable: ${reason}`);
      const started = Date.now();
      try {
        // ponytail: lib's file interface keeps retrying writes in the background after its 5s timeout
        await this.create().raw(data);
      } catch (e) {
        if (e instanceof HttpException) throw e;
        this.logger.error(`Print failed: ${errorMessage(e)}`);
        throw new ServiceUnavailableException(
          `Printer error: ${errorMessage(e)}`,
        );
      }
      const durationMs = Date.now() - started;
      this.logger.log(`Printed ${data.length} bytes in ${durationMs}ms`);
      return { success: true, bytes: data.length, durationMs };
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
