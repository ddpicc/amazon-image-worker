'use client'

import { createContext, useContext, useMemo } from 'react'

export type DashboardLanguage = 'zh'

const zh = {
  appName: 'Image Worker',
  loading: '加载中...',
  loadingDashboard: '正在加载控制台...',
  signOut: '退出登录',
  roleAdmin: '管理员',
  roleUser: '用户',
  navOverview: '总览',
  navActivity: '活动',
  navRecharge: '充值',
  navApiKeys: 'API 密钥',
  navApiDocs: 'API 文档',
  navAccount: '账号',
  navUsers: '用户',
  navProviders: '供应商',
  navTestImage: '测试生图',
  navTasks: '任务',
  navStatistics: '统计',
  navPricing: '定价',
  navBilling: '账单',
  navPayments: '支付',
  navDebug: '调试',
  navManagement: '管理',
  loginSubtitle: '登录到你的账号',
  email: '邮箱',
  password: '密码',
  signIn: '登录',
  signingIn: '登录中...',
  invalidCredentials: '账号或密码错误',
  connectionError: '连接失败，请稍后再试。',
  registerLinkLead: '还没有账号？',
  register: '注册',
  registerTitle: '创建账号',
  registerSubtitle: '获取你自己的 API 密钥和任务记录',
  name: '名称',
  createAccount: '创建账号',
  creatingAccount: '创建中...',
  registrationFailed: '注册失败',
  loginLinkLead: '已有账号？',
  yourName: '你的名称',
  enterPassword: '输入你的密码',
  atLeast8Chars: '至少 8 个字符',
  overviewTitle: '总览',
  overviewAdminSubtitle: '系统级运行概览',
  overviewUserSubtitle: '你的账号活动概览',
  tasks24h: '24 小时任务',
  tasks7d: '7 天任务',
  tasks30d: '30 天任务',
  successRate: '成功率',
  activeProviders: '活跃供应商',
  avgDuration: '平均耗时',
  myTasks24h: '我的 24 小时任务',
  mySuccessRate: '我的成功率',
  myApiKeys: '我的 API 密钥',
  providerHealthSnapshot: '供应商健康快照',
  top5ByRisk: '风险最高前 5',
  provider: '供应商',
  vendor: '厂商',
  status: '状态',
  attempts: '尝试次数',
  na: '暂无',
  tripped: '已熔断',
  enabled: '启用',
  disabled: '禁用',
  recentFailures: '最近失败',
  recentFailedTasks: '最近失败任务',
  last10: '最近 10 条',
  noRecentFailures: '最近没有失败记录',
  prompt: '提示词',
  error: '错误',
  time: '时间',
  taskFailed: '任务失败',
  justNow: '刚刚',
  minutesAgo: '分钟前',
  hoursAgo: '小时前',
  daysAgo: '天前',
  payments: '支付',
  recharge: '充值',
  paymentsAdminSubtitle: '管理充值套餐并查看支付订单',
  paymentsUserSubtitle: '通过微信支付为账号余额充值',
  loadingPayments: '正在加载支付数据...',
  failedToLoadPayments: '加载支付数据失败',
  failedToLoadPackages: '加载套餐失败',
  failedToLoadOrders: '加载订单失败',
  failedToCreateOrder: '创建订单失败',
  failedToVerifyOrder: '校验订单失败',
  failedToSettleOrder: '手工入账失败',
  failedToSavePackages: '保存套餐失败',
  customTopup: '自由充值',
  customTopupTitle: '自由充值',
  customTopupSubtitle: '输入任意充值金额，支付成功后按 1:1 充值到账余额。',
  amountYuan: '充值金额（元）',
  amountPlaceholder: '例如 9.90',
  rechargeNow: '立即充值',
  quickPackages: '快捷套餐',
  quickPackagesSubtitle: '也可以直接选择下面的固定套餐快速充值。',
  creditBalance: '到账余额',
  includesBonus: '含赠送',
  rechargePackages: '充值套餐',
  rechargePackagesSubtitle: '可直接编辑套餐价格、到账金额、排序和启用状态。',
  addPackage: '新增套餐',
  savePackages: '保存套餐',
  saving: '保存中...',
  packageName: '名称',
  price: '价格',
  credit: '到账',
  bonus: '赠送',
  total: '合计',
  order: '排序',
  actions: '操作',
  remove: '删除',
  packageNamePlaceholder: '套餐名称',
  noRechargePackagesYet: '暂时还没有充值套餐',
  paymentOrders: '支付订单',
  myOrders: '我的订单',
  outTradeNo: '商户单号',
  type: '类型',
  amount: '金额',
  action: '操作',
  noPaymentOrdersFound: '没有找到支付订单',
  manualSettle: '手工入账',
  settled: '已入账',
  checkPayment: '检查支付',
  paid: '已支付',
  orderCreated: '订单已创建',
  orderVerified: '订单已到账',
  orderStillPending: '订单仍未支付',
  orderManuallySettled: '订单已手工入账',
  packagesUpdated: '充值套餐已更新',
  tasksTitleAdmin: '任务控制台',
  tasksTitleUser: '我的任务',
  tasksSubtitleAdmin: '仅管理员可见的任务控制台，包含供应商和运行细节',
  tasksSubtitleUser: '来自你所有 API 密钥的任务',
  taskTabAll: '全部',
  taskTabQueued: '排队中',
  taskTabProcessing: '处理中',
  taskTabSucceeded: '成功',
  taskTabFailed: '失败',
  loadingTasks: '正在加载任务...',
  failedToLoadTasks: '加载任务失败',
  failedToLoadTaskDetails: '加载任务详情失败',
  retryNotReady: '控制台里的重试流程暂时还没接通。',
  apiKey: 'API 密钥',
  duration: '耗时',
  created: '创建时间',
  noTasksFound: '没有找到任务',
  pageOfTotal: '第 {page} / {totalPages} 页，共 {total} 条',
  previous: '上一页',
  next: '下一页',
  detailsLoading: '正在加载任务详情...',
  detailsOnDemand: '详情按需加载。尝试次数：{attempts}，图片数：{images}',
  images: '张',
  taskAttempts: '尝试记录（{count}）',
  generatedImages: '生成图片',
  retry: '重试',
  retrying: '重试中...',
  adminDebug: '管理员调试信息',
  cost: '成本',
  pricing: '定价',
  workerJob: 'Worker 任务',
  requeues: '重排次数',
  webhooks: 'Webhook 数',
  callback: '回调地址',
  webhookDeliveries: 'Webhook 投递（{count}）',
  resultKind: '结果类型',
  uploadedSize: '上传大小',
  errorType: '错误类型',
  noTimingData: '暂无耗时数据',
  decrypt: '解密',
  upstream: '上游调用',
  cosUpload: 'COS 上传',
  assetPersist: '资源落库',
  innerTotal: '内部总耗时',
  attemptTotal: '单次尝试总耗时',
  requestTotal: '请求总耗时',
  statusQueued: '排队中',
  statusProcessing: '处理中',
  statusSucceeded: '成功',
  statusFailed: '失败',
  statusPending: '待支付',
} as const

type TranslationKey = keyof typeof zh

type DashboardI18nContextValue = {
  lang: DashboardLanguage
  setLang: (lang: DashboardLanguage) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const DashboardI18nContext = createContext<DashboardI18nContextValue | null>(null)

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}

export function DashboardI18nProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<DashboardI18nContextValue>(() => ({
    lang: 'zh',
    setLang: () => {},
    t: (key, vars) => interpolate(zh[key], vars),
  }), [])

  return (
    <DashboardI18nContext.Provider value={value}>
      {children}
    </DashboardI18nContext.Provider>
  )
}

export function useDashboardI18n() {
  const ctx = useContext(DashboardI18nContext)
  if (!ctx) {
    throw new Error('useDashboardI18n must be used within DashboardI18nProvider')
  }
  return ctx
}

export function roleLabel(lang: DashboardLanguage, role: 'ADMIN' | 'USER') {
  return role === 'ADMIN' ? zh.roleAdmin : zh.roleUser
}

export function taskStatusLabel(lang: DashboardLanguage, status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED') {
  const map = {
    QUEUED: zh.statusQueued,
    PROCESSING: zh.statusProcessing,
    SUCCEEDED: zh.statusSucceeded,
    FAILED: zh.statusFailed,
  }
  return map[status]
}

export function paymentStatusLabel(lang: DashboardLanguage, status: string) {
  if (status === 'PENDING') return zh.statusPending
  if (status === 'PAID') return zh.paid
  if (status === 'FAILED') return zh.statusFailed
  if (status === 'CANCELLED') return zh.disabled
  return status
}
