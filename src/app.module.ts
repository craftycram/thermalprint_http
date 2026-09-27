import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { Env, env } from './config';
import { PrinterController } from './printer/printer.controller';
import { PrinterService } from './printer/printer.service';

@Module({
  controllers: [PrinterController],
  providers: [
    { provide: Env, useValue: env },
    PrinterService,
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class AppModule {}
