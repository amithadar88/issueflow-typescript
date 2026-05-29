import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { TicketPriority, TicketStatus, TicketType } from '../ticket.entity';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  // Defaults to TODO at the entity level if omitted.
  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(TicketPriority)
  priority: TicketPriority;

  @IsEnum(TicketType)
  type: TicketType;

  @IsInt()
  projectId: number;

  @IsInt()
  @IsOptional()
  assigneeId?: number;

  @IsDateString()
  @IsOptional()
  dueDate?: string;
}
