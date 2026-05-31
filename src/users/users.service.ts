import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, QueryFailedError, Repository } from 'typeorm';
import { AuditAction, EntityType } from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Comment } from '../comments/comment.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';

const BCRYPT_ROUNDS = 10;
const PG_UNIQUE_VIOLATION = '23505';
const DEFAULT_PAGE_SIZE = 20;

export interface MentionItem {
  id: number;
  ticketId: number;
  authorId: number;
  content: string;
  createdAt: Date;
  mentionedUsers: { id: number; username: string; fullName: string }[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(createUserDto: CreateUserDto, performedBy: number | null = null): Promise<User> {
    const user = this.usersRepository.create({
      ...createUserDto,
      password: await bcrypt.hash(createUserDto.password, BCRYPT_ROUNDS),
    });

    const saved = await this.save(user);
    this.auditLog.log({ action: AuditAction.CREATE, entityType: EntityType.USER, entityId: saved.id, performedBy });
    return saved;
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto, performedBy: number | null = null): Promise<User> {
    const user = await this.findOne(id);

    Object.assign(user, updateUserDto);

    const saved = await this.save(user);
    this.auditLog.log({ action: AuditAction.UPDATE, entityType: EntityType.USER, entityId: id, performedBy });
    return saved;
  }

  async remove(id: number, performedBy: number | null = null): Promise<void> {
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User ${id} not found`);
    }
    this.auditLog.log({ action: AuditAction.DELETE, entityType: EntityType.USER, entityId: id, performedBy });
  }

  async findMentions(
    userId: number,
    page: number,
    pageSize: number = DEFAULT_PAGE_SIZE,
  ): Promise<{ data: MentionItem[]; total: number; page: number }> {
    await this.findOne(userId); // 404 if user doesn't exist

    // Step 1: paginate at the DB level using the ManyToMany join.
    const [rows, total] = await this.commentsRepository
      .createQueryBuilder('comment')
      .innerJoin('comment.mentionedUsers', 'target', 'target.id = :userId', { userId })
      .orderBy('comment.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    if (rows.length === 0) {
      return { data: [], total, page };
    }

    // Step 2: reload the page with mentionedUsers populated.
    const ids = rows.map((r) => r.id);
    const comments = await this.commentsRepository.find({
      where: { id: In(ids) },
      relations: { mentionedUsers: true },
      order: { createdAt: 'DESC' },
    });

    return { data: comments.map(this.toMentionItem), total, page };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private toMentionItem(comment: Comment): MentionItem {
    return {
      id: comment.id,
      ticketId: comment.ticketId,
      authorId: comment.authorId,
      content: comment.content,
      createdAt: comment.createdAt,
      mentionedUsers: comment.mentionedUsers.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
      })),
    };
  }

  // Centralizes the unique-constraint handling for create and update so a
  // duplicate username/email surfaces as 409 rather than a 500.
  private async save(user: User): Promise<User> {
    try {
      return await this.usersRepository.save(user);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Username or email already in use');
      }
      throw err;
    }
  }
}
