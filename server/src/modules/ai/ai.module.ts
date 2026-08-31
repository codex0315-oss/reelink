import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AmicusService } from './amicus.service';

@Module({
  controllers: [AiController],
  providers: [AiService, AmicusService],
  exports: [AiService],
})
export class AiModule {}
