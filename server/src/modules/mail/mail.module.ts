import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global: several modules will want to send mail, and it holds no per-request state. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
