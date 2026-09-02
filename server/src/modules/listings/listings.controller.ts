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
import { memoryStorage, FileFilterCallback } from 'multer';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { StorageService } from '../storage/storage.service';
import { AgentOnlyGuard } from '../../common/agent-only.guard';
import {
  readImageSizeFromBuffer,
  isPanoramaShaped,
  PANORAMA_MIN_RATIO,
} from '../../common/image-size';

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
 * Panoramas are legitimately large — a 360 shot is several times the pixels of a
 * normal photo — so the cap is shared and set to the larger of the two. The limit
 * matters more now that files are held in memory rather than streamed to disk: this
 * bounds a single request at 16 × 15MB.
 */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * memoryStorage, not diskStorage.
 *
 * The bytes have to reach StorageService so they can go to object storage. Writing them
 * to the container's filesystem first would be wasted work and, on a host that wipes
 * that filesystem between restarts, actively wrong — which is how listing photos were
 * being lost: the database kept the path while the file itself disappeared.
 */
const listingUpload = {
  storage: memoryStorage(),
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

/**
 * A normal photo dropped into the 360 viewer looks broken, so the shape is checked
 * before anything is stored — rejecting here means nothing has to be cleaned up
 * afterwards, and a bad file never reaches the bucket. The message says exactly what
 * was wrong with which file.
 */
function assertPanoramas(files?: Express.Multer.File[]) {
  const bad: string[] = [];

  for (const file of files ?? []) {
    const size = readImageSizeFromBuffer(file.buffer);
    if (!isPanoramaShaped(size)) {
      bad.push(
        size
          ? `${file.originalname} (${size.width}×${size.height})`
          : file.originalname,
      );
    }
  }

  if (bad.length > 0) {
    throw new BadRequestException(
      `These are not panoramas: ${bad.join(', ')}. A 360 photo must be at least ` +
        `${PANORAMA_MIN_RATIO}× wider than it is tall — use your phone's Panorama mode ` +
        `or a 360 camera.`,
    );
  }
}

@Controller('listings')
export class ListingsController {
  constructor(
    private listingsService: ListingsService,
    private jwt: JwtService,
    private storage: StorageService,
  ) {}

  // Staff run the platform rather than sell on it. Enforced here and not only in the
  // client, since a hidden button is still a reachable endpoint.
  @UseGuards(AuthGuard('jwt'), AgentOnlyGuard)
  @Post()
  @UseInterceptors(FileFieldsInterceptor(LISTING_FIELDS, listingUpload))
  async create(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateListingDto,
    @UploadedFiles() files: UploadedListingFiles,
  ) {
    assertPanoramas(files?.panoramas);

    // Stored before the row is written, so a storage failure means no listing rather
    // than a listing row pointing at files that were never saved.
    const photoUrls = await this.storage.saveAll('listings', files?.photos);
    const panoramaUrls = await this.storage.saveAll('panoramas', files?.panoramas);
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
  async update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
    @UploadedFiles() files: UploadedListingFiles,
  ) {
    // Only the newly uploaded ones are checked; the kept ones already passed.
    assertPanoramas(files?.panoramas);

    const newPhotoUrls = await this.storage.saveAll('listings', files?.photos);
    const photoUrls = [...(dto.existingPhotoUrls ?? []), ...newPhotoUrls];

    const newPanoramaUrls = await this.storage.saveAll('panoramas', files?.panoramas);
    const panoramaUrls = [...(dto.existingPanoramaUrls ?? []), ...newPanoramaUrls];

    return this.listingsService.update(req.user.userId, id, dto, photoUrls, panoramaUrls);
  }

  /** The agent's answer to an automated flag: a request for a human to look. */
  @UseGuards(AuthGuard('jwt'))
  @Post(':id/appeal')
  appeal(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.listingsService.appealModeration(req.user.userId, id, body?.note ?? '');
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  remove(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.listingsService.remove(req.user.userId, id);
  }
}
