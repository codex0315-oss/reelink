import { Controller, Get, Patch, Post, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';

@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll(@Req() req: { user: { userId: string } }) {
    return this.notificationsService.findForUser(req.user.userId);
  }

  @Patch('read-all')
  markAllRead(@Req() req: { user: { userId: string } }) {
    return this.notificationsService.markAllRead(req.user.userId);
  }

  @Patch(':id/read')
  markRead(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.notificationsService.markRead(req.user.userId, id);
  }

  @Post('test')
  sendTest(@Req() req: { user: { userId: string } }) {
    return this.notificationsService.create(
      req.user.userId,
      'system',
      'Test notification',
      'This is a real-time test notification from Reelink.',
    );
  }
}