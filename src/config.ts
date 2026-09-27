import { readFileSync } from 'fs';
import { join } from 'path';
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { BreakLine, CharacterSet, PrinterTypes } from 'node-thermal-printer';

export const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
) as { name: string; version: string; description: string };

const toBool = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : value === 'true';
const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value ? value.toUpperCase() : undefined;
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

/** All settings come from env vars; defaults target an Epson on /dev/usb/lp0. */
export class Env {
  // --- HTTP ---
  @Transform(toInt) @IsInt() @Min(1) @Max(65535) PORT = 3000;
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(8)
  API_KEY?: string;
  /** Max request size (JSON body and image upload) */
  @Transform(toInt) @IsInt() @Min(1) BODY_LIMIT_MB = 10;
  @Transform(toBool) @IsBoolean() SWAGGER_ENABLED = true;
  @IsString() SWAGGER_PATH = 'swagger';
  @Transform(emptyToUndefined) @IsOptional() @IsString() CORS_ORIGIN?: string;

  // --- Printer ---
  @Transform(lower) @IsEnum(PrinterTypes) PRINTER_TYPE = PrinterTypes.EPSON;
  /** /dev/usb/lp0, tcp://192.168.1.50:9100, or any writable file path */
  @IsString() PRINTER_INTERFACE = '/dev/usb/lp0';
  /** Characters per line (TM-T20II 80mm: 48, 58mm: 35) */
  @Transform(toInt) @IsInt() @Min(1) PRINTER_WIDTH = 48;
  /** Code page for text; the lib switches pages per char when one can't print it */
  @Transform(upper)
  @IsEnum(CharacterSet)
  PRINTER_CHARACTER_SET = CharacterSet.PC437_USA;
  @Transform(toBool) @IsBoolean() PRINTER_REMOVE_SPECIAL_CHARACTERS = false;
  @IsString() @Length(1, 1) PRINTER_LINE_CHARACTER = '-';
  @Transform(upper) @IsEnum(BreakLine) PRINTER_BREAK_LINE = BreakLine.WORD;
  /** Network interface timeout in ms */
  @Transform(toInt) @IsInt() @Min(1) PRINTER_TIMEOUT = 3000;
  /** Cut paper after each job unless the request says otherwise */
  @Transform(toBool) @IsBoolean() PRINTER_CUT_AFTER_JOB = true;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(
      'Invalid configuration:\n' +
        errors
          .map(
            (e) =>
              `  ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
          )
          .join('\n'),
    );
  }
  return env;
}

try {
  process.loadEnvFile(); // .env for local dev; real env vars take precedence
} catch {
  // no .env file
}

/** Validated once at startup: a bad config fails fast before anything listens. */
export const env = (() => {
  try {
    return validateEnv(process.env);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
})();
