import { IsBoolean, IsOptional } from 'class-validator';

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
}
