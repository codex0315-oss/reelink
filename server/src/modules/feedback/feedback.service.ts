import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

/**
 * Ratings at or above this can appear on the landing page without anyone approving
 * them. Below it, the entry is kept and readable in admin but never shown publicly —
 * criticism is the useful half of feedback, and it does not belong on a sales page.
 */
const PUBLISHABLE_FROM = 4;

/** How many testimonials the carousel gets. Beyond this nobody is still watching. */
const PUBLIC_LIMIT = 12;

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  /**
   * Whether to show the prompt, and never more than once.
   *
   * Asked after the first finished reel rather than on arrival: that is the moment the
   * product has actually delivered something, so the answer is about an experience the
   * agent has had rather than a first impression of an empty dashboard.
   */
  async shouldAsk(userId: string): Promise<{ ask: boolean; source: string }> {
    const [user, existing, doneReels] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { feedbackDismissedAt: true },
      }),
      this.prisma.feedback.findUnique({
        where: { userId },
        select: { id: true },
      }),
      this.prisma.reel.count({ where: { userId, status: 'done' } }),
    ]);

    return {
      ask: !!user && !user.feedbackDismissedAt && !existing && doneReels > 0,
      source: 'reel',
    };
  }

  /**
   * Records the rating and decides there and then whether it is publishable.
   *
   * Three things have to hold: the rating is high, there are words to show, and the
   * user agreed to be named. An entry failing any of them is still stored — the point
   * is the honest average, not only the flattering half.
   */
  async submit(userId: string, dto: CreateFeedbackDto) {
    const comment = dto.comment?.trim() || null;
    const published = dto.rating >= PUBLISHABLE_FROM && !!comment;

    // upsert, not create: the prompt is shown once, but a double-submitted form or a
    // retried request should update the answer rather than collide with the unique
    // index and surface as an error the user cannot act on.
    return this.prisma.feedback.upsert({
      where: { userId },
      create: {
        userId,
        rating: dto.rating,
        comment,
        source: dto.source,
        showName: dto.showName ?? true,
        published,
      },
      update: {
        rating: dto.rating,
        comment,
        showName: dto.showName ?? true,
        published,
      },
      select: { id: true, rating: true, published: true },
    });
  }

  /** Closing the prompt is an answer too: it means stop asking. */
  async dismiss(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { feedbackDismissedAt: new Date() },
    });
    return { dismissed: true };
  }

  /**
   * What the landing page shows. Public, so it deliberately returns nothing that is
   * not meant to be read by strangers: no email, no id, and the name and photo only
   * where that person agreed to it.
   */
  async published() {
    const rows = await this.prisma.feedback.findMany({
      where: { published: true, comment: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: PUBLIC_LIMIT,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        showName: true,
        user: { select: { name: true, avatarUrl: true, isVerified: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.createdAt,
      name: row.showName ? row.user.name : 'A Reelink agent',
      avatarUrl: row.showName ? row.user.avatarUrl : null,
      // Worth showing: a testimonial from a verified broker carries more weight.
      isVerified: row.showName ? row.user.isVerified : false,
    }));
  }

  /** Everything, for staff. Includes the unhappy entries, which are the point. */
  async listAll() {
    const [rows, aggregate] = await Promise.all([
      this.prisma.feedback.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          rating: true,
          comment: true,
          source: true,
          showName: true,
          published: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      }),
      this.prisma.feedback.aggregate({ _avg: { rating: true }, _count: true }),
    ]);

    return {
      feedback: rows,
      // The honest average across every rating, not only the published ones.
      average: aggregate._avg.rating,
      total: aggregate._count,
    };
  }

  /**
   * Staff override for a single entry.
   *
   * Only ever turns publication off or back on. It cannot edit what somebody wrote,
   * which would turn a testimonial into a fabrication.
   */
  async setPublished(id: string, published: boolean) {
    return this.prisma.feedback.update({
      where: { id },
      data: { published },
      select: { id: true, published: true },
    });
  }
}
