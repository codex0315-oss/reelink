import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from './presence.service';

/**
 * One holding reply per conversation per this window.
 *
 * A buyer typing four questions in a row should be answered once, not four times. The
 * window is long enough that a burst of enquiry is a single reply and short enough that
 * someone returning hours later is not ignored.
 */
const COOLDOWN_MS = 30 * 60 * 1000;

/** Beyond a handful, an amenity list stops being useful and starts being a wall. */
const MAX_AMENITIES = 4;

/**
 * Answers buyers on behalf of an agent who is not online.
 *
 * Deliberately not intelligent. Every sentence is assembled from columns already on the
 * listing row — title, price, type, furnishing, areas, amenities — so there is no path
 * by which it can state something untrue about someone else's property. It acknowledges,
 * repeats the facts the buyer is most likely to want, and says a person is coming. It
 * does not answer questions, because the questions worth asking here ("is the title
 * clean?", "will they take 3M?") are exactly the ones a machine must not answer.
 *
 * The reply carries the agent's name, which is what makes labelling it non-negotiable:
 * it is marked automated in the data, tagged in the interface, and says so in its own
 * text. A buyer should never come away believing the agent personally told them
 * anything.
 */
@Injectable()
export class AutoReplyService {
  private readonly logger = new Logger(AutoReplyService.name);

  /**
   * In memory, like the email debounce next door. Losing it on restart costs at most
   * one extra reply, which is not worth a column or a write per message.
   */
  private lastRepliedAt = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  /**
   * Decides whether to answer, and answers.
   *
   * Returns the created message so the caller can push it over the socket the buyer is
   * already holding, or null when it chose to stay quiet. Never throws: it is called
   * detached, and a failure here must not affect the message that triggered it.
   */
  async maybeReply(input: {
    conversationId: string;
    /** The agent — the person who is not here. */
    recipientId: string;
    /** The buyer, who gets the reply. */
    senderId: string;
    /** True when the message that triggered this was itself automated. */
    triggeredByAutomated: boolean;
  }): Promise<{ id: string; content: string; createdAt: Date } | null> {
    try {
      // Never answer ourselves. Without this the responder would see its own message
      // arrive and reply to it, forever.
      if (input.triggeredByAutomated) return null;

      // They are here. A holding reply to someone who is about to answer personally is
      // worse than nothing.
      if (this.presence.isOnline(input.recipientId)) return null;

      const lastAt = this.lastRepliedAt.get(input.conversationId) ?? 0;
      if (Date.now() - lastAt < COOLDOWN_MS) return null;

      const conversation = await this.prisma.conversation.findUnique({
        where: { id: input.conversationId },
        select: {
          id: true,
          sellerId: true,
          seller: { select: { name: true, autoReplyEnabled: true } },
          buyer: { select: { name: true } },
          listing: {
            select: {
              title: true,
              price: true,
              listingType: true,
              status: true,
              floorArea: true,
              lotArea: true,
              amenities: true,
            },
          },
        },
      });
      if (!conversation) return null;

      // Only ever on the agent's behalf. A buyer is not offering a service and has
      // nothing to hold anyone with.
      if (conversation.sellerId !== input.recipientId) return null;
      if (!conversation.seller.autoReplyEnabled) return null;

      // Claim the slot before writing, so two messages arriving together cannot both
      // pass the check above and produce two replies.
      this.lastRepliedAt.set(input.conversationId, Date.now());
      this.prune();

      const content = this.compose({
        agentName: conversation.seller.name,
        buyerName: conversation.buyer.name,
        listing: conversation.listing,
      });

      return await this.prisma.message.create({
        data: {
          conversationId: input.conversationId,
          senderId: conversation.sellerId,
          content,
          isAutomated: true,
        },
        select: { id: true, content: true, createdAt: true },
      });
    } catch (err) {
      this.logger.warn(`Auto-reply failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Builds the message.
   *
   * Every value interpolated here comes from the listing row. Nothing is inferred,
   * nothing is rounded into a claim, and where a field is empty the sentence is left
   * out rather than filled with a guess.
   */
  private compose(input: {
    agentName: string;
    buyerName: string;
    listing: {
      title: string;
      price: number;
      listingType: string;
      status: string;
      floorArea: number | null;
      lotArea: number | null;
      amenities: string[];
    } | null;
  }): string {
    const firstName = input.buyerName.split(' ')[0] || 'there';
    const agentFirst = input.agentName.split(' ')[0] || 'the agent';

    if (!input.listing) {
      return (
        `Hi ${firstName}, thanks for your message. ${agentFirst} is not online right ` +
        `now but will reply personally as soon as they are.\n\n` +
        `— Automatic reply from Reelink, not written by ${agentFirst}.`
      );
    }

    const l = input.listing;
    const forWhat = l.listingType === 'rent' ? 'for rent' : 'for sale';
    const period = l.listingType === 'rent' ? ' per month' : '';

    const facts: string[] = [
      `₱${l.price.toLocaleString()}${period}, ${forWhat}`,
      l.status ? `${l.status.replace(/-/g, ' ')}` : '',
      l.floorArea ? `${l.floorArea} sqm floor area` : '',
      l.lotArea ? `${l.lotArea} sqm lot area` : '',
      l.amenities.length
        ? l.amenities.slice(0, MAX_AMENITIES).join(', ')
        : '',
    ].filter(Boolean);

    return (
      `Hi ${firstName}, thanks for asking about ${l.title}.\n\n` +
      `${facts.join(' · ')}\n\n` +
      `${agentFirst} is not online at the moment and will reply personally soon. ` +
      `Anything not listed above — availability, negotiation, requirements — is best ` +
      `answered by them directly.\n\n` +
      `— Automatic reply from Reelink, not written by ${agentFirst}.`
    );
  }

  /** Keeps the debounce map from growing for the life of the process. */
  private prune() {
    if (this.lastRepliedAt.size < 500) return;
    const cutoff = Date.now() - COOLDOWN_MS;
    for (const [id, at] of this.lastRepliedAt) {
      if (at < cutoff) this.lastRepliedAt.delete(id);
    }
  }
}
