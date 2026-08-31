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
import { PrismaService } from '../../prisma/prisma.service';

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
  constructor(private prisma: PrismaService) {}

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
