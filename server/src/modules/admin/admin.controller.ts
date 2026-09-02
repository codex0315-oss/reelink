import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../../common/admin.guard';
import { AdminService } from './admin.service';

type Actor = { user: { userId: string; role: string } };

/**
 * Staff tooling. Both guards are required and the order matters: the JWT guard loads
 * the account and its role, and AdminGuard then checks it.
 */
@UseGuards(AuthGuard('jwt'), AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('metrics')
  metrics() {
    return this.admin.metrics();
  }

  @Get('users')
  users(@Query('search') search?: string, @Query('page') page?: string) {
    return this.admin.listUsers(search, Math.max(0, Number(page) || 0));
  }

  @Patch('users/:id/suspension')
  setSuspension(
    @Req() req: Actor,
    @Param('id') id: string,
    @Body() body: { suspended: boolean; reason?: string; days?: number },
  ) {
    return this.admin.setSuspended(
      req.user.userId,
      id,
      body?.suspended === true,
      body?.reason,
      body?.days,
    );
  }

  @Get('verifications')
  verifications(@Query('status') status?: string) {
    return this.admin.listVerifications(status || 'pending');
  }

  @Patch('verifications/:id')
  review(
    @Req() req: Actor,
    @Param('id') id: string,
    @Body() body: { approve: boolean; note?: string },
  ) {
    return this.admin.reviewVerification(
      req.user.userId,
      id,
      body?.approve === true,
      body?.note,
    );
  }

  /** What just happened across the platform, newest first. */
  @Get('activity')
  activity(@Query('limit') limit?: string) {
    return this.admin.activity(Math.min(Math.max(Number(limit) || 40, 1), 100));
  }

  /** Daily counts for the dashboard's charts. Capped so nobody asks for a decade. */
  @Get('trends')
  trends(@Query('days') days?: string) {
    return this.admin.trends(Math.min(Math.max(Number(days) || 14, 7), 90));
  }

  @Get('health')
  health() {
    return this.admin.health();
  }

  @Get('ai-usage')
  aiUsage() {
    return this.admin.aiUsage();
  }

  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.admin.userDetail(id);
  }

  /** Everything the automated check hid, disputes first. */
  @Get('flagged')
  flagged() {
    return this.admin.flagged();
  }

  /** Staff overruling the check, which puts the item back in front of buyers. */
  @Patch('flagged/:kind/:id/clear')
  clearFlag(@Param('kind') kind: string, @Param('id') id: string) {
    return this.admin.clearFlag(kind === 'reel' ? 'reel' : 'listing', id);
  }

  /**
   * Removal, not deletion by the owner. Both take a reason, which is required and is
   * sent on to whoever's work is being taken down.
   */
  @Delete('listings/:id')
  removeListing(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.admin.removeListing(id, body?.reason ?? '');
  }

  @Delete('reels/:id')
  removeReel(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.admin.removeReel(id, body?.reason ?? '');
  }
}
