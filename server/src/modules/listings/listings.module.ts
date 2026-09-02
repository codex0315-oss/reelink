import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  // Only for reading an optional bearer token on the public detail route, so a
  // view can be attributed to whoever is signed in. Same secret as AuthModule.
  imports: [
    NotificationsModule,
    AiModule,
    ModerationModule,
    JwtModule.register({ secret: process.env.JWT_SECRET }),
  ],
  controllers: [ListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}