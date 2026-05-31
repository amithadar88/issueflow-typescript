import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, OptimisticLockVersionMismatchError, Repository } from 'typeorm';
import { AuditAction, EntityType } from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Ticket } from '../tickets/ticket.entity';
import { User } from '../users/user.entity';
import { Comment } from './comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

// Shape returned to callers — mentionedUsers is narrowed to the three fields
// specified by the API contract.
export interface MentionedUser {
  id: number;
  username: string;
  fullName: string;
}

export interface CommentResponse {
  id: number;
  content: string;
  ticketId: number;
  authorId: number;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  mentionedUsers: MentionedUser[];
}

// Extracts unique @username tokens from a content string, normalised to lowercase.
function extractMentions(content: string): string[] {
  const raw = content.match(/@([a-zA-Z0-9_]+)/g) ?? [];
  return [...new Set(raw.map((m) => m.slice(1).toLowerCase()))];
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(ticketId: number): Promise<CommentResponse[]> {
    await this.assertTicketExists(ticketId);
    const comments = await this.commentsRepository.find({
      where: { ticketId },
      relations: { mentionedUsers: true },
      order: { createdAt: 'ASC' },
    });
    return comments.map(this.toResponse);
  }

  async create(ticketId: number, dto: CreateCommentDto, performedBy: number | null = null): Promise<CommentResponse> {
    await this.assertTicketExists(ticketId);
    const mentionedUsers = await this.resolveMentions(dto.content);

    const comment = this.commentsRepository.create({
      content: dto.content,
      ticketId,
      authorId: dto.authorId,
      mentionedUsers,
    });

    const saved = await this.commentsRepository.save(comment);
    this.auditLog.log({ action: AuditAction.CREATE, entityType: EntityType.COMMENT, entityId: saved.id, performedBy });
    return this.reload(saved.id);
  }

  async update(
    ticketId: number,
    commentId: number,
    dto: UpdateCommentDto,
    performedBy: number | null = null,
  ): Promise<CommentResponse> {
    const comment = await this.findOneOrFail(ticketId, commentId);

    if (dto.version !== undefined && dto.version !== comment.version) {
      throw new ConflictException(
        `Version mismatch (client: ${dto.version}, server: ${comment.version}) – reload and retry`,
      );
    }

    const mentionedUsers = await this.resolveMentions(dto.content);
    comment.content = dto.content;
    comment.mentionedUsers = mentionedUsers;

    try {
      const saved = await this.commentsRepository.save(comment);
      this.auditLog.log({ action: AuditAction.UPDATE, entityType: EntityType.COMMENT, entityId: commentId, performedBy });
      return this.reload(saved.id);
    } catch (err) {
      if (err instanceof OptimisticLockVersionMismatchError) {
        throw new ConflictException('Comment was modified concurrently – reload and retry');
      }
      throw err;
    }
  }

  async remove(ticketId: number, commentId: number, performedBy: number | null = null): Promise<void> {
    const comment = await this.findOneOrFail(ticketId, commentId);
    await this.commentsRepository.remove(comment);
    this.auditLog.log({ action: AuditAction.DELETE, entityType: EntityType.COMMENT, entityId: commentId, performedBy });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async assertTicketExists(ticketId: number): Promise<void> {
    const exists = await this.ticketsRepository.existsBy({ id: ticketId });
    if (!exists) {
      throw new NotFoundException(`Ticket ${ticketId} not found`);
    }
  }

  private async findOneOrFail(ticketId: number, commentId: number): Promise<Comment> {
    const comment = await this.commentsRepository.findOne({
      where: { id: commentId, ticketId },
      relations: { mentionedUsers: true },
    });
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found on ticket ${ticketId}`);
    }
    return comment;
  }

  // Parses @mentions, validates all tokens resolve to real users (422 if not),
  // and returns the User records. Unknown handles are an authoring error, not
  // a silent no-op, so the caller gets a clear message about what's wrong.
  private async resolveMentions(content: string): Promise<User[]> {
    const usernames = extractMentions(content);
    if (usernames.length === 0) return [];

    const users = await this.usersRepository.find({
      where: { username: In(usernames) },
    });

    const found = new Set(users.map((u) => u.username.toLowerCase()));
    const missing = usernames.filter((u) => !found.has(u));
    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        `Unknown @mention(s): ${missing.map((u) => `@${u}`).join(', ')}`,
      );
    }

    return users;
  }

  // Reloads a saved comment with its mentionedUsers relation so the response
  // always reflects the latest persisted state.
  private async reload(id: number): Promise<CommentResponse> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { mentionedUsers: true },
    });
    return this.toResponse(comment);
  }

  private toResponse(comment: Comment): CommentResponse {
    return {
      id: comment.id,
      content: comment.content,
      ticketId: comment.ticketId,
      authorId: comment.authorId,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      version: comment.version,
      mentionedUsers: comment.mentionedUsers.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
      })),
    };
  }
}
