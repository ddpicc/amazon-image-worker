import 'dotenv/config'
import { Worker } from 'bullmq'
import { executeQueuedImageGeneration } from '../lib/image-generation-service'
import { getImageGenerationQueueName, ImageGenerationQueueJobData } from '../lib/image-generation-worker-queue'
import { prisma } from '../lib/db/prisma'
import { snapshotProviderStats } from '../lib/providers/stats-snapshot'
import { resetDailyQuotas, resetMonthlyQuotas } from '../lib/auth/quota-reset'

const QUEUE_NAME = getImageGenerationQueueName()

// Scheduled intervals
const STATS_SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000   // 15 minutes
const DAILY_QUOTA_CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

const scheduledTimers: NodeJS.Timeout[] = []

function requireRedisUrl() {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is not set')
  }
  return redisUrl
}

function startScheduledJobs() {
  // Stats snapshot — every 15 minutes
  const statsTimer = setInterval(async () => {
    try {
      await snapshotProviderStats()
    } catch (error) {
      console.error('[scheduler] stats snapshot failed', error)
    }
  }, STATS_SNAPSHOT_INTERVAL_MS)
  scheduledTimers.push(statsTimer)

  // Quota reset check — every hour
  const quotaTimer = setInterval(async () => {
    try {
      await checkAndResetQuotas()
    } catch (error) {
      console.error('[scheduler] quota reset check failed', error)
    }
  }, DAILY_QUOTA_CHECK_INTERVAL_MS)
  scheduledTimers.push(quotaTimer)

  // Run initial snapshot
  snapshotProviderStats().catch(err => {
    console.error('[scheduler] initial stats snapshot failed', err)
  })

  console.info('[scheduler] scheduled jobs started')
}

async function checkAndResetQuotas() {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // Check if any quota has a dailyResetAt before today
  const staleDaily = await prisma.quota.findFirst({
    where: {
      dailyResetAt: { not: null, lt: startOfDay },
    },
  })
  if (staleDaily) {
    await resetDailyQuotas()
  }

  // Check if any quota has a monthlyResetAt before this month
  const staleMonthly = await prisma.quota.findFirst({
    where: {
      monthlyResetAt: { not: null, lt: startOfMonth },
    },
  })
  if (staleMonthly) {
    await resetMonthlyQuotas()
  }
}

function stopScheduledJobs() {
  for (const timer of scheduledTimers) {
    clearInterval(timer)
  }
  scheduledTimers.length = 0
  console.info('[scheduler] scheduled jobs stopped')
}

async function main() {
  console.info('[worker] starting image-generation worker')

  const redisUrl = requireRedisUrl()

  const worker = new Worker<ImageGenerationQueueJobData>(
    QUEUE_NAME,
    async (job) => {
      const { requestId } = job.data
      console.info('[worker] processing job', { jobId: job.id, requestId })

      try {
        const result = await executeQueuedImageGeneration(requestId)
        const status = 'status' in result ? (result as any).status : 'completed'
        console.info('[worker] job completed', {
          jobId: job.id,
          requestId,
          status,
        })
        return result
      } catch (error) {
        console.error('[worker] job failed', {
          jobId: job.id,
          requestId,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
    {
      connection: { url: redisUrl } as any,
      concurrency: 3,
    },
  )

  worker.on('completed', (job) => {
    console.info('[worker] job completed', { jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    console.error('[worker] job failed', {
      jobId: job?.id,
      error: err.message,
    })
  })

  worker.on('error', (err) => {
    console.error('[worker] worker error', { error: err.message })
  })

  // Start scheduled jobs (stats snapshot, quota resets)
  startScheduledJobs()

  console.info('[worker] image-generation worker ready, waiting for jobs...')

  const shutdown = async () => {
    console.info('[worker] shutting down...')
    stopScheduledJobs()
    await worker.close()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((error) => {
  console.error('[worker] fatal error', error)
  process.exit(1)
})
