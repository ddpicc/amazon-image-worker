import 'dotenv/config'
import { prisma } from '../src/lib/db/prisma'

type Mode = 'report' | 'disable' | 'purge'

interface EvolinkProviderRecord {
  id: string
  name: string
  vendor: string
  baseUrl: string
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

function parseMode(argv: string[]): Mode {
  const mode = argv[2] as Mode | undefined
  if (mode === 'report' || mode === 'disable' || mode === 'purge') {
    return mode
  }
  throw new Error('Usage: tsx scripts/evolink-provider-cleanup.ts <report|disable|purge>')
}

function buildDisableReason() {
  return `Disabled by Evolink cleanup on ${new Date().toISOString()}: worker no longer contains an Evolink-specific execution route.`
}

async function findMatchedProviders(): Promise<EvolinkProviderRecord[]> {
  return prisma.imageProvider.findMany({
    where: {
      OR: [
        {
          vendor: {
            contains: 'evolink',
            mode: 'insensitive',
          },
        },
        {
          baseUrl: {
            contains: 'evolink',
            mode: 'insensitive',
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      vendor: true,
      baseUrl: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

function printProviders(title: string, providers: EvolinkProviderRecord[]) {
  console.info(`\n${title}: ${providers.length}`)
  for (const provider of providers) {
    console.info(`- ${provider.id} | ${provider.name} | enabled=${provider.enabled} | vendor=${provider.vendor} | ${provider.baseUrl}`)
  }
}

async function runReport() {
  const matched = await findMatchedProviders()
  printProviders('Matched Evolink providers', matched)

  if (matched.length === 0) {
    console.info('\nNo Evolink providers found.')
    return
  }

  console.info('\nRecommended sequence:')
  console.info('1. npm run providers:evolink:disable')
  console.info('2. Replace them with supported OpenAI-compatible providers')
  console.info('3. npm run providers:evolink:purge')
}

async function runDisable() {
  const matched = await findMatchedProviders()
  const enabled = matched.filter((provider) => provider.enabled)

  printProviders('Enabled Evolink providers to disable', enabled)

  if (enabled.length === 0) {
    console.info('\nNo enabled Evolink providers found.')
    return
  }

  const now = new Date()
  const reason = buildDisableReason()

  await prisma.$transaction(
    enabled.map((provider) =>
      prisma.imageProvider.update({
        where: { id: provider.id },
        data: {
          enabled: false,
          cooldownUntil: null,
          circuitBreakerTrippedAt: now,
          circuitBreakerTripReason: reason,
        },
      }),
    ),
  )

  console.info(`\nDisabled ${enabled.length} Evolink provider(s).`)
}

async function runPurge() {
  const matched = await findMatchedProviders()
  const disabled = matched.filter((provider) => !provider.enabled)

  printProviders('Disabled Evolink providers to purge', disabled)

  if (disabled.length === 0) {
    console.info('\nNo disabled Evolink providers found to purge.')
    return
  }

  await prisma.$transaction(
    disabled.map((provider) =>
      prisma.imageProvider.delete({
        where: { id: provider.id },
      }),
    ),
  )

  console.info(`\nPurged ${disabled.length} disabled Evolink provider record(s).`)
}

async function main() {
  const mode = parseMode(process.argv)

  try {
    if (mode === 'report') {
      await runReport()
    } else if (mode === 'disable') {
      await runDisable()
    } else {
      await runPurge()
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
