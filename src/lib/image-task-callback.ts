import { buildImageTaskResponse } from '@/lib/image-task-response'

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

    try {
      const response = await fetch(parsed.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      if (response.ok) {
        return
      }
    } catch {
      // Retry on next iteration
    } finally {
      clearTimeout(timeout)
    }
  }
}
