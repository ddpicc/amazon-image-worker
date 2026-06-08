import { prisma } from '@/lib/db/prisma'
import { hashPassword } from './password'

export async function ensureBootstrapAdmin() {
  const adminCount = await prisma.user.count({
    where: { role: 'ADMIN' },
  })

  if (adminCount > 0) {
    return
  }

  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    console.warn('[auth.bootstrap] No ADMIN_EMAIL / ADMIN_PASSWORD provided; skipping bootstrap admin creation')
    return
  }

  const passwordHash = await hashPassword(password)

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      enabled: true,
      name: 'Bootstrap Admin',
    },
  })

  await prisma.apiKey.updateMany({
    where: { ownerUserId: null },
    data: { ownerUserId: admin.id },
  })

  console.info('[auth.bootstrap] Bootstrap admin ensured')
}
