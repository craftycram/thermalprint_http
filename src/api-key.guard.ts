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
const ACCEPTS_MCP_KEY = 'acceptsMcpKey';
/** Also accept MCP_API_KEY, so Claude's key can be revoked without touching other clients. */
export const AcceptsMcpKey = () => SetMetadata(ACCEPTS_MCP_KEY, true);

/**
 * Enforced only when API_KEY (or MCP_API_KEY on MCP routes) is set. Accepts `X-API-Key: <key>`, `Authorization: Bearer <key>`
 * or `?key=<key>` (for MCP clients like claude.ai custom connectors that can't set headers).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly env: Env,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const keys = [
      this.env.API_KEY,
      this.reflector.getAllAndOverride<boolean>(ACCEPTS_MCP_KEY, targets)
        ? this.env.MCP_API_KEY
        : undefined,
    ].filter((k): k is string => !!k);
    if (!keys.length) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets))
      return true;

    const req = context.switchToHttp().getRequest<Request>();
    const provided =
      req.header('x-api-key') ??
      req.header('authorization')?.replace(/^Bearer\s+/i, '') ??
      (typeof req.query.key === 'string' ? req.query.key : undefined);
    const a = Buffer.from(provided ?? '');
    const matches = (key: string) => {
      const b = Buffer.from(key);
      return a.length === b.length && timingSafeEqual(a, b);
    };
    if (keys.some(matches)) return true;
    throw new UnauthorizedException('Missing or invalid API key');
  }
}
