import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

// ClassSerializerInterceptor applies the entity's @Exclude() rules, guaranteeing
// the password is stripped from every response this controller returns.
@UseInterceptors(ClassSerializerInterceptor)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':userId')
  findOne(@Param('userId', ParseIntPipe) userId: number) {
    return this.usersService.findOne(userId);
  }

  @Get(':userId/mentions')
  findMentions(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.usersService.findMentions(userId, page, pageSize);
  }

  // @Public() — no guaranteed req.user; performedBy is null for self-registration.
  @Public()
  @Post()
  create(@Body() createUserDto: CreateUserDto, @Req() req: Request) {
    const performedBy = (req.user as User | undefined)?.id ?? null;
    return this.usersService.create(createUserDto, performedBy);
  }

  @Post('update/:userId')
  update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: Request,
  ) {
    return this.usersService.update(userId, updateUserDto, (req.user as User).id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('userId', ParseIntPipe) userId: number, @Req() req: Request) {
    return this.usersService.remove(userId, (req.user as User).id);
  }
}
