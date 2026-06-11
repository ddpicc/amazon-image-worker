import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const redis = new Redis(process.env.REDIS_URL || '');
const prisma = new PrismaClient();

async function main() {
  console.log('=== 1. All QUEUED tasks in DB ===');
  const queuedTasks = await prisma.imageGenerationRequest.findMany({
    where: { status: 'QUEUED' },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`Total QUEUED in DB: ${queuedTasks.length}`);

  // For each queued task, check if its expected BullMQ job exists
  console.log('\n=== 2. Checking BullMQ job existence for each QUEUED task ===');
  for (const task of queuedTasks) {
    const jobId = `${task.id}:1`;
    const exists = await redis.exists(`bull:image-generation:${jobId}`);
    const marker = exists ? '✓ EXISTS in Redis' : '✗ MISSING from Redis';
    console.log(`  ${task.id} (created ${task.createdAt.toISOString()}) - ${marker}`);
  }

  // Check the actual job keys in Redis that start with "bull:image-generation:" and are hash type
  console.log('\n=== 3. All BullMQ job hash keys in Redis ===');
  const allKeys = await redis.keys('bull:image-generation:*');
  const hashKeys = [];
  for (const key of allKeys) {
    const type = await redis.type(key);
    if (type === 'hash' && key !== 'bull:image-generation:meta') {
      hashKeys.push(key);
    }
  }
  console.log(`Total job hash keys: ${hashKeys.length}`);

  // Get job data from a few hashes to understand format
  if (hashKeys.length > 0) {
    const sampleKey = hashKeys[0];
    const data = await redis.hgetall(sampleKey);
    console.log(`\n  Sample key: ${sampleKey}`);
    console.log(`  Sample data: ${JSON.stringify(data, null, 2)}`);
  }

  // Check completed set
  console.log('\n=== 4. Completed jobs in Redis ===');
  const completedJobs = await redis.zrange('bull:image-generation:completed', 0, -1, 'WITHSCORES');
  console.log(`Total completed: ${completedJobs.length / 2}`);
  // Show last 5
  const entries = [];
  for (let i = 0; i < completedJobs.length; i += 2) {
    entries.push({ id: completedJobs[i], timestamp: new Date(parseInt(completedJobs[i + 1])).toISOString() });
  }
  for (const entry of entries.slice(-5)) {
    console.log(`  ${entry.id} - completed at ${entry.timestamp}`);
  }

  // Check failed set
  console.log('\n=== 5. Failed jobs in Redis ===');
  const failedJobs = await redis.zrange('bull:image-generation:failed', 0, -1, 'WITHSCORES');
  console.log(`Total failed: ${failedJobs.length / 2}`);
  for (let i = 0; i < Math.min(failedJobs.length, 10); i += 2) {
    const ts = new Date(parseInt(failedJobs[i + 1]));
    console.log(`  ${failedJobs[i]} - failed at ${ts.toISOString()}`);
  }

  // Test: try to add a test job to see if Redis write works
  console.log('\n=== 6. Testing Redis write ===');
  try {
    await redis.set('bull:test:connection', 'ok');
    const val = await redis.get('bull:test:connection');
    console.log(`  Redis write test: ${val}`);
    await redis.del('bull:test:connection');
  } catch (e) {
    console.error(`  Redis write FAILED: ${e}`);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    redis.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });
