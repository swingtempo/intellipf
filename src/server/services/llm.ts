import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getEnv } from '#/lib/env'

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool'

export interface LlmToolCall {
  id: string
  name: string
  arguments: string
}

export interface LlmMessage {
  role: LlmRole
  content: string | null
  toolCalls?: LlmToolCall[]
  toolCallId?: string
  name?: string
}

export interface LlmToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface LlmResult {
  content: string | null
  toolCalls: LlmToolCall[]
  model: string
  provider: LlmProviderName
}

export type LlmProviderName = 'openai' | 'openrouter' | 'anthropic'

export interface LlmProviderConfig {
  provider: LlmProviderName
  model: string
  configured: boolean
  baseUrl?: string
}

const DB_SCHEMA_DESCRIPTION = `
You have access to the user's personal finance database (SQLite). Schema (columns snake_case):

- users(id, name, email, created_at)
- plaid_items(id, user_id, plaid_item_id, access_token, institution_id, institution_name, cursor, status, last_sync_at)
- accounts(id, user_id, plaid_item_id, plaid_account_id, source[plaid|qif|manual], name, official_name, type[depository|credit|loan|investment|brokerage|insurance|other], subtype, mask, institution_name, currency_code, is_active)
- balances(id, user_id, account_id, date, available, current, limit) -- daily balance snapshots
- transactions(id, user_id, account_id, plaid_transaction_id, source[plaid|qif|manual], amount, name, merchant_name, category, date, currency_code, pending, notes)
  NOTE: amount > 0 means money OUT of the account (expense); amount < 0 means money IN (income/deposit).
- securities(id, ticker, name, type, currency, isin)
- holdings(id, account_id, security_id, quantity, cost_basis, price, price_as_of)
- budgets(id, user_id, category, month[YYYY-MM], amount)
- goals(id, user_id, name, target_amount, current_amount, target_date, icon, color)
- net_worth_snapshots(id, user_id, date, total_assets, total_liabilities, net_worth)

Queries are read-only. All amounts are stored in the account currency (default USD).
`.trim()

export function buildSystemPrompt(): string {
  return `You are IntelliPF, a helpful personal-finance assistant embedded in the user's finance dashboard.

${DB_SCHEMA_DESCRIPTION}

Guidelines:
- Use the query_finance_db tool to look up real data before answering anything about balances, spending, budgets, goals, net worth, or holdings.
- When the user asks "how much did I spend on X this month", query the transactions table (date LIKE 'YYYY-MM%') and sum positive amounts.
- When asked about net worth, combine cash balances (current or available) with holdings market value, minus loan/credit balances.
- Keep answers concise and cite the numbers you actually retrieved.
- If a query fails or returns nothing, say so rather than guessing.`
}

export function getLlmProviderConfig(): LlmProviderConfig {
  const provider = (getEnv('LLM_PROVIDER') ?? 'openrouter') as LlmProviderName
  if (provider === 'anthropic') {
    return {
      provider,
      model: getEnv('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5',
      configured: Boolean(getEnv('ANTHROPIC_API_KEY')),
    }
  }
  if (provider === 'openai') {
    return {
      provider,
      model: getEnv('OPENAI_MODEL') ?? 'gpt-4o',
      configured: Boolean(getEnv('OPENAI_API_KEY')),
      baseUrl: getEnv('OPENAI_BASE_URL'),
    }
  }
  return {
    provider: 'openrouter',
    model: getEnv('OPENROUTER_MODEL') ?? 'anthropic/claude-sonnet-4',
    configured: Boolean(getEnv('OPENROUTER_API_KEY')),
    baseUrl: getEnv('OPENAI_BASE_URL') ?? 'https://openrouter.ai/api/v1',
  }
}

export async function completeChat(opts: {
  messages: LlmMessage[]
  tools?: LlmToolDefinition[]
  temperature?: number
  maxTokens?: number
}): Promise<LlmResult> {
  const config = getLlmProviderConfig()
  if (!config.configured) {
    throw new Error(
      `LLM provider "${config.provider}" is not configured. Set ${config.provider.toUpperCase()}_API_KEY (or LLM_PROVIDER) in your .env file.`,
    )
  }

  if (config.provider === 'anthropic') {
    return completeAnthropic(config.model, opts)
  }
  return completeOpenAICompat(config.provider, config.model, config.baseUrl, opts)
}

async function completeOpenAICompat(
  provider: LlmProviderName,
  model: string,
  baseUrl: string | undefined,
  opts: {
    messages: LlmMessage[]
    tools?: LlmToolDefinition[]
    temperature?: number
    maxTokens?: number
  },
): Promise<LlmResult> {
  const apiKey = provider === 'openrouter' ? getEnv('OPENROUTER_API_KEY') : getEnv('OPENAI_API_KEY')
  const client = new OpenAI({ apiKey: apiKey!, baseURL: baseUrl })
  const response = await client.chat.completions.create(
    {
      model,
      messages: opts.messages.map(toOpenAIMessage),
      tools: opts.tools?.map(toOpenAITool),
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    },
    { timeout: 120_000 },
  )

  const message = response.choices[0]?.message
  const content =
    typeof message?.content === 'string'
      ? message.content
      : Array.isArray(message?.content)
        ? message.content
            .map((part) => (part.type === 'text' ? part.text : ''))
            .filter(Boolean)
            .join('\n') || null
        : null

  const toolCalls: LlmToolCall[] = (message?.tool_calls ?? []).map((call) => ({
    id: call.id ?? `tc_${Math.random().toString(36).slice(2)}`,
    name: call.function?.name ?? '',
    arguments: call.function?.arguments ?? '{}',
  }))

  return { content, toolCalls, model: response.model ?? model, provider }
}

function toOpenAIMessage(message: LlmMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (message.role === 'system') {
    return { role: 'system', content: message.content ?? '' }
  }
  if (message.role === 'user') {
    return { role: 'user', content: message.content ?? '' }
  }
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId ?? '',
      content: message.content ?? '',
    }
  }
  return {
    role: 'assistant',
    content: message.content,
    tool_calls: message.toolCalls?.length
      ? message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: {
            name: call.name,
            arguments: call.arguments,
          },
        }))
      : undefined,
  }
}

function toOpenAITool(tool: LlmToolDefinition): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}

async function completeAnthropic(
  model: string,
  opts: {
    messages: LlmMessage[]
    tools?: LlmToolDefinition[]
    temperature?: number
    maxTokens?: number
  },
): Promise<LlmResult> {
  const client = new Anthropic({ apiKey: getEnv('ANTHROPIC_API_KEY')! })
  const systemMessages = opts.messages.filter((m) => m.role === 'system')
  const messages = opts.messages.filter((m) => m.role !== 'system')

  const response = await client.messages.create(
    {
      model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature,
      system: systemMessages.map((m) => m.content ?? '').join('\n\n'),
      messages: messages.map(toAnthropicMessage),
      tools: opts.tools?.map(toAnthropicTool),
    },
    { timeout: 120_000 },
  )

  let content = ''
  const toolCalls: LlmToolCall[] = []
  for (const block of response.content) {
    if (block.type === 'text') content += block.text
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: JSON.stringify(block.input ?? {}),
      })
    }
  }

  return {
    content: content || null,
    toolCalls,
    model: response.model ?? model,
    provider: 'anthropic',
  }
}

function toAnthropicMessage(message: LlmMessage): Anthropic.MessageParam {
  if (message.role === 'tool') {
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: message.toolCallId ?? '',
          content: message.content ?? '',
        },
      ],
    }
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: [
        ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
        ...message.toolCalls.map((call) => ({
          type: 'tool_use' as const,
          id: call.id,
          name: call.name,
          input: JSON.parse(call.arguments || '{}') as Record<string, unknown>,
        })),
      ],
    }
  }
  return {
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content ?? '',
  }
}

function toAnthropicTool(tool: LlmToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  }
}

export const financeTools: LlmToolDefinition[] = [
  {
    name: 'query_finance_db',
    description:
      'Run a read-only SQL SELECT query against the local finance database. Returns up to 200 rows as JSON. Only SELECT statements are allowed; always include a LIMIT clause.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A SQLite SELECT statement. Must include LIMIT.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_schema_info',
    description:
      'Return the list of database tables, their columns, and data semantics to help write correct SQL queries.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
]

export { DB_SCHEMA_DESCRIPTION }
