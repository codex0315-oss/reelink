import {
  Controller,
  Post,
  Patch,
  Body,
  Get,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, FileFilterCallback } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { NotificationPrefsDto } from './dto/notification-prefs.dto';

const avatarFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  const allowed = /\.(jpg|jpeg|png|webp)$/i;
  if (!allowed.test(file.originalname)) {
    return cb(new BadRequestException('Profile photo must be a JPG, PNG, or WEBP image'));
  }
  cb(null, true);
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Five new accounts an hour from one source is already generous for real use,
  // and it stops a script filling the user table.
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Enough for a few typos, far short of a password guessing run.
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * Renews an expired access token. Public — the refresh token is the credential, and
   * the access token it replaces is by definition no longer valid.
   *
   * The limit is generous because a busy tab legitimately refreshes once an hour, but
   * it still caps anyone grinding guesses against a 256-bit token.
   */
  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  @Post('refresh')
  refresh(@Body() body: { refreshToken?: string }) {
    return this.authService.refresh(body?.refreshToken ?? '');
  }

  /** Revokes the refresh token so the session cannot be renewed again. */
  @Post('logout')
  logout(@Body() body: { refreshToken?: string }) {
    return this.authService.logout(body?.refreshToken);
  }

  /** Public by design, and answers the same way whether or not the email exists. */
  // Each attempt sends an email to whoever owns that address, so this is the one
  // endpoint a stranger can use to spam someone else. Kept deliberately low.
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post('forgot-password')
  forgotPassword(@Body() body: { email?: string }) {
    return this.authService.requestPasswordReset(body?.email ?? '');
  }

  // Guards against grinding the token space, even though it is 256 bits of random.
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Post('reset-password')
  resetPassword(@Body() body: { token?: string; password?: string }) {
    return this.authService.resetPassword(body?.token ?? '', body?.password ?? '');
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Req() req: { user: { userId: string } }) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          cb(null, unique);
        },
      }),
      fileFilter: avatarFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  updateProfile(
    @Req() req: { user: { userId: string } },
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    const avatarUrl = avatar ? `/uploads/avatars/${avatar.filename}` : undefined;
    return this.authService.updateProfile(req.user.userId, dto, avatarUrl);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('password')
  changePassword(
    @Req() req: { user: { userId: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      req.user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('notifications')
  updateNotifications(
    @Req() req: { user: { userId: string } },
    @Body() dto: NotificationPrefsDto,
  ) {
    return this.authService.updateNotificationPrefs(req.user.userId, dto);
  }
}
