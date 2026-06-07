import crypto from 'crypto'

/**
 * Generate a new raw API key string.
 * Format: imgw_{48-char-hex} (24 random bytes → 48 hex chars after the prefix).
 */
export function generateRawApiKey(): string {
  return `imgw_${crypto.randomBytes(24).toString('hex')}`
}

/**
 * Hash a raw API key using SHA-256 with the APP_SECRET env var as a salt prefix.
 * The resulting hash is what gets stored in the database.
 */
export function hashApiKey(rawKey: string): string {
  return crypto
    .createHash('sha256')
    .update(`${process.env.APP_SECRET}:${rawKey}`)
    .digest('hex')
}

/**
 * Extract a short prefix from the raw key (the first 8 hex chars after "imgw_").
 * This is stored in the database so users can identify which key they're looking at.
 */
export function extractKeyPrefix(rawKey: string): string {
  const keyPart = rawKey.startsWith('imgw_') ? rawKey.slice(5) : rawKey
  return keyPart.slice(0, 8)
}
