import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  buildSystemPrompt,
  completeChat,
  financeTools,
  getLlmProviderConfig,
  type LlmMessage,
} from '../services/llm'
import { validateAndRunQuery } from '../services/sqlRunner'

export const getChatConfig = createServerFn({ method: 'GET' }).handler(async () => {
  return getLlmProviderConfig()
})

export const sendChatMessage = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      messages: z.array(
        z.object({
          role: z.enum(['system', 'user', 'assistant', 'tool']),
          content: z.string().nullable(),
          toolCalls: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                arguments: z.string(),
              }),
            )
            .optional(),
          toolCallId: z.string().optional(),
          name: z.string().optional(),
        }),
      ),
      temperature: z.number().min(0).max(2).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const messages: LlmMessage[] = [
      { role: 'system', content: buildSystemPrompt() },
      ...data.messages,
    ]
    return completeChat({
      messages,
      tools: financeTools,
      temperature: data.temperature ?? 0.4,
    })
  })

export const runFinanceQuery = createServerFn({ method: 'POST' })
  .validator(z.object({ sql: z.string().min(1) }))
  .handler(async ({ data }) => {
    return validateAndRunQuery(data.sql)
  })
