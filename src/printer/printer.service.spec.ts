import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { validateEnv } from '../config';
import { PrinterService } from './printer.service';

describe('config', () => {
  it('applies defaults and parses case-insensitively', () => {
    const env = validateEnv({
      PRINTER_TYPE: 'EPSON',
      PRINTER_CHARACTER_SET: 'pc858_euro',
      PRINTER_WIDTH: '42',
      PRINTER_CUT_AFTER_JOB: 'false',
      API_KEY: '',
    });
    expect(env).toMatchObject({
      PORT: 3000,
      PRINTER_TYPE: 'epson',
      PRINTER_CHARACTER_SET: 'PC858_EURO',
      PRINTER_WIDTH: 42,
      PRINTER_CUT_AFTER_JOB: false,
      PRINTER_BREAK_LINE: 'WORD',
      PRINTER_INTERFACE: '/dev/usb/lp0',
    });
    expect(env.API_KEY).toBeUndefined();
  });

  it('rejects bad values', () => {
    expect(() => validateEnv({ PRINTER_TYPE: 'hp' })).toThrow(/PRINTER_TYPE/);
    expect(() => validateEnv({ PRINTER_WIDTH: 'abc' })).toThrow(
      /PRINTER_WIDTH/,
    );
  });
});

describe('PrinterService', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'tp-')), 'printer.bin');
  writeFileSync(out, '');
  const service = new PrinterService(
    validateEnv({
      PRINTER_INTERFACE: out,
      PRINTER_CHARACTER_SET: 'PC858_EURO',
    }),
  );

  it('renders every command type and cuts by default', async () => {
    // 8x8 black PNG
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAIElEQVR4AYXBAQEAAAiAIPP/53qQMMDykCBBggQJEiQcDFMBD2KE+E8AAAAASUVORK5CYII=';
    const buf = await service.build({
      commands: [
        {
          type: 'text',
          text: 'Hello €',
          bold: true,
          align: 'center',
          width: 2,
          height: 2,
        },
        { type: 'newLine', count: 2 },
        { type: 'line' },
        { type: 'leftRight', left: 'A', right: 'B' },
        {
          type: 'table',
          cells: [
            { text: 'x', width: 0.5 },
            { text: 'y', align: 'right' },
          ],
        },
        { type: 'qr', data: 'qr-data' },
        { type: 'barcode', data: '12345' },
        { type: 'image', data: png },
        { type: 'beep' },
        { type: 'cashDrawer' },
        { type: 'raw', data: Buffer.from('RAW').toString('base64') },
      ],
    });
    const s = buf.toString('latin1');
    expect(s).toContain('Hello');
    expect(s).toContain('qr-data');
    expect(s).toContain('RAW');
    expect(s).toContain('\x1d\x56'); // GS V = cut
  });

  it('skips the cut when asked', async () => {
    const buf = await service.build({
      commands: [{ type: 'text', text: 'x' }],
      cut: false,
    });
    expect(buf.toString('latin1')).not.toContain('\x1d\x56');
  });

  it('maps broken command content to 400', async () => {
    await expect(
      service.build({ commands: [{ type: 'image', data: 'bm90IGEgcG5n' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes to the interface and serializes concurrent jobs', async () => {
    const results = await Promise.all([
      service.printRaw(Buffer.from('one')),
      service.printRaw(Buffer.from('two')),
    ]);
    expect(results.map((r) => r.bytes)).toEqual([3, 3]);
    expect(readFileSync(out, 'latin1')).toBe('two');
  });

  it('returns 503 when the printer is missing', async () => {
    const missing = new PrinterService(
      validateEnv({ PRINTER_INTERFACE: '/nope/lp0' }),
    );
    expect((await missing.status()).connected).toBe(false);
    await expect(missing.printRaw(Buffer.from('x'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
