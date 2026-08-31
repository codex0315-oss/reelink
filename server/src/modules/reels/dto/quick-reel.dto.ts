import { IsString, IsNumber, IsOptional, IsArray, IsIn, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { parseJsonArray } from '../../../common/parse-json-array';

export class QuickReelDto {
  @IsString()
  title!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsIn(['bare', 'semi-furnished', 'fully-furnished'])
  status!: string;

  @IsIn(['sale', 'rent'])
  listingType!: string;

  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  /** Visual template id. Falls back to the default when omitted or unknown. */
  @IsOptional()
  @IsString()
  template?: string;
}
