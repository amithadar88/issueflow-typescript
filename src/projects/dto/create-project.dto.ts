import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsPositive()
  ownerId: number;
}
