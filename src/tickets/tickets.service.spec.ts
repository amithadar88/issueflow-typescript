import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TicketDependenciesService } from '../ticket-dependencies/ticket-dependencies.service';
import { User, UserRole } from '../users/user.entity';
import { Ticket, TicketPriority, TicketStatus, TicketType } from './ticket.entity';
import { TicketsService } from './tickets.service';

// Chainable QueryBuilder stub for escalateOverdueTickets
function makeQb(rows: Ticket[]) {
  const qb = {
    where: jest.fn(),
    andWhere: jest.fn(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  return qb;
}

const mockTicketRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  count: jest.fn(),
  existsBy: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockUserRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
});

const mockAuditLog = () => ({ log: jest.fn() });

const mockTicketDeps = () => ({
  hasUnresolvedBlockers: jest.fn().mockResolvedValue(false),
});

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 1,
    title: 'Fix bug',
    description: null,
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    type: TicketType.BUG,
    projectId: 1,
    project: null,
    assigneeId: null,
    assignee: null,
    dueDate: null,
    isOverdue: false,
    version: 1,
    deletedAt: null,
    ...overrides,
  } as Ticket;
}

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketRepo: ReturnType<typeof mockTicketRepo>;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let auditLog: ReturnType<typeof mockAuditLog>;
  let ticketDeps: ReturnType<typeof mockTicketDeps>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useFactory: mockTicketRepo },
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: AuditLogService, useFactory: mockAuditLog },
        { provide: TicketDependenciesService, useFactory: mockTicketDeps },
      ],
    }).compile();

    service = module.get(TicketsService);
    ticketRepo = module.get(getRepositoryToken(Ticket));
    userRepo = module.get(getRepositoryToken(User));
    auditLog = module.get(AuditLogService);
    ticketDeps = module.get(TicketDependenciesService);
  });

  describe('create()', () => {
    it('creates a ticket without an assignee when no developers are available', async () => {
      const ticket = makeTicket({ assigneeId: null });
      ticketRepo.create.mockReturnValue(ticket);
      ticketRepo.save.mockResolvedValue(ticket);
      userRepo.find.mockResolvedValue([]); // no developers

      const result = await service.create(
        { title: 'Fix bug', priority: TicketPriority.MEDIUM, type: TicketType.BUG, projectId: 1 },
        1,
      );

      expect(result.assigneeId).toBeNull();
      // Only CREATE log fires; no AUTO_ASSIGN log.
      expect(auditLog.log).toHaveBeenCalledTimes(1);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE' }),
      );
    });
  });

  describe('findOne()', () => {
    it('returns the ticket when found', async () => {
      const ticket = makeTicket();
      ticketRepo.findOne.mockResolvedValue(ticket);

      await expect(service.findOne(1)).resolves.toBe(ticket);
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      ticketRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update() — status transitions', () => {
    it('allows moving status forward (TODO → IN_PROGRESS)', async () => {
      const ticket = makeTicket({ status: TicketStatus.TODO });
      ticketRepo.findOne.mockResolvedValue(ticket);
      ticketRepo.save.mockResolvedValue({ ...ticket, status: TicketStatus.IN_PROGRESS });

      await expect(
        service.update(1, { status: TicketStatus.IN_PROGRESS }, 1),
      ).resolves.toMatchObject({ status: TicketStatus.IN_PROGRESS });
      expect(auditLog.log).toHaveBeenCalled();
    });

    it('rejects backward status transitions (IN_REVIEW → TODO)', async () => {
      const ticket = makeTicket({ status: TicketStatus.IN_REVIEW });
      ticketRepo.findOne.mockResolvedValue(ticket);

      await expect(
        service.update(1, { status: TicketStatus.TODO }, 1),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects backward status transitions (IN_PROGRESS → TODO)', async () => {
      const ticket = makeTicket({ status: TicketStatus.IN_PROGRESS });
      ticketRepo.findOne.mockResolvedValue(ticket);

      await expect(
        service.update(1, { status: TicketStatus.TODO }, 1),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects skipping steps forward (TODO → DONE)', async () => {
      const ticket = makeTicket({ status: TicketStatus.TODO });
      ticketRepo.findOne.mockResolvedValue(ticket);

      await expect(
        service.update(1, { status: TicketStatus.DONE }, 1),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects skipping steps forward (TODO → IN_REVIEW)', async () => {
      const ticket = makeTicket({ status: TicketStatus.TODO });
      ticketRepo.findOne.mockResolvedValue(ticket);

      await expect(
        service.update(1, { status: TicketStatus.IN_REVIEW }, 1),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects any update on a DONE ticket', async () => {
      const ticket = makeTicket({ status: TicketStatus.DONE });
      ticketRepo.findOne.mockResolvedValue(ticket);

      await expect(service.update(1, { title: 'New title' }, 1)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('blocks transition to DONE when unresolved blockers exist', async () => {
      const ticket = makeTicket({ status: TicketStatus.IN_REVIEW });
      ticketRepo.findOne.mockResolvedValue(ticket);
      ticketDeps.hasUnresolvedBlockers.mockResolvedValue(true);

      await expect(
        service.update(1, { status: TicketStatus.DONE }, 1),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(ticketDeps.hasUnresolvedBlockers).toHaveBeenCalledWith(1);
    });

    it('allows DONE transition when all blockers are resolved', async () => {
      const ticket = makeTicket({ status: TicketStatus.IN_REVIEW });
      ticketRepo.findOne.mockResolvedValue(ticket);
      ticketDeps.hasUnresolvedBlockers.mockResolvedValue(false);
      ticketRepo.save.mockResolvedValue({ ...ticket, status: TicketStatus.DONE });

      await expect(
        service.update(1, { status: TicketStatus.DONE }, 1),
      ).resolves.toMatchObject({ status: TicketStatus.DONE });
    });
  });

  describe('update() — optimistic locking', () => {
    it('throws ConflictException when client version is stale', async () => {
      const ticket = makeTicket({ version: 3 });
      ticketRepo.findOne.mockResolvedValue(ticket);

      await expect(service.update(1, { version: 2 }, 1)).rejects.toThrow(ConflictException);
    });

    it('accepts update when version matches', async () => {
      const ticket = makeTicket({ version: 2 });
      ticketRepo.findOne.mockResolvedValue(ticket);
      ticketRepo.save.mockResolvedValue(ticket);

      await expect(service.update(1, { version: 2, title: 'OK' }, 1)).resolves.toBeDefined();
    });
  });

  describe('softDelete()', () => {
    it('soft-deletes an existing ticket and logs DELETE', async () => {
      const ticket = makeTicket();
      ticketRepo.findOne.mockResolvedValue(ticket);
      ticketRepo.softDelete.mockResolvedValue({ affected: 1 });

      await service.softDelete(1, 5);

      expect(ticketRepo.softDelete).toHaveBeenCalledWith(1);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityId: 1 }),
      );
    });

    it('throws NotFoundException for missing ticket', async () => {
      ticketRepo.findOne.mockResolvedValue(null);

      await expect(service.softDelete(99, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('autoAssign()', () => {
    it('assigns the developer with the fewest open tickets in the same project', async () => {
      const ticket = makeTicket({ assigneeId: null, projectId: 3 });
      // findOne is called twice: once to load the ticket, once to reload after save.
      ticketRepo.findOne
        .mockResolvedValueOnce(ticket)
        .mockResolvedValueOnce({ ...ticket, assigneeId: 11 });

      const devA = { id: 10, role: UserRole.DEVELOPER } as User;
      const devB = { id: 11, role: UserRole.DEVELOPER } as User;
      userRepo.find.mockResolvedValue([devA, devB]);

      // devA has 5 open in project 3, devB has 2 — devB should be assigned.
      ticketRepo.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);

      ticketRepo.save.mockResolvedValue(ticket);

      const result = await service.autoAssign(1);

      expect(result.assigneeId).toBe(11);
      // Verify the count is project-scoped.
      expect(ticketRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ projectId: 3 }) }),
      );
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AUTO_ASSIGN' }),
      );
    });

    it('breaks ties by user id (registration order)', async () => {
      const ticket = makeTicket({ projectId: 1 });
      ticketRepo.findOne
        .mockResolvedValueOnce(ticket)
        .mockResolvedValueOnce({ ...ticket, assigneeId: 5 });

      const devA = { id: 5, role: UserRole.DEVELOPER } as User;
      const devB = { id: 9, role: UserRole.DEVELOPER } as User;
      userRepo.find.mockResolvedValue([devA, devB]); // already ordered by id ASC from DB

      // Both have 0 open tickets — devA (id=5) wins the tie.
      ticketRepo.count.mockResolvedValue(0);
      ticketRepo.save.mockResolvedValue(ticket);

      const result = await service.autoAssign(1);

      expect(result.assigneeId).toBe(5);
    });

    it('throws UnprocessableEntityException when no developers exist', async () => {
      ticketRepo.findOne.mockResolvedValue(makeTicket());
      userRepo.find.mockResolvedValue([]);

      await expect(service.autoAssign(1)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('exportCsv()', () => {
    it('returns a Buffer with correct CSV headers (id, title, description, status, priority, type, assigneeId)', async () => {
      ticketRepo.find.mockResolvedValue([
        makeTicket({ id: 7, title: 'Alpha', priority: TicketPriority.HIGH, type: TicketType.FEATURE }),
      ]);

      const buf = await service.exportCsv();

      expect(buf).toBeInstanceOf(Buffer);
      const csv = buf.toString();
      expect(csv).toContain('id');
      expect(csv).toContain('title');
      expect(csv).toContain('assigneeId');
      expect(csv).not.toContain('projectId');
      expect(csv).not.toContain('dueDate');
      expect(csv).toContain('Alpha');
    });
  });

  describe('importCsv()', () => {
    // CSV format for import: title, description, status, priority, type, assigneeId.
    // projectId is supplied as the second argument, not in the CSV.
    it('creates tickets from valid CSV rows using the provided projectId', async () => {
      const csv = Buffer.from(
        'title,description,status,priority,type,assigneeId\n' +
          'Fix login,,TODO,HIGH,BUG,\n',
      );

      ticketRepo.create.mockImplementation((d) => d as Ticket);
      ticketRepo.save.mockResolvedValue(makeTicket({ title: 'Fix login' }));
      userRepo.find.mockResolvedValue([]); // no developers → auto-assignment skipped

      const result = await service.importCsv(csv, 5, 1);

      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      // Verify projectId from parameter is injected, not from CSV.
      expect(ticketRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 5 }),
      );
    });

    it('collects per-row errors without aborting the whole import', async () => {
      const csv = Buffer.from(
        'title,description,status,priority,type,assigneeId\n' +
          ',,,INVALID,BUG,\n' +
          'Good ticket,,TODO,HIGH,BUG,\n',
      );

      ticketRepo.create.mockImplementation((d) => d as Ticket);
      ticketRepo.save.mockResolvedValue(makeTicket({ title: 'Good ticket' }));
      userRepo.find.mockResolvedValue([]); // no developers → auto-assignment skipped

      const result = await service.importCsv(csv, 1, 1);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.failed).toBe(result.errors.length);
      expect(result.created).toBe(1);
    });
  });

  describe('escalateOverdueTickets()', () => {
    it('promotes priority one level for overdue non-DONE tickets', async () => {
      const ticket = makeTicket({
        priority: TicketPriority.LOW,
        status: TicketStatus.IN_PROGRESS,
        dueDate: new Date('2000-01-01'),
        isOverdue: false,
      });
      ticketRepo.createQueryBuilder.mockReturnValue(makeQb([ticket]));
      ticketRepo.save.mockResolvedValue(ticket);

      const count = await service.escalateOverdueTickets();

      expect(count).toBe(1);
      expect(ticketRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ priority: TicketPriority.MEDIUM }),
      );
    });

    it('sets isOverdue=true when ticket reaches CRITICAL', async () => {
      const ticket = makeTicket({
        priority: TicketPriority.HIGH,
        status: TicketStatus.IN_PROGRESS,
        dueDate: new Date('2000-01-01'),
        isOverdue: false,
      });
      ticketRepo.createQueryBuilder.mockReturnValue(makeQb([ticket]));
      ticketRepo.save.mockResolvedValue(ticket);

      await service.escalateOverdueTickets();

      expect(ticketRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ priority: TicketPriority.CRITICAL, isOverdue: true }),
      );
    });

    it('saves a CRITICAL ticket that is not yet marked overdue (sets isOverdue=true)', async () => {
      const ticket = makeTicket({
        priority: TicketPriority.CRITICAL,
        status: TicketStatus.IN_PROGRESS,
        dueDate: new Date('2000-01-01'),
        isOverdue: false, // flag missing even though priority is already CRITICAL
      });
      ticketRepo.createQueryBuilder.mockReturnValue(makeQb([ticket]));
      ticketRepo.save.mockResolvedValue(ticket);

      const count = await service.escalateOverdueTickets();

      expect(count).toBe(1);
      expect(ticketRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ priority: TicketPriority.CRITICAL, isOverdue: true }),
      );
    });

    it('is idempotent — does not re-save CRITICAL tickets already marked overdue', async () => {
      const ticket = makeTicket({
        priority: TicketPriority.CRITICAL,
        status: TicketStatus.IN_PROGRESS,
        dueDate: new Date('2000-01-01'),
        isOverdue: true,
      });
      ticketRepo.createQueryBuilder.mockReturnValue(makeQb([ticket]));

      const count = await service.escalateOverdueTickets();

      expect(count).toBe(0);
      expect(ticketRepo.save).not.toHaveBeenCalled();
    });
  });
});
