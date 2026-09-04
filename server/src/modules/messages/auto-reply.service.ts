import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from './presence.service';

const MODEL = 'openai/gpt-oss-120b';

/**
 * A ceiling, not a cadence.
 *
 * The assistant answers each question rather than sending one holding message, so a
 * cooldown would defeat the point. This exists only to bound a runaway: a buyer who
 * sends forty messages, or any loop nobody foresaw, stops costing tokens at some
 * knowable limit.
 */
const MAX_REPLIES_PER_HOUR = 12;

/** Enough recent turns for the reply to follow the thread without resending it all. */
const HISTORY_TURNS = 10;

/** Beyond this the buyer has stopped waiting and started wondering. */
const TIMEOUT_MS = 20_000;

/**
 * Answers buyers on the agent's behalf while the agent is offline.
 *
 * It reasons and advises — whether a unit suits a family, what to look at during a
 * viewing, how the listed features relate to what was asked — because a template that
 * deflects every question is not an assistant. What it may not do is invent, and the
 * distinction is enforced in the prompt and worth stating plainly: facts about the
 * property come only from the listing row, and anything that would commit the agent
 * (availability, negotiation, reservations, timelines, title or financing) is referred
 * back to them. Those are the answers that send a buyer across Cebu for nothing.
 *
 * The first reply in a thread says it is automatic and that the agent will follow up.
 * Later replies do not repeat it: the disclosure has been made, and a disclaimer on
 * every line stops being information and becomes noise. Every automated message stays
 * flagged in the data, and the thread renders them distinctly.
 */
@Injectable()
export class AutoReplyService {
  private readonly logger = new Logger(AutoReplyService.name);

  /**
   * Timestamps per conversation, in memory. This is a safety valve rather than an
   * accounting record — losing it on restart costs at most a few extra replies, which
   * is not worth a write on every message.
   */
  private recent = new Map<string, number[]>();

  constructor(
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  /**
   * Decides whether to answer, and answers. Never throws: it is called detached, so a
   * rejection here would be an unhandled promise rather than anything a user sees.
   */
  async maybeReply(input: {
    conversationId: string;
    /** The agent — the person who is not here. */
    recipientId: string;
    /** True when the message that triggered this was itself automated. */
    triggeredByAutomated: boolean;
  }): Promise<{ id: string; content: string; createdAt: Date } | null> {
    try {
      // Never answer ourselves. Without this the assistant would see its own message
      // arrive and reply to it, forever.
      if (input.triggeredByAutomated) return null;

      // They are here. A stand-in for someone about to answer personally is worse
      // than the short wait it replaces.
      if (this.presence.isOnline(input.recipientId)) return null;
      if (!this.withinRateLimit(input.conversationId)) return null;

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
              description: true,
              price: true,
              listingType: true,
              status: true,
              floorArea: true,
              lotArea: true,
              amenities: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: HISTORY_TURNS,
            select: { content: true, senderId: true, isAutomated: true },
          },
        },
      });
      if (!conversation) return null;

      // Only ever on the agent's behalf. A buyer is not offering a service and has
      // nobody waiting on them.
      if (conversation.sellerId !== input.recipientId) return null;
      if (!conversation.seller.autoReplyEnabled) return null;

      const history = [...conversation.messages].reverse();
      // Whether this thread has already been told. The opening line is a disclosure,
      // not a signature, so it is said once.
      const isFirstReply = !history.some((m) => m.isAutomated);

      const body = await this.ask({
        agentName: conversation.seller.name,
        buyerName: conversation.buyer.name,
        listing: conversation.listing,
        history: history.map((m) => ({
          role: m.senderId === conversation.sellerId ? 'agent' : 'buyer',
          automated: m.isAutomated,
          content: m.content,
        })),
      });
      if (!body) return null;

      const agentFirst = conversation.seller.name.split(' ')[0] || 'the agent';
      const content = isFirstReply
        ? `Replying automatically while ${agentFirst} is away — they'll follow up personally.\n\n${body}`
        : body;

      this.record(input.conversationId);

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
   * Asks the model for a reply.
   *
   * The listing block is the only source of fact about the property, and the prompt
   * says so in those terms rather than hoping. Returns null on any failure — no key,
   * a timeout, an empty completion — and null means the buyer simply waits for the
   * agent, which is the behaviour this feature replaced and a safe place to fall back
   * to.
   */
  private async ask(input: {
    agentName: string;
    buyerName: string;
    listing: {
      title: string;
      description: string | null;
      price: number;
      listingType: string;
      status: string;
      floorArea: number | null;
      lotArea: number | null;
      amenities: string[];
    } | null;
    history: { role: string; automated: boolean; content: string }[];
  }): Promise<string | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;

    const agentFirst = input.agentName.split(' ')[0] || 'the agent';
    const buyerFirst = input.buyerName.split(' ')[0] || 'there';

    const facts = input.listing
      ? [
          `Title: ${input.listing.title}`,
          `Price: PHP ${input.listing.price.toLocaleString()}${
            input.listing.listingType === 'rent' ? ' per month' : ''
          }`,
          `Offer: for ${input.listing.listingType}`,
          `Furnishing: ${input.listing.status.replace(/-/g, ' ')}`,
          input.listing.floorArea ? `Floor area: ${input.listing.floorArea} sqm` : '',
          input.listing.lotArea ? `Lot area: ${input.listing.lotArea} sqm` : '',
          input.listing.amenities.length
            ? `Amenities: ${input.listing.amenities.join(', ')}`
            : '',
          input.listing.description
            ? `Description written by the agent: ${input.listing.description}`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : 'No listing details are attached to this conversation.';

    const transcript = input.history
      .map((m) => `${m.role === 'agent' ? agentFirst : buyerFirst}: ${m.content}`)
      .join('\n');

    const prompt =
      `You are ${agentFirst}'s assistant on Reelink, a Philippine property app. ` +
      `${agentFirst} is offline. You are replying to ${buyerFirst}, who is asking ` +
      `about a property ${agentFirst} has listed.\n\n` +
      `THE ONLY FACTS YOU HAVE ABOUT THIS PROPERTY:\n${facts}\n\n` +
      `CONVERSATION SO FAR:\n${transcript}\n\n` +
      `Write ${agentFirst}'s next reply.\n\n` +
      `You may: answer anything the facts above support; explain what those facts ` +
      `mean for the buyer; say whether the place suits what they described; suggest ` +
      `what to check at a viewing; give general guidance about renting or buying in ` +
      `the Philippines.\n\n` +
      `You must NOT: state any fact about this property that is not listed above — ` +
      `not the floor, the age, the view, the neighbours, the exact address, nor ` +
      `whether pets, parking or utilities are included unless it says so. You must ` +
      `NOT confirm it is still available, agree or hint at any price change, accept ` +
      `or hold a booking, promise a viewing date, or say anything about the title, ` +
      `taxes, financing or legal status. For any of those, say ${agentFirst} will ` +
      `confirm when they are back. Never invent a number.\n\n` +
      `Write 2 to 4 short sentences in warm plain English, as a helpful assistant ` +
      `speaking on ${agentFirst}'s behalf. Do not sign off, do not add a subject ` +
      `line, and do not claim to be ${agentFirst}.`;

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          max_tokens: 400,
          // Thinking tokens are billed against max_tokens and are not returned, so a
          // long deliberation here arrives as an empty reply.
          reasoning_effort: 'low',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Assistant model unavailable: HTTP ${res.status}`);
        return null;
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = (json.choices?.[0]?.message?.content ?? '').trim();
      return text || null;
    } catch (err) {
      this.logger.warn(`Assistant call failed: ${(err as Error).message}`);
      return null;
    }
  }

  private withinRateLimit(conversationId: string) {
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const times = (this.recent.get(conversationId) ?? []).filter((t) => t > hourAgo);
    this.recent.set(conversationId, times);
    return times.length < MAX_REPLIES_PER_HOUR;
  }

  private record(conversationId: string) {
    const times = this.recent.get(conversationId) ?? [];
    times.push(Date.now());
    this.recent.set(conversationId, times);

    // Keeps the map from growing for the life of the process.
    if (this.recent.size > 500) {
      const hourAgo = Date.now() - 60 * 60 * 1000;
      for (const [id, stamps] of this.recent) {
        if (!stamps.some((t) => t > hourAgo)) this.recent.delete(id);
      }
    }
  }
}
