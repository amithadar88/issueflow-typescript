import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { TokenDenylistService } from './token-denylist.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly denylist: TokenDenylistService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Reject denylisted tokens before passport validates them, so a logged-out
    // token is refused even though its signature is still cryptographically valid.
    const request = context.switchToHttp().getRequest();
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    if (token && this.denylist.isRevoked(token)) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return super.canActivate(context);
  }
}
