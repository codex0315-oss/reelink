import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Every switch on the Settings page has to appear here.
 *
 * The global pipe runs with `whitelist: true`, which silently drops any property this
 * class does not declare — so a field missing from here is not a validation error, it
 * is a setting that appears to save and never does. notifyEmailMessages was exactly
 * that: shipped in the interface, absent from this file, and quietly discarded on every
 * request. Confirmed by asking the API to set it true and reading back false.
 */
export class NotificationPrefsDto {
  @IsOptional()
  @IsBoolean()
  notifyNewListings?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyNewReels?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyMyActivity?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyEmailMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  autoReplyEnabled?: boolean;
}
