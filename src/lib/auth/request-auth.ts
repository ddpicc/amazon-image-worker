import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from './api-key-service'
import { getCurrentUserContext } from './current-user'

export interface RequestAuthContext {
  authType: 'session' | 'api-key'
  userId: string
  role: 'ADMIN' | 'USER'
  apiKeyId?: string
  sessionId?: string
}

export async function resolveRequestAuth(request: NextRequest): Promise<RequestAuthContext | null> {
  const headerUserId = request.headers.get('x-user-id')
  const headerUserRole = request.headers.get('x-user-role')
  const headerAuthType = request.headers.get('x-auth-type')
  const headerApiKeyId = request.headers.get('x-api-key-id')
  const headerSessionId = request.headers.get('x-session-id')

  if (
    headerUserId &&
    headerUserRole &&
    (headerAuthType === 'session' || headerAuthType === 'api-key')
  ) {
    return {
      authType: headerAuthType,
      userId: headerUserId,
      role: headerUserRole === 'ADMIN' ? 'ADMIN' : 'USER',
      apiKeyId: headerApiKeyId ?? undefined,
      sessionId: headerSessionId ?? undefined,
    }
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = await validateApiKey(authHeader.slice('Bearer '.length))
    if (apiKey?.ownerUserId && apiKey.ownerUser) {
      return {
        authType: 'api-key',
        userId: apiKey.ownerUserId,
        role: apiKey.ownerUser.role,
        apiKeyId: apiKey.id,
      }
    }
  }

  const currentUser = await getCurrentUserContext()
  if (!currentUser) {
    return null
  }

  return {
    authType: 'session',
    userId: currentUser.userId,
    role: currentUser.role,
    sessionId: currentUser.sessionId,
  }
}

export async function requireRequestAuth(request: NextRequest) {
  const auth = await resolveRequestAuth(request)
  if (!auth) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as NextResponse }
  }

  return { auth }
}

export async function requireAdminRequest(request: NextRequest) {
  const result = await requireRequestAuth(request)
  if ('error' in result) {
    return result
  }

  if (result.auth.role !== 'ADMIN') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as NextResponse }
  }

  return result
}
