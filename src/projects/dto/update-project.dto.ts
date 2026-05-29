import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateProjectDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
