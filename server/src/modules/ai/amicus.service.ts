import { StorageService } from '../storage/storage.service';
import { imageDataUrl } from './image-data-url';
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// gpt-oss is the stronger writer but is text-only; qwen is the one on this account
// that accepts images, so a message with attachments is routed to it.
const TEXT_MODEL = 'openai/gpt-oss-120b';
const VISION_MODEL = 'qwen/qwen3.6-27b';

// How much of the conversation to replay as context. Keeps prompts bounded on a
// long-running thread while still feeling like a continuous chat.
const HISTORY_LIMIT = 20;

type ChatTurn = { role: string; content: string; imageUrls: string[] };

@Injectable()
export class AmicusService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  private get apiKey() {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new BadRequestException('GROQ_API_KEY is not configured');
    return key;
  }

  history(userId: string) {
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async clear(userId: string) {
    await this.prisma.chatMessage.deleteMany({ where: { userId } });
    return { cleared: true };
  }

  async ask(userId: string, message: string, imageUrls: string[]) {
    if (!message.trim() && imageUrls.length === 0) {
      throw new BadRequestException('Ask a question or attach a photo');
    }

    await this.prisma.chatMessage.create({
      data: { userId, role: 'user', content: message, imageUrls },
    });

    const [priorTurns, systemPrompt] = await Promise.all([
      this.recentTurns(userId),
      this.buildSystemPrompt(userId),
    ]);

    const reply = await this.callGroq(systemPrompt, priorTurns, imageUrls);

    const saved = await this.prisma.chatMessage.create({
      data: { userId, role: 'assistant', content: reply, imageUrls: [] },
    });

    return saved;
  }

  private async recentTurns(userId: string): Promise<ChatTurn[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    return rows.reverse();
  }

  /**
   * Amicus is deliberately narrow: property matters plus the product itself. The
   * user's own listings are summarised in so questions like "which listing has no
   * reel yet" can be answered without a separate lookup tool.
   */
  private async buildSystemPrompt(userId: string) {
    const [listings, reels] = await Promise.all([
      this.prisma.listing.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          price: true,
          status: true,
          listingType: true,
          amenities: true,
          lotArea: true,
          floorArea: true,
          photoUrls: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.reel.findMany({
        where: { userId },
        select: { listingId: true, status: true, title: true },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    const withReel = new Set(reels.map((r) => r.listingId).filter(Boolean));

    const listingLines = listings.length
      ? listings
          .map((l) => {
            const bits = [
              `"${l.title}"`,
              `PHP ${l.price.toLocaleString()}`,
              l.listingType === 'rent' ? 'for rent' : 'for sale',
              l.status,
              `${l.photoUrls.length} photo(s)`,
              withReel.has(l.id) ? 'has a reel' : 'no reel yet',
            ];
            if (l.lotArea) bits.push(`lot ${l.lotArea}sqm`);
            if (l.floorArea) bits.push(`floor ${l.floorArea}sqm`);
            if (l.amenities.length) bits.push(`amenities: ${l.amenities.join(', ')}`);
            return `- ${bits.join(' | ')}`;
          })
          .join('\n')
      : '- (this user has no listings yet)';

    const rendering = reels.filter((r) => r.status === 'processing').length;
    const failed = reels.filter((r) => r.status === 'failed').length;

    return `You are Amicus AI, the assistant inside Reelink — an AI marketing platform for Philippine real estate.

SCOPE — you only help with:
1. Real estate in the Philippines: buying, selling, renting, valuation and pricing, financing (Pag-IBIG, bank loans, in-house), taxes and fees (capital gains tax, DST, transfer tax, registration), titles and documents (TCT/CCT, Deed of Absolute Sale, tax declaration), and the transaction process.
2. Marketing properties: listing descriptions, Facebook captions, reel hooks, open-house posts, buyer follow-up messages.
3. Using Reelink itself: creating listings, generating reels, exporting video, why a render might fail.

If asked about anything outside those areas, briefly say it is outside what you help with and steer back to property matters. Do not answer general trivia, coding, medical, or unrelated questions.

HOW TO ANSWER:
- Be concise and practical. Short paragraphs or tight bullet lists.
- Your reply is shown in a narrow chat panel. Never use markdown tables, headings, or horizontal rules — they do not render. Use short lines and simple "- " bullets instead. Keep answers under about 180 words unless the user asks for more.
- Use Philippine context by default: peso amounts, local agencies (BIR, Registry of Deeds, Pag-IBIG, HLURB/DHSUD), local norms.
- When you state figures like tax rates, note that rates and rules change and a broker, lawyer or the BIR should confirm before acting.
- You are not a licensed broker or lawyer. For anything binding, recommend professional verification.
- Never invent details about the user's properties. Use only what is listed below.

WHAT REELINK CAN DO TODAY: AI listing descriptions, AI vertical video reels (1080x1920) with an AI voiceover, and exporting the finished MP4.
NOT YET AVAILABLE: publishing directly to Facebook, and syncing Facebook comments into leads. If asked, say those are coming soon and that for now the user exports the video and posts it themselves.

THIS USER'S PROPERTIES:
${listingLines}

REEL STATUS: ${reels.length} reel(s) total${rendering ? `, ${rendering} currently rendering` : ''}${failed ? `, ${failed} failed` : ''}.`;
  }

  private async callGroq(systemPrompt: string, turns: ChatTurn[], newImageUrls: string[]) {
    const useVision = newImageUrls.length > 0;

    // Prior turns are replayed as plain text; only the newest message carries images.
    const messages: unknown[] = [
      { role: 'system', content: systemPrompt },
      ...turns.slice(0, -1).map((t) => ({
        role: t.role,
        content:
          t.imageUrls.length > 0 ? `${t.content}\n[user attached ${t.imageUrls.length} photo(s)]` : t.content,
      })),
    ];

    const latest = turns[turns.length - 1];
    if (useVision) {
      const parts: unknown[] = [
        { type: 'text', text: latest?.content || 'Look at this property photo.' },
      ];
      for (const url of newImageUrls) {
        const dataUrl = await imageDataUrl(this.storage, url);
        if (dataUrl) parts.push({ type: 'image_url', image_url: { url: dataUrl } });
      }
      messages.push({ role: 'user', content: parts });
    } else {
      messages.push({ role: 'user', content: latest?.content ?? '' });
    }

    const body: Record<string, unknown> = {
      model: useVision ? VISION_MODEL : TEXT_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 1200,
    };
    // Only gpt-oss takes this, and without it a short budget returns empty content.
    if (!useVision) body.reasoning_effort = 'low';

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new BadRequestException(`Groq API error: ${await res.text()}`);
    }

    const json = await res.json();
    const raw = (json.choices?.[0]?.message?.content ?? '').trim();
    const text = this.stripThinking(raw);

    if (!text) {
      throw new BadRequestException(
        `Amicus returned an empty reply (finish_reason: ${json.choices?.[0]?.finish_reason ?? 'unknown'})`,
      );
    }
    return text;
  }

  /** The vision model narrates its reasoning inside <think> tags; users shouldn't see it. */
  private stripThinking(text: string) {
    return text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/i, '')
      .trim();
  }

}
