import { AspectRatio, RenderSize } from './image-options'
import { StoredReferenceImage } from './amazon-workflow'

export type ImageGenerationRequestStatus = 'STARTED' | 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

export interface RouteSummaryLine {
  lineIndex: number
  lineName: string
  status: 'succeeded' | 'failed'
  errorMessage?: string
}

export interface RouteSummary {
  selectedLineName: string
  selectedLineIndex: number
  switched: boolean
  attemptedLines: RouteSummaryLine[]
  userMessage: string
}

export interface PersistedImageGenerationPayload {
  prompt: string
  originalPrompt: string
  imageType?: string | null
  aspectRatio?: AspectRatio | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
  metadata?: Record<string, unknown> | null
}

export interface ImageGenerationSubmitResult {
  requestId: string
  operationId: string
  status: ImageGenerationRequestStatus
  statusMessage: string
}

export interface ImageGenerationStatusResult {
  requestId: string
  operationId: string | null
  status: ImageGenerationRequestStatus
  statusMessage: string | null
  errorMessage: string | null
  prompt: string
  revisedPrompt: string | null
  imageUrl: string | null
  imageType: string | null
  size: string | null
  aspectRatio: string | null
  routeSummary: RouteSummary | null
}

export function isImageGenerationActive(status: ImageGenerationRequestStatus) {
  return status === 'STARTED' || status === 'QUEUED' || status === 'PROCESSING'
}
