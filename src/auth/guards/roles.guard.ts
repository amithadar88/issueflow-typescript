import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator — any authenticated user may proceed.
    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!required.includes(user?.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
