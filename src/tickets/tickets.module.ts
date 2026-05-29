import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { TicketDependenciesModule } from '../ticket-dependencies/ticket-dependencies.module';
import { User } from '../users/user.entity';
import { Ticket } from './ticket.entity';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, User]),
    AuditLogModule,
    TicketDependenciesModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
