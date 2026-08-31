import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsIn,
  IsBoolean,
  Min,
  MinLength,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { parseJsonArray } from '../../../common/parse-json-array';
import { LIMITS } from '../../../common/field-limits';

export class CreateListingDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(LIMITS.listingTitle)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.listingDescription)
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lotArea?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  floorArea?: number;

  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @ArrayMaxSize(LIMITS.amenityCount)
  @IsString({ each: true })
  @MaxLength(LIMITS.amenity, { each: true })
  amenities?: string[];

  @IsIn(['bare', 'semi-furnished', 'fully-furnished'])
  status!: string;

  @IsIn(['sale', 'rent'])
  listingType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  publishToFacebook?: boolean;
}