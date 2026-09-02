import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** The fields any suspension decision needs. */
export type SuspensionState = {
  id: string;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  suspendedUntil: Date | null;
};

/**
 * Whether a suspension is still in force, and ends it if it is not.
 *
 * One function because there are two doors — signing in, and every authenticated
 * request after that — and they must agree. They did not: the JWT guard checked
 * suspendedAt while login did not check anything at all, so a suspended agent could
 * still sign in and receive a working token. Every request then failed, which the
 * dashboard swallowed, and the account looked like it worked while doing nothing.
 *
 * A timed suspension ends here rather than on a schedule. The row is cleared the first
 * time the account is touched after the deadline, which means it comes back exactly
 * when its owner tries to use it and never needs a job that could disagree with this.
 *
 * Throws when still suspended; returns quietly when not.
 */
export async function assertNotSuspended(
  prisma: PrismaService,
  user: SuspensionState,
): Promise<void> {
  if (!user.suspendedAt) return;

  if (user.suspendedUntil && user.suspendedUntil.getTime() <= Date.now()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { suspendedAt: null, suspendedReason: null, suspendedUntil: null },
    });
    return;
  }

  throw new ForbiddenException(suspensionMessage(user));
}

/**
 * What the person is told.
 *
 * Says when it ends where there is an end, because "suspended" with no horizon reads as
 * permanent, and someone who thinks they have lost their account for good does not come
 * back. The reason is included for the same purpose: it is the only thing they can act
 * on.
 */
export function suspensionMessage(user: SuspensionState): string {
  const until = user.suspendedUntil
    ? ` It lifts on ${user.suspendedUntil.toLocaleDateString('en-PH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}.`
    : '';

  return user.suspendedReason
    ? `Your account has been suspended: ${user.suspendedReason}${until}`
    : `Your account has been suspended.${until} Contact support if you think this is a mistake.`;
}
