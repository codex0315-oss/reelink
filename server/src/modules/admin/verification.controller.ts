import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailVerificationService } from './email-verification.service';

/** Long enough for any PRC or DHSUD number, short enough to be a number and not an essay. */
const MAX_LICENCE_LENGTH = 40;

/**
 * The agent's half of verification: submitting, and seeing where it stands.
 *
 * Separate from the admin controller because this is a normal signed-in route — the two
 * sides of the same feature have completely different audiences, and mixing them behind
 * one guard is how a staff-only endpoint accidentally becomes public.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('verification')
export class VerificationController {
  constructor(
    private prisma: PrismaService,
    private emailVerification: EmailVerificationService,
  ) {}

  /* ------------------------------------------------------ email verification */

  @Get('email')
  emailStatus(@Req() req: { user: { userId: string } }) {
    return this.emailVerification.status(req.user.userId);
  }

  /**
   * Each send delivers a real email, so this is the one route here a stranger could
   * use to bother someone. The service also enforces a 60-second cooldown per account;
   * this caps it per token as well.
   */
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('email/send')
  sendEmailCode(@Req() req: { user: { userId: string } }) {
    return this.emailVerification.send(req.user.userId);
  }

  /**
   * Six digits is a million combinations and the service allows five guesses per code,
   * but without a limit here an attacker could simply request code after code. This
   * bounds the whole attack, not just one code's lifetime.
   */
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Post('email/confirm')
  confirmEmailCode(
    @Req() req: { user: { userId: string } },
    @Body() body: { code?: string },
  ) {
    return this.emailVerification.confirm(req.user.userId, body?.code ?? '');
  }

  /* --------------------------------------------------- licence verification */

  /** The agent's latest request, so Settings can show pending/approved/rejected. */
  @Get('mine')
  async mine(@Req() req: { user: { userId: string } }) {
    const request = await this.prisma.verificationRequest.findFirst({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        licenseNumber: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
      },
    });
    return request ?? null;
  }

  @Post()
  async submit(
    @Req() req: { user: { userId: string } },
    @Body() body: { licenseNumber?: string },
  ) {
    const licenseNumber = body?.licenseNumber?.trim();
    if (!licenseNumber) {
      throw new BadRequestException('Enter your PRC licence or DHSUD registration number');
    }
    if (licenseNumber.length > MAX_LICENCE_LENGTH) {
      throw new BadRequestException('That does not look like a licence number');
    }

    // One open request at a time, so a queue cannot be flooded by one account and staff
    // never review two submissions from the same person.
    const pending = await this.prisma.verificationRequest.findFirst({
      where: { userId: req.user.userId, status: 'pending' },
      select: { id: true },
    });
    if (pending) {
      throw new BadRequestException('Your verification request is already being reviewed');
    }

    const already = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isVerified: true },
    });
    if (already?.isVerified) {
      throw new BadRequestException('Your account is already verified');
    }

    return this.prisma.verificationRequest.create({
      data: { userId: req.user.userId, licenseNumber },
      select: { id: true, status: true, licenseNumber: true, createdAt: true },
    });
  }
}
