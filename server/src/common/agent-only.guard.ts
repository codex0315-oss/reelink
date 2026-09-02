import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Blocks staff from acting as agents.
 *
 * An admin account is for running the platform, not for selling on it. Hiding the
 * buttons in the client is presentation, not enforcement — the endpoints are still
 * reachable with a token and a POST — so the rule lives here, where it actually holds.
 *
 * The mirror image of AdminGuard, and it reads the role the same way: from the account
 * loaded by `AuthGuard('jwt')` rather than from a claim inside the token, so demoting
 * someone takes effect on their next request instead of whenever their token expires.
 *
 * Deliberately narrow. It guards creating things — listings, reels — and nothing else.
 * Staff keep their inbox, because an admin who was already mid-conversation with an
 * agent should not vanish from it, and buyers should never be left unanswered.
 */
@Injectable()
export class AgentOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    if (request.user?.role === 'admin') {
      throw new ForbiddenException(
        'Admin accounts cannot post listings or reels. Use an agent account.',
      );
    }
    return true;
  }
}
