import {
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { Attachment } from './attachment.entity';

export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private readonly repo: Repository<Attachment>,
    @InjectRepository(Ticket)
    private readonly ticketsRepo: Repository<Ticket>,
  ) {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  async saveAttachment(
    ticketId: number,
    file: Express.Multer.File,
    uploadedBy: number | null = null,
  ): Promise<Attachment> {
    await this.assertTicketExists(ticketId);

    const attachment = this.repo.create({
      ticketId,
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy,
    });
    return this.repo.save(attachment);
  }

  async findAll(ticketId: number): Promise<Attachment[]> {
    await this.assertTicketExists(ticketId);
    return this.repo.find({ where: { ticketId }, order: { createdAt: 'ASC' } });
  }

  async download(ticketId: number, attachmentId: number): Promise<{ file: StreamableFile; attachment: Attachment }> {
    const attachment = await this.findOneOrFail(ticketId, attachmentId);
    const filePath = path.join(UPLOADS_DIR, attachment.storedName);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found on disk');
    }

    const stream = fs.createReadStream(filePath);
    return { file: new StreamableFile(stream), attachment };
  }

  async remove(ticketId: number, attachmentId: number): Promise<void> {
    const attachment = await this.findOneOrFail(ticketId, attachmentId);
    const filePath = path.join(UPLOADS_DIR, attachment.storedName);

    await this.repo.remove(attachment);

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // File deletion failure is non-fatal: the DB record is already removed.
        // The orphaned file can be cleaned up by a maintenance sweep.
      }
    }
  }

  private async findOneOrFail(ticketId: number, attachmentId: number): Promise<Attachment> {
    const attachment = await this.repo.findOne({ where: { id: attachmentId, ticketId } });
    if (!attachment) {
      throw new NotFoundException(`Attachment ${attachmentId} not found on ticket ${ticketId}`);
    }
    return attachment;
  }

  private async assertTicketExists(ticketId: number): Promise<void> {
    const exists = await this.ticketsRepo.existsBy({ id: ticketId });
    if (!exists) {
      throw new NotFoundException(`Ticket ${ticketId} not found`);
    }
  }
}
