import { AlertSeverity } from '@prisma/client'
import { prisma } from '../db/prisma'

export interface DispatchContext {
  providerName?: string
  providerId?: string
  failureRate?: number
  avgLatencyMs?: number
  errorType?: string
  [key: string]: unknown
}

export async function dispatchAlert(
  ruleId: string,
  message: string,
  severity: AlertSeverity,
  context: DispatchContext,
): Promise<void> {
  // Create event record
  await prisma.alertEvent.create({
    data: {
      ruleId,
      providerId: context.providerId ?? null,
      message,
      severity,
    },
  })

  // Update rule's lastTriggeredAt
  const rule = await prisma.alertRule.update({
    where: { id: ruleId },
    data: { lastTriggeredAt: new Date() },
  })

  // Fire webhook (fire-and-forget, don't block worker)
  if (rule.webhookUrl) {
    fireWebhook(rule.webhookUrl, {
      ruleName: rule.name,
      ruleId: rule.id,
      conditionType: rule.conditionType,
      message,
      severity,
      ...context,
      timestamp: new Date().toISOString(),
    }).catch(err => {
      console.error(`[AlertDispatcher] Webhook failed for rule ${rule.id}:`, err)
    })
  }
}

async function fireWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000) // 5s timeout

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}
