import {
  All,
  Controller,
  Post,
  Req,
  Res,
  ValidationPipe,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response } from 'express';
import { z } from 'zod';
import { pkg } from './config';
import { PrintJobDto } from './printer/print.dto';
import { PrinterService } from './printer/printer.service';

// same options as the global pipe in main.ts
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const COMMANDS_HELP = `Commands run in order; styles apply only to the command they're set on.
- {type:"text", text, align?:"left"|"center"|"right", bold?, underline?, invert?, upsideDown?, font?:"A"|"B", width?:1-8, height?:1-8, newLine?:true}
- {type:"newLine", count?}
- {type:"line", character?}
- {type:"leftRight", left, right}
- {type:"table", cells:[{text, align?, width?:fraction 0-1, bold?}]}
- {type:"qr", data, cellSize?:1-8, correction?:"L"|"M"|"Q"|"H", align?}
- {type:"barcode", data, barcodeType?:65-79 (67 EAN13, 73 CODE128 default), width?, height?, hriPos?:0-3, align?}
- {type:"cut", partial?}
- {type:"beep", count?, duration?}
- {type:"cashDrawer"}`;

/** Streamable HTTP MCP endpoint (stateless), so Claude Desktop/web can print via a custom connector. */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(private readonly printer: PrinterService) {}

  private server() {
    const server = new McpServer({ name: pkg.name, version: pkg.version });
    const run = async (fn: () => Promise<unknown>) => {
      try {
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(await fn()) },
          ],
        };
      } catch (e) {
        const msg = (e as { response?: { message?: unknown } }).response
          ?.message;
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(msg ?? (e as Error).message),
            },
          ],
        };
      }
    };

    server.registerTool(
      'printer_status',
      {
        description:
          'Printer config (type, characters per line) and whether it is reachable',
      },
      () => run(() => this.printer.status()),
    );
    server.registerTool(
      'print_text',
      {
        description: 'Print plain text on the thermal receipt printer',
        inputSchema: {
          text: z.string().min(1).describe('Plain text, \\n for line breaks'),
          cut: z.boolean().optional().describe('Cut after printing'),
        },
      },
      ({ text, cut }) => run(() => this.printer.printText(text, cut)),
    );
    server.registerTool(
      'print_job',
      {
        description: `Print a formatted receipt on the thermal printer. Call printer_status first to learn the line width.\n${COMMANDS_HELP}`,
        inputSchema: {
          // ponytail: loose schema here, the existing class-validator DTOs do the real validation
          commands: z.array(z.looseObject({ type: z.string() })).min(1),
          cut: z.boolean().optional().describe('Cut after printing'),
        },
      },
      (args) =>
        run(async () => {
          const job = (await validation.transform(args, {
            type: 'body',
            metatype: PrintJobDto,
          })) as PrintJobDto;
          return this.printer.print(job);
        }),
    );
    server.registerTool(
      'print_test_page',
      { description: 'Print a test page' },
      () => run(() => this.printer.printTestPage()),
    );
    return server;
  }

  @Post()
  async handle(@Req() req: Request, @Res() res: Response) {
    const server = this.server();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @All()
  notAllowed(@Res() res: Response) {
    res.status(405).set('Allow', 'POST').end();
  }
}
