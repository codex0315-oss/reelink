import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserThrottlerGuard } from './common/user-throttler.guard';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ListingsModule } from './modules/listings/listings.module';
import { AiModule } from './modules/ai/ai.module';
import { ReelsModule } from './modules/reels/reels.module';
import { AdminModule } from './modules/admin/admin.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { MessagesModule } from './modules/messages/messages.module';
import { MailModule } from './modules/mail/mail.module';

@Module({
  imports: [
    // A single generous ceiling applied everywhere, so a new endpoint is protected
    // the day it is written rather than the day someone remembers to decorate it.
    // Anything that costs money, sends mail or accepts a password tightens this with
    // @Throttle on the route itself.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    // Only so UserThrottlerGuard can read the caller id out of the bearer token.
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    PrismaModule,
    StorageModule,
    AuthModule,
    NotificationsModule,
    ListingsModule,
    AiModule,
    ReelsModule,
    AdminModule,
    FeedbackModule,
    MessagesModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
