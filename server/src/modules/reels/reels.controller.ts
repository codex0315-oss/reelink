import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  Res,
  UseInterceptors,
  UploadedFiles,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage, FileFilterCallback } from 'multer';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ReelsService } from './reels.service';
import { QuickReelDto } from './dto/quick-reel.dto';
import { listTemplates } from './reel-templates';
import { StorageService } from '../storage/storage.service';

const photoFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  const allowed = /\.(jpg|jpeg|png|webp)$/i;
  if (!allowed.test(file.originalname)) {
    return cb(new BadRequestException('Only JPG, PNG, or WEBP images are allowed'));
  }
  cb(null, true);
};

@UseGuards(AuthGuard('jwt'))
@Controller('reels')
export class ReelsController {
  constructor(
    private reelsService: ReelsService,
    private storage: StorageService,
  ) {}

  /** Template list is public to the app so the picker renders from one source of truth. */
  @Get('templates')
  templates() {
    return listTemplates();
  }

  /** What the agent has left today, so the cinematic toggle can say so rather than guess. */
  @Get('quota')
  quota(@Req() req: { user: { userId: string } }) {
    return this.reelsService.quotaFor(req.user.userId);
  }

  @Post('generate/:listingId')
  generate(
    @Req() req: { user: { userId: string } },
    @Param('listingId') listingId: string,
    @Body() body: { template?: string; cinematic?: boolean },
  ) {
    return this.reelsService.generateReel(
      req.user.userId,
      listingId,
      body?.template,
      body?.cinematic === true,
    );
  }

  // Reel from photos + details typed in directly, with no listing behind it.
  @Post('quick')
  @UseInterceptors(
    FilesInterceptor('photos', 10, {
      storage: memoryStorage(),
      fileFilter: photoFileFilter,
      // Matches the listing uploader; every photo here is rendered into a video, so
      // an unbounded file is both a memory and a render problem.
      limits: { fileSize: 15 * 1024 * 1024, files: 10 },
    }),
  )
  async generateQuick(
    @Req() req: { user: { userId: string } },
    @Body() dto: QuickReelDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const photoUrls = await this.storage.saveAll('listings', files);
    return this.reelsService.generateQuickReel(req.user.userId, dto, photoUrls);
  }

  @Get('mine')
  findMine(@Req() req: { user: { userId: string } }) {
    return this.reelsService.findMine(req.user.userId);
  }

  /** Everyone's finished reels — the browsing feed, not the user's own library. */
  @Get('feed')
  findFeed() {
    return this.reelsService.findFeed();
  }

  @Post(':id/regenerate')
  regenerate(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.reelsService.regenerate(req.user.userId, id);
  }

  @Delete(':id')
  remove(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.reelsService.remove(req.user.userId, id);
  }

  @Get('listing/:listingId')
  findForListing(@Param('listingId') listingId: string) {
    return this.reelsService.findForListing(listingId);
  }

  // Serves the rendered file as an attachment so the browser saves it instead of
  // playing it inline - the manual step before Facebook publishing is automated.
  @Get(':id/download')
  async download(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const reel = await this.reelsService.findOneOwned(req.user.userId, id);
    if (!reel.videoUrl) throw new NotFoundException('This reel has no video yet');

    // basename() keeps a crafted videoUrl from escaping the uploads directory.
    const filePath = join(process.cwd(), 'uploads', 'reels', basename(reel.videoUrl));
    if (!existsSync(filePath)) throw new NotFoundException('Reel video file is missing');

    const safeTitle = (reel.listing?.title ?? reel.title ?? 'reelink-reel')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return res.download(filePath, `${safeTitle || 'reelink-reel'}.mp4`);
  }
}
