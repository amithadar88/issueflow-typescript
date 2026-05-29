import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '../users/user.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto, @Req() req: Request) {
    return this.projectsService.create(dto, dto.ownerId, (req.user as User).id);
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  // Static route declared before /:projectId so NestJS doesn't treat
  // the string "deleted" as a param and pass it to ParseIntPipe.
  @Get('deleted')
  @Roles(UserRole.ADMIN)
  findDeleted() {
    return this.projectsService.findDeleted();
  }

  @Get(':projectId')
  findOne(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.projectsService.findOne(projectId);
  }

  @Patch(':projectId')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: UpdateProjectDto,
    @Req() req: Request,
  ) {
    return this.projectsService.update(projectId, dto, (req.user as User).id);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('projectId', ParseIntPipe) projectId: number, @Req() req: Request) {
    return this.projectsService.softDelete(projectId, (req.user as User).id);
  }

  @Post(':projectId/restore')
  @Roles(UserRole.ADMIN)
  restore(@Param('projectId', ParseIntPipe) projectId: number, @Req() req: Request) {
    return this.projectsService.restore(projectId, (req.user as User).id);
  }
}
