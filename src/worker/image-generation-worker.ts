import 'dotenv/config'
import { Worker } from 'bullmq'
import { executeQueuedImageGeneration, ProviderCapacityRequeueError } from '../lib/image-generation-service'
import { enqueueImageGeneration, getImageGenerationQueueName, ImageGenerationQueueJobData } from '../lib/image-generation-worker-queue'
import { prisma } from '../lib/db/prisma'
import { snapshotProviderStats } from '../lib/providers/stats-snapshot'
import { resetDailyQuotas, resetMonthlyQuotas } from '../lib/auth/quota-reset'
import { refundBalance } from '../lib/billing/billing-service'
import { dispatchImageTaskCallback } from '../lib/image-task-callback'
import { reconcileTimedOutBillableImageTasks } from '../lib/image-task-submission'
import { logger } from '../lib/logger'

const QUEUE_NAME = getImageGenerationQueueName()
const PROVIDER_CAPACITY_REQUEUE_DELAY_MS = 10_000

// Scheduled intervals
const STATS_SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000   // 15 minutes
const DAILY_QUOTA_CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const TASK_RECONCILE_INTERVAL_MS = 5 * 60 * 1000

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

  const taskReconcileTimer = setInterval(async () => {
    try {
      const result = await reconcileTimedOutBillableImageTasks()
      if (result.reconciled > 0) {
        console.warn('[scheduler] reconciled timed out image tasks', result)
      }
    } catch (error) {
      console.error('[scheduler] task reconcile failed', error)
    }
  }, TASK_RECONCILE_INTERVAL_MS)
  scheduledTimers.push(taskReconcileTimer)

  // Run initial snapshot
  snapshotProviderStats().catch(err => {
    console.error('[scheduler] initial stats snapshot failed', err)
  })
  reconcileTimedOutBillableImageTasks().then((result) => {
    if (result.reconciled > 0) {
      console.warn('[scheduler] initial timed out image task reconcile completed', result)
    }
  }).catch(err => {
    console.error('[scheduler] initial task reconcile failed', err)
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
  logger.info('worker.starting', { queueName: QUEUE_NAME })

  const redisUrl = requireRedisUrl()

  const worker = new Worker<ImageGenerationQueueJobData>(
    QUEUE_NAME,
    async (job) => {
      const { requestId } = job.data
      logger.info('worker.job.processing', { jobId: job.id, requestId })

      try {
        const result = await executeQueuedImageGeneration(requestId)
        const status = 'status' in result ? (result as any).status : 'completed'
        logger.info('worker.job.completed', {
          jobId: job.id,
          requestId,
          status,
        })
        return result
      } catch (error) {
        if (error instanceof ProviderCapacityRequeueError) {
          const nextJob = await enqueueImageGeneration({
            requestId,
            enqueueVersion: job.data.enqueueVersion + 1,
            options: {
              delay: PROVIDER_CAPACITY_REQUEUE_DELAY_MS,
            },
          })

          await prisma.imageGenerationRequest.update({
            where: { id: requestId },
            data: {
              workerJobId: nextJob.id?.toString() ?? null,
            },
          }).catch(() => undefined)

          logger.info('worker.job.requeued_capacity', {
            jobId: job.id,
            requestId,
            nextJobId: nextJob.id,
            enqueueVersion: job.data.enqueueVersion + 1,
            delayMs: PROVIDER_CAPACITY_REQUEUE_DELAY_MS,
          })

          return {
            requestId,
            status: 'requeued',
            delayMs: PROVIDER_CAPACITY_REQUEUE_DELAY_MS,
          }
        }

        logger.error('worker.job.failed', {
          jobId: job.id,
          requestId,
          error,
        })

        try {
          const request = await prisma.imageGenerationRequest.findUnique({
            where: { id: requestId },
            select: {
              id: true,
              cost: true,
              costStatus: true,
              callbackUrl: true,
              apiKey: {
                select: {
                  ownerUserId: true,
                },
              },
            },
          })

          if (
            request?.apiKey.ownerUserId &&
            request.cost !== null &&
            request.costStatus === 'CHARGED'
          ) {
            await refundBalance(
              request.apiKey.ownerUserId,
              Number(request.cost),
              request.id,
              'generation_failed',
            )
            logger.info('worker.job.refunded_failed_request', {
              requestId,
              amount: Number(request.cost),
            })
          }

          if (request?.callbackUrl) {
            const latestTask = await prisma.imageGenerationRequest.findUnique({
              where: { id: requestId },
              include: {
                assets: {
                  orderBy: { createdAt: 'asc' },
                },
              },
            })

            if (latestTask) {
              await dispatchImageTaskCallback({
                callbackUrl: request.callbackUrl,
                task: latestTask,
              }).catch(() => undefined)
            }
          }
        } catch (refundError) {
          logger.error('worker.job.refund_failed', {
            requestId,
            error: refundError,
          })
        }

        throw error
      }
    },
    {
      connection: { url: redisUrl } as any,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '10', 10),
    },
  )

  worker.on('completed', (job) => {
    logger.info('worker.event.completed', { jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    logger.error('worker.event.failed', {
      jobId: job?.id,
      error: err,
    })
  })

  worker.on('error', (err) => {
    logger.error('worker.error', { error: err })
  })

  // Start scheduled jobs (stats snapshot, quota resets)
  startScheduledJobs()

  logger.info('worker.ready', { queueName: QUEUE_NAME })

  const shutdown = async () => {
    logger.info('worker.shutdown')
    stopScheduledJobs()
    await worker.close()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((error) => {
  logger.error('worker.fatal', { error })
  process.exit(1)
})
