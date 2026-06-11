import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || '');

async function main() {
  // Check if the 9 queued tasks' job IDs exist in Redis
  const queuedIds = [
    'cmq95rh8d001pmfz093eus3mw',
    'cmq95hhkw001imfz096wl4s16',
    'cmq95chnr001bmfz0vua81jg6',
    'cmq954y0u0012mfz0y3c70je2',
    'cmq954eld000vmfz0h2chr52g',
    'cmq953jwr000omfz0dw6gucc9',
    'cmq9533th000hmfz0jd71kxsd',
    'cmq952o6o000amfz0ukrmx94r',
    'cmq952igl0003mfz0d57an8dq',
  ];

  console.log('=== Checking if queued task jobs exist in Redis ===');
  for (const id of queuedIds) {
    // Check old format (just requestId)
    const oldKey = `bull:image-generation:${id}`;
    const oldExists = await redis.exists(oldKey);

    // Check new format (requestId:1, requestId:2, etc.)
    for (let v = 1; v <= 5; v++) {
      const newKey = `bull:image-generation:${id}:${v}`;
      const exists = await redis.exists(newKey);
      if (exists) {
        console.log(`  FOUND: ${newKey}`);
      }
    }

    if (oldExists) {
      console.log(`  FOUND (old format): ${oldKey}`);
    }

    if (!oldExists) {
      // Check if it's in any set (waiting, active, etc.)
    }
  }

  // Check waiting queue contents
  const waitingJobs = await redis.lrange('bull:image-generation:wait', 0, -1);
  console.log(`\n=== Waiting queue contents (${waitingJobs.length} total) ===`);
  for (const job of waitingJobs) {
    try {
      const parsed = JSON.parse(job);
      console.log(`  id: ${parsed.id}, name: ${parsed.name}, data: ${JSON.stringify(parsed.data)}`);
    } catch {
      console.log(`  raw: ${job.substring(0, 200)}`);
    }
  }

  // Check delayed queue
  const delayedJobs = await redis.zrange('bull:image-generation:delayed', 0, -1);
  console.log(`\n=== Delayed queue contents (${delayedJobs.length} total) ===`);
  for (const job of delayedJobs) {
    try {
      const parsed = JSON.parse(job);
      console.log(`  id: ${parsed.id}, name: ${parsed.name}, data: ${JSON.stringify(parsed.data)}`);
    } catch {
      console.log(`  raw: ${job.substring(0, 200)}`);
    }
  }

  // Check job ID counter
  const jobIdCounter = await redis.get('bull:image-generation:id');
  console.log(`\n=== Job ID counter: ${jobIdCounter} ===`);

  // Check for any keys matching the new format
  const newFormatKeys = await redis.keys('bull:image-generation:*:*');
  console.log(`\n=== Keys with new format (containing ':') ===`);
  for (const key of newFormatKeys.slice(0, 20)) {
    console.log(`  ${key}`);
  }

  // Check the meta key
  const meta = await redis.hgetall('bull:image-generation:meta');
  console.log(`\n=== Queue meta ===`);
  console.log(JSON.stringify(meta, null, 2));
}

main()
  .catch(console.error)
  .finally(() => {
    redis.disconnect();
    process.exit(0);
  });
