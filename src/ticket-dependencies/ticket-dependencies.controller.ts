import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { TicketDependenciesService } from './ticket-dependencies.service';

@Controller('tickets/:ticketId/dependencies')
export class TicketDependenciesController {
  constructor(private readonly service: TicketDependenciesService) {}

  @Post()
  addDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: AddDependencyDto,
  ) {
    return this.service.addDependency(ticketId, dto.blockedBy);
  }

  @Get()
  getDependencies(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.service.getDependencies(ticketId);
  }

  @Get('blocking')
  getBlocking(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.service.getBlocking(ticketId);
  }

  @Delete(':blockerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('blockerId', ParseIntPipe) blockerId: number,
  ) {
    return this.service.removeDependency(ticketId, blockerId);
  }
}
