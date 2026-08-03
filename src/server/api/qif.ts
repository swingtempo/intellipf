import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { ensureUserScoped } from '../user'
import { importQif, parseQif } from '../services/qif'

export const previewQif = createServerFn({ method: 'POST' })
  .validator(z.object({ content: z.string() }))
  .handler(async ({ data }) => {
    const parsed = parseQif(data.content)
    return {
      sections: parsed.sections.map((s) => ({
        type: s.type,
        recordCount: s.records.length,
      })),
      accounts: parsed.accounts,
    }
  })

export const importQifFile = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      fileName: z.string(),
      content: z.string(),
      accountId: z.string().optional().nullable(),
      accountName: z.string().optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await ensureUserScoped()
    const result = await importQif({
      userId,
      accountId: data.accountId,
      fileName: data.fileName,
      content: data.content,
      accountName: data.accountName,
    })
    return result
  })
