import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import { getProvider, updateProvider, deleteProvider } from '@/lib/providers/provider-service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireAdminRequest(_request)
    if ('error' in result) {
      return result.error
    }

    const { id } = await params

    const provider = await getProvider(id)
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    // Include last 20 attempts for this provider
    const attempts = await prisma.imageGenerationAttempt.findMany({
      where: { providerId: id },
      orderBy: { startedAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({ data: { ...provider, attempts } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const { id } = await params

    const body = await request.json()
    const { name, vendor, baseUrl, model, priority, enabled, estimatedCostPerReq } = body as {
      name?: string
      vendor?: string
      baseUrl?: string
      model?: string
      priority?: number
      enabled?: boolean
      estimatedCostPerReq?: number
    }

    const provider = await updateProvider(id, {
      name,
      vendor,
      baseUrl,
      model,
      priority,
      enabled,
      estimatedCostPerReq,
    })

    return NextResponse.json({ data: provider })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireAdminRequest(_request)
    if ('error' in result) {
      return result.error
    }

    const { id } = await params

    await deleteProvider(id)

    return NextResponse.json({ data: { deleted: true } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
