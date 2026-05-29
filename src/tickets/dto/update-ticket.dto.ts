import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TicketPriority, TicketStatus, TicketType } from '../ticket.entity';

export class UpdateTicketDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @IsEnum(TicketType)
  @IsOptional()
  type?: TicketType;

  @IsInt()
  @IsOptional()
  assigneeId?: number;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  // Client echoes back the version it last read. The service rejects the
  // update with 409 if the DB version has moved on, preventing lost updates.
  @IsInt()
  @Min(1)
  @IsOptional()
  version?: number;
}
