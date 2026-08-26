import { createAction } from '@silkweave/core'
import z from 'zod'
import { TokenClient } from '../../classes/TokenClient.js'
import { userIdSchema } from '../../lib/auth.js'
import { extractMessageText } from '../../lib/attachments.js'

function toUnixSeconds(value: string | undefined): string | undefined {
  if (!value) { return undefined }
  if (/^\d+$/.test(value)) { return value }
  const milliseconds = Date.parse(value)
  if (Number.isNaN(milliseconds)) { throw new Error(`Invalid time '${value}'. Use ISO 8601 or Unix seconds.`) }
  return String(Math.floor(milliseconds / 1000))
}

export const ImMessageList = createAction({
  name: 'imMessageList',
  description: 'List historical messages from a Feishu/Lark chat for summarization. The bot must be in the chat and needs permission to read all group messages.',
  kind: 'query',
  args: ['userId'],
  input: z.object({
    chatId: z.string().describe('Chat ID whose history should be read'),
    startTime: z.string().optional().describe('Inclusive start time as ISO 8601 or Unix seconds'),
    endTime: z.string().optional().describe('Inclusive end time as ISO 8601 or Unix seconds'),
    sortType: z.enum(['ByCreateTimeAsc', 'ByCreateTimeDesc']).optional().default('ByCreateTimeDesc').describe('Message order'),
    pageSize: z.int().min(1).max(50).optional().default(50).describe('Number of messages to return (1-50)'),
    pageToken: z.string().optional().describe('Pagination token returned by the previous call'),
    userId: userIdSchema('tenant')
  }),
  run: async ({ chatId, startTime, endTime, sortType, pageSize, pageToken, userId }) => {
    const start = toUnixSeconds(startTime)
    const end = toUnixSeconds(endTime)
    if (start && end && Number(start) > Number(end)) { throw new Error('startTime must not be after endTime') }

    const client = new TokenClient(userId)
    const result = await client.withAuth((lark, options) => lark.im.message.list({
      params: {
        container_id_type: 'chat',
        container_id: chatId,
        start_time: start,
        end_time: end,
        sort_type: sortType,
        page_size: pageSize,
        page_token: pageToken
      }
    }, options))

    return {
      ...result,
      items: result.items?.map((message) => ({
        ...message,
        text: extractMessageText(
          message.msg_type ?? 'text',
          message.body?.content ?? '',
          (message.mentions ?? []).map(({ key, name }) => ({ key, name }))
        )
      }))
    }
  }
})

