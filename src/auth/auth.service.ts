import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { JwtPayload } from './jwt.strategy';
import { TokenDenylistService } from './token-denylist.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly denylist: TokenDenylistService,
  ) {}

  async login(username: string, password: string): Promise<{ access_token: string }> {
    // password has select:false on the entity, so it must be explicitly added.
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .getOne();

    if (!user || !(await bcrypt.compare(password, user.password))) {
      // Same error for unknown user and wrong password — don't leak which.
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = { sub: user.id, username: user.username };
    return { access_token: this.jwtService.sign(payload) };
  }

  logout(token: string): void {
    const decoded = this.jwtService.decode(token) as { exp?: number } | null;
    // Fall back to "now" so a token without exp is still denied immediately.
    const exp = decoded?.exp ?? Math.floor(Date.now() / 1000);
    this.denylist.revoke(token, exp);
  }
}
