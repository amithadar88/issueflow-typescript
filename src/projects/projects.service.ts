import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { AuditAction, EntityType } from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { User } from '../users/user.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './project.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateProjectDto, ownerId: number, performedBy: number | null = null): Promise<Project> {
    const owner = await this.usersRepository.findOne({ where: { id: ownerId } });
    if (!owner) throw new NotFoundException(`User ${ownerId} not found`);

    const project = this.projectsRepository.create({ ...dto, ownerId });
    const saved = await this.projectsRepository.save(project);
    this.auditLog.log({ action: AuditAction.CREATE, entityType: EntityType.PROJECT, entityId: saved.id, performedBy });
    return saved;
  }

  findAll(): Promise<Project[]> {
    return this.projectsRepository.find();
  }

  async findOne(id: number): Promise<Project> {
    const project = await this.projectsRepository.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  async update(id: number, dto: UpdateProjectDto, performedBy: number | null = null): Promise<Project> {
    const project = await this.findOne(id);
    Object.assign(project, dto);
    const saved = await this.projectsRepository.save(project);
    this.auditLog.log({ action: AuditAction.UPDATE, entityType: EntityType.PROJECT, entityId: id, performedBy });
    return saved;
  }

  async softDelete(id: number, performedBy: number | null = null): Promise<void> {
    // softDelete() only touches deletedAt; it won't throw on a missing row,
    // so we verify existence first so the caller gets a proper 404.
    await this.findOne(id);
    await this.projectsRepository.softDelete(id);
    this.auditLog.log({ action: AuditAction.DELETE, entityType: EntityType.PROJECT, entityId: id, performedBy });
  }

  findDeleted(): Promise<Project[]> {
    return this.projectsRepository.find({ withDeleted: true, where: { deletedAt: Not(IsNull()) } });
  }

  async restore(id: number, performedBy: number | null = null): Promise<Project> {
    // Confirm the row exists (even if soft-deleted) before restoring.
    const project = await this.projectsRepository.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    await this.projectsRepository.restore(id);
    this.auditLog.log({ action: AuditAction.RESTORE, entityType: EntityType.PROJECT, entityId: id, performedBy });
    const restored = await this.projectsRepository.findOne({ where: { id } });
    if (!restored) throw new NotFoundException(`Project ${id} not found after restore`);
    return restored;
  }
}
