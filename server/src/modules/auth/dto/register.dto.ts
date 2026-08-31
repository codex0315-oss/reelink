import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { LIMITS } from '../../../common/field-limits';

export class RegisterDto {
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(LIMITS.name)
  name!: string;

  @IsEmail()
  @MaxLength(LIMITS.email)
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(LIMITS.password)
  password!: string;
}
