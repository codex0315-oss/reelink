import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from './presence.service';

/** Enough for any real enquiry; keeps a runaway client from filling the column. */
const MAX_MESSAGE_LENGTH = 2000;

/**
 * `phone` is included so the details panel can offer a Call button. It is only ever
 * exposed to the other party in an existing conversation — someone who has already been
 * put in touch — never on a public listing or feed.
 */
const PARTICIPANT = {
  select: { id: true, name: true, avatarUrl: true, lastSeenAt: true, phone: true },
} as const;

const CONVERSATION_INCLUDE = {
  buyer: PARTICIPANT,
  seller: PARTICIPANT,
  listing: {
    // status and listingType drive the panel's badge; photoUrls doubles as its gallery.
    select: {
      id: true,
      title: true,
      price: true,
      photoUrls: true,
      status: true,
      listingType: true,
    },
  },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private presence: PresenceService,
  ) {}

  /**
   * Finds the thread for this property and pair, creating it on first contact.
   *
   * The seller is always the listing's owner, so the caller cannot nominate who they
   * are talking to — that would let anyone open a thread in someone else's name.
   */
  async openConversation(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, userId: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.userId === userId) {
      throw new BadRequestException('This is your own listing');
    }

    const where = {
      listingId_buyerId_sellerId: {
        listingId,
        buyerId: userId,
        sellerId: listing.userId,
      },
    };

    // upsert, so two quick taps on "Message" cannot race into two threads — the
    // unique index makes the second one a no-op update.
    return this.prisma.conversation.upsert({
      where,
      create: { listingId, buyerId: userId, sellerId: listing.userId },
      update: {},
      include: CONVERSATION_INCLUDE,
    });
  }

  /** Every thread the user is part of, most recently active first. */
  /**
   * The caller's inbox.
   *
   * A thread the caller deleted stays hidden until something new is said in it — the
   * comparison is against `lastMessageAt`, so a reply from the other side brings it
   * back rather than leaving them talking into a thread that will never be seen.
   */
  async listConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [
          {
            buyerId: userId,
            OR: [
              { buyerDeletedAt: null },
              { buyerDeletedAt: { lt: this.prisma.conversation.fields.lastMessageAt } },
            ],
          },
          {
            sellerId: userId,
            OR: [
              { sellerDeletedAt: null },
              { sellerDeletedAt: { lt: this.prisma.conversation.fields.lastMessageAt } },
            ],
          },
        ],
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        ...CONVERSATION_INCLUDE,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: {
          select: {
            // Unread means: sent by the other person and not yet opened.
            messages: { where: { readAt: null, senderId: { not: userId } } },
          },
        },
      },
    });

    return conversations.map((c) => this.decorate(c, userId));
  }

  /**
   * Hides a thread from one person's inbox.
   *
   * Never deletes the row. Both sides share it, so removing it would take the other
   * party's history with it — and they may still be waiting on a reply. Clearing the
   * stamp is what a later message does, which is why this is a timestamp and not a
   * boolean.
   */
  async deleteConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, buyerId: true, sellerId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conversation, userId);

    const isBuyer = conversation.buyerId === userId;
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: isBuyer ? { buyerDeletedAt: new Date() } : { sellerDeletedAt: new Date() },
    });

    return { id: conversationId, deleted: true };
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conversation, userId);

    // Someone who cleared this thread should not get the old messages back when it
    // returns — only what has been said since. The other side keeps everything.
    const clearedAt =
      conversation.buyerId === userId
        ? conversation.buyerDeletedAt
        : conversation.sellerDeletedAt;

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(clearedAt ? { createdAt: { gt: clearedAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    return { ...this.decorate(conversation, userId), messages };
  }

  async sendMessage(userId: string, conversationId: string, content: string) {
    const text = content.trim();
    if (!text) throw new BadRequestException('Message cannot be empty');
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Keep messages under ${MAX_MESSAGE_LENGTH} characters`);
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conversation, userId);

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, senderId: userId, content: text },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          // Writing in a thread you cleared brings it back for you, and keeps your own
          // message visible — leaving the stamp would hide the line you just sent.
          ...(conversation.buyerId === userId
            ? { buyerDeletedAt: null }
            : { sellerDeletedAt: null }),
        },
      }),
    ]);

    // The raw row, not the decorated one: the caller needs both participants, and
    // `otherUser` would be the other party relative to the *sender*.
    return { message, conversation };
  }

  /**
   * The recipient's app confirming a message actually arrived.
   *
   * Only messages sent *to* this user are touched, and only once — re-acking after a
   * reconnect must not move the timestamp, or "Delivered 2m ago" would keep resetting.
   */
  async markDelivered(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, buyerId: true, sellerId: true },
    });
    if (!conversation) return null;
    if (conversation.buyerId !== userId && conversation.sellerId !== userId) return null;

    const deliveredAt = new Date();
    const { count } = await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, deliveredAt: null },
      data: { deliveredAt },
    });
    if (count === 0) return null;

    return { count, deliveredAt, senderId: this.otherId(conversation, userId) };
  }

  /** Marks the other party's messages as read, and reports what changed. */
  async markRead(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, buyerId: true, sellerId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertParticipant(conversation, userId);

    const readAt = new Date();
    const { count } = await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt },
    });

    return { count, readAt, otherUserId: this.otherId(conversation, userId) };
  }

  /** Drives the badge on the sidebar. */
  async unreadCount(userId: string) {
    const count = await this.prisma.message.count({
      where: {
        readAt: null,
        senderId: { not: userId },
        conversation: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      },
    });
    return { count };
  }

  otherId(
    conversation: { buyerId: string; sellerId: string },
    userId: string,
  ) {
    return conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
  }

  private assertParticipant(
    conversation: { buyerId: string; sellerId: string },
    userId: string,
  ) {
    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }
  }

  /**
   * Reshapes a row for the client: it only cares about "the other person", not about
   * which side of the row they sit on, and presence is live rather than stored.
   */
  private decorate<
    T extends {
      buyerId: string;
      sellerId: string;
      buyer: { id: string; name: string; avatarUrl: string | null; lastSeenAt: Date | null };
      seller: { id: string; name: string; avatarUrl: string | null; lastSeenAt: Date | null };
      messages?: unknown[];
      _count?: { messages: number };
    },
  >(conversation: T, userId: string) {
    const other = conversation.buyerId === userId ? conversation.seller : conversation.buyer;
    const { buyer, seller, _count, messages, ...rest } = conversation;
    void buyer;
    void seller;

    return {
      ...rest,
      otherUser: { ...other, online: this.presence.isOnline(other.id) },
      lastMessage: Array.isArray(messages) ? (messages[0] ?? null) : undefined,
      unreadCount: _count?.messages ?? 0,
    };
  }
}
