import {
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  /**
   * Capped rather than unbounded. This is shown in a carousel card on the landing
   * page, and an essay would either break the layout or be truncated anyway — better
   * to say so in the form than to silently cut someone off.
   */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  comment?: string;

  /** Which moment prompted the prompt. */
  @IsIn(['reel', 'listing'])
  source!: string;

  @IsOptional()
  @IsBoolean()
  showName?: boolean;
}
