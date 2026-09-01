import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from './presence.service';
import { MailService } from '../mail/mail.service';
import { newMessageEmail } from '../mail/templates';
import { clientUrl } from '../../common/client-url';

/**
 * One nudge per conversation per this window. A back-and-forth of ten messages while
 * someone is away should produce one email, not ten.
 */
const COOLDOWN_MS = 15 * 60 * 1000;

/** Enough to recognise the enquiry without reprinting the whole thing in an inbox. */
const PREVIEW_LENGTH = 180;

/**
 * Emails people about messages they could not have seen.
 *
 * The trigger is the presence tracking the chat already relies on: if the recipient
 * has no live socket, the in-app notification lands somewhere nobody is looking, so
 * it goes to their inbox instead. Someone with the app open gets nothing — the toast
 * already told them.
 */
@Injectable()
export class OfflineNotifierService {
  /**
   * In memory on purpose. This is a debounce, not a guarantee: the worst a restart
   * can do is allow one extra email, which is not worth a write on every message or
   * a column that would need migrating.
   */
  private lastEmailed = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private presence: PresenceService,
    private mail: MailService,
  ) {}

  /** Detached by every caller — a mail problem must never fail sending a message. */
  async notify(input: {
    recipientId: string;
    conversationId: string;
    senderName: string;
    propertyTitle?: string;
    content: string;
  }) {
    const { recipientId, conversationId, senderName, propertyTitle, content } = input;

    // They are looking at the app; the toast has already done this job.
    if (this.presence.isOnline(recipientId)) return;

    const lastAt = this.lastEmailed.get(conversationId) ?? 0;
    if (Date.now() - lastAt < COOLDOWN_MS) return;

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { email: true, name: true, notifyEmailMessages: true },
    });
    if (!recipient?.notifyEmailMessages) return;

    // Reserve the slot before awaiting the send, so two messages arriving together
    // cannot both pass the check above.
    this.lastEmailed.set(conversationId, Date.now());
    this.prune();

    const base = clientUrl();
    const { subject, html, text } = newMessageEmail({
      recipientName: recipient.name,
      senderName,
      propertyTitle,
      preview: truncate(content, PREVIEW_LENGTH),
      url: `${base}/dashboard?conversation=${conversationId}`,
    });

    // The cooldown stands whether or not the send succeeded. Clearing it on failure
    // sounds generous, but it means a misconfigured or failing provider retries on
    // every single message — which is exactly the burst the debounce exists to stop,
    // and risks a duplicate if the first send actually landed before erroring.
    await this.mail.send({
      to: recipient.email,
      toName: recipient.name,
      subject,
      html,
      text,
    });
  }

  /** Keeps the map from growing forever on a long-running process. */
  private prune() {
    if (this.lastEmailed.size < 500) return;
    const cutoff = Date.now() - COOLDOWN_MS;
    for (const [id, at] of this.lastEmailed) {
      if (at < cutoff) this.lastEmailed.delete(id);
    }
  }
}

function truncate(value: string, max: number) {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
