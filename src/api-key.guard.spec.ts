import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AcceptsMcpKey, ApiKeyGuard } from './api-key.guard';
import { Env } from './config';

class Rest {}
@AcceptsMcpKey()
class Mcp {}

const allowed = (env: Partial<Env>, cls: typeof Rest, key?: string) => {
  const ctx = {
    getHandler: () => () => {},
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ header: () => undefined, query: { key } }),
    }),
  } as unknown as ExecutionContext;
  try {
    return new ApiKeyGuard(env as Env, new Reflector()).canActivate(ctx);
  } catch (e) {
    if (e instanceof UnauthorizedException) return false;
    throw e;
  }
};

describe('ApiKeyGuard', () => {
  const both = { API_KEY: 'apikeyapikey', MCP_API_KEY: 'mcpkeymcpkey' };

  it('accepts the MCP key only on MCP routes', () => {
    expect(allowed(both, Rest, 'apikeyapikey')).toBe(true);
    expect(allowed(both, Rest, 'mcpkeymcpkey')).toBe(false);
    expect(allowed(both, Mcp, 'apikeyapikey')).toBe(true);
    expect(allowed(both, Mcp, 'mcpkeymcpkey')).toBe(true);
    expect(allowed(both, Mcp)).toBe(false);
  });

  it('MCP_API_KEY alone protects only MCP routes', () => {
    const env = { MCP_API_KEY: 'mcpkeymcpkey' };
    expect(allowed(env, Rest)).toBe(true);
    expect(allowed(env, Mcp)).toBe(false);
    expect(allowed(env, Mcp, 'mcpkeymcpkey')).toBe(true);
  });
});
