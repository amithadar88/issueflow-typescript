import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';
import { TokenDenylistService } from './token-denylist.service';

jest.mock('bcrypt');

const mockUserRepo = () => ({ createQueryBuilder: jest.fn() });
const mockJwt = () => ({ sign: jest.fn().mockReturnValue('signed-token'), decode: jest.fn() });
const mockDenylist = () => ({ revoke: jest.fn() });

function makeQb(result: User | null) {
  const qb: any = {
    addSelect: jest.fn(),
    where: jest.fn(),
    getOne: jest.fn().mockResolvedValue(result),
  };
  qb.addSelect.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  return qb;
}

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let jwtService: ReturnType<typeof mockJwt>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: JwtService, useFactory: mockJwt },
        { provide: TokenDenylistService, useFactory: mockDenylist },
      ],
    }).compile();

    service = module.get(AuthService);
    userRepo = module.get(getRepositoryToken(User));
    jwtService = module.get(JwtService);
  });

  describe('login()', () => {
    it('returns an access_token for valid credentials', async () => {
      const user = { id: 1, username: 'jdoe', password: 'hashed' } as User;
      userRepo.createQueryBuilder.mockReturnValue(makeQb(user));
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('jdoe', 'secret');

      expect(result).toEqual({ access_token: 'signed-token' });
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 1, username: 'jdoe' });
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      userRepo.createQueryBuilder.mockReturnValue(makeQb(null));

      await expect(service.login('nobody', 'pass')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      const user = { id: 1, username: 'jdoe', password: 'hashed' } as User;
      userRepo.createQueryBuilder.mockReturnValue(makeQb(user));
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login('jdoe', 'wrongpass')).rejects.toThrow(UnauthorizedException);
    });

    it('returns the same error message for missing user and wrong password (no credential leakage)', async () => {
      userRepo.createQueryBuilder.mockReturnValue(makeQb(null));
      const missingErr = await service.login('nobody', 'x').catch((e) => e);

      const user = { id: 1, username: 'jdoe', password: 'hashed' } as User;
      userRepo.createQueryBuilder.mockReturnValue(makeQb(user));
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const wrongPassErr = await service.login('jdoe', 'wrong').catch((e) => e);

      expect(missingErr.message).toBe(wrongPassErr.message);
    });
  });
});
