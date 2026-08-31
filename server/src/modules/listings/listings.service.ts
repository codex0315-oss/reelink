import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AiService } from '../ai/ai.service';
import { unlink } from 'fs/promises';
import { join, basename } from 'path';
import {
  readImageSize,
  isPanoramaShaped,
  PANORAMA_MIN_RATIO,
} from '../../common/image-size';

// Uploaded files live on disk outside the database, so removing a row is not enough -
// without this the uploads folder grows forever as listings are edited and deleted.
// basename() keeps a stored path from ever pointing outside its upload folder.
async function deleteUploads(folder: 'listings' | 'reels' | 'panoramas', urls: string[]) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        await unlink(join(process.cwd(), 'uploads', folder, basename(url)));
      } catch {
        // already gone, or never written - nothing to clean up
      }
    }),
  );
}

@Injectable()
export class ListingsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private aiService: AiService,
  ) {}

  /**
   * A normal photo dropped into the 360 viewer looks broken, so the shape is checked
   * before it is ever stored. Rejected files are removed rather than left orphaned on
   * disk, and the message says exactly what was wrong with which file.
   */
  private async assertPanoramas(panoramaUrls: string[]) {
    const bad: string[] = [];

    for (const url of panoramaUrls) {
      const path = join(process.cwd(), 'uploads', 'panoramas', basename(url));
      const size = await readImageSize(path);
      if (!isPanoramaShaped(size)) {
        bad.push(
          size ? `${basename(url)} (${size.width}×${size.height})` : basename(url),
        );
      }
    }

    if (bad.length > 0) {
      await deleteUploads('panoramas', panoramaUrls);
      throw new BadRequestException(
        `These are not panoramas: ${bad.join(', ')}. A 360 photo must be at least ` +
          `${PANORAMA_MIN_RATIO}× wider than it is tall — use your phone's Panorama mode ` +
          `or a 360 camera.`,
      );
    }
  }

  async create(
    userId: string,
    dto: CreateListingDto,
    photoUrls: string[],
    panoramaUrls: string[] = [],
  ) {
    // Before the row is written, so a rejected panorama leaves nothing behind.
    await this.assertPanoramas(panoramaUrls);

    const listing = await this.prisma.listing.create({
      data: {
        panoramaUrls,
        title: dto.title,
        description: dto.description,
        price: dto.price,
        lotArea: dto.lotArea,
        floorArea: dto.floorArea,
        amenities: dto.amenities ?? [],
        status: dto.status,
        listingType: dto.listingType,
        latitude: dto.latitude,
        longitude: dto.longitude,
        publishToFacebook: dto.publishToFacebook ?? false,
        photoUrls,
        userId,
      },
    });

    // Let everyone else know a property appeared in Browse. Detached on purpose:
    // a notification failure must never fail the listing that was just saved.
    void this.notificationsService
      .broadcast(
        userId,
        'notifyNewListings',
        'listing',
        'New property listed',
        `"${listing.title}" — ₱${listing.price.toLocaleString()} is now on Reelink.`,
        listing.id,
      )
      .catch((err) => console.error('Could not broadcast new listing', err));

    void this.labelPanoramasInBackground(listing.id, panoramaUrls);

    return listing;
  }

  /**
   * Names the room in each panorama, so tour stops read "Living room" rather than
   * "Room 2 of 3". Detached like the broadcast above: the agent should not wait on a
   * vision model to finish saving a listing, and a failure here changes nothing about
   * the listing itself.
   */
  private async labelPanoramasInBackground(listingId: string, panoramaUrls: string[]) {
    if (panoramaUrls.length === 0) return;
    try {
      const labels = await this.aiService.labelPropertyPhotos(panoramaUrls, 'panoramas');
      if (!labels) return;
      // updateMany, so a listing deleted while the model was thinking is a no-op
      // rather than an unhandled P2025 rejection.
      await this.prisma.listing.updateMany({
        where: { id: listingId },
        data: { panoramaLabels: labels },
      });
    } catch (err) {
      console.error('Could not label listing panoramas', err);
    }
  }

  findMine(userId: string) {
    return this.prisma.listing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAll() {
    return this.prisma.listing.findMany({
      orderBy: { createdAt: 'desc' },
      // avatarUrl so Browse can show who listed the property, not just their name.
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
  }

  async findOne(id: string, viewerId?: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      // The detail page carries the seller's contact card. phone is only exposed
      // here, not on the list endpoint, and it is the number the user entered under
      // "used for buyer enquiries" — never their email or anything else private.
      include: {
        user: { select: { id: true, name: true, avatarUrl: true, phone: true } },
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    // Detached: a view is a side effect of reading the page, and the buyer should never
    // wait on our bookkeeping to see the property.
    void this.recordView(id, listing.userId, viewerId);

    return listing;
  }

  /**
   * Records that someone looked at a listing.
   *
   * Two things are deliberately not counted. An agent opening their own listing would
   * otherwise inflate the number they use to judge it — the figure has to mean
   * *interest*, not *activity*. And a viewer is counted once per listing per day, so
   * refreshing or coming back from the map does not turn one person into twenty.
   *
   * Signed-out visitors are not recorded at all. Deduplicating them would need an IP or
   * a fingerprint, and an inflated number is worse than an honest gap — today every
   * route that reaches this page is behind a login anyway.
   */
  private async recordView(listingId: string, ownerId: string, viewerId?: string) {
    if (!viewerId || viewerId === ownerId) return;

    try {
      const since = new Date();
      since.setHours(0, 0, 0, 0);

      const seenToday = await this.prisma.listingView.findFirst({
        where: { listingId, viewerId, createdAt: { gte: since } },
        select: { id: true },
      });
      if (seenToday) return;

      await this.prisma.listingView.create({ data: { listingId, viewerId } });
    } catch {
      // Analytics must never break browsing.
    }
  }

  /**
   * Views per day for the agent's listings, oldest first.
   *
   * Only the timestamps are selected, and only for the window being drawn, so the row
   * count stays proportional to recent activity rather than to all history. Bucketing
   * happens here rather than in SQL because the day boundaries have to match the
   * server's local midnight, which a UTC `date_trunc` would not.
   */
  async viewStats(userId: string, days = 14) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const rows = await this.prisma.listingView.findMany({
      where: { listing: { userId }, createdAt: { gte: since } },
      select: { createdAt: true },
    });

    const byDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      byDay.set(dayKey(d), 0);
    }
    for (const r of rows) {
      const key = dayKey(r.createdAt);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }

    const series = [...byDay.entries()].map(([date, count]) => ({ date, count }));
    const half = Math.floor(days / 2);
    const recent = series.slice(half).reduce((n, d) => n + d.count, 0);
    const previous = series.slice(0, half).reduce((n, d) => n + d.count, 0);

    return {
      series,
      total: rows.length,
      recent,
      previous,
      // Null rather than 0% when there is no baseline — "up 100%" from nothing is a
      // number that reads as insight while carrying none.
      trendPct: previous > 0 ? Math.round(((recent - previous) / previous) * 100) : null,
    };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateListingDto,
    photoUrls?: string[],
    panoramaUrls?: string[],
  ) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.userId !== userId) throw new ForbiddenException('Not your listing');

    // Only the newly uploaded ones need checking; the kept ones already passed.
    if (panoramaUrls) {
      const added = panoramaUrls.filter((url) => !listing.panoramaUrls.includes(url));
      await this.assertPanoramas(added);
    }

    const { existingPhotoUrls, existingPanoramaUrls, ...rest } = dto;
    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        ...rest,
        ...(photoUrls ? { photoUrls } : {}),
        ...(panoramaUrls ? { panoramaUrls } : {}),
      },
    });

    // Photos the user removed while editing are no longer referenced anywhere.
    if (photoUrls) {
      const dropped = listing.photoUrls.filter((url) => !photoUrls.includes(url));
      await deleteUploads('listings', dropped);

    }

    if (panoramaUrls) {
      const dropped = listing.panoramaUrls.filter((url) => !panoramaUrls.includes(url));
      await deleteUploads('panoramas', dropped);

      // The labels are positional, so any change to the set invalidates all of them.
      const changed =
        panoramaUrls.length !== listing.panoramaUrls.length ||
        panoramaUrls.some((url, i) => url !== listing.panoramaUrls[i]);
      if (changed) void this.labelPanoramasInBackground(id, panoramaUrls);
    }

    return updated;
  }

  async remove(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { reels: { select: { videoUrl: true } } },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.userId !== userId) throw new ForbiddenException('Not your listing');

    // Reels cascade-delete in the database, so collect their videos before the rows go.
    const reelVideos = listing.reels
      .map((reel) => reel.videoUrl)
      .filter((url): url is string => !!url);

    const deleted = await this.prisma.listing.delete({ where: { id } });

    await Promise.all([
      deleteUploads('listings', listing.photoUrls),
      deleteUploads('panoramas', listing.panoramaUrls),
      deleteUploads('reels', reelVideos),
    ]);

    return deleted;
  }
}
/**
 * A YYYY-MM-DD key in the server's own timezone.
 *
 * `toISOString()` cannot be used here. The day boundaries are set with `setHours(0,0,0,0)`,
 * which is local, so keying the buckets by UTC put them out of step: at UTC+8 the bucket
 * list ended on *yesterday's* UTC date while today's views keyed to today's, so every
 * view recorded today landed outside the series and the chart stayed flat while the
 * total climbed. Local on both sides, or neither.
 */
function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
