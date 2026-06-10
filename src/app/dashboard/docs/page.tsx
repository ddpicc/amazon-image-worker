import type { Metadata } from 'next'
import { ApiDocsContent } from '@/components/docs/api-docs-content'

export const metadata: Metadata = {
  title: 'Image Generation API Docs',
  description: 'Unified image generation API documentation',
}

export default function DashboardDocsPage() {
  return <ApiDocsContent />
}
