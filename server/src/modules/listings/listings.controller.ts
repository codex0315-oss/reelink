import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage, FileFilterCallback } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

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

/**
 * Multer takes one storage engine per request, so the destination is chosen per
 * field here rather than per interceptor.
 */
const listingStorage = diskStorage({
  destination: (req, file, cb) =>
    cb(null, file.fieldname === 'panoramas' ? './uploads/panoramas' : './uploads/listings'),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
    cb(null, unique);
  },
});

/**
 * Panoramas are legitimately large — a 360 shot is several times the pixels of a
 * normal photo — so the cap is shared and set to the larger of the two. Without any
 * limit at all, ten unbounded files per request is a way to fill the disk.
 */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const listingUpload = {
  storage: listingStorage,
  fileFilter: photoFileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 16 },
};

const LISTING_FIELDS = [
  { name: 'photos', maxCount: 10 },
  { name: 'panoramas', maxCount: 6 },
];

type UploadedListingFiles = {
  photos?: Express.Multer.File[];
  panoramas?: Express.Multer.File[];
};

@Controller('listings')
export class ListingsController {
  constructor(
    private listingsService: ListingsService,
    private jwt: JwtService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  @UseInterceptors(FileFieldsInterceptor(LISTING_FIELDS, listingUpload))
  create(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateListingDto,
    @UploadedFiles() files: UploadedListingFiles,
  ) {
    const photoUrls = (files?.photos ?? []).map((f) => `/uploads/listings/${f.filename}`);
    const panoramaUrls = (files?.panoramas ?? []).map((f) => `/uploads/panoramas/${f.filename}`);
    return this.listingsService.create(req.user.userId, dto, photoUrls, panoramaUrls);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('mine')
  findMine(@Req() req: { user: { userId: string } }) {
    return this.listingsService.findMine(req.user.userId);
  }

  @Get()
  findAll() {
    return this.listingsService.findAll();
  }

  /** Views for the signed-in agent's own listings, for the dashboard trend. */
  @UseGuards(AuthGuard('jwt'))
  @Get('stats/views')
  viewStats(@Req() req: { user: { userId: string } }) {
    return this.listingsService.viewStats(req.user.userId);
  }

  /**
   * Stays public — a listing is readable without an account. The token is read when
   * present purely so a view can be attributed: that is what lets us skip the owner's
   * own visits and count one person once a day rather than once a refresh.
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.listingsService.findOne(id, this.viewerFrom(req));
  }

  /** Never throws: an unreadable token just means an unattributed view. */
  private viewerFrom(req: Request): string | undefined {
    const header = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    try {
      const payload = this.jwt.verify<{ sub?: string }>(header.slice(7));
      return payload?.sub;
    } catch {
      return undefined;
    }
  }

    @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  @UseInterceptors(FileFieldsInterceptor(LISTING_FIELDS, listingUpload))
  update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
    @UploadedFiles() files: UploadedListingFiles,
  ) {
    const newPhotoUrls = (files?.photos ?? []).map((f) => `/uploads/listings/${f.filename}`);
    const photoUrls = [...(dto.existingPhotoUrls ?? []), ...newPhotoUrls];

    const newPanoramaUrls = (files?.panoramas ?? []).map(
      (f) => `/uploads/panoramas/${f.filename}`,
    );
    const panoramaUrls = [...(dto.existingPanoramaUrls ?? []), ...newPanoramaUrls];

    return this.listingsService.update(req.user.userId, id, dto, photoUrls, panoramaUrls);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.listingsService.remove(req.user.userId, id);
  }
}