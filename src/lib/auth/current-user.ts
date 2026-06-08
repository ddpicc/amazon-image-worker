import { getCurrentSessionFromCookies } from './session'

export interface CurrentUserContext {
  userId: string
  role: 'ADMIN' | 'USER'
  sessionId: string
  email: string
  name: string | null
}

export async function getCurrentUserContext(): Promise<CurrentUserContext | null> {
  const session = await getCurrentSessionFromCookies()
  if (!session) return null

  return {
    userId: session.user.id,
    role: session.user.role,
    sessionId: session.id,
    email: session.user.email,
    name: session.user.name,
  }
}
