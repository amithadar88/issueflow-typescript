import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { diskStorage } from 'multer';
import { Request, Response } from 'express';
import { User } from '../users/user.entity';
import { AttachmentsService, UPLOADS_DIR } from './attachments.service';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/plain',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Controller('tickets/:ticketId/attachments')
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `File type "${file.mimetype}" is not allowed. Accepted: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  upload(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    return this.service.saveAttachment(ticketId, file, (req.user as User).id);
  }

  @Get()
  findAll(@Param('ticketId', ParseIntPipe) ticketId: number) {
    return this.service.findAll(ticketId);
  }

  @Get(':attachmentId')
  async download(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, attachment } = await this.service.download(ticketId, attachmentId);
    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename="${attachment.originalName}"`,
    });
    return file;
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    return this.service.remove(ticketId, attachmentId);
  }
}
