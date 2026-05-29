import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Ticket } from '../tickets/ticket.entity';
import { User } from '../users/user.entity';
import { Comment } from './comment.entity';
import { CommentsService } from './comments.service';

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  existsBy: jest.fn(),
});

const mockAuditLog = () => ({ log: jest.fn() });

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    content: 'Hello @alice',
    ticketId: 10,
    authorId: 1,
    mentionedUsers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ticket: null,
    author: null,
    ...overrides,
  } as unknown as Comment;
}

describe('CommentsService', () => {
  let service: CommentsService;
  let commentRepo: ReturnType<typeof mockRepo>;
  let ticketRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;
  let auditLog: ReturnType<typeof mockAuditLog>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useFactory: mockRepo },
        { provide: getRepositoryToken(Ticket), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: AuditLogService, useFactory: mockAuditLog },
      ],
    }).compile();

    service = module.get(CommentsService);
    commentRepo = module.get(getRepositoryToken(Comment));
    ticketRepo = module.get(getRepositoryToken(Ticket));
    userRepo = module.get(getRepositoryToken(User));
    auditLog = module.get(AuditLogService);
  });

  describe('create()', () => {
    it('throws NotFoundException when ticket does not exist', async () => {
      ticketRepo.existsBy.mockResolvedValue(false);

      await expect(service.create(99, { content: 'hi', authorId: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntityException for unknown @mentions', async () => {
      ticketRepo.existsBy.mockResolvedValue(true);
      userRepo.find.mockResolvedValue([]); // no users found

      await expect(
        service.create(10, { content: 'Hey @nobody', authorId: 1 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('creates a comment with resolved mentionedUsers', async () => {
      ticketRepo.existsBy.mockResolvedValue(true);

      const alice = { id: 5, username: 'alice', fullName: 'Alice A' } as User;
      userRepo.find.mockResolvedValue([alice]);

      const saved = makeComment({ mentionedUsers: [alice] });
      commentRepo.create.mockReturnValue(saved);
      commentRepo.save.mockResolvedValue(saved);
      commentRepo.findOne.mockResolvedValue(saved);

      const result = await service.create(10, { content: 'Hello @alice', authorId: 1 });

      expect(result.mentionedUsers).toHaveLength(1);
      expect(result.mentionedUsers[0].username).toBe('alice');
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entityType: 'Comment' }),
      );
    });
  });

  describe('update()', () => {
    it('throws ConflictException on version mismatch', async () => {
      const comment = makeComment({ version: 3 });
      commentRepo.findOne.mockResolvedValue(comment);

      await expect(
        service.update(10, 1, { content: 'new content', version: 2 }),
      ).rejects.toThrow(ConflictException);
    });

    it('re-evaluates mentions on update', async () => {
      const comment = makeComment({ version: 1 });
      commentRepo.findOne.mockResolvedValue(comment);

      const bob = { id: 6, username: 'bob', fullName: 'Bob B' } as User;
      userRepo.find.mockResolvedValue([bob]);

      const updated = makeComment({ content: 'Hi @bob', mentionedUsers: [bob] });
      commentRepo.save.mockResolvedValue(updated);
      commentRepo.findOne
        .mockResolvedValueOnce(comment)  // findOneOrFail
        .mockResolvedValueOnce(updated); // reload

      const result = await service.update(10, 1, { content: 'Hi @bob', version: 1 });

      expect(result.mentionedUsers[0].username).toBe('bob');
    });
  });

  describe('remove()', () => {
    it('removes the comment and logs DELETE', async () => {
      const comment = makeComment();
      commentRepo.findOne.mockResolvedValue(comment);
      commentRepo.remove.mockResolvedValue(undefined);

      await service.remove(10, 1, 3);

      expect(commentRepo.remove).toHaveBeenCalledWith(comment);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityId: 1 }),
      );
    });

    it('throws NotFoundException when comment is not on the given ticket', async () => {
      commentRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(10, 999, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
