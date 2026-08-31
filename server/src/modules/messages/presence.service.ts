import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Who is online right now.
 *
 * Held in memory rather than the database: presence is only true for the lifetime of
 * this process anyway, and writing a row on every connect would be a lot of traffic
 * for something that is stale the moment the socket drops. `lastSeenAt` is persisted
 * instead, so an offline user can still be shown as "Active 12m ago".
 *
 * A user is counted once per socket — two open tabs are two sockets, and they only
 * go offline when the last one closes.
 */
@Injectable()
export class PresenceService {
  private sockets = new Map<string, Set<string>>();

  constructor(private prisma: PrismaService) {}

  async connect(userId: string, socketId: string) {
    const existing = this.sockets.get(userId);
    if (existing) existing.add(socketId);
    else this.sockets.set(userId, new Set([socketId]));

    await this.touch(userId);
    // Only the first socket is a real state change worth broadcasting.
    return existing === undefined;
  }

  async disconnect(userId: string, socketId: string) {
    const existing = this.sockets.get(userId);
    if (!existing) return false;

    existing.delete(socketId);
    if (existing.size > 0) return false;

    this.sockets.delete(userId);
    await this.touch(userId);
    return true;
  }

  isOnline(userId: string) {
    return this.sockets.has(userId);
  }

  onlineIds() {
    return [...this.sockets.keys()];
  }

  private async touch(userId: string) {
    // updateMany: a user deleted mid-session should not throw here.
    await this.prisma.user
      .updateMany({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }
}
