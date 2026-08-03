import { format, subDays, subMonths } from 'date-fns'
import { eq, and } from 'drizzle-orm'
import { getDb, schema } from './index'
import { getOrCreateDefaultUser } from '../user'
import { uid } from '#/lib/utils'

function seededRandom(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const EXPENSE_CATEGORIES = [
  ['Food and Drink', 'Restaurants'],
  ['Food and Drink', 'Groceries'],
  ['Transportation', 'Gas'],
  ['Home', 'Utilities'],
  ['Home', 'Rent'],
  ['Entertainment', 'Streaming'],
  ['Shopping', 'Retail'],
  ['Health', 'Pharmacy'],
  ['Travel', 'Flights'],
  ['Transfer', 'Wire Transfer'],
]

const EXPENSE_NAMES: Record<string, string[]> = {
  Restaurants: ['The French Press', 'Golden Fork Bistro', 'Taco Fiesta', 'Noodle House', 'Blue Willow Cafe', 'Sushi Ko'],
  Groceries: ['Whole Foods Market', 'Trader Joes', 'Safeway', 'Kroger', 'Costco Wholesale'],
  Gas: ['Shell', 'Chevron', 'Exxon', 'BP', '7-Eleven'],
  Utilities: ['PG&E', 'Comcast Xfinity', 'AT&T', 'Verizon Wireless'],
  Rent: ['Oakwood Properties'],
  Streaming: ['Netflix', 'Spotify', 'Hulu', 'Disney+', 'HBO Max'],
  Retail: ['Amazon', 'Target', 'Walmart', 'Best Buy', 'IKEA'],
  Pharmacy: ['CVS Pharmacy', 'Walgreens', 'Rite Aid'],
  Flights: ['United Airlines', 'Delta Air Lines', 'Airbnb'],
  'Wire Transfer': ['ACH Deposit', 'Payroll Deposit'],
}

const INCOME_NAMES = ['ACME Corp Payroll', 'Acme Corp Bonus', 'Vanguard Dividend', 'Interest Payment']

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]!
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export async function seedDatabase() {
  const db = getDb()
  const user = await getOrCreateDefaultUser()
  const userId = user.id

  const existing = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId)).limit(1)
  if (existing.length > 0) {
    console.log('Database already seeded. Skipping.')
    return
  }

  const rand = seededRandom(1337)

  const checkingId = uid('acc')
  const savingsId = uid('acc')
  const creditId = uid('acc')
  const brokerageId = uid('acc')
  const retirementId = uid('acc')

  await db.insert(schema.accounts).values([
    { id: checkingId, userId, source: 'manual', name: 'Checking', type: 'depository', subtype: 'checking', mask: '4821', institutionName: 'Demo Bank', isActive: true },
    { id: savingsId, userId, source: 'manual', name: 'Savings', type: 'depository', subtype: 'savings', mask: '7724', institutionName: 'Demo Bank', isActive: true },
    { id: creditId, userId, source: 'manual', name: 'Credit Card', type: 'credit', subtype: 'credit card', mask: '5560', institutionName: 'Demo Bank', isActive: true },
    { id: brokerageId, userId, source: 'manual', name: 'Brokerage', type: 'brokerage', subtype: 'brokerage', mask: '9012', institutionName: 'Demo Investments', isActive: true },
    { id: retirementId, userId, source: 'manual', name: '401(k)', type: 'brokerage', subtype: '401k', mask: '3345', institutionName: 'Demo Investments', isActive: true },
  ])

  let checkingBalance = 4200
  let savingsBalance = 18500
  let creditBalance = 640
  const today = new Date()

  for (let daysAgo = 540; daysAgo >= 0; daysAgo -= 7) {
    const date = subDays(today, daysAgo)
    const key = format(date, 'yyyy-MM-dd')
    checkingBalance = round2(checkingBalance + (rand() - 0.48) * 600)
    savingsBalance = round2(savingsBalance + (rand() - 0.49) * 300)
    creditBalance = round2(Math.max(100, creditBalance + (rand() - 0.5) * 420))
    const values = []
    values.push({ id: uid('bal'), userId, accountId: checkingId, date: key, current: Math.max(500, checkingBalance), available: Math.max(500, checkingBalance) - 320, createdAt: key })
    values.push({ id: uid('bal'), userId, accountId: savingsId, date: key, current: savingsBalance, available: savingsBalance })
    values.push({ id: uid('bal'), userId, accountId: creditId, date: key, current: creditBalance, available: creditBalance, limit: 10000 })
    await db.insert(schema.balances).values(values)
  }

  const transactions: (typeof schema.transactions.$inferInsert)[] = []
  let monthCount = 0

  for (let daysAgo = 179; daysAgo >= 0; daysAgo--) {
    const date = subDays(today, daysAgo)
    const key = format(date, 'yyyy-MM-dd')
    const month = key.slice(0, 7)

    if (date.getDate() === 1 || date.getDate() === 15) {
      const income = monthCount % 2 === 0 ? 2400 : 2430
      transactions.push({
        id: uid('txn'), userId, accountId: checkingId, source: 'manual',
        amount: -income, name: pick(INCOME_NAMES, rand), category: JSON.stringify(['Income', 'Payroll']),
        date: key, pending: false, notes: 'Semi-monthly paycheck',
      })
    }

    if (date.getDay() === 2) {
      const category = ['Restaurants', 'Groceries', 'Gas'][Math.floor(rand() * 3)]!
      const accountId = rand() > 0.75 ? creditId : checkingId
      transactions.push({
        id: uid('txn'), userId, accountId, source: 'manual',
        amount: round2(8 + rand() * 80),
        name: pick(EXPENSE_NAMES[category]!, rand),
        category: JSON.stringify(['Food and Drink', category]),
        date: key, pending: false,
      })
    }

    if (rand() < 0.45) {
      const [group, sub] = pick(EXPENSE_CATEGORIES, rand)
      const accountId = sub === 'Rent' ? checkingId : rand() > 0.6 ? creditId : checkingId
      transactions.push({
        id: uid('txn'), userId, accountId, source: 'manual',
        amount: round2(sub === 'Rent' ? 1650 : 5 + rand() * 120),
        name: pick(EXPENSE_NAMES[sub] ?? [sub], rand),
        category: JSON.stringify([group, sub]),
        date: key, pending: false,
      })
    }

    if (daysAgo % 30 === 0) {
      const budgetRows = await db
        .select()
        .from(schema.budgets)
        .where(and(eq(schema.budgets.userId, userId), eq(schema.budgets.month, month)))
        .limit(1)
      if (budgetRows.length === 0 && rand() > 0.4) {
        for (const [group, sub] of EXPENSE_CATEGORIES.slice(0, 6)) {
          const amount = sub === 'Rent' ? 1650 : sub === 'Restaurants' ? 320 : sub === 'Groceries' ? 480 : 120 + rand() * 220
          await db.insert(schema.budgets).values({
            id: uid('bud'), userId, category: sub, month, amount: round2(amount),
          })
        }
      }
      monthCount++
    }
  }

  const unique = new Map<string, (typeof schema.transactions.$inferInsert)[]>()
  for (const tx of transactions) {
    const key = `${tx.date}|${tx.name}|${tx.amount}`
    if (!unique.has(key)) unique.set(key, [])
    unique.get(key)!.push(tx)
  }
  for (const [, group] of unique) {
    for (const tx of group.slice(0, 1)) {
      await db.insert(schema.transactions).values(tx)
    }
  }

  const securities: Array<{ ticker: string; name: string; type: string; price: number }> = [
    { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'etf', price: 276.4 },
    { ticker: 'VXUS', name: 'Vanguard Total International Stock ETF', type: 'etf', price: 63.2 },
    { ticker: 'BND', name: 'Vanguard Total Bond Market ETF', type: 'etf', price: 72.8 },
    { ticker: 'AAPL', name: 'Apple Inc.', type: 'stock', price: 228.5 },
    { ticker: 'MSFT', name: 'Microsoft Corp.', type: 'stock', price: 452.1 },
    { ticker: 'GLD', name: 'SPDR Gold Shares', type: 'commodity', price: 251.9 },
  ]

  const holdingsDefs = [
    { accountId: brokerageId, ticker: 'VTI', quantity: 42.5 },
    { accountId: brokerageId, ticker: 'VXUS', quantity: 30 },
    { accountId: brokerageId, ticker: 'BND', quantity: 25 },
    { accountId: brokerageId, ticker: 'AAPL', quantity: 12 },
    { accountId: brokerageId, ticker: 'MSFT', quantity: 8 },
    { accountId: brokerageId, ticker: 'GLD', quantity: 10 },
    { accountId: retirementId, ticker: 'VTI', quantity: 58 },
    { accountId: retirementId, ticker: 'BND', quantity: 20 },
  ]

  for (const security of securities) {
    const securityId = uid('sec')
    await db.insert(schema.securities).values({
      id: securityId,
      ticker: security.ticker,
      name: security.name,
      type: security.type,
    })
    for (const holdingDef of holdingsDefs.filter((h) => h.ticker === security.ticker)) {
      const costBasis = round2(holdingDef.quantity * security.price * (0.72 + rand() * 0.35))
      await db.insert(schema.holdings).values({
        id: uid('hol'),
        accountId: holdingDef.accountId,
        securityId,
        quantity: holdingDef.quantity,
        costBasis,
        price: security.price,
        priceAsOf: format(today, 'yyyy-MM-dd'),
      })
    }
  }

  const currentMonth = format(today, 'yyyy-MM')
  const goalsToInsert = [
    { name: 'Emergency Fund', targetAmount: 20000, currentAmount: 18500, targetDate: format(subMonths(today, -8), 'yyyy-MM-dd'), icon: 'umbrella', color: '#4fb8b2' },
    { name: 'Europe Vacation', targetAmount: 8000, currentAmount: 2600, targetDate: format(subMonths(today, -11), 'yyyy-MM-dd'), icon: 'plane', color: '#2f6a4a' },
    { name: 'New Car', targetAmount: 45000, currentAmount: 9800, targetDate: format(subMonths(today, -30), 'yyyy-MM-dd'), icon: 'car', color: '#328f97' },
  ]
  for (const goal of goalsToInsert) {
    await db.insert(schema.goals).values({ id: uid('goal'), userId, ...goal })
  }

  console.log(`Seeded demo data for user ${user.email} (month ${currentMonth}).`)
}

seedDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seeding failed:', error)
    process.exit(1)
  })
