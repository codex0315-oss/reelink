import { IsString, IsOptional, IsEmail, MaxLength, MinLength } from 'class-validator';
import { LIMITS } from '../../../common/field-limits';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Name cannot be empty' })
  @MaxLength(LIMITS.name)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.phone)
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(LIMITS.email)
  email?: string;

  /** Required only when changing the email, since that is the login identifier. */
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.password)
  currentPassword?: string;
}
