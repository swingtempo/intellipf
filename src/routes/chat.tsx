import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Send, TableProperties, User } from 'lucide-react'
import { getChatConfig, runFinanceQuery, sendChatMessage } from '#/server/api/chat'
import type { LlmMessage } from '#/server/services/llm'
import { PageHeader } from '../components/page-header'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/input'
import { Spinner } from '../components/ui/button'

export const Route = createFileRoute('/chat')({
  loader: () => getChatConfig(),
  component: ChatPage,
})

const MAX_TOOL_ROUNDS = 8

interface ChatEntry {
  role: 'user' | 'assistant'
  content: string
  toolResults?: Array<{ label: string; summary: string }>
}

function ChatPage() {
  const { t } = useTranslation()
  const config = Route.useLoaderData()
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries, thinking])

  async function send() {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    setError(null)
    setEntries((prev) => [...prev, { role: 'user', content: text }])
    setThinking(true)

    const messages: LlmMessage[] = [
      ...entries.map((entry) => ({ role: entry.role, content: entry.content })),
      { role: 'user', content: text },
    ]

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await sendChatMessage({ data: { messages } })

        if (response.toolCalls.length === 0) {
          const content = response.content ?? 'I could not find an answer.'
          setEntries((prev) => [...prev, { role: 'assistant', content }])
          return
        }

        const toolResults: Array<{ label: string; summary: string }> = []
        messages.push({
          role: 'assistant',
          content: response.content ?? null,
          toolCalls: response.toolCalls,
        })
        for (const call of response.toolCalls) {
          if (call.name === 'get_schema_info') {
            const result = { columns: ['message'], rows: [{ message: 'See system prompt for the full schema. Key tables: users, accounts, transactions, balances, securities, holdings, budgets, goals, net_worth_snapshots. amount > 0 is money out.' }] }
            toolResults.push({ label: call.name, summary: `Returned schema overview (${result.rows.length} row).` })
            messages.push({
              role: 'tool',
              toolCallId: call.id,
              name: call.name,
              content: JSON.stringify(result),
            })
          } else {
            let parsed: { query?: string }
            try {
              parsed = JSON.parse(call.arguments || '{}')
            } catch {
              parsed = {}
            }
            const result = await runFinanceQuery({ data: { sql: parsed.query ?? '' } })
            toolResults.push({
              label: call.name,
              summary: `Ran query Â· ${result.rowCount} row(s)`,
            })
            messages.push({
              role: 'tool',
              toolCallId: call.id,
              name: call.name,
              content: JSON.stringify(result),
            })
          }
        }

        setEntries((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: response.content ?? '',
            toolResults,
          },
        ])
      }
      setEntries((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'I needed more than 8 rounds of tool calls. Please try a more specific question.',
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setEntries((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ])
    } finally {
      setThinking(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-8">
      <PageHeader title={t('chat.title')} subtitle={t('chat.subtitle')}>
        {config.configured ? (
          <Badge tone="success">{t('settings.llmConfigured')}</Badge>
        ) : (
          <Badge tone="warning">{t('settings.llmNotConfigured')}</Badge>
        )}
      </PageHeader>

      <Card className="flex h-[70vh] flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {entries.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(79,184,178,0.16)] text-[var(--lagoon-deep)]">
                <Bot className="h-7 w-7" />
              </span>
              <p className="max-w-md text-sm text-[var(--sea-ink-soft)]">{t('chat.welcome')}</p>
            </div>
          )}

          {entries.map((entry, index) => (
            <div key={index} className={entry.role === 'user' ? 'flex justify-end' : ''}>
              <div
                className={
                  entry.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-md bg-[var(--lagoon-deep)] px-4 py-2.5 text-white'
                    : 'max-w-[90%]'
                }
              >
                {entry.role === 'user' ? (
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <User className="h-3.5 w-3.5" />
                    {entry.content}
                  </div>
                ) : (
                  <>
                    {entry.toolResults && entry.toolResults.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {entry.toolResults.map((result, i) => (
                          <Badge key={i} tone="neutral" className="gap-1">
                            <TableProperties className="h-3 w-3" />
                            {result.summary}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {entry.content && (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--sea-ink)]">
                        {entry.content}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {thinking && (
            <div className="flex items-center gap-2 text-sm text-[var(--sea-ink-soft)]">
              <Spinner className="h-4 w-4" />
              {t('chat.thinking')}
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="border-t border-[var(--line)] p-4">
          {!config.configured && (
            <p className="mb-2 text-xs text-amber-600">{t('chat.providerNotConfigured')}</p>
          )}
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={t('chat.placeholder')}
              className="min-h-11 flex-1 resize-none"
              rows={1}
            />
            <Button onClick={() => void send()} disabled={!input.trim() || thinking}>
              <Send className="h-4 w-4" />
              {t('chat.send')}
            </Button>
          </div>
        </div>
      </Card>
    </main>
  )
}
