import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditActor, AuditLog } from './audit-log.entity';
import { AuditLogService } from './audit-log.service';

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
});

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: jest.Mocked<Pick<Repository<AuditLog>, 'create' | 'save' | 'find'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(AuditLogService);
    repo = module.get(getRepositoryToken(AuditLog));
  });

  describe('log()', () => {
    it('infers USER actor when performedBy is set', () => {
      const entry = { action: 'CREATE', entityType: 'Ticket', entityId: 1, performedBy: 42, actor: AuditActor.USER };
      repo.create.mockReturnValue(entry as any);
      repo.save.mockResolvedValue(entry as any);

      service.log({ action: 'CREATE', entityType: 'Ticket', entityId: 1, performedBy: 42 });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ actor: AuditActor.USER, performedBy: 42 }),
      );
    });

    it('infers SYSTEM actor when performedBy is null', () => {
      const entry = { action: 'AUTO_ASSIGN', entityType: 'Ticket', entityId: 1, performedBy: null, actor: AuditActor.SYSTEM };
      repo.create.mockReturnValue(entry as any);
      repo.save.mockResolvedValue(entry as any);

      service.log({ action: 'AUTO_ASSIGN', entityType: 'Ticket', entityId: 1, performedBy: null });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ actor: AuditActor.SYSTEM, performedBy: null }),
      );
    });

    it('does not throw when save rejects (fire-and-forget)', () => {
      repo.create.mockReturnValue({} as any);
      repo.save.mockRejectedValue(new Error('DB error'));

      expect(() =>
        service.log({ action: 'CREATE', entityType: 'Ticket', entityId: 1, performedBy: 1 }),
      ).not.toThrow();
    });
  });

  describe('findAll()', () => {
    it('returns entries ordered by timestamp DESC', async () => {
      const entries = [{ id: 2 }, { id: 1 }] as AuditLog[];
      repo.find.mockResolvedValue(entries);

      const result = await service.findAll({});

      expect(repo.find).toHaveBeenCalledWith({ where: {}, order: { timestamp: 'DESC' } });
      expect(result).toBe(entries);
    });

    it('builds WHERE clause from provided filters', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAll({ entityType: 'Ticket', actor: AuditActor.USER });

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Ticket', actor: AuditActor.USER },
        }),
      );
    });

    it('omits filter keys that are undefined', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAll({ entityType: 'Ticket' });

      const call = (repo.find as jest.Mock).mock.calls[0][0];
      expect(call.where).not.toHaveProperty('entityId');
      expect(call.where).not.toHaveProperty('action');
    });
  });
});
