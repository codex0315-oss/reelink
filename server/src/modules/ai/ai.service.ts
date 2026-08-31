import { Injectable, BadRequestException } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { basename, join } from 'path';

type DescriptionInput = {
  title: string;
  price: number;
  lotArea?: number;
  floorArea?: number;
  status: string;
  amenities: string[];
};

type ReelScriptInput = {
  title: string;
  price: number;
  status: string;
  listingType: string;
  amenities: string[];
};

type VoiceoverInput = ReelScriptInput & {
  /** Length of the reel, so the script can be written to fit inside it. */
  seconds: number;
};

const MODEL = 'openai/gpt-oss-120b';
// gpt-oss is text-only; qwen is the vision model available on this account.
const VISION_MODEL = 'qwen/qwen3.6-27b';
/** Every photo costs tokens, and a tour rarely needs more stops than this. */
const MAX_LABELLED_PHOTOS = 9;
/**
 * Hard limit of the vision model. A fourth image returns
 * 400 "Too many images provided. This model supports up to 3 images" — measured
 * against the live API, so requests are sent in batches of this size.
 */
const IMAGES_PER_REQUEST = 3;

/** Images live on disk and the model cannot reach this host, so they go inline. */
async function toDataUrl(localUrl: string, folder: string) {
  const filename = basename(localUrl);
  const buffer = await readFile(join(process.cwd(), 'uploads', folder, filename));
  const ext = filename.toLowerCase().split('.').pop();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

@Injectable()
export class AiService {
  /**
   * One place to talk to Groq, so every caller gets the same guarantees.
   *
   * The model is a reasoning model: its thinking tokens are billed against
   * max_tokens and are *not* returned in `content`. With a small budget the whole
   * allowance is spent thinking and the reply comes back empty with
   * finish_reason 'length'. `reasoning_effort: 'low'` keeps that short (~31 tokens
   * instead of ~160), and the empty check below makes the failure loud instead of
   * letting blank text flow into a listing or a video.
   */
  private async complete(prompt: string, maxTokens: number, temperature: number) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('GROQ_API_KEY is not configured');
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
        reasoning_effort: 'low',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new BadRequestException(`Groq API error: ${errText}`);
    }

    const json = await res.json();
    const choice = json.choices?.[0];
    const text = (choice?.message?.content ?? '').trim();

    if (!text) {
      throw new BadRequestException(
        `Groq returned an empty response (finish_reason: ${choice?.finish_reason ?? 'unknown'}). ` +
          'Try raising max_tokens for this prompt.',
      );
    }

    // Models like wrapping single-line answers in quotes.
    return text.replace(/^"|"$/g, '');
  }

  async generateDescription(data: DescriptionInput) {
    const prompt = `Write a compelling, professional real estate listing description (3-4 sentences) for this property:
Title: ${data.title}
Price: PHP ${data.price}
Lot Area: ${data.lotArea ?? 'N/A'} sqm
Floor Area: ${data.floorArea ?? 'N/A'} sqm
Status: ${data.status}
Amenities: ${data.amenities.join(', ') || 'None listed'}

Write only the description text, no headers or labels.`;

    const description = await this.complete(prompt, 600, 0.7);
    return { description };
  }

  async generateReelScript(data: ReelScriptInput) {
    const prompt = `Write a short, punchy hook (under 8 words) for a real estate Facebook Reel advertising this property. It should create urgency or excitement, like a headline. No hashtags, no emojis, no quotation marks.

Title: ${data.title}
Price: PHP ${data.price}
Listing type: ${data.listingType === 'rent' ? 'For rent' : 'For sale'}
Status: ${data.status}
Amenities: ${data.amenities.join(', ') || 'None listed'}

Respond with only the hook text.`;

    // Budget covers the model's reasoning tokens as well as the handful of words
    // actually returned.
    const hook = await this.complete(prompt, 300, 0.8);
    return { hook };
  }

  async generateVoiceover(data: VoiceoverInput) {
    // Roughly 2.5 spoken words per second, trimmed a little so the narration ends
    // before the video does rather than being cut off mid-sentence.
    const wordBudget = Math.max(12, Math.floor(data.seconds * 2.5) - 4);

    const prompt = `Write a spoken voiceover script for a ${data.seconds}-second real estate video ad. It will be read aloud by a text-to-speech voice, so write plain flowing sentences.

Hard limit: ${wordBudget} words maximum. Do not exceed it.
No emojis, no hashtags, no quotation marks, no stage directions, no labels.
Write prices as words a narrator would say (for example "twenty three million pesos").

Property: ${data.title}
Price: PHP ${data.price}
Listing type: ${data.listingType === 'rent' ? 'For rent' : 'For sale'}
Condition: ${data.status}
Amenities: ${data.amenities.join(', ') || 'None listed'}

Respond with only the script text.`;

    const voiceover = await this.complete(prompt, 500, 0.7);
    return { voiceover };
  }

  /**
   * Renders narration to a WAV buffer for the local Remotion renderer.
   *
   * Returns null rather than throwing when speech is unavailable — Groq's TTS models
   * require a one-time terms acceptance by the org admin, and a silent reel is a much
   * better outcome than a failed render.
   */
  async synthesizeSpeech(text: string): Promise<Buffer | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !text.trim()) return null;

    try {
      const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.GROQ_TTS_MODEL ?? 'canopylabs/orpheus-v1-english',
          input: text,
          voice: process.env.GROQ_TTS_VOICE ?? 'tara',
          response_format: 'wav',
        }),
      });

      if (!res.ok) {
        console.warn('Text-to-speech unavailable:', (await res.text()).slice(0, 200));
        return null;
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.warn('Text-to-speech request failed:', (err as Error).message);
      return null;
    }
  }

  /**
   * Names the room shown in each image, for the virtual tour's stop labels.
   *
   * Returns null rather than throwing: a tour that falls back to "Room 2 of 3" is a
   * small loss, and this runs detached after an upload where a thrown error would
   * have nothing to catch it. A partial result is still returned — the caller pads
   * the rest — so one bad batch does not discard the labels that did come back.
   */
  async labelPropertyPhotos(
    imageUrls: string[],
    folder: 'listings' | 'panoramas' = 'listings',
  ): Promise<string[] | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || imageUrls.length === 0) return null;

    const slice = imageUrls.slice(0, MAX_LABELLED_PHOTOS);
    const labels: string[] = [];

    // The model takes at most IMAGES_PER_REQUEST images, so this walks the set in
    // batches rather than sending them all and getting a 400 back.
    for (let start = 0; start < slice.length; start += IMAGES_PER_REQUEST) {
      const batch = slice.slice(start, start + IMAGES_PER_REQUEST);
      const batchLabels = await this.labelBatch(apiKey, batch, folder);
      if (!batchLabels) break;
      labels.push(...batchLabels);
    }

    return labels.length ? labels : null;
  }

  /** One request: up to three images in, up to three labels out. */
  private async labelBatch(
    apiKey: string,
    batch: string[],
    folder: string,
  ): Promise<string[] | null> {
    try {
      const parts: unknown[] = [
        {
          type: 'text',
          text:
            `You are labelling ${batch.length} photo(s) of one property, in order, for ` +
            `a virtual tour. Reply with ONLY a JSON array of ${batch.length} short ` +
            `label(s), one per photo, in the same order. Each label is at most 3 words ` +
            `naming what the photo shows: "Living room", "Kitchen", "Master bedroom", ` +
            `"Facade", "Balcony", "Garden". No numbering, no commentary, no markdown.`,
        },
      ];
      for (const url of batch) {
        parts.push({ type: 'image_url', image_url: { url: await toDataUrl(url, folder) } });
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          messages: [{ role: 'user', content: parts }],
          temperature: 0.2,
          max_tokens: 300,
        }),
      });

      if (!res.ok) {
        console.warn('Photo labelling unavailable:', (await res.text()).slice(0, 200));
        return null;
      }

      const json = await res.json();
      const raw = (json.choices?.[0]?.message?.content ?? '')
        // The vision model narrates inside <think> tags and likes fencing its JSON.
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```(?:json)?/g, '')
        .trim();

      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return null;

      const parsed: unknown = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return null;

      const labels = parsed
        .map((l) => (typeof l === 'string' ? l.trim().slice(0, 40) : ''))
        .filter((l) => l.length > 0)
        // A model that returns more labels than images would shift every later batch.
        .slice(0, batch.length);

      return labels.length ? labels : null;
    } catch (err) {
      console.warn('Photo labelling failed:', (err as Error).message);
      return null;
    }
  }
}
