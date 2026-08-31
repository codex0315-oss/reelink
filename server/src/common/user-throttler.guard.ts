import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

/**
 * Rate limits per account, falling back to IP for anonymous callers.
 *
 * Tracking purely by IP is wrong for this audience. Philippine mobile carriers put
 * large numbers of subscribers behind CGNAT, and agents in one brokerage share an
 * office connection — so an IP-only limit would have unrelated users throttling each
 * other, and a single busy office could lock out its whole team.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Reads the caller's id straight from the bearer token rather than from `req.user`.
   *
   * `req.user` is not populated yet. This guard is registered with APP_GUARD, and
   * global guards run *before* route-level ones — so `AuthGuard('jwt')` has not fired
   * when this is asked for a key. Relying on `req.user` silently fell through to the
   * IP branch on every single request, which meant two agents in one office shared a
   * bucket and the first one to work locked out the second. Verified: a brand-new
   * account's first request returned 429 because another account had spent the
   * allowance from the same address.
   *
   * The signature is verified, not just decoded. An unverified token would let anyone
   * invent a `sub` per request and mint themselves unlimited buckets, which is worse
   * than tracking by IP.
   */
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, string | undefined> | undefined;
    const auth = headers?.authorization;

    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify<{ sub?: string }>(auth.slice(7));
        if (payload?.sub) return `user:${payload.sub}`;
      } catch {
        // Expired or forged: fall through and limit by address instead.
      }
    }

    // `ips` is populated when a trust-proxy setting is on; index 0 is the client.
    const ips = req.ips as string[] | undefined;
    const ip = ips?.length ? ips[0] : (req.ip as string | undefined);
    return `ip:${ip ?? 'unknown'}`;
  }

  /**
   * Guards registered with APP_GUARD run for WebSocket events too, and the throttler
   * expects an HTTP request/response pair. Anything that is not HTTP is passed
   * through — the gateways do their own JWT check on connect.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.canActivate(context);
  }
}
