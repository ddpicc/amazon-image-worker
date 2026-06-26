import { buildImageTaskResponse } from '@/lib/image-task-response'
import { prisma } from '@/lib/db/prisma'
import { logger } from '@/lib/logger'

function isPrivateHostname(hostname: string) {
  const value = hostname.toLowerCase()
  if (value === 'localhost' || value === '127.0.0.1' || value === '::1') return true
  if (value.startsWith('10.')) return true
  if (value.startsWith('192.168.')) return true
  const match172 = value.match(/^172\.(\d{1,3})\./)
  if (match172) {
    const second = Number(match172[1])
    if (second >= 16 && second <= 31) return true
  }
  return false
}

export async function dispatchImageTaskCallback(params: {
  callbackUrl: string
  task: Parameters<typeof buildImageTaskResponse>[0]
}) {
  let parsed: URL
  try {
    parsed = new URL(params.callbackUrl)
  } catch {
    return
  }

  if (parsed.protocol !== 'https:' || isPrivateHostname(parsed.hostname)) {
    logger.warn('webhook.delivery.skipped', {
      requestId: params.task.id,
      reason: 'invalid_callback_url',
      callbackUrl: params.callbackUrl,
    })
    return
  }

  const payload = buildImageTaskResponse(params.task)

  const delays = [0, 1000, 2000, 4000]
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    const startedAt = Date.now()
    const delivery = await prisma.webhookDelivery.create({
      data: {
        requestId: params.task.id,
        callbackUrl: parsed.toString(),
        attemptIndex: attempt + 1,
        status: 'STARTED',
      },
    })

    try {
      const response = await fetch(parsed.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const responseBodySample = await response.text().catch(() => '')
      const durationMs = Date.now() - startedAt

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: response.ok ? 'SUCCEEDED' : 'FAILED',
          httpStatus: response.status,
          durationMs,
          responseBodySample: responseBodySample.slice(0, 1000) || null,
          completedAt: new Date(),
        },
      }).catch(() => undefined)

      logger.info('webhook.delivery.completed', {
        requestId: params.task.id,
        deliveryId: delivery.id,
        attemptIndex: attempt + 1,
        httpStatus: response.status,
        durationMs,
        ok: response.ok,
      })

      if (response.ok) {
        return
      }
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const message = error instanceof Error ? error.message : String(error)
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          durationMs,
          errorMessage: message,
          completedAt: new Date(),
        },
      }).catch(() => undefined)
      logger.warn('webhook.delivery.failed', {
        requestId: params.task.id,
        deliveryId: delivery.id,
        attemptIndex: attempt + 1,
        durationMs,
        error: message,
      })
    } finally {
      clearTimeout(timeout)
    }
  }
}
