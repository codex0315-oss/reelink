import { Module } from '@nestjs/common';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';
import { Json2VideoService } from './json2video.service';
import { HiggsfieldService } from './higgsfield.service';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AiModule, NotificationsModule],
  controllers: [ReelsController],
  providers: [ReelsService, Json2VideoService, HiggsfieldService],
})
export class ReelsModule {}
