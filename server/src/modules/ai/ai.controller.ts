import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage, FileFilterCallback } from 'multer';
import { Request } from 'express';
import { AiService } from './ai.service';
import { AmicusService } from './amicus.service';
import { StorageService } from '../storage/storage.service';

const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  const allowed = /\.(jpg|jpeg|png|webp)$/i;
  if (!allowed.test(file.originalname)) {
    return cb(new BadRequestException('Only JPG, PNG, or WEBP images can be attached'));
  }
  cb(null, true);
};

@UseGuards(AuthGuard('jwt'))
@Controller('ai')
export class AiController {
  constructor(
    private aiService: AiService,
    private amicusService: AmicusService,
    private storage: StorageService,
  ) {}

  // Every call is a paid Groq completion, so this is capped per account.
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post('generate-description')
  generateDescription(
    @Body()
    body: {
      title: string;
      price: number;
      lotArea?: number;
      floorArea?: number;
      status: string;
      amenities: string[];
    },
  ) {
    return this.aiService.generateDescription(body);
  }

  @Get('chat')
  chatHistory(@Req() req: { user: { userId: string } }) {
    return this.amicusService.history(req.user.userId);
  }

  @Delete('chat')
  clearChat(@Req() req: { user: { userId: string } }) {
    return this.amicusService.clear(req.user.userId);
  }

  // Vision calls with attached photos are the most expensive thing Amicus does.
  @Throttle({ default: { limit: 40, ttl: 3_600_000 } })
  @Post('chat')
  @UseInterceptors(
    FilesInterceptor('images', 4, {
      storage: memoryStorage(),
      fileFilter: imageFileFilter,
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async chat(
    @Req() req: { user: { userId: string } },
    @Body() body: { message?: string },
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    // Stored rather than kept in memory for the one call: the URLs go into the chat
    // history, so the images have to still be there when the thread is reopened.
    const imageUrls = await this.storage.saveAll('chat', files);
    return this.amicusService.ask(req.user.userId, body.message ?? '', imageUrls);
  }
}
