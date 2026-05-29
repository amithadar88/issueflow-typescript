import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { Attachment } from './attachment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment, Ticket])],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
