import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TicketsModule } from '../tickets/tickets.module';
import { EscalationService } from './escalation.service';

@Module({
  imports: [ScheduleModule.forRoot(), TicketsModule],
  providers: [EscalationService],
})
export class SchedulerModule {}
