'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  KeyRound,
  Layers,
  Menu,
  Route,
  ShieldCheck,
  Sparkles,
  Wallet,
  Webhook,
  X,
  Zap,
} from 'lucide-react'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'

const copy = {
  navFeatures: '产品特性',
  navHow: '接入流程',
  navPricing: '价格',
  navDocs: 'API 文档',
  signIn: '登录',
  getStarted: '免费注册',
  openConsole: '进入控制台',
  badge: 'OpenAI 兼容 · 同步 / 异步 · 按量计费',
  titleA: '一个 API，',
  titleB: '稳定调用多家生图模型',
  subtitle:
    'Image Worker 提供与 OpenAI 兼容的图片生成与编辑接口，内置多供应商智能路由、失败自动切换与熔断保护。注册即可获取 API Key，按量计费，无最低消费。',
  ctaPrimary: '免费注册',
  ctaSecondary: '查看 API 文档',
  trustKey: '注册即取 API Key',
  trustSdk: '兼容 OpenAI SDK',
  trustBilling: '按任务计费',
  codeTitle: '提交一个异步生图任务',
  statusDone: '任务完成',
  statusDuration: '耗时 30.2 秒',
  featuresEyebrow: '产品特性',
  featuresTitle: '为生产环境而生',
  featuresSubtitle: '路由、重试、计费与图片交付都已内置，你只需专注于业务本身。',
  feature1Title: 'OpenAI 兼容接口',
  feature1Desc: '现有 OpenAI SDK 只需替换 Base URL 和 API Key，即可无缝接入。',
  feature2Title: '同步 + 异步双模式',
  feature2Desc: '简单场景同步直返结果；批量任务异步提交，支持回调通知或轮询查询。',
  feature3Title: '供应商智能路由',
  feature3Desc: '按成功率、延迟与成本实时为多个供应商评分排序，每次请求都走最优线路。',
  feature4Title: '故障自动隔离',
  feature4Desc: '渐进冷却与熔断器自动隔离故障线路，任务自动切换到后备供应商。',
  feature5Title: 'Webhook 实时回调',
  feature5Desc: '任务完成即刻推送结果，附带完整用量与计费信息，无需轮询。',
  feature6Title: '透明按量计费',
  feature6Desc: '按任务计费，余额透明，支持微信支付充值与订单查询。',
  howEyebrow: '接入流程',
  howTitle: '三步完成接入',
  how1Title: '创建 API Key',
  how1Desc: '注册账号，在控制台生成属于你的 API Key。',
  how2Title: '调用生图接口',
  how2Desc: '用 curl 或任意 OpenAI SDK 提交生成 / 编辑任务。',
  how3Title: '获取生成结果',
  how3Desc: '同步接口直接返回图片，异步任务通过回调或轮询领取。',
  ctaTitle: '准备好生成第一张图了吗？',
  ctaSubtitle: '注册即取 API Key，一分钟内生成你的第一张图片。',
  ctaButton: '免费注册',
  ctaSecondaryButton: '登录控制台',
  footerNote: 'OpenAI 兼容的图片生成 API，内置多供应商智能路由。',
}

type Token = { text: string; className: string }

const featureIcons = [Zap, Layers, Route, ShieldCheck, Webhook, Wallet] as const

export default function LandingPage() {
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [origin, setOrigin] = useState('https://your-worker.example.com')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const t = copy

  useEffect(() => {
    setOrigin(window.location.origin)

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

  const requestLines = useMemo<Token[][]>(() => {
    const cmd: Token[][] = [
      [{ text: '$ ', className: 'text-slate-500' }, { text: 'curl -X POST ', className: 'text-slate-100' }],
      [
        { text: '  "',
          className: 'text-slate-100' },
        { text: `${origin}/v1/async/images/generations`, className: 'text-sky-300' },
        { text: '" \\', className: 'text-slate-100' },
      ],
      [
        { text: '  -H ', className: 'text-slate-100' },
        { text: '"Authorization: Bearer YOUR_API_KEY"', className: 'text-emerald-300' },
        { text: ' \\', className: 'text-slate-100' },
      ],
      [
        { text: '  -H ', className: 'text-slate-100' },
        { text: '"Content-Type: application/json"', className: 'text-emerald-300' },
        { text: ' \\', className: 'text-slate-100' },
      ],
      [{ text: "  -d '{", className: 'text-slate-100' }],
    ]
    const body: Token[][] = [
      [{ text: '    ', className: '' }, { text: '"model"', className: 'text-sky-300' }, { text: ': ', className: 'text-slate-400' }, { text: '"gpt-image-2"', className: 'text-emerald-300' }, { text: ',', className: 'text-slate-400' }],
      [{ text: '    ', className: '' }, { text: '"prompt"', className: 'text-sky-300' }, { text: ': ', className: 'text-slate-400' }, { text: '"A cozy coffee corner, warm morning light"', className: 'text-emerald-300' }, { text: ',', className: 'text-slate-400' }],
      [{ text: '    ', className: '' }, { text: '"size"', className: 'text-sky-300' }, { text: ': ', className: 'text-slate-400' }, { text: '"1536x1024"', className: 'text-emerald-300' }, { text: ',', className: 'text-slate-400' }],
      [{ text: '    ', className: '' }, { text: '"callback_url"', className: 'text-sky-300' }, { text: ': ', className: 'text-slate-400' }, { text: '"https://your-app.com/hooks/done"', className: 'text-emerald-300' }],
      [{ text: "  }'", className: 'text-slate-100' }],
    ]
    return [...cmd, ...body]
  }, [origin])

  const responseLines = useMemo<Token[][]>(
    () => [
      [{ text: '{', className: 'text-slate-400' }],
      [{ text: '  "id"', className: 'text-sky-300' }, { text: ': ', className: 'text-slate-400' }, { text: '"task_x8f2ka"', className: 'text-emerald-300' }, { text: ',', className: 'text-slate-400' }],
      [{ text: '  "object"', className: 'text-sky-300' }, { text: ': ', className: 'text-slate-400' }, { text: '"image.generation.task"', className: 'text-emerald-300' }, { text: ',', className: 'text-slate-400' }],
      [{ text: '  "status"', className: 'text-sky-300' }, { text: ': ', className: 'text-slate-400' }, { text: '"completed"', className: 'text-emerald-300' }, { text: ',', className: 'text-slate-400' }],
      [{ text: '  "data"', className: 'text-sky-300' }, { text: ': [{ ', className: 'text-slate-400' }, { text: '"url"', className: 'text-sky-300' }, { text: ': ', className: 'text-slate-400' }, { text: '"https://…/final.png"', className: 'text-emerald-300' }, { text: ' }]', className: 'text-slate-400' }],
      [{ text: '}', className: 'text-slate-400' }],
    ],
    [],
  )

  const features: { title: string; desc: string }[] = [
    { title: t.feature1Title, desc: t.feature1Desc },
    { title: t.feature2Title, desc: t.feature2Desc },
    { title: t.feature3Title, desc: t.feature3Desc },
    { title: t.feature4Title, desc: t.feature4Desc },
    { title: t.feature5Title, desc: t.feature5Desc },
    { title: t.feature6Title, desc: t.feature6Desc },
  ]

  const steps = [
    { icon: KeyRound, title: t.how1Title, desc: t.how1Desc },
    { icon: Zap, title: t.how2Title, desc: t.how2Desc },
    { icon: Check, title: t.how3Title, desc: t.how3Desc },
  ]

  const authArea = user ? (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
    >
      {t.openConsole}
      <ArrowRight className="h-4 w-4" />
    </Link>
  ) : (
    <div className="flex items-center gap-2">
      <Link
        href="/dashboard/login"
        className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
      >
        {t.signIn}
      </Link>
      <Link
        href="/dashboard/register"
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        {t.getStarted}
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
            <a href="#features" className="transition-colors hover:text-gray-900">{t.navFeatures}</a>
            <a href="#how" className="transition-colors hover:text-gray-900">{t.navHow}</a>
            <Link href="/pricing" className="transition-colors hover:text-gray-900">{t.navPricing}</Link>
            <Link href="/dashboard/docs" className="transition-colors hover:text-gray-900">{t.navDocs}</Link>
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
              <a href="#features" onClick={() => setMobileNavOpen(false)} className="rounded-lg px-3 py-2 hover:bg-gray-50">{t.navFeatures}</a>
              <a href="#how" onClick={() => setMobileNavOpen(false)} className="rounded-lg px-3 py-2 hover:bg-gray-50">{t.navHow}</a>
              <Link href="/pricing" onClick={() => setMobileNavOpen(false)} className="rounded-lg px-3 py-2 hover:bg-gray-50">{t.navPricing}</Link>
              <Link href="/dashboard/docs" onClick={() => setMobileNavOpen(false)} className="rounded-lg px-3 py-2 hover:bg-gray-50">{t.navDocs}</Link>
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
        <div aria-hidden className="pointer-events-none absolute top-40 left-[5%] h-64 w-64 rounded-full bg-indigo-100 opacity-60 blur-3xl" />

        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-10 lg:pt-24">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              {t.badge}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              {t.titleA}
              <br />
              <span className="text-blue-600">
                {t.titleB}
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg">
              {t.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={user ? '/dashboard' : '/dashboard/register'}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                {user ? t.openConsole : t.ctaPrimary}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard/docs"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                {t.ctaSecondary}
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500">
              {[t.trustKey, t.trustSdk, t.trustBilling].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-blue-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative min-w-0">
            <div className="overflow-hidden rounded-xl border border-gray-800 bg-slate-900 shadow-2xl shadow-blue-900/20">
              <div className="flex items-center gap-2 border-b border-slate-700/60 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-red-400/80" />
                <span className="h-3 w-3 rounded-full bg-yellow-400/80" />
                <span className="h-3 w-3 rounded-full bg-green-400/80" />
                <span className="ml-2 text-xs text-slate-400">{t.codeTitle}</span>
              </div>
              <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed sm:text-[13px]">
                <code className="font-mono">
                  {requestLines.map((line, i) => (
                    <div key={i} className="whitespace-pre">
                      {line.map((token, j) => (
                        <span key={j} className={token.className}>{token.text}</span>
                      ))}
                    </div>
                  ))}
                </code>
              </pre>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-800 bg-slate-900 shadow-xl shadow-blue-900/10 sm:ml-10">
              <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-2.5">
                <span className="text-xs text-slate-400">response · 200 OK</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {t.statusDone} · {t.statusDuration}
                </span>
              </div>
              <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed">
                <code className="font-mono">
                  {responseLines.map((line, i) => (
                    <div key={i} className="whitespace-pre">
                      {line.map((token, j) => (
                        <span key={j} className={token.className}>{token.text}</span>
                      ))}
                    </div>
                  ))}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-16 border-t border-gray-100 bg-gray-50/70 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">{t.featuresEyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{t.featuresTitle}</h2>
            <p className="mt-4 text-base leading-relaxed text-gray-600">{t.featuresSubtitle}</p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => {
              const Icon = featureIcons[i]
              return (
                <div
                  key={feature.title}
                  className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-gray-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{feature.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-16 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">{t.howEyebrow}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{t.howTitle}</h2>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.title} className="relative">
                {i < steps.length - 1 && (
                  <div aria-hidden className="absolute left-12 top-6 hidden h-px w-[calc(100%-3rem)] border-t-2 border-dashed border-gray-200 sm:block" />
                )}
                <div className="relative flex flex-col items-start">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-600/25">
                      <step.icon className="h-5 w-5" />
                    </span>
                    <span className="text-4xl font-extrabold text-gray-100 select-none">{i + 1}</span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-gray-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-20 sm:pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl bg-blue-600 px-6 py-14 text-center shadow-xl shadow-blue-600/20 sm:px-16">
            <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
            <h2 className="relative text-2xl font-bold tracking-tight text-white sm:text-3xl">{t.ctaTitle}</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-sm leading-relaxed text-blue-100 sm:text-base">
              {t.ctaSubtitle}
            </p>
            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={user ? '/dashboard' : '/dashboard/register'}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50"
              >
                {user ? t.openConsole : t.ctaButton}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {!user && (
                <Link
                  href="/dashboard/login"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  {t.ctaSecondaryButton}
                </Link>
              )}
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
            <span className="hidden text-sm text-gray-400 sm:inline">· {t.footerNote}</span>
          </div>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} Image Worker</p>
        </div>
      </footer>
    </div>
  )
}
