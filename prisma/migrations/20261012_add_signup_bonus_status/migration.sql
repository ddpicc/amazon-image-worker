-- 新增「新用户注册赠送」的余额变动类型
ALTER TYPE "UsageStatus" ADD VALUE IF NOT EXISTS 'SIGNUP_BONUS';
