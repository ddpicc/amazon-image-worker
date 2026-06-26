import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import { testImageProviderDirect } from '@/lib/direct-provider-test'
import type { RenderSize } from '@/lib/image-options'

const ALLOWED_SIZES = new Set<RenderSize>([
  '1024x1024',
  '2048x2048',
  '1536x1024',
  '2048x1365',
  '1024x1536',
  '1365x2048',
  '1536x960',
  '1024x640',
])

export async function POST(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const body = await request.json()
    const { providerId, prompt, size = '1024x1024', image_urls } = body as {
      providerId?: string
      prompt?: string
      size?: RenderSize
      image_urls?: string[]
    }

    if (!providerId || typeof providerId !== 'string') {
      return NextResponse.json({ error: 'providerId is required' }, { status: 400 })
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    if (prompt.length > 32000) {
      return NextResponse.json({ error: 'prompt exceeds 32000 characters' }, { status: 400 })
    }

    if (!ALLOWED_SIZES.has(size)) {
      return NextResponse.json({ error: 'Unsupported size' }, { status: 400 })
    }

    const imageUrls = Array.isArray(image_urls) ? image_urls.filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 16) : []

    const data = await testImageProviderDirect({
      providerId,
      prompt: prompt.trim(),
      size,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    })

    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
