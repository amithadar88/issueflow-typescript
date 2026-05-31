import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { QueryFailedError } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Comment } from '../comments/comment.entity';
import { User } from './user.entity';
import { UsersService } from './users.service';

jest.mock('bcrypt');

// Chainable QueryBuilder stub — every method returns `this` except the terminals.
function makeQb(result: [Comment[], number]) {
  const qb = {
    innerJoin: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  qb.innerJoin.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  qb.skip.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);
  return qb;
}

const mockUserRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(),
});

const mockCommentRepo = () => ({
  createQueryBuilder: jest.fn(),
  find: jest.fn(),
});

const mockAuditLog = () => ({ log: jest.fn() });

function makeUser(overrides: Partial<User> = {}): User {
  return { id: 1, username: 'alice', email: 'alice@test.com', fullName: 'Alice', role: 'DEVELOPER', ...overrides } as User;
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 1,
    content: 'Hello @alice',
    ticketId: 10,
    authorId: 2,
    mentionedUsers: [],
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    version: 1,
    ...overrides,
  } as unknown as Comment;
}

describe('UsersService — findMentions()', () => {
  let service: UsersService;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let commentRepo: ReturnType<typeof mockCommentRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: getRepositoryToken(Comment), useFactory: mockCommentRepo },
        { provide: AuditLogService, useFactory: mockAuditLog },
      ],
    }).compile();

    service = module.get(UsersService);
    userRepo = module.get(getRepositoryToken(User));
    commentRepo = module.get(getRepositoryToken(Comment));
  });

  it('throws NotFoundException when the user does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.findMentions(99, 1, 20)).rejects.toThrow(NotFoundException);
    expect(commentRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns empty data when no comments mention the user', async () => {
    userRepo.findOne.mockResolvedValue(makeUser());
    const qb = makeQb([[], 0]);
    commentRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findMentions(1, 1, 20);

    expect(result).toEqual({ data: [], total: 0, page: 1 });
    expect(commentRepo.find).not.toHaveBeenCalled();
  });

  it('returns shaped MentionItem array with mentionedUsers projected', async () => {
    const mentionedUser = makeUser({ id: 1, username: 'alice', fullName: 'Alice A' });
    const comment = makeComment({
      id: 5,
      ticketId: 10,
      authorId: 2,
      content: 'Hey @alice',
      mentionedUsers: [mentionedUser],
      createdAt: new Date('2024-06-01'),
    });

    userRepo.findOne.mockResolvedValue(mentionedUser);
    const qb = makeQb([[comment], 1]);
    commentRepo.createQueryBuilder.mockReturnValue(qb);
    commentRepo.find.mockResolvedValue([comment]);

    const result = await service.findMentions(1, 1, 20);

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      id: 5,
      ticketId: 10,
      authorId: 2,
      content: 'Hey @alice',
      createdAt: comment.createdAt,
      mentionedUsers: [{ id: 1, username: 'alice', fullName: 'Alice A' }],
    });
  });

  it('passes correct pagination offsets to the QueryBuilder', async () => {
    userRepo.findOne.mockResolvedValue(makeUser());
    const qb = makeQb([[], 50]);
    commentRepo.createQueryBuilder.mockReturnValue(qb);

    await service.findMentions(1, 3, 10); // page 3, pageSize 10 → skip 20

    expect(qb.skip).toHaveBeenCalledWith(20);
    expect(qb.take).toHaveBeenCalledWith(10);
  });

  it('filters by userId via innerJoin on mentionedUsers', async () => {
    userRepo.findOne.mockResolvedValue(makeUser({ id: 7 }));
    const qb = makeQb([[], 0]);
    commentRepo.createQueryBuilder.mockReturnValue(qb);

    await service.findMentions(7, 1, 20);

    expect(qb.innerJoin).toHaveBeenCalledWith(
      'comment.mentionedUsers',
      'target',
      'target.id = :userId',
      { userId: 7 },
    );
  });

  it('reloads comments with mentionedUsers relation after ID pagination', async () => {
    const c1 = makeComment({ id: 3 });
    const c2 = makeComment({ id: 7 });
    userRepo.findOne.mockResolvedValue(makeUser());
    const qb = makeQb([[c1, c2], 2]);
    commentRepo.createQueryBuilder.mockReturnValue(qb);
    commentRepo.find.mockResolvedValue([c1, c2]);

    await service.findMentions(1, 1, 20);

    // TypeORM's In() returns a FindOperator, not a plain array — inspect structure separately.
    expect(commentRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ relations: { mentionedUsers: true } }),
    );
    const callArg = (commentRepo.find as jest.Mock).mock.calls[0][0];
    expect(callArg.where.id._value).toEqual(expect.arrayContaining([3, 7]));
  });

  it('reports correct total even when current page is empty (deep page)', async () => {
    userRepo.findOne.mockResolvedValue(makeUser());
    // total=5 but page 99 yields no rows
    const qb = makeQb([[], 5]);
    commentRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findMentions(1, 99, 20);

    expect(result.total).toBe(5);
    expect(result.data).toEqual([]);
  });
});

describe('UsersService — create()', () => {
  let service: UsersService;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let auditLog: ReturnType<typeof mockAuditLog>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: getRepositoryToken(Comment), useFactory: mockCommentRepo },
        { provide: AuditLogService, useFactory: mockAuditLog },
      ],
    }).compile();

    service = module.get(UsersService);
    userRepo = module.get(getRepositoryToken(User));
    auditLog = module.get(AuditLogService);
  });

  it('hashes the password and logs CREATE on success', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
    const user = makeUser({ id: 7 });
    userRepo.create.mockReturnValue(user);
    userRepo.save.mockResolvedValue(user);

    const result = await service.create(
      { username: 'alice', email: 'alice@test.com', fullName: 'Alice', password: 'secret', role: 'DEVELOPER' as any },
      5,
    );

    expect(result).toBe(user);
    expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({ password: 'hashed-pw' }));
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'User', entityId: 7 }),
    );
  });

  it('throws ConflictException on duplicate username or email (PG unique violation)', async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
    userRepo.create.mockReturnValue(makeUser());

    const pgError = Object.assign(
      new QueryFailedError('INSERT', [], new Error('duplicate')),
      { code: '23505' },
    );
    userRepo.save.mockRejectedValue(pgError);

    await expect(
      service.create({ username: 'alice', email: 'alice@test.com', fullName: 'Alice', password: 'secret', role: 'DEVELOPER' as any }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('UsersService — findOne()', () => {
  let service: UsersService;
  let userRepo: ReturnType<typeof mockUserRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: getRepositoryToken(Comment), useFactory: mockCommentRepo },
        { provide: AuditLogService, useFactory: mockAuditLog },
      ],
    }).compile();

    service = module.get(UsersService);
    userRepo = module.get(getRepositoryToken(User));
  });

  it('returns the user when found', async () => {
    const user = makeUser();
    userRepo.findOne.mockResolvedValue(user);

    await expect(service.findOne(1)).resolves.toBe(user);
  });

  it('throws NotFoundException when user does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService — update()', () => {
  let service: UsersService;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let auditLog: ReturnType<typeof mockAuditLog>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: getRepositoryToken(Comment), useFactory: mockCommentRepo },
        { provide: AuditLogService, useFactory: mockAuditLog },
      ],
    }).compile();

    service = module.get(UsersService);
    userRepo = module.get(getRepositoryToken(User));
    auditLog = module.get(AuditLogService);
  });

  it('applies the patch and logs UPDATE', async () => {
    const user = makeUser();
    userRepo.findOne.mockResolvedValue(user);
    userRepo.save.mockResolvedValue({ ...user, fullName: 'Alice Updated' });

    const result = await service.update(1, { fullName: 'Alice Updated' }, 5);

    expect(result.fullName).toBe('Alice Updated');
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityId: 1 }),
    );
  });

  it('throws NotFoundException when user does not exist', async () => {
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.update(99, { fullName: 'X' }, 1)).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService — remove()', () => {
  let service: UsersService;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let auditLog: ReturnType<typeof mockAuditLog>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: getRepositoryToken(Comment), useFactory: mockCommentRepo },
        { provide: AuditLogService, useFactory: mockAuditLog },
      ],
    }).compile();

    service = module.get(UsersService);
    userRepo = module.get(getRepositoryToken(User));
    auditLog = module.get(AuditLogService);
  });

  it('deletes the user and logs DELETE', async () => {
    userRepo.delete.mockResolvedValue({ affected: 1 });

    await service.remove(1, 5);

    expect(userRepo.delete).toHaveBeenCalledWith(1);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', entityType: 'User', entityId: 1 }),
    );
  });

  it('throws NotFoundException when user does not exist', async () => {
    userRepo.delete.mockResolvedValue({ affected: 0 });

    await expect(service.remove(99, 1)).rejects.toThrow(NotFoundException);
    expect(auditLog.log).not.toHaveBeenCalled();
  });
});
