import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateApiKeyInput } from '@blockpress/shared';
import { PrismaService } from '../prisma/prisma.service';
import { derivePrefix, generateRawKey, hashKey } from './api-key.crypto';

// The ONLY fields ever projected back to a caller. Deliberately omits `hashedKey`
// (and `ownerUserId`): the hash never leaves the DB and the raw key is shown once,
// at create, then forgotten.
const summarySelect = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  lastUsedAt: true,
  revokedAt: true,
  expiresAt: true,
  createdAt: true,
} satisfies Prisma.ApiKeySelect;

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mint a key for `ownerUserId`. Generates the raw secret, stores only its sha256 hash
   * + display prefix, and returns the summary plus the raw key EXACTLY ONCE. The raw key
   * is never persisted and never recoverable afterwards.
   */
  async create(input: CreateApiKeyInput, ownerUserId: string) {
    const rawKey = generateRawKey();
    const key = await this.prisma.apiKey.create({
      data: {
        name: input.name,
        hashedKey: hashKey(rawKey),
        prefix: derivePrefix(rawKey),
        scopes: input.scopes,
        ownerUserId,
        expiresAt: input.expiresAt ?? null,
      },
      select: summarySelect,
    });
    return { ...key, rawKey };
  }

  /** List the caller's own keys. Never includes the hash or raw secret. */
  async list(ownerUserId: string) {
    return this.prisma.apiKey.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: 'desc' },
      select: summarySelect,
    });
  }

  /**
   * Revoke a key the caller owns. Scoped to `ownerUserId` so a user can never revoke
   * another user's key — `updateMany` is required because `update`'s `where` accepts only
   * unique fields and so can't filter by owner. A miss (wrong owner or unknown id) 404s
   * without leaking whether the id exists.
   */
  async revoke(id: string, ownerUserId: string) {
    const result = await this.prisma.apiKey.updateMany({
      where: { id, ownerUserId },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('API key not found');
    return { ok: true };
  }
}
