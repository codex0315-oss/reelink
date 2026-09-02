import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { assertNotSuspended } from '../../../common/suspension';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not set in environment variables');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  /**
   * Reads the account on every request rather than trusting the token alone.
   *
   * A JWT is a snapshot of who the user was when it was signed, so role and suspension
   * cannot live in it: suspending someone would do nothing until their token expired,
   * and a demoted admin would keep their powers for the rest of the hour. One indexed
   * lookup by primary key is a cheap price for both taking effect immediately.
   */
  async validate(payload: { sub: string; email: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        suspendedAt: true,
        suspendedReason: true,
        suspendedUntil: true,
      },
    });

    // Deleted since the token was issued.
    if (!user) throw new UnauthorizedException('Session expired');

    // Shared with login, so both doors apply the same rule — and so a suspension
    // with an end date lifts itself the first time the account is used after it.
    await assertNotSuspended(this.prisma, user);

    return { userId: user.id, email: user.email, role: user.role };
  }
}
