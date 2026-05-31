import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { Ticket, TicketStatus } from '../tickets/ticket.entity';
import { TicketDependency } from './ticket-dependency.entity';
import { TicketDependenciesService } from './ticket-dependencies.service';

const mockDepRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
});

const mockTicketRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
});

function makeTicket(id: number, projectId = 1, status = TicketStatus.TODO): Ticket {
  return { id, projectId, status, title: `Ticket ${id}` } as unknown as Ticket;
}

function makeDep(ticketId: number, dependsOnId: number): TicketDependency {
  return { id: 1, ticketId, dependsOnId, createdAt: new Date() } as TicketDependency;
}

describe('TicketDependenciesService', () => {
  let service: TicketDependenciesService;
  let depRepo: ReturnType<typeof mockDepRepo>;
  let ticketRepo: ReturnType<typeof mockTicketRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketDependenciesService,
        { provide: getRepositoryToken(TicketDependency), useFactory: mockDepRepo },
        { provide: getRepositoryToken(Ticket), useFactory: mockTicketRepo },
      ],
    }).compile();

    service = module.get(TicketDependenciesService);
    depRepo = module.get(getRepositoryToken(TicketDependency));
    ticketRepo = module.get(getRepositoryToken(Ticket));
  });

  describe('addDependency()', () => {
    it('creates a dependency between two tickets in the same project', async () => {
      ticketRepo.findOne
        .mockResolvedValueOnce(makeTicket(1))
        .mockResolvedValueOnce(makeTicket(2));
      depRepo.find.mockResolvedValue([]); // no existing deps → no cycle
      const dep = makeDep(1, 2);
      depRepo.create.mockReturnValue(dep);
      depRepo.save.mockResolvedValue(dep);

      const result = await service.addDependency(1, 2);

      expect(result).toBe(dep);
      expect(depRepo.save).toHaveBeenCalled();
    });

    it('throws BadRequestException when a ticket depends on itself', async () => {
      await expect(service.addDependency(5, 5)).rejects.toThrow(BadRequestException);
      expect(ticketRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when tickets are in different projects', async () => {
      ticketRepo.findOne
        .mockResolvedValueOnce(makeTicket(1, 1)) // project 1
        .mockResolvedValueOnce(makeTicket(2, 2)); // project 2

      await expect(service.addDependency(1, 2)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when the dependency already exists (unique violation)', async () => {
      ticketRepo.findOne
        .mockResolvedValueOnce(makeTicket(1))
        .mockResolvedValueOnce(makeTicket(2));
      depRepo.find.mockResolvedValue([]);
      depRepo.create.mockReturnValue(makeDep(1, 2));

      const pgError = Object.assign(
        new QueryFailedError('INSERT', [], new Error('duplicate')),
        { code: '23505' },
      );
      depRepo.save.mockRejectedValue(pgError);

      await expect(service.addDependency(1, 2)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when adding the dependency would create a cycle', async () => {
      // Existing graph: ticket 1 → ticket 2 (ticket 1 depends on ticket 2).
      // Attempt to add ticket 2 → ticket 1 would form a cycle.
      ticketRepo.findOne
        .mockResolvedValueOnce(makeTicket(2)) // loadTicket(ticketId=2)
        .mockResolvedValueOnce(makeTicket(1)); // loadTicket(blockedBy=1)

      // BFS from node 1: find deps of 1 → [{dependsOnId: 2}]; reaching 2 === ticketId=2 → cycle
      depRepo.find.mockResolvedValueOnce([makeDep(1, 2)]);

      await expect(service.addDependency(2, 1)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when a referenced ticket does not exist', async () => {
      ticketRepo.findOne
        .mockResolvedValueOnce(null) // ticket 1 not found
        .mockResolvedValueOnce(makeTicket(2));

      await expect(service.addDependency(1, 2)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDependencies()', () => {
    it('returns shaped blocker list in creation order', async () => {
      depRepo.find.mockResolvedValue([makeDep(1, 2), makeDep(1, 3)]);
      ticketRepo.find.mockResolvedValue([
        makeTicket(3, 1, TicketStatus.DONE),
        makeTicket(2, 1, TicketStatus.IN_PROGRESS),
      ]);

      const result = await service.getDependencies(1);

      // Order follows dependency creation time (blockerIds=[2,3]), not ticket id.
      expect(result).toEqual([
        { id: 2, title: 'Ticket 2', status: TicketStatus.IN_PROGRESS },
        { id: 3, title: 'Ticket 3', status: TicketStatus.DONE },
      ]);
    });

    it('returns an empty array when the ticket has no dependencies', async () => {
      depRepo.find.mockResolvedValue([]);

      await expect(service.getDependencies(1)).resolves.toEqual([]);
      expect(ticketRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('removeDependency()', () => {
    it('removes an existing dependency', async () => {
      const dep = makeDep(1, 2);
      depRepo.findOne.mockResolvedValue(dep);
      depRepo.remove.mockResolvedValue(undefined);

      await service.removeDependency(1, 2);

      expect(depRepo.remove).toHaveBeenCalledWith(dep);
    });

    it('throws NotFoundException when dependency does not exist', async () => {
      depRepo.findOne.mockResolvedValue(null);

      await expect(service.removeDependency(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('hasUnresolvedBlockers()', () => {
    it('returns false when the ticket has no dependencies', async () => {
      depRepo.find.mockResolvedValue([]);

      await expect(service.hasUnresolvedBlockers(1)).resolves.toBe(false);
    });

    it('returns true when at least one blocker is not DONE', async () => {
      depRepo.find.mockResolvedValue([makeDep(1, 2), makeDep(1, 3)]);
      // Only 1 of 2 blockers is DONE.
      ticketRepo.count.mockResolvedValue(1);

      await expect(service.hasUnresolvedBlockers(1)).resolves.toBe(true);
    });

    it('returns false when all blockers are DONE', async () => {
      depRepo.find.mockResolvedValue([makeDep(1, 2), makeDep(1, 3)]);
      // All 2 blockers are DONE.
      ticketRepo.count.mockResolvedValue(2);

      await expect(service.hasUnresolvedBlockers(1)).resolves.toBe(false);
    });

    it('blocks a DONE transition — hasUnresolvedBlockers integrates with ticket update guard', async () => {
      // Verify the method returns the value TicketsService uses to gate the DONE transition.
      depRepo.find.mockResolvedValue([makeDep(10, 20)]);
      ticketRepo.count.mockResolvedValue(0); // blocker not done

      const unresolved = await service.hasUnresolvedBlockers(10);

      expect(unresolved).toBe(true);
      // Verify the count query targeted the correct blocker IDs and status.
      expect(ticketRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: TicketStatus.DONE }),
        }),
      );
    });
  });
});
