import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { User } from '../users/user.entity';
import { Project } from './project.entity';
import { ProjectsService } from './projects.service';

const mockProjectRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
});

const mockUserRepo = () => ({ findOne: jest.fn() });
const mockAuditLog = () => ({ log: jest.fn() });

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: 'Test Project',
    description: 'A test project',
    ownerId: 1,
    owner: null,
    deletedAt: null,
    ...overrides,
  } as unknown as Project;
}

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepo: ReturnType<typeof mockProjectRepo>;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let auditLog: ReturnType<typeof mockAuditLog>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useFactory: mockProjectRepo },
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: AuditLogService, useFactory: mockAuditLog },
      ],
    }).compile();

    service = module.get(ProjectsService);
    projectRepo = module.get(getRepositoryToken(Project));
    userRepo = module.get(getRepositoryToken(User));
    auditLog = module.get(AuditLogService);
  });

  describe('create()', () => {
    it('creates a project and logs CREATE', async () => {
      const owner = { id: 1 } as User;
      const project = makeProject();
      userRepo.findOne.mockResolvedValue(owner);
      projectRepo.create.mockReturnValue(project);
      projectRepo.save.mockResolvedValue(project);

      const result = await service.create({ name: 'Test Project', ownerId: 1 }, 1, 5);

      expect(result).toBe(project);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entityType: 'Project', entityId: 1 }),
      );
    });

    it('throws NotFoundException when owner does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Orphan Project', ownerId: 99 }, 99),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne()', () => {
    it('returns the project when found', async () => {
      const project = makeProject();
      projectRepo.findOne.mockResolvedValue(project);

      await expect(service.findOne(1)).resolves.toBe(project);
    });

    it('throws NotFoundException when project does not exist', async () => {
      projectRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('applies patch fields and logs UPDATE', async () => {
      const project = makeProject();
      projectRepo.findOne.mockResolvedValue(project);
      projectRepo.save.mockResolvedValue({ ...project, name: 'New Name' });

      const result = await service.update(1, { name: 'New Name' }, 5);

      expect(result.name).toBe('New Name');
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', entityId: 1 }),
      );
    });

    it('throws NotFoundException when project does not exist', async () => {
      projectRepo.findOne.mockResolvedValue(null);

      await expect(service.update(99, { name: 'X' }, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete()', () => {
    it('soft-deletes an existing project and logs DELETE', async () => {
      const project = makeProject();
      projectRepo.findOne.mockResolvedValue(project);
      projectRepo.softDelete.mockResolvedValue({ affected: 1 });

      await service.softDelete(1, 5);

      expect(projectRepo.softDelete).toHaveBeenCalledWith(1);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entityId: 1 }),
      );
    });

    it('throws NotFoundException when project does not exist', async () => {
      projectRepo.findOne.mockResolvedValue(null);

      await expect(service.softDelete(99, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('restore()', () => {
    it('restores a soft-deleted project and logs RESTORE', async () => {
      const deleted = makeProject({ deletedAt: new Date('2026-01-01') });
      const restored = makeProject({ deletedAt: null });

      projectRepo.findOne
        .mockResolvedValueOnce(deleted)   // withDeleted lookup
        .mockResolvedValueOnce(restored); // reload after restore
      projectRepo.restore.mockResolvedValue({ affected: 1 });

      const result = await service.restore(1, 5);

      expect(result.deletedAt).toBeNull();
      expect(projectRepo.restore).toHaveBeenCalledWith(1);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RESTORE', entityId: 1 }),
      );
    });

    it('throws NotFoundException when project does not exist at all', async () => {
      projectRepo.findOne.mockResolvedValue(null);

      await expect(service.restore(99, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
