import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Matches the reels service. Kept here so the spend estimate is not a magic number. */
const HIGGSFIELD_CREDITS_PER_CLIP = 6.5;
const USD_PER_CREDIT = 0.0627;

const PAGE_SIZE = 25;

/** What staff see about an account. Never includes the password hash. */
const USER_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
  role: true,
  isVerified: true,
  suspendedAt: true,
  suspendedReason: true,
  createdAt: true,
  lastSeenAt: true,
} as const;

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /* ------------------------------------------------------------------ metrics */

  /**
   * A single read of where the platform stands.
   *
   * Everything here is counted from rows that already exist — there are no derived
   * tallies kept anywhere, so these numbers cannot drift out of step with reality.
   */
  async metrics() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      users,
      newUsers,
      verified,
      suspended,
      listings,
      newListings,
      reels,
      reelsReady,
      reelsFailed,
      rendersToday,
      aiRendersWeek,
      viewsWeek,
      conversations,
      pendingVerifications,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.user.count({ where: { isVerified: true } }),
      this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
      this.prisma.listing.count(),
      this.prisma.listing.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.reel.count(),
      this.prisma.reel.count({ where: { status: 'done' } }),
      this.prisma.reel.count({ where: { status: 'failed' } }),
      this.prisma.reelRender.count({ where: { createdAt: { gte: dayAgo } } }),
      this.prisma.reelRender.count({ where: { usedAi: true, createdAt: { gte: weekAgo } } }),
      this.prisma.listingView.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.conversation.count(),
      this.prisma.verificationRequest.count({ where: { status: 'pending' } }),
    ]);

    return {
      users: { total: users, newThisWeek: newUsers, verified, suspended },
      listings: { total: listings, newThisWeek: newListings },
      reels: { total: reels, ready: reelsReady, failed: reelsFailed },
      renders: { today: rendersToday, aiThisWeek: aiRendersWeek },
      // The only line item that costs money, so it is reported in pesos as well as
      // dollars — an estimate from the credit price, not a figure from Higgsfield.
      aiSpend: {
        clipsThisWeek: aiRendersWeek,
        estimatedUsd: +(aiRendersWeek * HIGGSFIELD_CREDITS_PER_CLIP * USD_PER_CREDIT).toFixed(2),
      },
      engagement: { viewsThisWeek: viewsWeek, conversations },
      queue: { pendingVerifications },
    };
  }

  /* -------------------------------------------------------------------- users */

  async listUsers(search?: string, page = 0) {
    const where = search?.trim()
      ? {
          OR: [
            { name: { contains: search.trim(), mode: 'insensitive' as const } },
            { email: { contains: search.trim(), mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          ...USER_FIELDS,
          _count: { select: { listings: true, reels: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, pageSize: PAGE_SIZE };
  }

  /**
   * Suspends or restores an account.
   *
   * An admin cannot suspend themselves or another admin. The first is a foot-gun that
   * locks staff out of their own tool; the second means one compromised admin account
   * cannot disable the others before doing damage.
   */
  async setSuspended(
    actorId: string,
    userId: string,
    suspended: boolean,
    reason?: string,
  ) {
    if (actorId === userId) {
      throw new BadRequestException('You cannot suspend your own account');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, name: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'admin') {
      throw new BadRequestException('Admin accounts cannot be suspended from here');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        suspendedAt: suspended ? new Date() : null,
        suspendedReason: suspended ? (reason?.trim() || null) : null,
      },
      select: USER_FIELDS,
    });

    // Every session ends immediately: the access token stops working at the next
    // request because the strategy re-reads the account, and revoking the refresh
    // tokens stops it being renewed.
    if (suspended) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return user;
  }

  /* ------------------------------------------------------------ verification */

  async listVerifications(status = 'pending') {
    return this.prisma.verificationRequest.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' }, // oldest first: nobody should wait indefinitely
      include: { user: { select: USER_FIELDS } },
    });
  }

  /**
   * Approves or rejects a request, and tells the agent either way.
   *
   * Approving is the only thing in the codebase that sets `isVerified`, which is what
   * makes the badge mean something to a buyer.
   */
  async reviewVerification(
    actorId: string,
    requestId: string,
    approve: boolean,
    note?: string,
  ) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, status: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'pending') {
      throw new BadRequestException('This request has already been reviewed');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.verificationRequest.update({
        where: { id: requestId },
        data: {
          status: approve ? 'approved' : 'rejected',
          reviewNote: note?.trim() || null,
          reviewedAt: new Date(),
          reviewedById: actorId,
        },
      }),
      this.prisma.user.update({
        where: { id: request.userId },
        data: { isVerified: approve },
      }),
    ]);

    void this.notifications
      .create(
        request.userId,
        'verification',
        approve ? 'You are now a verified agent' : 'Verification was not approved',
        approve
          ? 'Buyers browsing your listings will see the verified badge on your profile.'
          : note?.trim() ||
            'Check the licence details you submitted and try again from Settings.',
      )
      .catch(() => undefined);

    return updated;
  }
}
