import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  ParseBoolPipe,
  ParseFilePipe,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../api-key.guard';
import { env, pkg } from '../config';
import { getHello } from '../motd';
import {
  COMMAND_CLASSES,
  PrinterStatusDto,
  PrintJobDto,
  PrintRawDto,
  PrintResultDto,
  PrintTextDto,
} from './print.dto';
import { PrinterService } from './printer.service';

const MB = 1024 * 1024;

@Controller()
@ApiSecurity('api-key')
@ApiExtraModels(...Object.values(COMMAND_CLASSES))
@ApiUnauthorizedResponse({
  description: 'API_KEY is set and the request lacks it',
})
export class PrinterController {
  constructor(private readonly printer: PrinterService) {}

  @Public()
  @Get()
  @ApiTags('meta')
  @ApiOperation({ summary: 'this shows service information' })
  info(@Ip() ip: string) {
    return getHello(ip, pkg.version);
  }

  @Public()
  @Get('health')
  @ApiTags('meta')
  @ApiOperation({
    summary: 'Health check, 503 when the printer is unreachable',
  })
  @ApiOkResponse({ type: PrinterStatusDto })
  @ApiServiceUnavailableResponse()
  async health() {
    const status = await this.printer.status();
    if (!status.connected) throw new ServiceUnavailableException(status);
    return status;
  }

  @Get('printer/status')
  @ApiTags('printer')
  @ApiOperation({ summary: 'Printer configuration and reachability' })
  @ApiOkResponse({ type: PrinterStatusDto })
  status() {
    return this.printer.status();
  }

  @Post('print')
  @HttpCode(200)
  @ApiTags('print')
  @ApiOperation({
    summary: 'Print a job made of commands',
    description:
      'Commands: text, newLine, line, leftRight, table, qr, barcode, image, cut, beep, cashDrawer, raw. See schemas below.',
  })
  @ApiOkResponse({ type: PrintResultDto })
  @ApiBadRequestResponse({ description: 'Invalid job' })
  @ApiServiceUnavailableResponse({
    description: 'Printer unreachable or failed',
  })
  print(@Body() job: PrintJobDto) {
    return this.printer.print(job);
  }

  @Post('print/text')
  @HttpCode(200)
  @ApiTags('print')
  @ApiOperation({ summary: 'Print plain text' })
  @ApiOkResponse({ type: PrintResultDto })
  @ApiServiceUnavailableResponse({
    description: 'Printer unreachable or failed',
  })
  printText(@Body() dto: PrintTextDto) {
    return this.printer.printText(dto.text, dto.cut);
  }

  @Post('print/image')
  @HttpCode(200)
  @ApiTags('print')
  @ApiOperation({ summary: 'Print an uploaded PNG (multipart field "image")' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: { type: 'string', format: 'binary' },
        cut: { type: 'boolean' },
      },
    },
  })
  @ApiOkResponse({ type: PrintResultDto })
  @ApiServiceUnavailableResponse({
    description: 'Printer unreachable or failed',
  })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: env.BODY_LIMIT_MB * MB },
    }),
  )
  printImage(
    @UploadedFile(new ParseFilePipe()) image: Express.Multer.File,
    @Body('cut', new ParseBoolPipe({ optional: true })) cut?: boolean,
  ) {
    return this.printer.printImage(image.buffer, cut);
  }

  @Post('print/raw')
  @HttpCode(200)
  @ApiTags('print')
  @ApiOperation({ summary: 'Send raw ESC/POS bytes (base64) as-is' })
  @ApiOkResponse({ type: PrintResultDto })
  @ApiServiceUnavailableResponse({
    description: 'Printer unreachable or failed',
  })
  printRaw(@Body() dto: PrintRawDto) {
    return this.printer.printRaw(Buffer.from(dto.data, 'base64'));
  }

  @Post('print/test')
  @HttpCode(200)
  @ApiTags('print')
  @ApiOperation({ summary: 'Print a test page' })
  @ApiOkResponse({ type: PrintResultDto })
  @ApiServiceUnavailableResponse({
    description: 'Printer unreachable or failed',
  })
  printTest() {
    return this.printer.printTestPage();
  }
}
