import { createHash, randomBytes } from 'node:crypto';

/**
 * API-key crypto helpers.
 *
 * Why sha256 and NOT bcrypt: bcrypt's salt + work-factor exist to slow brute-force
 * attacks on LOW-entropy human passwords. An API key here is a 256-bit cryptographically
 * random token (`randomBytes(32)`), so it has no meaningful brute-force surface — there is
 * nothing to salt and no work-factor to tune. A single fast sha256 of the raw key gives a
 * deterministic, indexable digest we can look up with a unique index, while never storing
 * the raw secret. (bcrypt would also be unusable here: its non-deterministic per-row salt
 * makes a `WHERE hashedKey = ?` lookup impossible.)
 */

/** Generate a fresh raw API key: the non-secret `bp_` namespace prefix + 256 bits of entropy. */
export function generateRawKey(): string {
  return 'bp_' + randomBytes(32).toString('hex');
}

/** Deterministically hash a raw key to its stored sha256 hex digest (64 chars). */
export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Derive the short, non-sensitive display prefix (first 8 chars) from a raw key. */
export function derivePrefix(raw: string): string {
  return raw.slice(0, 8);
}
