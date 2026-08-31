import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Staff-only.
 *
 * Sits behind `AuthGuard('jwt')`, which has already loaded the account and put its role
 * on the request — so this trusts the database's answer, not a claim inside the token.
 * That is what makes revoking an admin take effect at once.
 *
 * The message is deliberately the same as any other forbidden response: telling a
 * stranger that an endpoint exists but needs a higher role is an invitation.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('Not found');
    }
    return true;
  }
}
