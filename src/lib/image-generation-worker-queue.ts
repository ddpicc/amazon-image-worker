import { JobsOptions, Queue } from 'bullmq'

const IMAGE_GENERATION_QUEUE_NAME = 'image-generation'

export interface ImageGenerationQueueJobData {
  requestId: string
  enqueueVersion: number
}

let queueInstance: Queue<ImageGenerationQueueJobData> | null = null

function requireRedisUrl() {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is not set')
  }
  return redisUrl
}

function getRedisConnectionOpts() {
  return {
    url: requireRedisUrl(),
    maxRetriesPerRequest: null as null,
    enableReadyCheck: true,
  }
}

export function getImageGenerationQueue() {
  if (!queueInstance) {
    queueInstance = new Queue<ImageGenerationQueueJobData>(IMAGE_GENERATION_QUEUE_NAME, {
      connection: getRedisConnectionOpts(),
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    })
  }

  return queueInstance
}

export function getImageGenerationQueueName() {
  return IMAGE_GENERATION_QUEUE_NAME
}

export function buildImageGenerationJobId(requestId: string, enqueueVersion: number) {
  return `${requestId}:${enqueueVersion}`
}

export async function enqueueImageGeneration(params: {
  requestId: string
  enqueueVersion?: number
  options?: Omit<JobsOptions, 'jobId'>
}) {
  const queue = getImageGenerationQueue()
  return queue.add(
    IMAGE_GENERATION_QUEUE_NAME,
    {
      requestId: params.requestId,
      enqueueVersion: params.enqueueVersion ?? 1,
    },
    {
      jobId: buildImageGenerationJobId(params.requestId, params.enqueueVersion ?? 1),
      attempts: 1,
      ...params.options,
    },
  )
}
