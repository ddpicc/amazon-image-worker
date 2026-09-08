import { NextRequest, NextResponse } from 'next/server'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { listPublicImageModels } from '@/lib/image-models'

export async function GET(request: NextRequest) {
  const result = await requireRequestAuth(request)
  if ('error' in result) return result.error
  if (result.auth.authType !== 'api-key') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const models = await listPublicImageModels()
  return NextResponse.json({
    object: 'list',
    data: models.map((id) => ({
      id,
      object: 'model',
      owned_by: 'amazon-image-worker',
    })),
  })
}
