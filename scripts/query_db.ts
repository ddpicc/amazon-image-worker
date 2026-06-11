import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Task status distribution
  const statusDistribution = await prisma.imageGenerationRequest.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("=== Task Status Distribution ===");
  console.table(statusDistribution);

  // 2. Recent QUEUED tasks
  const queuedTasks = await prisma.imageGenerationRequest.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      workerJobId: true,
      capacityRequeueCount: true,
      attemptCount: true,
      errorMessage: true,
      statusMessage: true,
      queuedAt: true,
      startedAt: true,
      createdAt: true,
    },
  });
  console.log("\n=== Recent QUEUED Tasks ===");
  console.table(queuedTasks);

  // 3. Provider status
  const providers = await prisma.imageProvider.findMany({
    orderBy: { priority: "asc" },
    select: {
      id: true,
      name: true,
      enabled: true,
      priority: true,
      maxConcurrent: true,
      circuitBreakerTrippedAt: true,
      cooldownUntil: true,
      consecutiveFailures: true,
      failureCount: true,
      totalAttempts: true,
      successfulAttempts: true,
    },
  });
  console.log("\n=== Provider Status ===");
  console.table(providers);

  // 4. Count PROCESSING tasks (active jobs)
  const processingCount = await prisma.imageGenerationRequest.count({
    where: { status: "PROCESSING" },
  });
  console.log(`\n=== PROCESSING count: ${processingCount} ===`);

  // 5. Check total tasks
  const total = await prisma.imageGenerationRequest.count();
  console.log(`Total tasks: ${total}`);

  // 6. Check recent FAILED tasks for error messages
  const recentFailed = await prisma.imageGenerationRequest.findMany({
    where: { status: "FAILED" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      errorMessage: true,
      statusMessage: true,
      createdAt: true,
    },
  });
  console.log("\n=== Recent FAILED Tasks ===");
  console.table(recentFailed);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
