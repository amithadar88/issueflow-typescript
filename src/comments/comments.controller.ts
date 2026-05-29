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
import { User } from '../users/user.entity';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Controller('tickets/:ticketId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  findAll(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.commentsService.findAll(ticketId);
  }

  @Post()
  create(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: CreateCommentDto,
    @Req() req: Request,
  ) {
    return this.commentsService.create(ticketId, dto, (req.user as User).id);
  }

  @Patch(':commentId')
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() dto: UpdateCommentDto,
    @Req() req: Request,
  ) {
    return this.commentsService.update(ticketId, commentId, dto, (req.user as User).id);
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Req() req: Request,
  ) {
    return this.commentsService.remove(ticketId, commentId, (req.user as User).id);
  }
}
