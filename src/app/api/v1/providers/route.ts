import { NextRequest, NextResponse } from 'next/server'
import { listProviders, createProvider } from '@/lib/providers/provider-service'

export async function GET() {
  try {
    const providers = await listProviders(true)
    return NextResponse.json({ data: providers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, vendor, baseUrl, model, priority, apiKeyPlaintext, estimatedCostPerReq } = body as {
      name?: string
      vendor?: string
      baseUrl?: string
      model?: string
      priority?: number
      apiKeyPlaintext?: string
      estimatedCostPerReq?: number
    }

    if (!name || !vendor || !baseUrl || !model || !apiKeyPlaintext) {
      return NextResponse.json(
        { error: 'name, vendor, baseUrl, model, and apiKeyPlaintext are required' },
        { status: 400 },
      )
    }

    const provider = await createProvider({
      name,
      vendor,
      baseUrl,
      model,
      priority,
      apiKeyPlaintext,
      estimatedCostPerReq,
    })

    return NextResponse.json({ data: provider }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
