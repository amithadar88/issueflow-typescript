import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { AuditActor } from './audit-log.entity';
import { AuditLogService } from './audit-log.service';

class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  entityId?: number;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsEnum(AuditActor)
  actor?: AuditActor;
}

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLogService.findAll(query);
  }
}
