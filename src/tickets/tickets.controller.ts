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
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '../users/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(@Body() dto: CreateTicketDto, @Req() req: Request) {
    return this.ticketsService.create(dto, (req.user as User).id);
  }

  @Get()
  findAll(
    @Query('projectId', new ParseIntPipe({ optional: true })) projectId?: number,
  ) {
    return this.ticketsService.findAll(projectId);
  }

  // Literal sub-routes declared before /:ticketId so they are never coerced to int.
  @Get('deleted')
  @Roles(UserRole.ADMIN)
  findDeleted(
    @Query('projectId', new ParseIntPipe({ optional: true })) projectId?: number,
  ) {
    return this.ticketsService.findDeleted(projectId);
  }

  @Get('export')
  async exportCsv(
    @Query('projectId', new ParseIntPipe({ optional: true })) projectId: number | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.ticketsService.exportCsv(projectId);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="tickets.csv"',
    });
    return new StreamableFile(csv);
  }

  // Accepts multipart/form-data: file field "file" (CSV) + form field "projectId".
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body('projectId', ParseIntPipe) projectId: number,
    @Req() req: Request,
  ) {
    return this.ticketsService.importCsv(file.buffer, projectId, (req.user as User).id);
  }

  @Get(':ticketId')
  findOne(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.findOne(ticketId);
  }

  @Patch(':ticketId')
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketDto,
    @Req() req: Request,
  ) {
    return this.ticketsService.update(ticketId, dto, (req.user as User).id);
  }

  @Delete(':ticketId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('ticketId', ParseIntPipe) ticketId: number, @Req() req: Request) {
    return this.ticketsService.softDelete(ticketId, (req.user as User).id);
  }

  @Post(':ticketId/restore')
  @Roles(UserRole.ADMIN)
  restore(@Param('ticketId', ParseIntPipe) ticketId: number, @Req() req: Request) {
    return this.ticketsService.restore(ticketId, (req.user as User).id);
  }

  @Post(':ticketId/auto-assign')
  autoAssign(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.ticketsService.autoAssign(ticketId);
  }
}
