import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global: uploads happen in listings, reels, auth and the Amicus chat, and threading
 * this through four module imports adds nothing over making it available everywhere.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
