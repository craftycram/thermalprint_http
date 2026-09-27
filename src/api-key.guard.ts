import { timingSafeEqual } from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Env } from './config';

const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Enforced only when API_KEY is set. Accepts `X-API-Key: <key>` or `Authorization: Bearer <key>`. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly env: Env,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.env.API_KEY) return true;
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;

    const req = context.switchToHttp().getRequest<Request>();
    const provided =
      req.header('x-api-key') ??
      req.header('authorization')?.replace(/^Bearer\s+/i, '');
    const a = Buffer.from(provided ?? '');
    const b = Buffer.from(this.env.API_KEY);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
    throw new UnauthorizedException('Missing or invalid API key');
  }
}
