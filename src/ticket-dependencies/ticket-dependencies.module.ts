import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { TicketDependenciesController } from './ticket-dependencies.controller';
import { TicketDependenciesService } from './ticket-dependencies.service';
import { TicketDependency } from './ticket-dependency.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TicketDependency, Ticket])],
  controllers: [TicketDependenciesController],
  providers: [TicketDependenciesService],
  exports: [TicketDependenciesService],
})
export class TicketDependenciesModule {}
