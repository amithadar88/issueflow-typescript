import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { ExtractJwt } from 'passport-jwt';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.username, loginDto.password);
  }

  // Protected by the global guard, so a valid token is required to log out.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() request: Request) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    if (token) {
      this.authService.logout(token);
    }
    return { message: 'Logged out' };
  }

  // req.user is the User instance returned by JwtStrategy.validate();
  // ClassSerializerInterceptor strips the password via the entity's @Exclude().
  @Get('me')
  @UseInterceptors(ClassSerializerInterceptor)
  me(@Req() request: Request) {
    return request.user;
  }
}
