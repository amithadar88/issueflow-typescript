import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { TicketsService } from '../tickets/tickets.service';

@Controller('projects')
export class WorkloadController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get(':projectId/workload')
  getWorkload(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.ticketsService.getWorkload(projectId);
  }
}
