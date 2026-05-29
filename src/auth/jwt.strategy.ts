import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: number;
  username: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Runs after the signature/expiry are verified. We reload the user so that a
  // token for a since-deleted account is rejected, and the return value becomes
  // req.user (a User instance, so ClassSerializerInterceptor strips password).
  async validate(payload: JwtPayload) {
    try {
      return await this.usersService.findOne(payload.sub);
    } catch {
      throw new UnauthorizedException();
    }
  }
}
