import { AttemptStatus, Prisma, UpstreamApiKind } from '@prisma/client'
import { prisma } from './db/prisma'

type JsonValue = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined

type OperationKind = 'IMAGE_GENERATION'
type ProviderType = 'IMAGE'

type OperationStatus = AttemptStatus

const OPERATION_RETENTION_DAYS = 30

export function getAiOperationExpiryDate() {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + OPERATION_RETENTION_DAYS)
  return expiresAt
}

type StartOperationParams = {
  apiKeyId: string
  kind: OperationKind
  entryPoint?: string | null
  inputSummary?: unknown
  requestSnapshot?: unknown
  expiresAt?: Date | null
}

type CompleteOperationParams = {
  operationId: string
  status: OperationStatus
  finalPrompt?: string | null
  outputSummary?: unknown
  responseSnapshot?: unknown
  errorMessage?: string | null
  completedAt?: Date
}

type StartOperationAttemptParams = {
  operationId: string
  providerType: ProviderType
  providerId?: string | null
  providerName?: string | null
  baseUrl?: string | null
  model?: string | null
  attemptIndex: number
  upstreamApiKind?: UpstreamApiKind
  requestSnapshot?: unknown
}

type CompleteOperationAttemptParams = {
  attemptId: string
  status: OperationStatus
  responseSnapshot?: unknown
  errorMessage?: string | null
  completedAt?: Date
}

function toNullableJsonValue(value: unknown): JsonValue {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return Prisma.JsonNull
  }

  return value as Prisma.InputJsonValue
}

export async function startAiOperation(params: StartOperationParams) {
  return prisma.aiOperation.create({
    data: {
      apiKeyId: params.apiKeyId,
      kind: params.kind,
      entryPoint: params.entryPoint ?? null,
      status: 'STARTED',
      inputSummaryJson: toNullableJsonValue(params.inputSummary),
      requestSnapshotJson: toNullableJsonValue(params.requestSnapshot),
      expiresAt: params.expiresAt ?? null,
    },
  })
}

export async function completeAiOperation(params: CompleteOperationParams) {
  const completedAt = params.completedAt ?? new Date()
  const operation = await prisma.aiOperation.findUniqueOrThrow({
    where: { id: params.operationId },
    select: { startedAt: true },
  })

  return prisma.aiOperation.update({
    where: { id: params.operationId },
    data: {
      status: params.status,
      finalPrompt: params.finalPrompt ?? undefined,
      outputSummaryJson: toNullableJsonValue(params.outputSummary),
      responseSnapshotJson: toNullableJsonValue(params.responseSnapshot),
      errorMessage: params.errorMessage ?? undefined,
      completedAt,
      durationMs: Math.max(0, completedAt.getTime() - operation.startedAt.getTime()),
    },
  })
}

export async function startAiOperationAttempt(params: StartOperationAttemptParams) {
  return prisma.aiOperationAttempt.create({
    data: {
      operationId: params.operationId,
      providerType: params.providerType,
      providerId: params.providerId ?? null,
      providerName: params.providerName ?? null,
      baseUrl: params.baseUrl ?? null,
      model: params.model ?? null,
      attemptIndex: params.attemptIndex,
      status: 'STARTED',
      upstreamApiKind: params.upstreamApiKind ?? 'UNKNOWN',
      requestSnapshotJson: toNullableJsonValue(params.requestSnapshot),
    },
  })
}

export async function completeAiOperationAttempt(params: CompleteOperationAttemptParams) {
  const completedAt = params.completedAt ?? new Date()
  const attempt = await prisma.aiOperationAttempt.findUniqueOrThrow({
    where: { id: params.attemptId },
    select: { startedAt: true },
  })

  return prisma.aiOperationAttempt.update({
    where: { id: params.attemptId },
    data: {
      status: params.status,
      responseSnapshotJson: toNullableJsonValue(params.responseSnapshot),
      errorMessage: params.errorMessage ?? undefined,
      completedAt,
      durationMs: Math.max(0, completedAt.getTime() - attempt.startedAt.getTime()),
    },
  })
}
