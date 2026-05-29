import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { TokenDenylistService } from './token-denylist.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // Number() so jsonwebtoken reads it as seconds, not milliseconds.
        signOptions: { expiresIn: Number(config.getOrThrow('JWT_EXPIRES_IN')) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    TokenDenylistService,
    // Applies JwtAuthGuard to every route in the app by default.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Applies RolesGuard globally; routes without @Roles() pass through freely.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
