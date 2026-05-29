import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import {
  IsNull,
  Not,
  OptimisticLockVersionMismatchError,
  Repository,
} from 'typeorm';
import { AuditAction, EntityType } from '../audit-log/audit-log.constants';
import { AuditActor } from '../audit-log/audit-log.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TicketDependenciesService } from '../ticket-dependencies/ticket-dependencies.service';
import { User, UserRole } from '../users/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Ticket, TicketPriority, TicketStatus, TicketType } from './ticket.entity';

const STATUS_ORDER: Record<TicketStatus, number> = {
  [TicketStatus.TODO]: 0,
  [TicketStatus.IN_PROGRESS]: 1,
  [TicketStatus.IN_REVIEW]: 2,
  [TicketStatus.DONE]: 3,
};

// Promotes priority exactly one level; CRITICAL is the ceiling.
const PRIORITY_NEXT: Record<TicketPriority, TicketPriority> = {
  [TicketPriority.LOW]: TicketPriority.MEDIUM,
  [TicketPriority.MEDIUM]: TicketPriority.HIGH,
  [TicketPriority.HIGH]: TicketPriority.CRITICAL,
  [TicketPriority.CRITICAL]: TicketPriority.CRITICAL,
};

// Export columns as specified; id included so the row can be referenced.
const EXPORT_COLUMNS = ['id', 'title', 'description', 'status', 'priority', 'type', 'assigneeId'] as const;

function computeIsOverdue(ticket: Pick<Ticket, 'dueDate' | 'status'>): boolean {
  if (!ticket.dueDate || ticket.status === TicketStatus.DONE) return false;
  return new Date(ticket.dueDate) < new Date();
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly auditLog: AuditLogService,
    private readonly ticketDeps: TicketDependenciesService,
  ) {}

  async create(dto: CreateTicketDto, performedBy: number | null = null): Promise<Ticket> {
    const ticket = this.ticketsRepository.create(dto);
    ticket.isOverdue = computeIsOverdue(ticket);
    const saved = await this.ticketsRepository.save(ticket);
    this.auditLog.log({ action: AuditAction.CREATE, entityType: EntityType.TICKET, entityId: saved.id, performedBy });
    return saved;
  }

  findAll(projectId?: number): Promise<Ticket[]> {
    return this.ticketsRepository.find({
      where: projectId ? { projectId } : {},
    });
  }

  async findOne(id: number): Promise<Ticket> {
    const ticket = await this.ticketsRepository.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async update(id: number, dto: UpdateTicketDto, performedBy: number | null = null): Promise<Ticket> {
    const ticket = await this.findOne(id);

    if (ticket.status === TicketStatus.DONE) {
      throw new UnprocessableEntityException('A completed ticket cannot be updated');
    }

    if (dto.version !== undefined && dto.version !== ticket.version) {
      throw new ConflictException(
        `Version mismatch (client: ${dto.version}, server: ${ticket.version}) – reload and retry`,
      );
    }

    if (
      dto.status !== undefined &&
      dto.status !== ticket.status &&
      STATUS_ORDER[dto.status] !== STATUS_ORDER[ticket.status] + 1
    ) {
      throw new UnprocessableEntityException(
        `Invalid status transition: ${ticket.status} → ${dto.status}. ` +
          'Status must advance one step at a time (TODO → IN_PROGRESS → IN_REVIEW → DONE)',
      );
    }

    // Block DONE if unresolved blockers remain.
    if (dto.status === TicketStatus.DONE) {
      const blocked = await this.ticketDeps.hasUnresolvedBlockers(id);
      if (blocked) {
        throw new UnprocessableEntityException(
          'Cannot close ticket: one or more blocking tickets are not yet DONE',
        );
      }
    }

    const { version: _version, ...fields } = dto;
    Object.assign(ticket, fields);
    ticket.isOverdue = computeIsOverdue(ticket);

    try {
      const saved = await this.ticketsRepository.save(ticket);
      this.auditLog.log({ action: AuditAction.UPDATE, entityType: EntityType.TICKET, entityId: id, performedBy });
      return saved;
    } catch (err) {
      if (err instanceof OptimisticLockVersionMismatchError) {
        throw new ConflictException('Ticket was modified concurrently – reload and retry');
      }
      throw err;
    }
  }

  async softDelete(id: number, performedBy: number | null = null): Promise<void> {
    await this.findOne(id);
    await this.ticketsRepository.softDelete(id);
    this.auditLog.log({ action: AuditAction.DELETE, entityType: EntityType.TICKET, entityId: id, performedBy });
  }

  findDeleted(projectId?: number): Promise<Ticket[]> {
    return this.ticketsRepository.find({
      withDeleted: true,
      where: { ...(projectId ? { projectId } : {}), deletedAt: Not(IsNull()) },
    });
  }

  async restore(id: number, performedBy: number | null = null): Promise<Ticket> {
    const ticket = await this.ticketsRepository.findOne({ where: { id }, withDeleted: true });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    await this.ticketsRepository.restore(id);
    this.auditLog.log({ action: AuditAction.RESTORE, entityType: EntityType.TICKET, entityId: id, performedBy });
    return this.ticketsRepository.findOne({ where: { id } });
  }

  // ── Auto-assignment ────────────────────────────────────────────────────────

  // Assigns the ticket to the DEVELOPER with fewest open tickets in the same
  // project. Ties are broken by user id (ascending = registration order).
  async autoAssign(ticketId: number): Promise<Ticket> {
    const ticket = await this.findOne(ticketId);

    const developers = await this.usersRepository.find({
      where: { role: UserRole.DEVELOPER },
      order: { id: 'ASC' }, // registration order for tie-breaking
    });

    if (developers.length === 0) {
      throw new UnprocessableEntityException('No developers available for assignment');
    }

    const counts = await Promise.all(
      developers.map(async (dev) => ({
        dev,
        count: await this.ticketsRepository.count({
          where: {
            assigneeId: dev.id,
            projectId: ticket.projectId,
            status: Not(TicketStatus.DONE),
          },
        }),
      })),
    );

    // Stable sort: primary key is count ASC; secondary is already guaranteed by
    // the id ASC order from the DB query, so Array.sort stability preserves it.
    counts.sort((a, b) => a.count - b.count);
    ticket.assigneeId = counts[0].dev.id;

    const saved = await this.ticketsRepository.save(ticket);
    this.auditLog.log({
      action: 'AUTO_ASSIGN',
      entityType: EntityType.TICKET,
      entityId: ticketId,
      performedBy: null,
      actor: AuditActor.SYSTEM,
    });

    return saved;
  }

  // ── Workload ───────────────────────────────────────────────────────────────

  async getWorkload(projectId: number): Promise<{ userId: number; username: string; openTicketCount: number }[]> {
    const developers = await this.usersRepository.find({
      where: { role: UserRole.DEVELOPER },
      order: { id: 'ASC' },
    });

    const results = await Promise.all(
      developers.map(async (dev) => ({
        userId: dev.id,
        username: dev.username,
        openTicketCount: await this.ticketsRepository.count({
          where: { assigneeId: dev.id, projectId, status: Not(TicketStatus.DONE) },
        }),
      })),
    );

    return results.sort((a, b) => a.openTicketCount - b.openTicketCount);
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────

  async exportCsv(projectId?: number): Promise<Buffer> {
    const tickets = await this.findAll(projectId);
    const rows = tickets.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
      status: t.status,
      priority: t.priority,
      type: t.type,
      assigneeId: t.assigneeId ?? '',
    }));
    const csv = stringify(rows, { header: true, columns: [...EXPORT_COLUMNS] });
    return Buffer.from(csv);
  }

  // ── CSV Import ─────────────────────────────────────────────────────────────

  // projectId is supplied as a separate form field — not embedded in each row.
  async importCsv(
    csvBuffer: Buffer,
    projectId: number,
    performedBy: number | null = null,
  ): Promise<{ created: number; failed: number; errors: { row: number; message: string }[] }> {
    const records: Record<string, string>[] = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const errors: { row: number; message: string }[] = [];
    let created = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const rowNum = i + 2; // 1-based + header row

      try {
        this.validateImportRow(r, rowNum);

        const dto: CreateTicketDto = {
          title: r.title,
          description: r.description || undefined,
          status: (r.status as TicketStatus) || undefined,
          priority: r.priority as TicketPriority,
          type: r.type as TicketType,
          projectId,
          assigneeId: r.assigneeId ? parseInt(r.assigneeId, 10) : undefined,
        };

        await this.create(dto, performedBy);
        created++;
      } catch (err) {
        errors.push({ row: rowNum, message: (err as Error).message });
      }
    }

    return { created, failed: errors.length, errors };
  }

  private validateImportRow(r: Record<string, string>, rowNum: number): void {
    const missing: string[] = [];
    if (!r.title?.trim()) missing.push('title');
    if (!r.priority) missing.push('priority');
    if (!r.type) missing.push('type');
    if (missing.length > 0) {
      throw new Error(`Row ${rowNum}: missing required fields: ${missing.join(', ')}`);
    }
    if (!Object.values(TicketPriority).includes(r.priority as TicketPriority)) {
      throw new Error(`Row ${rowNum}: invalid priority "${r.priority}"`);
    }
    if (!Object.values(TicketType).includes(r.type as TicketType)) {
      throw new Error(`Row ${rowNum}: invalid type "${r.type}"`);
    }
    if (r.status && !Object.values(TicketStatus).includes(r.status as TicketStatus)) {
      throw new Error(`Row ${rowNum}: invalid status "${r.status}"`);
    }
  }

  // ── Escalation (called by the hourly cron) ────────────────────────────────

  // For each overdue, non-DONE ticket: promote priority one level. When priority
  // reaches CRITICAL also set isOverdue=true. Truly idempotent — CRITICAL tickets
  // already at max are only touched if isOverdue needs setting.
  async escalateOverdueTickets(): Promise<number> {
    const now = new Date();
    const overdue = await this.ticketsRepository
      .createQueryBuilder('t')
      .where('t.status != :done', { done: TicketStatus.DONE })
      .andWhere('t.dueDate IS NOT NULL')
      .andWhere('t.dueDate < :now', { now })
      .andWhere('t.deletedAt IS NULL')
      .getMany();

    let escalated = 0;

    for (const ticket of overdue) {
      const nextPriority = PRIORITY_NEXT[ticket.priority];
      const willBeCritical = nextPriority === TicketPriority.CRITICAL;
      const priorityChanged = nextPriority !== ticket.priority;
      const isOverdueMissing = willBeCritical && !ticket.isOverdue;

      if (!priorityChanged && !isOverdueMissing) continue; // truly idempotent

      ticket.priority = nextPriority;
      if (willBeCritical) ticket.isOverdue = true;

      await this.ticketsRepository.save(ticket);
      escalated++;
    }

    return escalated;
  }
}
