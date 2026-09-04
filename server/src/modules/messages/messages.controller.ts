import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MessagesService } from './messages.service';
import { MessagesGateway } from './messages.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { OfflineNotifierService } from './offline-notifier.service';
import { AutoReplyService } from './auto-reply.service';

type AuthedRequest = { user: { userId: string } };

@UseGuards(AuthGuard('jwt'))
@Controller('messages')
export class MessagesController {
  constructor(
    private messagesService: MessagesService,
    private gateway: MessagesGateway,
    private notifications: NotificationsService,
    private offlineNotifier: OfflineNotifierService,
    private autoReply: AutoReplyService,
  ) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.messagesService.listConversations(req.user.userId);
  }

  @Get('unread-count')
  unread(@Req() req: AuthedRequest) {
    return this.messagesService.unreadCount(req.user.userId);
  }

  /** Called by the Message button on a property; returns the thread to open. */
  @Post('open/:listingId')
  open(@Req() req: AuthedRequest, @Param('listingId') listingId: string) {
    return this.messagesService.openConversation(req.user.userId, listingId);
  }

  @Get(':id')
  getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.messagesService.getConversation(req.user.userId, id);
  }

  /**
   * Removes the thread from the caller's inbox only. The other party keeps theirs —
   * they may still be waiting on a reply, and one row is shared by both.
   */
  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.messagesService.deleteConversation(req.user.userId, id);
  }

  @Post(':id')
  async send(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    const { message, conversation } = await this.messagesService.sendMessage(
      req.user.userId,
      id,
      body?.content ?? '',
    );

    // Push to the recipient so their thread and inbox update without polling.
    const senderId = req.user.userId;
    const recipientId = this.messagesService.otherId(conversation, senderId);
    const sender = conversation.buyerId === senderId ? conversation.buyer : conversation.seller;

    this.gateway.sendToUser(recipientId, 'message', {
      conversationId: id,
      message,
      // Enough for the recipient to render a toast without fetching anything.
      from: sender,
      listing: conversation.listing,
    });

    // Also lands in the bell menu, so a missed toast is not a missed message.
    void this.notifications
      .create(
        recipientId,
        'message',
        `New message from ${sender.name}`,
        message.content.slice(0, 120),
        // The conversation, so tapping the alert opens that thread rather than the inbox.
        message.conversationId,
      )
      .catch((err) => console.error('Could not record message notification', err));

    // And an email if they are not online to see any of the above.
    void this.offlineNotifier
      .notify({
        recipientId,
        conversationId: id,
        senderName: sender.name,
        propertyTitle: conversation.listing?.title,
        content: message.content,
      })
      .catch((err) => console.error('Could not send offline message email', err));

    // A holding reply, when the agent is away. Detached like everything else here: the
    // buyer's message is already saved and must not depend on this.
    void this.autoReply
      .maybeReply({
        conversationId: id,
        recipientId,
        triggeredByAutomated: message.isAutomated,
      })
      .then((reply) => {
        if (!reply) return;

        // Pushed to the buyer, who is the one waiting, and to the agent's own session
        // in case they are signed in elsewhere — they should see what was said in
        // their name without having to go looking for it.
        for (const audience of [senderId, recipientId]) {
          this.gateway.sendToUser(audience, 'message', {
            conversationId: id,
            message: { ...reply, conversationId: id, senderId: recipientId, isAutomated: true },
            from: conversation.seller,
            listing: conversation.listing,
          });
        }
      })
      .catch((err) => console.error('Could not send auto-reply', err));

    return message;
  }

  @Post(':id/read')
  async read(@Req() req: AuthedRequest, @Param('id') id: string) {
    const result = await this.messagesService.markRead(req.user.userId, id);

    // Let the sender's ticks turn, but only when something actually changed.
    if (result.count > 0) {
      this.gateway.sendToUser(result.otherUserId, 'message:read', {
        conversationId: id,
        readAt: result.readAt,
      });
    }

    return { count: result.count };
  }
}
