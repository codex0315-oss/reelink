import {
  Body,
  Controller,
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
    @Body() body: { suspended: boolean; reason?: string },
  ) {
    return this.admin.setSuspended(
      req.user.userId,
      id,
      body?.suspended === true,
      body?.reason,
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
}
