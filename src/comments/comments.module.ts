import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Ticket } from '../tickets/ticket.entity';
import { User } from '../users/user.entity';
import { Comment } from './comment.entity';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  // Ticket and User repos are injected directly to avoid circular module deps.
  imports: [TypeOrmModule.forFeature([Comment, Ticket, User]), AuditLogModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
