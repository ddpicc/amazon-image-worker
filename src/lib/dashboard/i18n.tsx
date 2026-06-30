'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type DashboardLanguage = 'en' | 'zh'

type TranslationKey =
  | 'appName'
  | 'language'
  | 'english'
  | 'chinese'
  | 'loading'
  | 'loadingDashboard'
  | 'signOut'
  | 'roleAdmin'
  | 'roleUser'
  | 'navOverview'
  | 'navActivity'
  | 'navRecharge'
  | 'navApiKeys'
  | 'navApiDocs'
  | 'navAccount'
  | 'navUsers'
  | 'navProviders'
  | 'navTestImage'
  | 'navTasks'
  | 'navStatistics'
  | 'navPricing'
  | 'navBilling'
  | 'navPayments'
  | 'navDebug'
  | 'navManagement'
  | 'loginSubtitle'
  | 'email'
  | 'password'
  | 'signIn'
  | 'signingIn'
  | 'invalidCredentials'
  | 'connectionError'
  | 'registerLinkLead'
  | 'register'
  | 'registerTitle'
  | 'registerSubtitle'
  | 'name'
  | 'createAccount'
  | 'creatingAccount'
  | 'registrationFailed'
  | 'loginLinkLead'
  | 'yourName'
  | 'enterPassword'
  | 'atLeast8Chars'
  | 'overviewTitle'
  | 'overviewAdminSubtitle'
  | 'overviewUserSubtitle'
  | 'tasks24h'
  | 'tasks7d'
  | 'tasks30d'
  | 'successRate'
  | 'activeProviders'
  | 'avgDuration'
  | 'myTasks24h'
  | 'mySuccessRate'
  | 'myApiKeys'
  | 'providerHealthSnapshot'
  | 'top5ByRisk'
  | 'provider'
  | 'vendor'
  | 'status'
  | 'attempts'
  | 'na'
  | 'tripped'
  | 'enabled'
  | 'disabled'
  | 'recentFailures'
  | 'recentFailedTasks'
  | 'last10'
  | 'noRecentFailures'
  | 'prompt'
  | 'error'
  | 'time'
  | 'taskFailed'
  | 'justNow'
  | 'minutesAgo'
  | 'hoursAgo'
  | 'daysAgo'
  | 'payments'
  | 'recharge'
  | 'paymentsAdminSubtitle'
  | 'paymentsUserSubtitle'
  | 'loadingPayments'
  | 'failedToLoadPayments'
  | 'failedToLoadPackages'
  | 'failedToLoadOrders'
  | 'failedToCreateOrder'
  | 'failedToVerifyOrder'
  | 'failedToSettleOrder'
  | 'failedToSavePackages'
  | 'customTopup'
  | 'customTopupTitle'
  | 'customTopupSubtitle'
  | 'amountYuan'
  | 'amountPlaceholder'
  | 'rechargeNow'
  | 'quickPackages'
  | 'quickPackagesSubtitle'
  | 'creditBalance'
  | 'includesBonus'
  | 'rechargePackages'
  | 'rechargePackagesSubtitle'
  | 'addPackage'
  | 'savePackages'
  | 'saving'
  | 'packageName'
  | 'price'
  | 'credit'
  | 'bonus'
  | 'total'
  | 'order'
  | 'actions'
  | 'remove'
  | 'packageNamePlaceholder'
  | 'noRechargePackagesYet'
  | 'paymentOrders'
  | 'myOrders'
  | 'outTradeNo'
  | 'type'
  | 'amount'
  | 'action'
  | 'noPaymentOrdersFound'
  | 'manualSettle'
  | 'settled'
  | 'checkPayment'
  | 'paid'
  | 'orderCreated'
  | 'orderVerified'
  | 'orderStillPending'
  | 'orderManuallySettled'
  | 'packagesUpdated'
  | 'tasksTitleAdmin'
  | 'tasksTitleUser'
  | 'tasksSubtitleAdmin'
  | 'tasksSubtitleUser'
  | 'taskTabAll'
  | 'taskTabQueued'
  | 'taskTabProcessing'
  | 'taskTabSucceeded'
  | 'taskTabFailed'
  | 'loadingTasks'
  | 'failedToLoadTasks'
  | 'failedToLoadTaskDetails'
  | 'retryNotReady'
  | 'apiKey'
  | 'duration'
  | 'created'
  | 'noTasksFound'
  | 'pageOfTotal'
  | 'previous'
  | 'next'
  | 'detailsLoading'
  | 'detailsOnDemand'
  | 'images'
  | 'taskAttempts'
  | 'generatedImages'
  | 'retry'
  | 'retrying'
  | 'adminDebug'
  | 'cost'
  | 'pricing'
  | 'workerJob'
  | 'requeues'
  | 'webhooks'
  | 'callback'
  | 'webhookDeliveries'
  | 'resultKind'
  | 'uploadedSize'
  | 'errorType'
  | 'noTimingData'
  | 'decrypt'
  | 'upstream'
  | 'cosUpload'
  | 'assetPersist'
  | 'innerTotal'
  | 'attemptTotal'
  | 'requestTotal'
  | 'statusQueued'
  | 'statusProcessing'
  | 'statusSucceeded'
  | 'statusFailed'
  | 'statusPending'

const STORAGE_KEY = 'dashboard-language'

const translations: Record<DashboardLanguage, Record<TranslationKey, string>> = {
  en: {
    appName: 'Image Worker',
    language: 'Language',
    english: 'English',
    chinese: '中文',
    loading: 'Loading...',
    loadingDashboard: 'Loading dashboard...',
    signOut: 'Sign Out',
    roleAdmin: 'Admin',
    roleUser: 'User',
    navOverview: 'Overview',
    navActivity: 'Activity',
    navRecharge: 'Recharge',
    navApiKeys: 'API Keys',
    navApiDocs: 'API Docs',
    navAccount: 'Account',
    navUsers: 'Users',
    navProviders: 'Providers',
    navTestImage: 'Test Image',
    navTasks: 'Tasks',
    navStatistics: 'Statistics',
    navPricing: 'Pricing',
    navBilling: 'Billing',
    navPayments: 'Payments',
    navDebug: 'Debug',
    navManagement: 'Management',
    loginSubtitle: 'Sign in to your account',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    invalidCredentials: 'Invalid credentials',
    connectionError: 'Connection error. Please try again.',
    registerLinkLead: 'No account yet?',
    register: 'Register',
    registerTitle: 'Create account',
    registerSubtitle: 'Get your own API keys and task history',
    name: 'Name',
    createAccount: 'Create account',
    creatingAccount: 'Creating account...',
    registrationFailed: 'Registration failed',
    loginLinkLead: 'Already have an account?',
    yourName: 'Your name',
    enterPassword: 'Enter your password',
    atLeast8Chars: 'At least 8 characters',
    overviewTitle: 'Overview',
    overviewAdminSubtitle: 'System-wide operational overview',
    overviewUserSubtitle: 'Your account activity overview',
    tasks24h: 'Tasks (24h)',
    tasks7d: 'Tasks (7d)',
    tasks30d: 'Tasks (30d)',
    successRate: 'Success Rate',
    activeProviders: 'Active Providers',
    avgDuration: 'Avg Duration',
    myTasks24h: 'My Tasks (24h)',
    mySuccessRate: 'My Success Rate',
    myApiKeys: 'My API Keys',
    providerHealthSnapshot: 'Provider Health Snapshot',
    top5ByRisk: 'Top 5 by risk',
    provider: 'Provider',
    vendor: 'Vendor',
    status: 'Status',
    attempts: 'Attempts',
    na: 'N/A',
    tripped: 'Tripped',
    enabled: 'Enabled',
    disabled: 'Disabled',
    recentFailures: 'Recent Failures',
    recentFailedTasks: 'Recent Failed Tasks',
    last10: 'Last 10',
    noRecentFailures: 'No recent failures',
    prompt: 'Prompt',
    error: 'Error',
    time: 'Time',
    taskFailed: 'Task failed',
    justNow: 'just now',
    minutesAgo: 'm ago',
    hoursAgo: 'h ago',
    daysAgo: 'd ago',
    payments: 'Payments',
    recharge: 'Recharge',
    paymentsAdminSubtitle: 'Manage recharge packages and inspect payment orders',
    paymentsUserSubtitle: 'Recharge your account balance through WeChat Pay',
    loadingPayments: 'Loading payments...',
    failedToLoadPayments: 'Failed to load payments',
    failedToLoadPackages: 'Failed to load packages',
    failedToLoadOrders: 'Failed to load orders',
    failedToCreateOrder: 'Failed to create order',
    failedToVerifyOrder: 'Failed to verify order',
    failedToSettleOrder: 'Failed to settle order',
    failedToSavePackages: 'Failed to save packages',
    customTopup: 'Custom top-up',
    customTopupTitle: 'Custom top-up',
    customTopupSubtitle: 'Enter any amount and your balance will be credited 1:1 after payment succeeds.',
    amountYuan: 'Amount (CNY)',
    amountPlaceholder: 'e.g. 9.90',
    rechargeNow: 'Recharge now',
    quickPackages: 'Quick packages',
    quickPackagesSubtitle: 'Or choose one of the fixed packages below for a faster checkout.',
    creditBalance: 'Credited balance',
    includesBonus: 'Includes bonus',
    rechargePackages: 'Recharge Packages',
    rechargePackagesSubtitle: 'Edit package pricing, credits, order, and enabled status inline.',
    addPackage: 'Add Package',
    savePackages: 'Save Packages',
    saving: 'Saving...',
    packageName: 'Name',
    price: 'Price',
    credit: 'Credit',
    bonus: 'Bonus',
    total: 'Total',
    order: 'Order',
    actions: 'Actions',
    remove: 'Remove',
    packageNamePlaceholder: 'Package name',
    noRechargePackagesYet: 'No recharge packages yet',
    paymentOrders: 'Payment Orders',
    myOrders: 'My Orders',
    outTradeNo: 'Out Trade No',
    type: 'Type',
    amount: 'Amount',
    action: 'Action',
    noPaymentOrdersFound: 'No payment orders found',
    manualSettle: 'Manual Settle',
    settled: 'Settled',
    checkPayment: 'Check Payment',
    paid: 'Paid',
    orderCreated: 'Order created',
    orderVerified: 'Order credited',
    orderStillPending: 'Order still unpaid',
    orderManuallySettled: 'Order settled manually',
    packagesUpdated: 'Recharge packages updated',
    tasksTitleAdmin: 'Task Console',
    tasksTitleUser: 'My Tasks',
    tasksSubtitleAdmin: 'Admin-only task console with provider and operational details',
    tasksSubtitleUser: 'Tasks from all of your API keys',
    taskTabAll: 'All',
    taskTabQueued: 'Queued',
    taskTabProcessing: 'Processing',
    taskTabSucceeded: 'Succeeded',
    taskTabFailed: 'Failed',
    loadingTasks: 'Loading tasks...',
    failedToLoadTasks: 'Failed to load tasks',
    failedToLoadTaskDetails: 'Failed to load task details',
    retryNotReady: 'Retry is not wired yet in the user/admin dashboard flow.',
    apiKey: 'API Key',
    duration: 'Duration',
    created: 'Created',
    noTasksFound: 'No tasks found',
    pageOfTotal: 'Page {page} of {totalPages} ({total} total)',
    previous: 'Previous',
    next: 'Next',
    detailsLoading: 'Loading task details...',
    detailsOnDemand: 'Details are loaded on demand. Attempts: {attempts}, images: {images}',
    images: 'images',
    taskAttempts: 'Attempts ({count})',
    generatedImages: 'Generated Images',
    retry: 'Retry',
    retrying: 'Retrying...',
    adminDebug: 'Admin Debug',
    cost: 'Cost',
    pricing: 'Pricing',
    workerJob: 'Worker Job',
    requeues: 'Requeues',
    webhooks: 'Webhooks',
    callback: 'Callback',
    webhookDeliveries: 'Webhook Deliveries ({count})',
    resultKind: 'Result Kind',
    uploadedSize: 'Uploaded Size',
    errorType: 'Type',
    noTimingData: 'No timing data',
    decrypt: 'Decrypt',
    upstream: 'Upstream',
    cosUpload: 'COS Upload',
    assetPersist: 'Asset Persist',
    innerTotal: 'Inner Total',
    attemptTotal: 'Attempt Total',
    requestTotal: 'Request Total',
    statusQueued: 'Queued',
    statusProcessing: 'Processing',
    statusSucceeded: 'Succeeded',
    statusFailed: 'Failed',
    statusPending: 'Pending',
  },
  zh: {
    appName: 'Image Worker',
    language: '语言',
    english: 'English',
    chinese: '中文',
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
  },
}

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

function detectInitialLanguage(): DashboardLanguage {
  if (typeof window === 'undefined') return 'en'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'zh') return saved
  return window.navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function DashboardI18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<DashboardLanguage>('en')

  useEffect(() => {
    setLangState(detectInitialLanguage())
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, lang)
    }
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  const value = useMemo<DashboardI18nContextValue>(() => ({
    lang,
    setLang: setLangState,
    t: (key, vars) => interpolate(translations[lang][key], vars),
  }), [lang])

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
  return role === 'ADMIN' ? translations[lang].roleAdmin : translations[lang].roleUser
}

export function taskStatusLabel(lang: DashboardLanguage, status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED') {
  const map = {
    QUEUED: translations[lang].statusQueued,
    PROCESSING: translations[lang].statusProcessing,
    SUCCEEDED: translations[lang].statusSucceeded,
    FAILED: translations[lang].statusFailed,
  }
  return map[status]
}

export function paymentStatusLabel(lang: DashboardLanguage, status: string) {
  if (status === 'PENDING') return translations[lang].statusPending
  if (status === 'PAID') return translations[lang].paid
  if (status === 'FAILED') return translations[lang].statusFailed
  if (status === 'CANCELLED') return translations[lang].disabled
  return status
}
