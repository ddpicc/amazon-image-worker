import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || '');

async function main() {
  try {
    const pong = await redis.ping();
    console.log('Redis connection:', pong);
  } catch (e) {
    console.error('Redis connection FAILED:', e);
    return;
  }

  const keys = await redis.keys('bull:image-generation:*');
  console.log(`\n=== BullMQ keys (${keys.length} total) ===`);

  const keyGroups: Record<string, string[]> = {};
  for (const key of keys) {
    const type = key.split(':')[2] || 'other';
    if (!keyGroups[type]) keyGroups[type] = [];
    keyGroups[type].push(key);
  }

  for (const [type, k] of Object.entries(keyGroups)) {
    console.log(`\n  ${type}: ${k.length} keys`);
    if (k.length <= 10) {
      for (const key of k) {
        const t = await redis.type(key);
        console.log(`    ${key} (${t})`);
      }
    }
  }

  const waitingCount = await redis.llen('bull:image-generation:wait');
  const activeCount = await redis.llen('bull:image-generation:active');
  const delayedCount = await redis.zcard('bull:image-generation:delayed');
  const completedCount = await redis.zcard('bull:image-generation:completed');
  const failedCount = await redis.zcard('bull:image-generation:failed');

  console.log(`\n=== Queue Stats ===`);
  console.log(`  Waiting:   ${waitingCount}`);
  console.log(`  Active:    ${activeCount}`);
  console.log(`  Delayed:   ${delayedCount}`);
  console.log(`  Completed: ${completedCount}`);
  console.log(`  Failed:    ${failedCount}`);

  if (waitingCount > 0) {
    const waitingJobs = await redis.lrange('bull:image-generation:wait', 0, 9);
    console.log(`\n=== Waiting jobs ===`);
    for (const job of waitingJobs) {
      try {
        const parsed = JSON.parse(job);
        console.log(`  - id: ${parsed.id}, requestId: ${parsed.data?.requestId}`);
      } catch {
        console.log(`  - raw: ${job.substring(0, 200)}`);
      }
    }
  }

  // Check all bull keys (any queue)
  const allBullKeys = await redis.keys('bull:*');
  console.log(`\n=== All BullMQ keys (${allBullKeys.length}) ===`);
  const queues = new Set<string>();
  for (const k of allBullKeys) {
    const parts = k.split(':');
    if (parts.length >= 2) queues.add(parts[1]);
  }
  for (const q of queues) {
    const wait = await redis.llen(`bull:${q}:wait`);
    const active = await redis.llen(`bull:${q}:active`);
    const delayed = await redis.zcard(`bull:${q}:delayed`);
    console.log(`  Queue "${q}": wait=${wait}, active=${active}, delayed=${delayed}`);
  }

  // Check worker registrations
  const workerKeys = await redis.keys('bull:*:workers');
  console.log(`\n=== Worker registrations ===`);
  if (workerKeys.length === 0) {
    console.log('  NONE - no workers registered!');
  }
  for (const key of workerKeys) {
    console.log(`  ${key}`);
  }
}

main()
  .catch(console.error)
  .finally(() => {
    redis.disconnect();
    process.exit(0);
  });
