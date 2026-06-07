import crypto from 'crypto'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is not set`)
  }
  return value
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptSecret(plaintext: string): string {
  const key = deriveKey(requireEnv('PROVIDER_KEY_ENCRYPTION_KEY'))
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.')
}

export function decryptSecret(ciphertext: string): string {
  const [ivB64, tagB64, encryptedB64] = ciphertext.split('.')
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted secret format')
  }

  const key = deriveKey(requireEnv('PROVIDER_KEY_ENCRYPTION_KEY'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

export function hashOpaqueToken(token: string): string {
  const appSecret = requireEnv('APP_SECRET')
  return crypto.createHash('sha256').update(`${appSecret}:${token}`).digest('hex')
}

export function hashRedemptionCode(code: string): string {
  const appSecret = requireEnv('APP_SECRET')
  return crypto.createHash('sha256').update(`redeem:${appSecret}:${code.trim().toUpperCase()}`).digest('hex')
}

export function hashEmailVerificationCode(email: string, code: string): string {
  const appSecret = requireEnv('APP_SECRET')
  return crypto
    .createHash('sha256')
    .update(`email-verify:${appSecret}:${email.trim().toLowerCase()}:${code.trim()}`)
    .digest('hex')
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function generateReferralCode(): string {
  return crypto.randomBytes(4).toString('hex')
}

export function generateEmailVerificationCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}
