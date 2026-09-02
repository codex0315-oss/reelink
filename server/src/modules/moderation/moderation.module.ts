import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Exported rather than global: only the two places that create content need this, and a
 * check that could be triggered from anywhere is one nobody can reason about.
 *
 * Notifications are imported because a verdict nobody hears about is not moderation, it
 * is a column in a table. Mail needs no import — MailModule is global.
 */
@Module({
  imports: [NotificationsModule],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
