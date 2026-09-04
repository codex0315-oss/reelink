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
 * Claims the model must not make, checked against what it actually wrote.
 *
 * Instructions were not enough. Told in plain terms not to comment on availability, it
 * still opened a reply with "The unit is still listed"; told to repeat figures without
 * interpreting them, it turned an amenity line reading "Parking" into "parking is
 * included at no additional charge" — a statement about money that nobody verified.
 *
 * For claims a buyer would act on, a rule that inspects the output is worth more than
 * a rule the model is asked to follow.
 */
const FORBIDDEN_CLAIMS: { pattern: RegExp; why: string }[] = [
  {
    pattern: /\b(?:still|currently)\s+(?:available|listed|on the market|vacant)\b|\bis available\b|\bremains available\b|\bstill up for\b/i,
    why: 'it commented on availability, which only the agent can confirm',
  },
  {
    pattern: /\b(?:no|without)\s+(?:additional|extra)\s+(?:charge|cost|fee)\b|\bfree of charge\b|\bat no cost\b|\bfree parking\b|\bincluded for free\b|\bcomes free\b/i,
    why: 'it said something is free or included at no cost, which the listing does not state',
  },
  {
    pattern: /\b(?:utilities|water|electricity|association dues|dues)\s+(?:are|is)\s+included\b/i,
    why: 'it said utilities or dues are included, which the listing does not state',
  },
];

/** Returns why a reply is unusable, or null when it is fine. */
function offendingClaim(text: string): string | null {
  for (const { pattern, why } of FORBIDDEN_CLAIMS) {
    if (pattern.test(text)) return why;
  }
  return null;
}

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
  }, correction?: string): Promise<string | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;

    const agentFirst = input.agentName.split(' ')[0] || 'the agent';
    const buyerFirst = input.buyerName.split(' ')[0] || 'there';

    const facts = input.listing
      ? [
          `Title: ${input.listing.title}`,
          // The peso sign, because whatever appears here is what gets copied into the
          // reply — written as PHP it came back to buyers as "PHP 13,000".
          `Price: ₱${input.listing.price.toLocaleString()}${
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

    // Own replies are labelled as such. Without this they arrive indistinguishable
    // from lines the agent actually typed, so an instruction not to repeat itself had
    // nothing to identify — and the replies drifted into the same closing every time.
    const transcript = input.history
      .map((m) => {
        const who = m.automated ? 'You (assistant)' : m.role === 'agent' ? agentFirst : buyerFirst;
        return `${who}: ${m.content}`;
      })
      .join('\n');

    const prompt =
      `You are the assistant for ${agentFirst}, a real estate agent in the ` +
      `Philippines. ${agentFirst} is offline right now. You are replying to ` +
      `${buyerFirst} about a property ${agentFirst} has listed. Your job is to be ` +
      `genuinely useful so ${buyerFirst} is glad they messaged, and so ${agentFirst} ` +
      `comes back to a warm conversation instead of a cold one.\n\n` +
      `THE ONLY FACTS YOU HAVE ABOUT THIS PROPERTY:\n${facts}\n\n` +
      `CONVERSATION SO FAR:\n${transcript}\n\n` +
      `Write the next reply.\n\n` +
      `HOW TO WRITE IT\n` +
      `- Answer the actual question first, in the first sentence. Do not open with a ` +
      `summary of the property they did not ask for.\n` +
      `- 2 to 4 sentences. Warm, professional, plain English of the kind a Filipino ` +
      `broker would write. No "Sure thing", no "Absolutely", no exclamation marks.\n` +
      `- No sales language. Do not call anything a great option, a great deal, ` +
      `perfect, ideal, cosy, or good value. Do not comment on whether the price is ` +
      `fair. Describe, do not sell — they are already interested.\n` +
      `- Say "${agentFirst}" rather than he or she. Mention that ${agentFirst} will ` +
      `follow up at most once, in one short clause, and only when something genuinely ` +
      `needs them. Never say it twice in the same reply.\n` +
      `- Sometimes the right reply is short. If they have asked one small thing, ` +
      `answer it in one or two sentences and stop. Padding a short answer out to four ` +
      `sentences is what makes it read as generated.\n` +
      `- Look at your own earlier replies above and do not reuse their closing ` +
      `sentence or shape. Repetition is what makes this read as a machine.\n` +
      `- If your previous reply ended with a question, do not end this one with a ` +
      `question. Two in a row is an interrogation, three is a script.\n\n` +
      `IF THEY DOUBT YOU OR SAY YOU ARE AN AI\n` +
      `Only when they raise it in their latest message. Say it plainly and once: you ` +
      `are an assistant answering while ${agentFirst} is away so they are not left ` +
      `waiting, and ${agentFirst} will read the conversation and reply personally. Do ` +
      `not pretend to be a person, do not argue, and do not change the subject to the ` +
      `property. Answer the objection, then stop. Never volunteer this again in a ` +
      `later message — repeating it unprompted is what makes it sound rehearsed.\n\n` +
      `WHAT YOU MUST NOT DO\n` +
      `- Do not state any fact about this property that is not listed above: not the ` +
      `floor, the age, the view, the neighbours, the exact address, nor whether pets, ` +
      `utilities or association dues are included unless it says so.\n` +
      `- Do not turn a number into a benefit. A lot area is not a garden, a floor ` +
      `area is not a number of bedrooms, and an amenity list does not tell you who may ` +
      `use it or when. Repeat the figure and stop; do not say what it means for their ` +
      `storage, their parking, their pets or their plans.\n` +
      `- Repeat the listing's own words exactly. If it says a bright unit, do not ` +
      `write a bright building. Every concrete detail in your reply must be traceable ` +
      `to a line in the facts above.\n` +
      `- Do not offer to arrange, schedule or set up a viewing. You may ask whether ` +
      `they would like one, so ${agentFirst} can arrange it.\n` +
      `- Say nothing at all about availability, in either direction. Not that it is ` +
      `available, not that it is still listed, not that it is still on the market — a ` +
      `buyer reads any of those as a yes. Only that ${agentFirst} will confirm.\n` +
      `- Do not agree to, hint at, or discuss a different price. Do not accept or hold ` +
      `a booking. Do not promise a viewing date. Do not comment on the title, taxes, ` +
      `financing or anything legal.\n` +
      `- For any of those, say plainly that ${agentFirst} will confirm.\n` +
      `- Never invent a number.\n` +
      `- Do not claim to be ${agentFirst}, and do not sign the message.` +
      (correction ? `

CORRECTION: ${correction}` : '');

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
          // A little warmer than the moderation call, which wants the same answer
          // twice. Here two identical replies in a row are the failure.
          temperature: 0.55,
          // Discourages reaching for the same phrasing every message, which is what
          // made consecutive replies read as a form letter.
          frequency_penalty: 0.3,
          presence_penalty: 0.2,
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
      if (!text) return null;

      const offence = offendingClaim(text);
      if (!offence) return text;

      // One correction, naming the specific mistake. A general "try again" tends to
      // produce the same sentence; quoting the rule it broke does not.
      this.logger.warn(`Assistant reply rejected because ${offence}; retrying once`);
      if (correction) {
        // Already retried. Rather than send a claim we do not stand behind, say the
        // one thing that is always true and let the agent handle the rest.
        return null;
      }
      return this.ask(
        input,
        `Your previous attempt was rejected because ${offence}. Write it again ` +
          `without that. State only what the facts list contains, and leave anything ` +
          `else for ${input.agentName.split(' ')[0]} to confirm.`,
      );
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
