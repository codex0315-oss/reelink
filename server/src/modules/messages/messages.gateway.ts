import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { MessagesService } from './messages.service';
import { PrismaService } from '../../prisma/prisma.service';
import { allowedOrigins } from '../../common/cors-origins';

/**
 * A typing flag with no matching "stopped" event would leave the indicator stuck on
 * forever, so the client's own timeout is backed up by one here.
 */
const TYPING_TTL_MS = 6000;

@WebSocketGateway({ cors: { origin: allowedOrigins() } })
@Injectable()
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private typingTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private jwtService: JwtService,
    private presence: PresenceService,
    private messages: MessagesService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string;
      if (!token) throw new Error('No token provided');
      const payload = this.jwtService.verify(token);
      const userId = payload.sub as string;

      client.data.userId = userId;
      client.join(`user:${userId}`);

      const cameOnline = await this.presence.connect(userId, client.id);
      // Tell this client who else is already here, so it can paint dots immediately
      // instead of waiting for someone to change state.
      client.emit('presence:snapshot', this.presence.onlineIds());
      if (cameOnline) await this.announce(userId, true);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;

    const wentOffline = await this.presence.disconnect(userId, client.id);
    if (wentOffline) await this.announce(userId, false);
  }

  /**
   * Typing is deliberately not persisted — it is only meaningful while both people
   * are looking at the thread, and it goes only to the other participant.
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; typing: boolean },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.conversationId) return;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: body.conversationId },
      select: { buyerId: true, sellerId: true },
    });
    if (!conversation) return;
    if (conversation.buyerId !== userId && conversation.sellerId !== userId) return;

    const otherId = this.messages.otherId(conversation, userId);
    this.emitTyping(otherId, body.conversationId, userId, body.typing);

    const key = `${body.conversationId}:${userId}`;
    clearTimeout(this.typingTimers.get(key));

    if (body.typing) {
      this.typingTimers.set(
        key,
        setTimeout(() => {
          this.emitTyping(otherId, body.conversationId, userId, false);
          this.typingTimers.delete(key);
        }, TYPING_TTL_MS),
      );
    } else {
      this.typingTimers.delete(key);
    }
  }

  /**
   * The recipient's app saying "I have this". Sent by the client the moment the
   * message event lands, wherever they are in the app — which is why the listener
   * driving it lives in a provider rather than on the Messages screen.
   */
  @SubscribeMessage('message:delivered')
  async handleDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    const userId = client.data.userId as string | undefined;
    if (!userId || !body?.conversationId) return;

    const result = await this.messages.markDelivered(userId, body.conversationId);
    if (!result) return;

    this.server.to(`user:${result.senderId}`).emit('message:delivered', {
      conversationId: body.conversationId,
      deliveredAt: result.deliveredAt,
    });
  }

  private emitTyping(
    toUserId: string,
    conversationId: string,
    fromUserId: string,
    typing: boolean,
  ) {
    this.server
      .to(`user:${toUserId}`)
      .emit('typing', { conversationId, userId: fromUserId, typing });
  }

  /** Only people who actually have a thread with this user need their presence. */
  private async announce(userId: string, online: boolean) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      select: { buyerId: true, sellerId: true },
    });

    const audience = new Set(
      conversations.map((c) => (c.buyerId === userId ? c.sellerId : c.buyerId)),
    );

    const payload = { userId, online, lastSeenAt: new Date().toISOString() };
    audience.forEach((id) => this.server.to(`user:${id}`).emit('presence', payload));
  }

  sendToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
