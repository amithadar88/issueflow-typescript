import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../user.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @MinLength(8)
  password: string;
}
