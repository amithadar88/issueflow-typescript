import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TicketsService } from '../tickets/tickets.service';

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(private readonly ticketsService: TicketsService) {}

  // Every hour: find overdue non-DONE tickets and promote priority one level.
  // Tickets that reach CRITICAL also get isOverdue=true set.
  @Cron(CronExpression.EVERY_HOUR)
  async handleEscalation(): Promise<void> {
    try {
      const escalated = await this.ticketsService.escalateOverdueTickets();
      this.logger.log(`Escalation run complete — ${escalated} ticket(s) promoted`);
    } catch (err) {
      this.logger.error('Escalation run failed', err);
    }
  }
}
