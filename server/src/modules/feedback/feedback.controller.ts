import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../../common/admin.guard';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

type Authed = { user: { userId: string } };

@Controller('feedback')
export class FeedbackController {
  constructor(private feedback: FeedbackService) {}

  /**
   * The landing page's testimonials. Deliberately the only unauthenticated route here
   * — everything else needs an account, and this returns nothing private.
   */
  @Get('public')
  publicFeedback() {
    return this.feedback.published();
  }

  /** Whether this user should see the prompt. Cheap, and asked once per session. */
  @UseGuards(AuthGuard('jwt'))
  @Get('prompt')
  prompt(@Req() req: Authed) {
    return this.feedback.shouldAsk(req.user.userId);
  }

  // A person answers this once. Anything beyond a few attempts an hour is a script,
  // and this route can write to the public landing page.
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @UseGuards(AuthGuard('jwt'))
  @Post()
  submit(@Req() req: Authed, @Body() dto: CreateFeedbackDto) {
    return this.feedback.submit(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('dismiss')
  dismiss(@Req() req: Authed) {
    return this.feedback.dismiss(req.user.userId);
  }

  /** Staff: every rating, including the ones never shown publicly. */
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get('all')
  all() {
    return this.feedback.listAll();
  }

  /** Staff: pull a testimonial off the landing page, or put one back. */
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Patch(':id/published')
  setPublished(@Param('id') id: string, @Body() body: { published: boolean }) {
    return this.feedback.setPublished(id, body.published === true);
  }
}
