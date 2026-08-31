import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { verifyEmailCode } from '../mail/templates';

/**
 * Six digits, not four. Both are the same effort to type, but four is 10,000
 * combinations — a script exhausts that in under a minute. Six is a million, and
 * combined with the attempt limit below it stops being guessable at all.
 */
const CODE_DIGITS = 6;
const CODE_TTL_MINUTES = 10;

/**
 * Wrong guesses before the code dies. This, not the length, is what makes the scheme
 * safe: five tries against a million codes is a 1-in-200,000 chance, and the attacker
 * has to start over with a code they cannot see.
 */
const MAX_ATTEMPTS = 5;

/** Stops the endpoint being used to flood someone's inbox. */
const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  /** What Settings shows: confirmed or not, and whether a code is already waiting. */
  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!user) throw new BadRequestException('Account not found');

    const pending = user.emailVerifiedAt
      ? null
      : await this.prisma.emailVerificationCode.findFirst({
          where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, expiresAt: true, attempts: true, email: true },
        });

    return {
      email: user.email,
      verified: !!user.emailVerifiedAt,
      verifiedAt: user.emailVerifiedAt,
      pending: pending
        ? {
            sentTo: pending.email,
            expiresAt: pending.expiresAt,
            attemptsLeft: Math.max(0, MAX_ATTEMPTS - pending.attempts),
          }
        : null,
    };
  }

  /**
   * Issues a code and emails it.
   *
   * Any earlier code is spent first, so exactly one is live per account at a time —
   * otherwise every resend would widen the window an attacker is guessing against.
   */
  async send(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    if (!user) throw new BadRequestException('Account not found');
    if (user.emailVerifiedAt) {
      throw new BadRequestException('This address is already verified');
    }

    const recent = await this.prisma.emailVerificationCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent) {
      const waited = (Date.now() - recent.createdAt.getTime()) / 1000;
      if (waited < RESEND_COOLDOWN_SECONDS) {
        throw new BadRequestException(
          `Wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - waited)} seconds before asking for another code`,
        );
      }
    }

    // randomInt is drawn from the crypto source. Math.random() is predictable from a
    // handful of prior outputs, which for a guessable-length code is fatal.
    const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await this.prisma.$transaction([
      // One live code per account.
      this.prisma.emailVerificationCode.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailVerificationCode.create({
        data: { userId, email: user.email, codeHash: hash(code), expiresAt },
      }),
    ]);

    const { subject, html, text } = verifyEmailCode(user.name, code, CODE_TTL_MINUTES);
    const sent = await this.mail.send({
      to: user.email,
      toName: user.name,
      subject,
      html,
      text,
    });

    if (!sent) {
      this.logger.warn(`Verification code for ${user.email} could not be emailed.`);
    }

    // Never returns the code. The response says only that one is on its way, so the
    // endpoint cannot be used to read a code without access to the inbox.
    return {
      sent,
      email: user.email,
      expiresAt,
      message: sent
        ? `We sent a ${CODE_DIGITS}-digit code to ${user.email}.`
        : 'Could not send the email just now. Try again in a moment.',
    };
  }

  /**
   * Redeems a code.
   *
   * Every failure path returns the same message. Saying "expired" versus "wrong"
   * versus "no code" tells someone guessing exactly where they stand.
   */
  async confirm(userId: string, code: string) {
    const digits = (code ?? '').trim();
    if (!/^\d{6}$/.test(digits)) {
      throw new BadRequestException('Enter the 6-digit code from your email');
    }

    const record = await this.prisma.emailVerificationCode.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const invalid = new BadRequestException(
      'That code is not valid. Check the latest email, or send a new code.',
    );

    if (!record) throw invalid;
    if (record.expiresAt.getTime() < Date.now()) throw invalid;

    if (record.attempts >= MAX_ATTEMPTS) {
      // Burn it so further guesses are pointless even before it expires.
      await this.prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      throw new BadRequestException('Too many attempts. Send yourself a new code.');
    }

    if (record.codeHash !== hash(digits)) {
      await this.prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid;
    }

    // The address may have been changed after the code was sent; verifying the old one
    // would mark the new address confirmed without anyone having read it.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user?.email !== record.email) {
      throw new BadRequestException(
        'Your email address changed after this code was sent. Send a new one.',
      );
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
        select: { email: true, emailVerifiedAt: true },
      }),
    ]);

    return { verified: true, ...updated };
  }
}

/**
 * Only the hash is stored. A six-digit space is small enough that anyone with the
 * database could reverse this in seconds, so it is not the defence — the expiry and
 * the attempt limit are. It keeps the plain code out of backups and log dumps.
 */
function hash(code: string) {
  return createHash('sha256').update(code).digest('hex');
}
