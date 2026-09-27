import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBase64,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const ALIGN = ['left', 'center', 'right'] as const;
export type Align = (typeof ALIGN)[number];

export const COMMAND_TYPES = [
  'text',
  'newLine',
  'line',
  'leftRight',
  'table',
  'qr',
  'barcode',
  'image',
  'cut',
  'beep',
  'cashDrawer',
  'raw',
] as const;

abstract class Command {
  @IsIn(COMMAND_TYPES)
  type: (typeof COMMAND_TYPES)[number];
}

export class TextCommand extends Command {
  @ApiProperty({ enum: ['text'] }) declare type: 'text';
  @ApiProperty({ example: 'Hello World' }) @IsString() text: string;
  @ApiPropertyOptional({ enum: ALIGN, default: 'left' })
  @IsOptional()
  @IsIn(ALIGN)
  align?: Align;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bold?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() underline?: boolean;
  @ApiPropertyOptional({ description: 'White on black' })
  @IsOptional()
  @IsBoolean()
  invert?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() upsideDown?: boolean;
  @ApiPropertyOptional({ enum: ['A', 'B'], default: 'A' })
  @IsOptional()
  @IsIn(['A', 'B'])
  font?: 'A' | 'B';
  @ApiPropertyOptional({ minimum: 1, maximum: 8, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  width?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 8, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  height?: number;
  @ApiPropertyOptional({ default: true, description: 'Append a line break' })
  @IsOptional()
  @IsBoolean()
  newLine?: boolean;
}

export class NewLineCommand extends Command {
  @ApiProperty({ enum: ['newLine'] }) declare type: 'newLine';
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  count?: number;
}

export class LineCommand extends Command {
  @ApiProperty({ enum: ['line'] }) declare type: 'line';
  @ApiPropertyOptional({ description: 'Defaults to PRINTER_LINE_CHARACTER' })
  @IsOptional()
  @IsString()
  @Length(1, 1)
  character?: string;
}

export class LeftRightCommand extends Command {
  @ApiProperty({ enum: ['leftRight'] }) declare type: 'leftRight';
  @ApiProperty({ example: 'Coffee' }) @IsString() left: string;
  @ApiProperty({ example: '3.50 EUR' }) @IsString() right: string;
}

export class TableCell {
  @ApiProperty() @IsString() text: string;
  @ApiPropertyOptional({ enum: ALIGN })
  @IsOptional()
  @IsIn(ALIGN)
  align?: Align;
  @ApiPropertyOptional({ description: 'Fraction of line width, e.g. 0.5' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  width?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bold?: boolean;
}

export class TableCommand extends Command {
  @ApiProperty({ enum: ['table'] }) declare type: 'table';
  @ApiProperty({ type: [TableCell] })
  @ValidateNested({ each: true })
  @Type(() => TableCell)
  @ArrayMinSize(1)
  cells: TableCell[];
}

export class QrCommand extends Command {
  @ApiProperty({ enum: ['qr'] }) declare type: 'qr';
  @ApiProperty({ example: 'https://example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(7000)
  data: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 8, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  cellSize?: number;
  @ApiPropertyOptional({ enum: ['L', 'M', 'Q', 'H'], default: 'M' })
  @IsOptional()
  @IsIn(['L', 'M', 'Q', 'H'])
  correction?: 'L' | 'M' | 'Q' | 'H';
  @ApiPropertyOptional({ enum: ALIGN, default: 'center' })
  @IsOptional()
  @IsIn(ALIGN)
  align?: Align;
}

export class BarcodeCommand extends Command {
  @ApiProperty({ enum: ['barcode'] }) declare type: 'barcode';
  @ApiProperty({ example: '4006381333931' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  data: string;
  @ApiPropertyOptional({
    default: 73,
    description:
      'ESC/POS GS k barcode type: 65 UPC-A, 66 UPC-E, 67 EAN13, 68 EAN8, 69 CODE39, 70 ITF, 71 CODABAR, 72 CODE93, 73 CODE128',
  })
  @IsOptional()
  @IsInt()
  @Min(65)
  @Max(79)
  barcodeType?: number;
  @ApiPropertyOptional({ minimum: 2, maximum: 6, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(6)
  width?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 255, default: 162 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(255)
  height?: number;
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 3,
    default: 2,
    description: 'Human readable text: 0 none, 1 above, 2 below, 3 both',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  hriPos?: number;
  @ApiPropertyOptional({ enum: ALIGN, default: 'center' })
  @IsOptional()
  @IsIn(ALIGN)
  align?: Align;
}

export class ImageCommand extends Command {
  @ApiProperty({ enum: ['image'] }) declare type: 'image';
  @ApiProperty({
    description:
      'Base64 encoded PNG. Max width = printer dots (TM-T20II: 576px)',
  })
  @IsBase64()
  data: string;
  @ApiPropertyOptional({ enum: ALIGN, default: 'center' })
  @IsOptional()
  @IsIn(ALIGN)
  align?: Align;
}

export class CutCommand extends Command {
  @ApiProperty({ enum: ['cut'] }) declare type: 'cut';
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  partial?: boolean;
}

export class BeepCommand extends Command {
  @ApiProperty({ enum: ['beep'] }) declare type: 'beep';
  @ApiPropertyOptional({ minimum: 1, maximum: 9, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  count?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 9, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  duration?: number;
}

export class CashDrawerCommand extends Command {
  @ApiProperty({ enum: ['cashDrawer'] }) declare type: 'cashDrawer';
}

export class RawCommand extends Command {
  @ApiProperty({ enum: ['raw'] }) declare type: 'raw';
  @ApiProperty({ description: 'Base64 encoded raw ESC/POS bytes' })
  @IsBase64()
  data: string;
}

export const COMMAND_CLASSES = {
  text: TextCommand,
  newLine: NewLineCommand,
  line: LineCommand,
  leftRight: LeftRightCommand,
  table: TableCommand,
  qr: QrCommand,
  barcode: BarcodeCommand,
  image: ImageCommand,
  cut: CutCommand,
  beep: BeepCommand,
  cashDrawer: CashDrawerCommand,
  raw: RawCommand,
} satisfies Record<(typeof COMMAND_TYPES)[number], unknown>;

export type PrintCommand = InstanceType<
  (typeof COMMAND_CLASSES)[keyof typeof COMMAND_CLASSES]
>;

export class PrintJobDto {
  @ApiProperty({
    description:
      'Commands executed in order. Text styles reset after each command.',
    type: 'array',
    items: {
      oneOf: Object.values(COMMAND_CLASSES).map((c) => ({
        $ref: getSchemaPath(c),
      })),
      discriminator: { propertyName: 'type' },
    },
    example: [
      {
        type: 'text',
        text: 'My Shop',
        align: 'center',
        bold: true,
        width: 2,
        height: 2,
      },
      { type: 'line' },
      { type: 'leftRight', left: 'Coffee', right: '3.50' },
      { type: 'qr', data: 'https://example.com' },
    ],
  })
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @Type(() => Command, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: 'type',
      subTypes: Object.entries(COMMAND_CLASSES).map(([name, value]) => ({
        name,
        value,
      })),
    },
  })
  commands: PrintCommand[];

  @ApiPropertyOptional({
    description: 'Cut after job. Defaults to PRINTER_CUT_AFTER_JOB',
  })
  @IsOptional()
  @IsBoolean()
  cut?: boolean;
}

export class PrintTextDto {
  @ApiProperty({
    example: 'Hello\nWorld',
    description: 'Plain text, \\n for line breaks',
  })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiPropertyOptional({
    description: 'Cut after job. Defaults to PRINTER_CUT_AFTER_JOB',
  })
  @IsOptional()
  @IsBoolean()
  cut?: boolean;
}

export class PrintRawDto {
  @ApiProperty({ description: 'Base64 encoded raw ESC/POS bytes, sent as-is' })
  @IsBase64()
  data: string;
}

export class PrintResultDto {
  @ApiProperty() success: boolean;
  @ApiProperty({ description: 'Bytes sent to the printer' }) bytes: number;
  @ApiProperty() durationMs: number;
}

export class PrinterStatusDto {
  @ApiProperty() connected: boolean;
  @ApiPropertyOptional({ description: 'Why the printer is unavailable' })
  error?: string;
  @ApiProperty() type: string;
  @ApiProperty() interface: string;
  @ApiProperty() width: number;
  @ApiPropertyOptional() characterSet?: string;
}
