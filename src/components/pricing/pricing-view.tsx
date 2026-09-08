'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  Menu,
  Sparkles,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import {
  COMMON_SIZE_EXAMPLES,
  resolvePricingTierForSize,
  type PublicPriceRow,
} from '@/lib/billing/price-service'
import { fenToYuan } from '@/lib/money'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'

const copy = {
  navHome: '首页',
  navFeatures: '产品特性',
  navPricing: '价格',
  navDocs: 'API 文档',
  signIn: '登录',
  getStarted: '免费注册',
  openConsole: '进入控制台',
  badge: '按量计费 · 无最低消费 · 失败自动退款',
  title: '简单透明的价格',
  subtitle:
    '仅为实际生成的图片付费。价格按图片尺寸档位（1K / 2K）计费，与使用的模型无关，同步与异步接口价格一致。',
  modelsEyebrow: '模型与价格',
  modelsTitle: '支持的模型',
  modelsSubtitle: '所有模型共用同一套尺寸价格，生成与编辑接口计费相同。',
  perImage: '/ 张',
  priceNote: '提交任务时扣费，生成失败自动退回余额。',
  aliasesLabel: '兼容别名',
  qualityLabel: 'quality 参数',
  sizesEyebrow: '尺寸明细',
  sizesTitle: '支持的尺寸与价格',
  sizesSubtitle:
    'size 省略时默认为 1024x1024，也支持符合 GPT-Image-2 约束的任意像素尺寸。以下为常用尺寸示例，实际不受该列表限制。',
  colSize: '像素尺寸',
  colTier: '计费档位',
  colPrice: '价格',
  tier1k: '1K 档',
  tier2k: '2K 档',
  disabledTag: '暂停服务',
  notesEyebrow: '计费说明',
  notesTitle: '计费规则',
  note1: '提交任务时按尺寸档位扣费，任务失败费用自动退回账户余额，无最低消费。',
  note2: '价格只与图片尺寸档位有关，与模型和 quality 参数无关。',
  note3: 'quality 参数（low / medium / high，默认 medium）仅 gpt-image-2 支持，不影响价格。',
  note4: '当前每次请求生成 1 张图片（n=1），支持 Idempotency-Key 防止重复扣费。',
  note5: '余额以人民币（CNY）计，支持微信支付充值，控制台可查询订单与消费明细。',
  ctaTitle: '按量付费，用多少花多少',
  ctaSubtitle: '注册即取 API Key，一分钟内生成你的第一张图片。',
  ctaButton: '免费注册',
  ctaDocsButton: '查看 API 文档',
  footerNote: 'OpenAI 兼容的图片生成 API，内置多供应商智能路由。',
}

const models: Array<{
  name: string
  tag: string
  desc: string
  quality: string
  aliases: string[]
}> = [
  {
    name: 'gpt-image-2',
    tag: '默认模型',
    desc: '综合能力最强的默认生图模型，适合电商主图、场景图等正式出图场景，生成与编辑接口均可用。',
    quality: '支持 low / medium / high，默认 medium',
    aliases: ['gpt-image2-1k', 'gpt-image-2-1k'],
  },
  {
    name: 'agnes-image-2.1-flash',
    tag: '快速模型',
    desc: 'Flash 快速出图模型，适合批量预览、草稿迭代等对速度敏感的场景，生成与编辑接口均可用。',
    quality: '不支持 quality 参数（仅 gpt-image-2 支持）',
    aliases: [],
  },
]

function formatPrice(priceFen: number | undefined) {
  if (priceFen === undefined) return '—'
  return `¥${fenToYuan(priceFen).toFixed(2)}`
}

export default function PricingView({ prices }: { prices: PublicPriceRow[] }) {
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    fetchCurrentUser()
      .then((u) => {
        if (mounted) setUser(u)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const priceBySku = useMemo(() => {
    const map = new Map<string, PublicPriceRow>()
    for (const row of prices) map.set(row.sku, row)
    return map
  }, [prices])

  const tier1k = priceBySku.get('image_1k')
  const tier2k = priceBySku.get('image_2k')

  const sizeRows = useMemo(
    () =>
      [...COMMON_SIZE_EXAMPLES]
        .map((size) => ({
          size,
          tier: resolvePricingTierForSize(size),
        }))
        .sort((a, b) => {
          if (a.tier !== b.tier) return a.tier === 'image_1k' ? -1 : 1
          const [aw, ah] = a.size.split('x').map(Number)
          const [bw, bh] = b.size.split('x').map(Number)
          return bw * bh - aw * ah
        }),
    [],
  )

  const notes = [copy.note1, copy.note2, copy.note3, copy.note4, copy.note5]

  const authArea = user ? (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
    >
      {copy.openConsole}
      <ArrowRight className="h-4 w-4" />
    </Link>
  ) : (
    <div className="flex items-center gap-2">
      <Link
        href="/dashboard/login"
        className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
      >
        {copy.signIn}
      </Link>
      <Link
        href="/dashboard/register"
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        {copy.getStarted}
      </Link>
    </div>
  )

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight">Image Worker</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-gray-600 md:flex">
            <Link href="/" className="transition-colors hover:text-gray-900">{copy.navHome}</Link>
            <Link href="/#features" className="transition-colors hover:text-gray-900">{copy.navFeatures}</Link>
            <Link href="/pricing" className="text-blue-600">{copy.navPricing}</Link>
            <Link href="/dashboard/docs" className="transition-colors hover:text-gray-900">{copy.navDocs}</Link>
          </nav>

          <div className="hidden items-center gap-3 md:flex">{authArea}</div>

          <button
            type="button"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label="切换菜单"
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileNavOpen && (
          <div className="border-t border-gray-200 bg-white px-4 py-4 md:hidden">
            <div className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              <Link href="/" onClick={() => setMobileNavOpen(false)} className="rounded-lg px-3 py-2 hover:bg-gray-50">{copy.navHome}</Link>
              <Link href="/#features" onClick={() => setMobileNavOpen(false)} className="rounded-lg px-3 py-2 hover:bg-gray-50">{copy.navFeatures}</Link>
              <Link href="/pricing" onClick={() => setMobileNavOpen(false)} className="rounded-lg px-3 py-2 text-blue-600 hover:bg-gray-50">{copy.navPricing}</Link>
              <Link href="/dashboard/docs" onClick={() => setMobileNavOpen(false)} className="rounded-lg px-3 py-2 hover:bg-gray-50">{copy.navDocs}</Link>
              <div className="mt-2 flex gap-2 border-t border-gray-100 pt-3">
                {authArea}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#eef2f7_1px,transparent_1px),linear-gradient(to_bottom,#eef2f7_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_55%,transparent_100%)]"
        />
        <div aria-hidden className="pointer-events-none absolute -top-32 right-[10%] h-80 w-80 rounded-full bg-blue-100 opacity-70 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-16 text-center sm:px-6 lg:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            {copy.badge}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">{copy.title}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg">
            {copy.subtitle}
          </p>

          <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
            {[
              { label: '1K 档（总像素 ≤ 3,686,400）', row: tier1k },
              { label: '2K 档（总像素 > 3,686,400）', row: tier2k },
            ].map(({ label, row }) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-white px-6 py-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
                <p className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">
                  {formatPrice(row?.priceFen)}
                  <span className="ml-1 text-sm font-medium text-gray-500">{copy.perImage}</span>
                </p>
                {row && !row.enabled && (
                  <p className="mt-1 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                    {copy.disabledTag}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Models */}
      <section id="models" className="scroll-mt-16 border-t border-gray-100 bg-gray-50/70 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">{copy.modelsEyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{copy.modelsTitle}</h2>
            <p className="mt-4 text-base leading-relaxed text-gray-600">{copy.modelsSubtitle}</p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {models.map((model) => (
              <div
                key={model.name}
                className="flex flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-mono text-lg font-bold text-gray-900">{model.name}</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                    <Zap className="h-3 w-3" />
                    {model.tag}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{model.desc}</p>

                <dl className="mt-5 space-y-2 text-sm text-gray-600">
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-medium text-gray-500">{copy.qualityLabel}</dt>
                    <dd>{model.quality}</dd>
                  </div>
                  {model.aliases.length > 0 && (
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium text-gray-500">{copy.aliasesLabel}</dt>
                      <dd className="font-mono text-[13px]">{model.aliases.join('、')}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-gray-100 pt-6">
                  {[
                    { tier: copy.tier1k, row: tier1k },
                    { tier: copy.tier2k, row: tier2k },
                  ].map(({ tier, row }) => (
                    <div key={tier} className="rounded-lg bg-gray-50 px-4 py-3">
                      <p className="text-xs font-medium text-gray-500">{tier}</p>
                      <p className="mt-1 text-xl font-bold text-gray-900">
                        {formatPrice(row?.priceFen)}
                        <span className="ml-1 text-xs font-normal text-gray-500">{copy.perImage}</span>
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-gray-400">
                  <Wallet className="h-3.5 w-3.5" />
                  {copy.priceNote}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sizes */}
      <section id="sizes" className="scroll-mt-16 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">{copy.sizesEyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{copy.sizesTitle}</h2>
            <p className="mt-4 text-base leading-relaxed text-gray-600">{copy.sizesSubtitle}</p>
          </div>

          <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">{copy.colSize}</th>
                    <th className="px-5 py-3 text-left font-medium">{copy.colTier}</th>
                    <th className="px-5 py-3 text-right font-medium">{copy.colPrice}</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeRows.map((row) => {
                    const price = priceBySku.get(row.tier)
                    return (
                      <tr key={row.size} className="border-t border-gray-100">
                        <td className="px-5 py-3 font-mono text-gray-900">{row.size}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                            {row.tier === 'image_1k' ? copy.tier1k : copy.tier2k}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">
                          {price && !price.enabled ? (
                            <span className="text-xs font-normal text-red-500">{copy.disabledTag}</span>
                          ) : (
                            <>
                              {formatPrice(price?.priceFen)}
                              <span className="ml-0.5 text-xs font-normal text-gray-400">{copy.perImage}</span>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="border-t border-gray-100 bg-gray-50/70 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">{copy.notesEyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{copy.notesTitle}</h2>
          </div>
          <ul className="mx-auto mt-10 max-w-2xl space-y-4">
            {notes.map((note) => (
              <li key={note} className="flex items-start gap-3 text-sm leading-relaxed text-gray-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl bg-blue-600 px-6 py-14 text-center shadow-xl shadow-blue-600/20 sm:px-16">
            <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
            <h2 className="relative text-2xl font-bold tracking-tight text-white sm:text-3xl">{copy.ctaTitle}</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-sm leading-relaxed text-blue-100 sm:text-base">
              {copy.ctaSubtitle}
            </p>
            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={user ? '/dashboard' : '/dashboard/register'}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50"
              >
                {user ? copy.openConsole : copy.ctaButton}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard/docs"
                className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                {copy.ctaDocsButton}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="text-sm font-semibold text-gray-900">Image Worker</span>
            <span className="hidden text-sm text-gray-400 sm:inline">· {copy.footerNote}</span>
          </div>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} Image Worker</p>
        </div>
      </footer>
    </div>
  )
}
