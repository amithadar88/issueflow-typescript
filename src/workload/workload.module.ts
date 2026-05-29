import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { WorkloadController } from './workload.controller';

@Module({
  imports: [TicketsModule],
  controllers: [WorkloadController],
})
export class WorkloadModule {}
