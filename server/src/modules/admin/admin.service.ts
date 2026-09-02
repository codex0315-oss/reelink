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

  /* ----------------------------------------------------------------- activity */

  /**
   * What just happened, across the whole platform, newest first.
   *
   * Merged in memory from the tables that already record these events rather than
   * written to an event log of its own. That keeps the feed honest — it cannot drift
   * from the rows it describes — at the cost of one query per kind. Each is capped, so
   * the work stays bounded however large the platform gets.
   */
  async activity(limit = 40) {
    const [users, listings, reels, verifications, feedback] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, name: true, createdAt: true },
      }),
      this.prisma.listing.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          price: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      }),
      this.prisma.reel.findMany({
        where: { status: { in: ['done', 'failed'] } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          status: true,
          createdAt: true,
          listing: { select: { title: true } },
          title: true,
          user: { select: { name: true } },
        },
      }),
      this.prisma.verificationRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          status: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      }),
      this.prisma.feedback.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          rating: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      }),
    ]);

    const events = [
      ...users.map((u) => ({
        id: `user-${u.id}`,
        kind: 'signup',
        at: u.createdAt,
        who: u.name,
        what: 'joined Reelink',
      })),
      ...listings.map((l) => ({
        id: `listing-${l.id}`,
        kind: 'listing',
        at: l.createdAt,
        who: l.user.name,
        what: `listed "${l.title}" at ₱${l.price.toLocaleString()}`,
      })),
      ...reels.map((r) => ({
        id: `reel-${r.id}`,
        kind: r.status === 'failed' ? 'reel-failed' : 'reel',
        at: r.createdAt,
        who: r.user.name,
        what:
          r.status === 'failed'
            ? `had a reel fail${r.listing ? ` for "${r.listing.title}"` : ''}`
            : `finished a reel${r.listing ? ` for "${r.listing.title}"` : ''}`,
      })),
      ...verifications.map((v) => ({
        id: `verify-${v.id}`,
        kind: 'verification',
        at: v.createdAt,
        who: v.user.name,
        what:
          v.status === 'pending'
            ? 'asked to be verified'
            : `was ${v.status} for verification`,
      })),
      ...feedback.map((f) => ({
        id: `feedback-${f.id}`,
        kind: 'feedback',
        at: f.createdAt,
        who: f.user.name,
        what: `rated Reelink ${f.rating} star${f.rating === 1 ? '' : 's'}`,
      })),
    ];

    return events
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
  }

  /* ------------------------------------------------------------------- trends */

  /**
   * Daily counts for the last `days` days, oldest first.
   *
   * Bucketed here rather than in SQL for the same reason the agent dashboard does it:
   * the day boundaries have to be the server's local midnight, and a UTC date_trunc
   * would put an evening in Cebu into the following day.
   */
  async trends(days = 14) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [users, listings, reels, views] = await Promise.all([
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.listing.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.reel.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, status: true },
      }),
      this.prisma.listingView.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;

    const empty = () => {
      const map = new Map<string, number>();
      for (let i = 0; i < days; i++) {
        const d = new Date(since);
        d.setDate(since.getDate() + i);
        map.set(key(d), 0);
      }
      return map;
    };

    const series = {
      signups: empty(),
      listings: empty(),
      reels: empty(),
      failures: empty(),
      views: empty(),
    };

    const add = (map: Map<string, number>, at: Date) => {
      const k = key(at);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
    };

    users.forEach((u) => add(series.signups, u.createdAt));
    listings.forEach((l) => add(series.listings, l.createdAt));
    views.forEach((v) => add(series.views, v.createdAt));
    reels.forEach((r) => {
      add(series.reels, r.createdAt);
      if (r.status === 'failed') add(series.failures, r.createdAt);
    });

    const toArray = (map: Map<string, number>) =>
      [...map.entries()].map(([date, count]) => ({ date, count }));

    return {
      days,
      signups: toArray(series.signups),
      listings: toArray(series.listings),
      reels: toArray(series.reels),
      failures: toArray(series.failures),
      views: toArray(series.views),
    };
  }

  /* ------------------------------------------------------------------- health */

  /**
   * Whether the machinery is working, rather than how much of it there is.
   *
   * The failure rate is the number worth watching: reels are the product, and a
   * renderer that starts failing is invisible in the totals until someone complains.
   */
  async health() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [done, failed, processing, recentFailures, stuck] = await Promise.all([
      this.prisma.reel.count({ where: { status: 'done' } }),
      this.prisma.reel.count({ where: { status: 'failed' } }),
      this.prisma.reel.count({ where: { status: 'processing' } }),
      this.prisma.reel.findMany({
        where: { status: 'failed', createdAt: { gte: dayAgo } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          user: { select: { name: true } },
          listing: { select: { title: true } },
        },
      }),
      // Anything still 'processing' from before the last restart was orphaned: renders
      // do not survive a restart, and the boot handler only sweeps what it can see.
      this.prisma.reel.count({
        where: { status: 'processing', createdAt: { lt: dayAgo } },
      }),
    ]);

    const attempted = done + failed;

    return {
      reels: {
        done,
        failed,
        processing,
        stuck,
        // Null rather than 0% when nothing has been attempted — "0% failure" from no
        // renders at all is a number that reads as reassurance while carrying none.
        failureRate: attempted > 0 ? Math.round((failed / attempted) * 100) : null,
      },
      recentFailures: recentFailures.map((r) => ({
        id: r.id,
        at: r.createdAt,
        who: r.user.name,
        listing: r.listing?.title ?? null,
      })),
      config: {
        // Read from the environment the API is actually running with, so this reports
        // what is live rather than what the repository defaults to.
        renderer: (process.env.REEL_RENDERER ?? 'remotion').trim().toLowerCase(),
        storage: process.env.S3_BUCKET
          ? `object storage (${process.env.S3_BUCKET})`
          : 'local disk — files are lost on restart',
        cloudRenderKey: !!process.env.JSON2VIDEO_API_KEY,
        cinematicKey: !!process.env.HIGGSFIELD_KEY_ID,
        groqKey: !!process.env.GROQ_API_KEY,
      },
    };
  }

  /* ----------------------------------------------------------------- ai usage */

  /**
   * How much the AI features are being used, and what that costs.
   *
   * Only the Higgsfield figure is money we can estimate with confidence, since it is
   * billed per clip at a known credit price. Cloud renders are billed per second of
   * output, so the estimate uses the reel length the templates actually produce.
   * Amicus and the written copy run on Groq's free tier today, so they are reported as
   * volume rather than spend — the number that matters there is whether usage is
   * approaching a limit, not a bill.
   */
  async aiUsage() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      clipsWeek,
      clipsTotal,
      rendersWeek,
      rendersTotal,
      chatWeek,
      chatTotal,
      chatToday,
      topUsers,
    ] = await Promise.all([
      this.prisma.reelRender.count({
        where: { usedAi: true, createdAt: { gte: weekAgo } },
      }),
      this.prisma.reelRender.count({ where: { usedAi: true } }),
      this.prisma.reel.count({
        where: { status: 'done', createdAt: { gte: weekAgo } },
      }),
      this.prisma.reel.count({ where: { status: 'done' } }),
      this.prisma.chatMessage.count({
        where: { role: 'user', createdAt: { gte: weekAgo } },
      }),
      this.prisma.chatMessage.count({ where: { role: 'user' } }),
      this.prisma.chatMessage.count({
        where: { role: 'user', createdAt: { gte: dayAgo } },
      }),
      this.prisma.reelRender.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: weekAgo } },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 5,
      }),
    ]);

    // Named so the arithmetic below is readable, and so the assumption is visible
    // rather than buried in a multiplication.
    const SECONDS_PER_REEL = 14;
    const CREDITS_PER_SECOND = 1;

    const names = await this.prisma.user.findMany({
      where: { id: { in: topUsers.map((t) => t.userId) } },
      select: { id: true, name: true, email: true },
    });

    return {
      cinematic: {
        thisWeek: clipsWeek,
        total: clipsTotal,
        estimatedUsdThisWeek: +(
          clipsWeek *
          HIGGSFIELD_CREDITS_PER_CLIP *
          USD_PER_CREDIT
        ).toFixed(2),
      },
      cloudRenders: {
        thisWeek: rendersWeek,
        total: rendersTotal,
        // Their billing counts seconds of finished video, so this is an estimate from
        // the template length rather than a figure read back from json2video.
        estimatedCreditsThisWeek: rendersWeek * SECONDS_PER_REEL * CREDITS_PER_SECOND,
      },
      amicus: { today: chatToday, thisWeek: chatWeek, total: chatTotal },
      heaviestUsers: topUsers.map((t) => ({
        renders: t._count.userId,
        ...(names.find((n) => n.id === t.userId) ?? { id: t.userId, name: '—', email: '' }),
      })),
    };
  }

  /* ------------------------------------------------------------- user detail */

  /** Everything about one account, for when a complaint names somebody. */
  async userDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_FIELDS,
        emailVerifiedAt: true,
        _count: { select: { listings: true, reels: true, reelRenders: true } },
      },
    });
    if (!user) throw new NotFoundException('No such account');

    const [listings, reels, feedback, renders] = await Promise.all([
      this.prisma.listing.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          title: true,
          price: true,
          listingType: true,
          createdAt: true,
          photoUrls: true,
        },
      }),
      this.prisma.reel.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          createdAt: true,
          videoUrl: true,
          listing: { select: { id: true, title: true } },
          title: true,
        },
      }),
      this.prisma.feedback.findUnique({
        where: { userId: id },
        select: { rating: true, comment: true, published: true, createdAt: true },
      }),
      this.prisma.reelRender.count({
        where: { userId: id, createdAt: { gte: new Date(Date.now() - 7 * 864e5) } },
      }),
    ]);

    return { user, listings, reels, feedback, rendersThisWeek: renders };
  }

  /* ------------------------------------------------------- moderation queue */

  /**
   * Everything the automated check hid, with disputes first.
   *
   * An agent who says the machine got it wrong is waiting on a person; one who has not
   * said anything may simply have posted a car. The order reflects who is blocked.
   */
  async flagged() {
    const [listings, reels] = await Promise.all([
      this.prisma.listing.findMany({
        where: { moderationStatus: { in: ['flagged', 'appealed'] } },
        orderBy: [{ moderationStatus: 'asc' }, { moderatedAt: 'desc' }],
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          photoUrls: true,
          moderationStatus: true,
          moderationReason: true,
          moderationNote: true,
          moderatedAt: true,
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      }),
      this.prisma.reel.findMany({
        where: { moderationStatus: { in: ['flagged', 'appealed'] } },
        orderBy: [{ moderationStatus: 'asc' }, { moderatedAt: 'desc' }],
        select: {
          id: true,
          title: true,
          photoUrls: true,
          videoUrl: true,
          moderationStatus: true,
          moderationReason: true,
          moderationNote: true,
          moderatedAt: true,
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      }),
    ]);

    return { listings, reels };
  }

  /**
   * Staff disagreeing with the check. Sets 'cleared' rather than 'ok' so the item is
   * never examined again — an edit would otherwise send it back through and flag it a
   * second time, which from the agent's side looks like the decision was ignored.
   */
  async clearFlag(kind: 'listing' | 'reel', id: string) {
    const data = {
      moderationStatus: 'cleared',
      moderationReason: null,
      moderatedAt: new Date(),
    };

    if (kind === 'listing') {
      const listing = await this.prisma.listing.findUnique({
        where: { id },
        select: { userId: true, title: true },
      });
      if (!listing) throw new NotFoundException('Listing not found');

      await this.prisma.listing.update({ where: { id }, data });
      await this.notifications
        .create(
          listing.userId,
          'listing',
          'Your listing is live again',
          `"${listing.title}" has been reviewed and is visible to buyers.`,
          id,
        )
        .catch(() => undefined);
      return { cleared: true, title: listing.title };
    }

    const reel = await this.prisma.reel.findUnique({
      where: { id },
      select: { userId: true, title: true },
    });
    if (!reel) throw new NotFoundException('Reel not found');

    await this.prisma.reel.update({ where: { id }, data });
    await this.notifications
      .create(
        reel.userId,
        'reel',
        'Your reel is live again',
        `"${reel.title ?? 'Your reel'}" has been reviewed and is back in the feed.`,
        id,
      )
      .catch(() => undefined);
    return { cleared: true, title: reel.title ?? 'Reel' };
  }

  /* --------------------------------------------------------------- moderation */

  /**
   * Removes content that breaks the rules, and says why.
   *
   * The reason is required and goes to the owner as a notification. Deleting an
   * agent's work silently is the kind of thing that loses a platform its users, and a
   * reason is also the only record of why staff acted — the row itself is gone.
   */
  async removeListing(id: string, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new BadRequestException('A reason is required to remove someone’s listing');
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, title: true, userId: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    await this.prisma.listing.delete({ where: { id } });

    // create, not createForOwner: this is not activity the user opted into hearing
    // about, it is something done to their account, and they need to know regardless
    // of their notification preferences.
    await this.notifications
      .create(
        listing.userId,
        'listing',
        'A listing was removed by Reelink staff',
        `"${listing.title}" was taken down. Reason: ${trimmed}`,
      )
      .catch(() => undefined);

    return { removed: true, title: listing.title };
  }

  async removeReel(id: string, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new BadRequestException('A reason is required to remove someone’s reel');
    }

    const reel = await this.prisma.reel.findUnique({
      where: { id },
      select: { id: true, userId: true, listing: { select: { title: true } }, title: true },
    });
    if (!reel) throw new NotFoundException('Reel not found');

    await this.prisma.reel.delete({ where: { id } });

    const label = reel.listing?.title ?? reel.title ?? 'A reel';
    await this.notifications
      .create(
        reel.userId,
        'reel',
        'A reel was removed by Reelink staff',
        `The reel for "${label}" was taken down. Reason: ${trimmed}`,
      )
      .catch(() => undefined);

    return { removed: true, title: label };
  }
}
