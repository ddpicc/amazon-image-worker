const GPT_IMAGE_2_MODEL_ALIASES = new Set([
  'gpt-image-2',
  'gpt-image2-1k',
  'gpt-image-2-1k',
])

export function normalizeImageModel(model: string): string {
  const normalized = model.trim().toLowerCase()
  if (GPT_IMAGE_2_MODEL_ALIASES.has(normalized)) {
    return 'gpt-image-2'
  }
  return normalized
}

export function getCompatibleImageProviderModels(model?: string | null): string[] | null {
  if (!model) return null

  const normalized = normalizeImageModel(model)
  if (normalized === 'gpt-image-2') {
    return [...GPT_IMAGE_2_MODEL_ALIASES]
  }

  return [normalized]
}

export function getPreferredImageProviderModel(model?: string | null): string | null {
  if (!model) return null
  return normalizeImageModel(model)
}

export function groupImageProviderModel(model: string): string {
  return normalizeImageModel(model)
}
