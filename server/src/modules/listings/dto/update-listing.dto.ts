import { PartialType } from '@nestjs/mapped-types';
import { CreateListingDto } from './create-listing.dto';
import { IsOptional, IsArray, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { parseJsonArray } from '../../../common/parse-json-array';

export class UpdateListingDto extends PartialType(CreateListingDto) {
  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @IsString({ each: true })
  existingPhotoUrls?: string[];

  /** Panoramas kept from the previous version, same contract as existingPhotoUrls. */
  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @IsString({ each: true })
  existingPanoramaUrls?: string[];
}