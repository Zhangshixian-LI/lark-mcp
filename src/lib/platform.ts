import { Domain } from '@larksuiteoapi/node-sdk'

export type LarkDomain = 'feishu' | 'lark'

function resolveDomain(value = process.env.LARK_DOMAIN): LarkDomain {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || normalized === 'feishu') { return 'feishu' }
  if (normalized === 'lark') { return 'lark' }
  throw new Error(`Invalid LARK_DOMAIN '${value}'. Expected 'feishu' or 'lark'.`)
}

/** China Feishu is the default; set LARK_DOMAIN=lark for international Lark. */
export const LARK_DOMAIN = resolveDomain()
export const SDK_DOMAIN = LARK_DOMAIN === 'feishu' ? Domain.Feishu : Domain.Lark
export const OPEN_PLATFORM_BASE = LARK_DOMAIN === 'feishu' ? 'https://open.feishu.cn' : 'https://open.larksuite.com'
export const OPEN_API_BASE = `${OPEN_PLATFORM_BASE}/open-apis`

