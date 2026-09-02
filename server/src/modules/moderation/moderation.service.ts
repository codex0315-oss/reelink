import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { imageDataUrl } from '../ai/image-data-url';
import { flaggedListingEmail } from '../mail/templates';

/** The vision model on this account. Matches the one the labeller already uses. */
const VISION_MODEL = 'qwen/qwen3.6-27b';

/**
 * How many images are examined.
 *
 * Enough to catch a listing padded with one property photo and nine of something else,
 * without spending a call per photo. The model sees them together in one request.
 */
const MAX_IMAGES = 3;

/** Beyond this the request is slower than the answer is worth. */
const TIMEOUT_MS = 25_000;

type Verdict = {
  property: boolean;
  reason: string;
};

/**
 * Decides whether what someone posted is a property at all.
 *
 * Worth being precise about what this is for. It catches misuse — a selfie, a car, a
 * meme, explicit content, a loan advert with innocent photos. It cannot catch fraud: a
 * genuine house photo that is not the poster's to sell, or a real property at an
 * invented price, looks exactly like a legitimate listing to any model. Treat a pass as
 * "nothing obviously wrong", never as "verified".
 *
 * Everything here fails open. A listing is hidden only when the model actively says it
 * is not a property; if Groq is down, slow, rate-limited, or replies with something
 * unparseable, the listing stays visible. The alternative — hiding things because a
 * third party had an outage — punishes the agent for our problem.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  /**
   * Checks a listing and acts on the answer. Never throws: it is called detached, so a
   * rejection here would be an unhandled promise rather than anything a user sees.
   */
  async checkListing(listingId: string): Promise<void> {
    try {
      const listing = await this.prisma.listing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          title: true,
          description: true,
          photoUrls: true,
          panoramaUrls: true,
          userId: true,
          moderationStatus: true,
          user: { select: { name: true } },
        },
      });
      // Gone already, or a human has already had an opinion about it.
      if (!listing || listing.moderationStatus === 'cleared') return;

      const verdict = await this.classify(
        `${listing.title}\n\n${listing.description ?? ''}`,
        [...listing.photoUrls, ...listing.panoramaUrls],
      );
      if (!verdict || verdict.property) return;

      await this.prisma.listing.updateMany({
        where: { id: listingId },
        data: {
          moderationStatus: 'flagged',
          moderationReason: verdict.reason,
          moderatedAt: new Date(),
        },
      });

      await this.announce({
        kind: 'listing',
        id: listingId,
        title: listing.title,
        reason: verdict.reason,
        ownerId: listing.userId,
        ownerName: listing.user.name,
      });
    } catch (err) {
      this.logger.warn(`Listing check failed for ${listingId}: ${(err as Error).message}`);
    }
  }

  /** The same for a quick reel, which has photos and details but no listing behind it. */
  async checkReel(reelId: string): Promise<void> {
    try {
      const reel = await this.prisma.reel.findUnique({
        where: { id: reelId },
        select: {
          id: true,
          title: true,
          photoUrls: true,
          userId: true,
          listingId: true,
          moderationStatus: true,
          user: { select: { name: true } },
        },
      });
      // A reel from a saved listing reuses photos that were checked when that listing
      // was created, so re-examining them would pay for an answer we already have.
      if (!reel || reel.listingId || reel.moderationStatus === 'cleared') return;

      const verdict = await this.classify(reel.title ?? '', reel.photoUrls);
      if (!verdict || verdict.property) return;

      await this.prisma.reel.updateMany({
        where: { id: reelId },
        data: {
          moderationStatus: 'flagged',
          moderationReason: verdict.reason,
          moderatedAt: new Date(),
        },
      });

      await this.announce({
        kind: 'reel',
        id: reelId,
        title: reel.title ?? 'Untitled reel',
        reason: verdict.reason,
        ownerId: reel.userId,
        ownerName: reel.user.name,
      });
    } catch (err) {
      this.logger.warn(`Reel check failed for ${reelId}: ${(err as Error).message}`);
    }
  }

  /**
   * Asks the model, once, about the words and the pictures together.
   *
   * Both in one request because they disambiguate each other: a photo of a field with
   * "Vacant lot in Minglanilla, titled" beside it is plainly a listing, and the same
   * photo with "DM me for crypto signals" is plainly not.
   *
   * Returns null for every failure — no key, no answer, a reply that will not parse —
   * and null means "leave it alone".
   */
  private async classify(text: string, imageUrls: string[]): Promise<Verdict | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;

    const images: string[] = [];
    for (const url of imageUrls.slice(0, MAX_IMAGES)) {
      const dataUrl = await imageDataUrl(this.storage, url);
      if (dataUrl) images.push(dataUrl);
    }
    // Nothing to look at and nothing written is not evidence of anything.
    if (images.length === 0 && !text.trim()) return null;

    const withImages = await this.ask(apiKey, text, images);
    if (withImages !== 'rejected') return withImages;

    // The model refused the request outright, which in practice means it could not
    // decode one of the images — a truncated upload, or a file that is not really the
    // picture its extension claims. Losing the whole check to that would throw away the
    // text as well, and the text is usually the clearer signal for spam. So ask again
    // on the words alone rather than giving up.
    if (!text.trim()) return null;
    this.logger.warn('Retrying moderation on text alone; the images were rejected');
    const textOnly = await this.ask(apiKey, text, []);
    return textOnly === 'rejected' ? null : textOnly;
  }

  /**
   * One request. Returns the verdict, null for "could not tell", or the sentinel
   * 'rejected' when the model refused the request itself — which is the only failure
   * worth retrying differently.
   */
  private async ask(
    apiKey: string,
    text: string,
    images: string[],
  ): Promise<Verdict | null | 'rejected'> {
    const parts: unknown[] = [
      {
        type: 'text',
        text:
          `You are checking whether a post on a Philippine real estate app is a genuine ` +
          `property listing.\n\n` +
          `Listing text:\n"""${text.slice(0, 1200)}"""\n\n` +
          `Say it IS a property for anything a real agent might post: houses, condos, ` +
          `apartments, rooms, commercial units, warehouses. Also vacant lots, raw land, ` +
          `farmland and rice fields; unfinished or under-construction buildings; ` +
          `exteriors, streets, gates, subdivision entrances and signage; site plans, ` +
          `lot maps, floor plans; empty unfurnished rooms; and dark, blurry or badly ` +
          `framed photos. A poor photo of a property is still a property.\n\n` +
          `Say it is NOT a property only when it is plainly something else: a person or ` +
          `selfie, a vehicle, food, an animal, a screenshot or chat, a meme, a document ` +
          `that is not property-related, sexual content, or text advertising something ` +
          `other than property such as loans, jobs, crypto or a link to another site.\n\n` +
          `When unsure, say it IS a property.\n\n` +
          `Reply with ONLY JSON: {"property": true|false, "reason": "<one short sentence>"}. ` +
          `The reason is read by the agent who posted it, so make it specific and plain.`,
      },
    ];
    for (const dataUrl of images) {
      parts.push({ type: 'image_url', image_url: { url: dataUrl } });
    }

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          messages: [{ role: 'user', content: parts }],
          // Zero, because this is a judgement that should come out the same twice.
          temperature: 0,
          // This is a reasoning model, and its thinking is billed against max_tokens
          // without being returned. At 300 with the default effort the whole budget
          // went to thinking and the reply came back truncated mid-<think> — measured,
          // not guessed. 'none' turns that off, which suits a two-way classification:
          // there is nothing here worth deliberating about at the cost of the answer.
          //
          // The vision model accepts only 'none' or 'default' — the 'low' the text
          // model takes is rejected with a 400.
          reasoning_effort: 'none',
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Moderation model unavailable: HTTP ${res.status}`);
        // 400 is the model objecting to what we sent — almost always an image it
        // cannot decode. Anything else (429, 5xx) is the service being unavailable,
        // and retrying without the pictures would not help.
        return res.status === 400 ? 'rejected' : null;
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      // The model narrates inside <think> tags and likes fencing its JSON, same as the
      // labeller does.
      const raw = (json.choices?.[0]?.message?.content ?? '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```(?:json)?/g, '')
        .trim();

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]) as { property?: unknown; reason?: unknown };
      if (typeof parsed.property !== 'boolean') return null;

      return {
        property: parsed.property,
        reason:
          typeof parsed.reason === 'string' && parsed.reason.trim()
            ? parsed.reason.trim().slice(0, 300)
            : 'This does not look like a property listing.',
      };
    } catch (err) {
      this.logger.warn(`Moderation call failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Tells the agent and every admin.
   *
   * The agent hears immediately over the socket they already hold open, so the warning
   * arrives while they are still looking at the screen, and gets a notification as well
   * for when they are not. Admins are emailed because the whole point is that this
   * reaches them when they are not signed in.
   */
  private async announce(item: {
    kind: 'listing' | 'reel';
    id: string;
    title: string;
    reason: string;
    ownerId: string;
    ownerName: string;
  }) {
    const label = item.kind === 'listing' ? 'listing' : 'reel';

    // create, not createForOwner: this is something done to their account, not activity
    // they chose to follow.
    await this.notifications
      .create(
        item.ownerId,
        item.kind,
        `Your ${label} is being reviewed`,
        `"${item.title}" is hidden from buyers while we check it. ${item.reason} If this is a genuine property, ask us to take another look.`,
        item.id,
      )
      .catch(() => undefined);

    this.notifications.push(item.ownerId, 'moderation:flagged', {
      kind: item.kind,
      id: item.id,
      title: item.title,
      reason: item.reason,
    });

    const admins = await this.prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true, name: true, email: true },
    });

    for (const admin of admins) {
      await this.notifications
        .create(
          admin.id,
          'moderation',
          `A ${label} was flagged`,
          `${item.ownerName} posted "${item.title}". ${item.reason}`,
          item.id,
        )
        .catch(() => undefined);

      const { subject, html, text } = flaggedListingEmail({
        adminName: admin.name,
        agentName: item.ownerName,
        kind: label,
        title: item.title,
        reason: item.reason,
      });
      await this.mail
        .send({ to: admin.email, toName: admin.name, subject, html, text })
        .catch((err) =>
          this.logger.warn(`Could not email ${admin.email}: ${(err as Error).message}`),
        );
    }
  }
}
