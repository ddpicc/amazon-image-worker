import type { Metadata } from 'next'
import LandingPage from '@/components/landing/landing-page'

export const metadata: Metadata = {
  title: 'Image Worker — OpenAI 兼容的 AI 生图 API',
  description:
    'OpenAI 兼容的图片生成与编辑 API：多供应商智能路由、同步/异步双模式、Webhook 回调、按量计费。注册即可获取 API Key。',
}

export default function Home() {
  return <LandingPage />
}
