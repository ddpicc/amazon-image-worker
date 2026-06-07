export type RenderSize =
  | '1024x1024'
  | '2048x2048'
  | '1536x1024'
  | '2048x1365'
  | '1024x1536'
  | '1365x2048'
  | '1536x960'
  | '1024x640'
export type AspectRatio = '1:1' | '3:2' | '2:3' | '8:5'

export const HIDDEN_APLUS_RENDER_SIZE = '1536x960' as const
const HIDDEN_APLUS_PROMPT_REQUIREMENT = '补充执行要求：输出为 1536x960 的横版画面，保持 8:5 构图。'

export interface SizeOption {
  value: RenderSize
  label: string
  note: string
  aspectRatio: AspectRatio
}

export const SIZE_OPTIONS: SizeOption[] = [
  {
    value: '1024x1024',
    label: '1024 × 1024',
    note: 'Square output, good for listing and generic tests',
    aspectRatio: '1:1',
  },
  {
    value: '2048x2048',
    label: '2048 × 2048',
    note: 'High-resolution square output for sharper export tests',
    aspectRatio: '1:1',
  },
  {
    value: '1536x1024',
    label: '1536 × 1024',
    note: 'Landscape output, suitable for wider scenes and A+ style layouts',
    aspectRatio: '3:2',
  },
  {
    value: '2048x1365',
    label: '2048 × 1365',
    note: 'Higher-resolution landscape output for wider scene testing',
    aspectRatio: '3:2',
  },
  {
    value: '1024x1536',
    label: '1024 × 1536',
    note: 'Portrait output, useful for tall compositions',
    aspectRatio: '2:3',
  },
  {
    value: '1365x2048',
    label: '1365 × 2048',
    note: 'Higher-resolution portrait output for tall compositions',
    aspectRatio: '2:3',
  },
  {
    value: '1024x640',
    label: '1024 × 640',
    note: 'Landscape output for Amazon A+ modular layouts',
    aspectRatio: '8:5',
  },
]

export const ASPECT_RATIO_OPTIONS: Array<{
  value: AspectRatio
  label: string
  description: string
}> = [
  {
    value: '1:1',
    label: '1:1',
    description: 'Balanced square composition',
  },
  {
    value: '3:2',
    label: '3:2',
    description: 'Wider landscape composition',
  },
  {
    value: '2:3',
    label: '2:3',
    description: 'Taller portrait composition',
  },
]

export function getSizesForAspectRatio(aspectRatio: AspectRatio): SizeOption[] {
  return SIZE_OPTIONS.filter((option) => option.aspectRatio === aspectRatio)
}

export function getDefaultSizeForAspectRatio(aspectRatio: AspectRatio): RenderSize {
  return getSizesForAspectRatio(aspectRatio)[0]?.value || '1024x1024'
}

export function getAspectRatioForSize(size: RenderSize): AspectRatio {
  if (size === HIDDEN_APLUS_RENDER_SIZE) return '8:5'
  return SIZE_OPTIONS.find((option) => option.value === size)?.aspectRatio || '1:1'
}

export function appendHiddenAPlusSizeRequirement(prompt: string): string {
  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) return HIDDEN_APLUS_PROMPT_REQUIREMENT
  if (trimmedPrompt.includes(HIDDEN_APLUS_PROMPT_REQUIREMENT)) return trimmedPrompt
  return `${trimmedPrompt}\n\n${HIDDEN_APLUS_PROMPT_REQUIREMENT}`
}

export function stripHiddenAPlusSizeRequirement(prompt: string): string {
  return prompt.replace(`\n\n${HIDDEN_APLUS_PROMPT_REQUIREMENT}`, '').replace(HIDDEN_APLUS_PROMPT_REQUIREMENT, '').trim()
}
