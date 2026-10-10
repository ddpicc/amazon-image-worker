import type { Metadata } from 'next'
import { listPublicPrices } from '@/lib/billing/price-service'
import PricingView from '@/components/pricing/pricing-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '价格 · Pixion 派图',
  description:
    'Pixion 派图支持的模型与价格：按模型和图片尺寸档位（1K / 2K）按量计费，失败自动退款，无最低消费。',
}

export default async function PricingPage() {
  const prices = await listPublicPrices()
  return <PricingView prices={prices} />
}
