import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { PresenceService } from './presence.service';
import { OfflineNotifierService } from './offline-notifier.service';
import { AutoReplyService } from './auto-reply.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [MessagesGateway, MessagesService, PresenceService, OfflineNotifierService, AutoReplyService],
  controllers: [MessagesController],
  exports: [MessagesService, PresenceService],
})
export class MessagesModule {}
