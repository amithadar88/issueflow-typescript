import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  // Client echoes back the version it last read; service returns 409 if
  // the server version has moved on since.
  @IsInt()
  @Min(1)
  @IsOptional()
  version?: number;
}
