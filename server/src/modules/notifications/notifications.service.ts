import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  /**
   * A live update with nothing to persist — reel render progress, for example, which
   * is meaningless once the render finishes and must never fill the bell menu.
   */
  push(userId: string, event: string, payload: unknown) {
    this.gateway.sendToUser(userId, event, payload);
  }

  async create(
    userId: string,
    type: string,
    title: string,
    body?: string,
    /** The row this is about, so the client can open it on tap. */
    entityId?: string,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body, entityId },
    });
    this.gateway.sendToUser(userId, 'notification', notification);
    return notification;
  }

  /** Only notifies the owner if they still have "my activity" switched on. */
  async createForOwner(
    userId: string,
    type: string,
    title: string,
    body?: string,
    entityId?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notifyMyActivity: true },
    });
    if (!user?.notifyMyActivity) return null;
    return this.create(userId, type, title, body, entityId);
  }

  /**
   * Tells everyone else that something new appeared on the platform. The author is
   * excluded (they know already) along with anyone who has opted out of this type.
   */
  async broadcast(
    exceptUserId: string,
    preference: 'notifyNewListings' | 'notifyNewReels',
    type: string,
    title: string,
    body?: string,
    entityId?: string,
  ) {
    const recipients = await this.prisma.user.findMany({
      where: { id: { not: exceptUserId }, [preference]: true },
      select: { id: true },
    });
    if (recipients.length === 0) return 0;

    // One insert for all rows, then a socket push each so open tabs update live.
    await this.prisma.notification.createMany({
      data: recipients.map((r) => ({ userId: r.id, type, title, body, entityId })),
    });

    for (const r of recipients) {
      this.gateway.sendToUser(r.id, 'notification', {
        type,
        title,
        body,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
    return recipients.length;
  }

  findForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}