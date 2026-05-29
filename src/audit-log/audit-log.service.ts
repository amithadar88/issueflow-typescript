import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditActor, AuditLog } from './audit-log.entity';

export interface LogPayload {
  action: string;
  entityType: string;
  entityId: number;
  performedBy?: number | null;
  // Inferred from performedBy when omitted: USER if set, SYSTEM if null/undefined.
  actor?: AuditActor;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  // Fire-and-forget: audit failures must never bubble up and break the calling operation.
  log(payload: LogPayload): void {
    const actor =
      payload.actor ??
      (payload.performedBy != null ? AuditActor.USER : AuditActor.SYSTEM);

    const entry = this.repo.create({
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      performedBy: payload.performedBy ?? null,
      actor,
    });

    this.repo.save(entry).catch((err) =>
      console.error('[AuditLog] failed to persist entry', err),
    );
  }

  findAll(filters: {
    entityType?: string;
    entityId?: number;
    action?: string;
    actor?: AuditActor;
  }): Promise<AuditLog[]> {
    const where: Partial<AuditLog> = {};
    if (filters.entityType !== undefined) where.entityType = filters.entityType;
    if (filters.entityId !== undefined) where.entityId = filters.entityId;
    if (filters.action !== undefined) where.action = filters.action;
    if (filters.actor !== undefined) where.actor = filters.actor;
    return this.repo.find({ where, order: { timestamp: 'DESC' } });
  }
}
