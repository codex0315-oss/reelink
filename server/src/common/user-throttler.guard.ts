import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limits per account, falling back to IP for anonymous callers.
 *
 * Tracking purely by IP is wrong for this audience. Philippine mobile carriers put
 * large numbers of subscribers behind CGNAT, and agents in one brokerage share an
 * office connection — so an IP-only limit would have unrelated users throttling each
 * other, and a single busy office could lock out its whole team.
 *
 * Keyed by user id, the limit means what it says: this account, this many requests.
 * Anonymous traffic (login, register, forgot-password) still falls back to IP, which
 * is the only identifier available before a token exists.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { userId?: string } | undefined;
    if (user?.userId) return `user:${user.userId}`;

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
