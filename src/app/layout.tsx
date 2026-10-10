import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pixion 派图 · 控制台',
  description: 'Pixion 派图 — OpenAI 兼容的 AI 生图 API 管理工作台',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
