import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { assertNotSuspended } from '../../common/suspension';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail, passwordChangedEmail } from '../mail/templates';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { clientUrl } from '../../common/client-url';

/** Long enough that guessing is hopeless, short enough to sit in a URL. */
const RESET_TOKEN_BYTES = 32;
const RESET_TTL_MINUTES = 60;

/** Same shape as the reset token: 256 bits of random, stored only as a hash. */
const REFRESH_TOKEN_BYTES = 32;
/** How long a signed-in device can stay signed in without typing a password again. */
const REFRESH_TTL_DAYS = 30;
const MIN_PASSWORD_LENGTH = 6;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
      },
    });

    return this.generateToken(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // This door had no check at all. The JWT guard rejected every request a suspended
    // account made afterwards, but the account could still sign in and be handed a
    // working token — and because the dashboard's loaders fail quietly, what the
    // suspended person saw was an app that opened and then showed nothing, with no
    // explanation. Checked after the password so a stranger cannot use the message to
    // learn which addresses are registered.
    await assertNotSuspended(this.prisma, user);

    return this.generateToken(user.id, user.email);
  }

  // Shape returned by /auth/me and every settings update, so the client always gets
  // the same user object back and never has to guess which fields changed.
  private static readonly PUBLIC_FIELDS = {
    id: true,
    name: true,
    email: true,
    phone: true,
    avatarUrl: true,
    isVerified: true,
    // Separate from isVerified above: this one is "we emailed you a code and you typed
    // it back", the other is "staff checked your broker licence".
    emailVerifiedAt: true,
    // The client uses this only to decide whether to offer the /admin link. Every admin
    // route re-checks the role server-side, so a tampered copy of this value buys
    // nothing but a link to a page that refuses to load.
    role: true,
    notifyNewListings: true,
    notifyNewReels: true,
    notifyMyActivity: true,
    notifyEmailMessages: true,
    autoReplyEnabled: true,
    createdAt: true,
  } as const;

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: AuthService.PUBLIC_FIELDS,
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  async updateProfile(
    userId: string,
    dto: { name?: string; phone?: string; email?: string; currentPassword?: string },
    avatarUrl?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const data: Record<string, unknown> = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    // Empty string clears the number; undefined leaves it alone.
    if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;
    if (avatarUrl) data.avatarUrl = avatarUrl;

    // Email is the login identifier, so it needs the password and a uniqueness check.
    if (dto.email && dto.email.toLowerCase() !== user.email.toLowerCase()) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Enter your current password to change your email');
      }
      const valid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!valid) throw new UnauthorizedException('Current password is incorrect');

      const taken = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (taken) throw new ConflictException('That email is already in use');

      data.email = dto.email;
    }

    if (Object.keys(data).length === 0) return this.getProfile(userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: AuthService.PUBLIC_FIELDS,
    });

    // The JWT carries the email, so a changed address needs a fresh token.
    return data.email
      ? { ...updated, ...(await this.generateToken(updated.id, updated.email)) }
      : updated;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    if (newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters');
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      throw new BadRequestException('New password must be different from the current one');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(newPassword, 10) },
    });

    return { changed: true };
  }

  async updateNotificationPrefs(
    userId: string,
    prefs: {
      notifyNewListings?: boolean;
      notifyNewReels?: boolean;
      notifyMyActivity?: boolean;
      notifyEmailMessages?: boolean;
      autoReplyEnabled?: boolean;
    },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: prefs,
      select: AuthService.PUBLIC_FIELDS,
    });
  }

  /* --------------------------------------------------- password reset */

  /**
   * Emails a reset link, and says nothing about whether the address exists.
   *
   * The response is identical either way: telling an anonymous caller "no account
   * with that email" hands them a way to enumerate who is registered here. The work
   * is detached for the same reason — a slow send on a real address versus an instant
   * return on an unknown one is the same leak, measured with a stopwatch.
   */
  async requestPasswordReset(email: string) {
    const address = email?.trim().toLowerCase();
    if (address) void this.deliverResetEmail(address).catch(() => undefined);

    return {
      message: 'If that email is registered, a reset link is on its way.',
    };
  }

  private async deliverResetEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    // One live link at a time: requesting again should retire the previous email.
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = randomBytes(RESET_TOKEN_BYTES).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      },
    });

    const url = `${clientUrl()}/reset-password?token=${token}`;
    const { subject, html, text } = passwordResetEmail(user.name, url, RESET_TTL_MINUTES);

    await this.mail.send({ to: user.email, toName: user.name, subject, html, text });
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token) throw new BadRequestException('This reset link is not valid');
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    // One message for every failure mode — expired, already used, never existed — so
    // the response cannot be used to probe which tokens were ever real.
    const invalid = !record || record.usedAt || record.expiresAt < new Date();
    if (invalid) {
      throw new BadRequestException('This reset link has expired or has already been used');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: await bcrypt.hash(newPassword, 10) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Any other outstanding link for this user is now stale.
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId, usedAt: null },
      }),
    ]);

    // Detached: the password is already changed, and a mail outage must not make it
    // look like the reset failed.
    const { subject, html, text } = passwordChangedEmail(record.user.name);
    void this.mail
      .send({ to: record.user.email, toName: record.user.name, subject, html, text })
      .catch(() => undefined);

    return { message: 'Your password has been changed. You can log in now.' };
  }

  /**
   * Trades a refresh token for a new access token, and rotates it.
   *
   * The old token is spent on every exchange, so a token that arrives already spent is
   * either a replay or a stolen copy racing the real client. Either way the honest
   * response is to end the whole session rather than guess which caller is genuine,
   * so every refresh token this user holds is revoked and both devices must log in.
   */
  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Session expired');

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!record) throw new UnauthorizedException('Session expired');

    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session expired');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    // The third door. A suspended account holding a valid refresh token could keep
    // minting access tokens here; each one was then rejected by the guard, but the
    // session never ended and the person was never told why.
    await assertNotSuspended(this.prisma, record.user);

    return this.issueTokens(record.user.id, record.user.email);
  }

  /**
   * Signing out. Revoking the row is the only part that actually ends anything — the
   * access token stays valid until it expires on its own, which is why it is short.
   * Never throws: a sign-out that fails would strand the user in a signed-in UI.
   */
  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken
        .updateMany({
          where: { tokenHash: hashToken(refreshToken), revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => undefined);
    }
    return { message: 'Signed out' };
  }

  /**
   * A short-lived access token plus the refresh token that renews it.
   *
   * Expired rows for this user are cleared on the way through: sessions accumulate one
   * row per login, and this is the moment we are already writing to the table, so it
   * costs nothing extra and needs no scheduled job.
   *
   * Revoked rows are deliberately *not* cleared until they expire on their own. They
   * are what makes replay detectable — delete a spent token and its reuse looks like an
   * unknown token rather than a stolen one, and the session it should have killed
   * stays open. Verified: with the revoked row deleted, replaying an old token left the
   * rotated one still working.
   */
  private async issueTokens(userId: string, email: string) {
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(refreshToken), expiresAt },
    });

    return {
      accessToken: this.jwtService.sign({ sub: userId, email }),
      refreshToken,
    };
  }

  private generateToken(userId: string, email: string) {
    return this.issueTokens(userId, email);
  }
}

/**
 * Only the hash is stored, so the column is useless to anyone who reads the database.
 * SHA-256 rather than bcrypt: the token is 256 bits of random, so there is nothing to
 * brute-force, and lookup has to be a fast exact match on an indexed column.
 */
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/** Kept for constant-time comparisons if tokens ever move off a unique index. */
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}