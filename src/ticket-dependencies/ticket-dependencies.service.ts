import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { Ticket, TicketStatus } from '../tickets/ticket.entity';
import { TicketDependency } from './ticket-dependency.entity';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class TicketDependenciesService {
  constructor(
    @InjectRepository(TicketDependency)
    private readonly repo: Repository<TicketDependency>,
    @InjectRepository(Ticket)
    private readonly ticketsRepo: Repository<Ticket>,
  ) {}

  async addDependency(ticketId: number, blockedBy: number): Promise<TicketDependency> {
    if (ticketId === blockedBy) {
      throw new BadRequestException('A ticket cannot depend on itself');
    }

    const [ticket, blocker] = await Promise.all([
      this.loadTicket(ticketId),
      this.loadTicket(blockedBy),
    ]);

    if (ticket.projectId !== blocker.projectId) {
      throw new BadRequestException('Both tickets must belong to the same project');
    }

    await this.assertNoCycle(ticketId, blockedBy);

    const dep = this.repo.create({ ticketId, dependsOnId: blockedBy });
    try {
      return await this.repo.save(dep);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('This dependency already exists');
      }
      throw err;
    }
  }

  async removeDependency(ticketId: number, blockerId: number): Promise<void> {
    const dep = await this.repo.findOne({ where: { ticketId, dependsOnId: blockerId } });
    if (!dep) throw new NotFoundException('Dependency not found');
    await this.repo.remove(dep);
  }

  async getDependencies(ticketId: number): Promise<{ id: number; title: string; status: TicketStatus }[]> {
    const deps = await this.repo.find({ where: { ticketId }, order: { createdAt: 'ASC' } });
    if (deps.length === 0) return [];

    const blockerIds = deps.map((d) => d.dependsOnId);
    const blockers = await this.ticketsRepo.find({ where: { id: In(blockerIds) } });

    // Preserve the order established by the dependency creation time.
    const byId = new Map(blockers.map((t) => [t.id, t]));
    return blockerIds
      .filter((id) => byId.has(id))
      .map((id) => ({ id: byId.get(id).id, title: byId.get(id).title, status: byId.get(id).status }));
  }

  getBlocking(ticketId: number): Promise<TicketDependency[]> {
    return this.repo.find({ where: { dependsOnId: ticketId }, order: { createdAt: 'ASC' } });
  }

  // Returns true if any blocker of ticketId is not yet DONE.
  async hasUnresolvedBlockers(ticketId: number): Promise<boolean> {
    const deps = await this.repo.find({ where: { ticketId } });
    if (deps.length === 0) return false;

    const blockerIds = deps.map((d) => d.dependsOnId);
    const doneCount = await this.ticketsRepo.count({
      where: { id: In(blockerIds), status: TicketStatus.DONE },
    });
    return doneCount < blockerIds.length;
  }

  // BFS: reject if adding ticketId→dependsOnId would form a cycle.
  private async assertNoCycle(ticketId: number, dependsOnId: number): Promise<void> {
    const visited = new Set<number>();
    const queue = [dependsOnId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === ticketId) {
        throw new BadRequestException(
          'Adding this dependency would create a circular dependency',
        );
      }
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = await this.repo.find({ where: { ticketId: current } });
      for (const d of deps) queue.push(d.dependsOnId);
    }
  }

  private async loadTicket(id: number): Promise<Ticket> {
    const ticket = await this.ticketsRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }
}
