import { Injectable } from '@nestjs/common';

// In-memory store of revoked JWTs. Each entry is keyed by the raw token and
// holds the token's own expiry (epoch seconds); once a token would have expired
// on its own there's no need to keep denying it, so entries are pruned lazily.
//
// NOTE: this lives in process memory — it is cleared on restart and is not
// shared across instances. Fine for a single-node dev setup; a multi-instance
// deployment would need a shared store (e.g. Redis).
@Injectable()
export class TokenDenylistService {
  private readonly revoked = new Map<string, number>();

  revoke(token: string, expEpochSeconds: number): void {
    this.revoked.set(token, expEpochSeconds);
    this.prune();
  }

  isRevoked(token: string): boolean {
    const exp = this.revoked.get(token);
    if (exp === undefined) {
      return false;
    }
    if (exp * 1000 <= Date.now()) {
      this.revoked.delete(token);
      return false;
    }
    return true;
  }

  private prune(): void {
    const now = Date.now();
    for (const [token, exp] of this.revoked) {
      if (exp * 1000 <= now) {
        this.revoked.delete(token);
      }
    }
  }
}
