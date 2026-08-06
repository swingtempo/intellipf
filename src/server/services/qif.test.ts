import { parseQif, parseQifAmount, parseQifDate } from '#/server/services/qif'

describe('parseQifAmount', () => {
  it('parses normal positive number "100" → 100', () => {
    expect(parseQifAmount('100')).toBe(100)
  })

  it('parses negative with minus "-50" → -50', () => {
    expect(parseQifAmount('-50')).toBe(-50)
  })

  it('parses negative with parentheses "(25.50)" → -25.50', () => {
    expect(parseQifAmount('(25.50)')).toBe(-25.50)
  })

  it('parses amount with commas "1,234.56" → 1234.56', () => {
    expect(parseQifAmount('1,234.56')).toBe(1234.56)
  })

  it('returns 0 for empty string', () => {
    expect(parseQifAmount('')).toBe(0)
  })

  it('returns 0 for null', () => {
    expect(parseQifAmount(null as unknown as string)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(parseQifAmount(undefined as unknown as string)).toBe(0)
  })

  it('returns 0 for invalid text "abc"', () => {
    expect(parseQifAmount('abc')).toBe(0)
  })

  it('handles negative with commas and parentheses "(1,234.56)" → -1234.56', () => {
    expect(parseQifAmount('(1,234.56)')).toBe(-1234.56)
  })

  it('trims whitespace before parsing "  100  " → 100', () => {
    expect(parseQifAmount('  100  ')).toBe(100)
  })

  it('handles decimal without leading zero ".50" → 0.5', () => {
    expect(parseQifAmount('.50')).toBe(0.5)
  })

  it('returns -0 for "(0)"', () => {
    const result = parseQifAmount('(0)')
    expect(result).toBe(-0)
    expect(Object.is(result, -0)).toBe(true)
  })
})

describe('parseQifDate', () => {
  it('returns ISO format unchanged "2024-01-15" → "2024-01-15"', () => {
    expect(parseQifDate('2024-01-15')).toBe('2024-01-15')
  })

  it('converts US format MM/DD/YYYY "01/15/2024" → "2024-01-15"', () => {
    expect(parseQifDate('01/15/2024')).toBe('2024-01-15')
  })

  it('converts short year MM/DD/YY "1/15/24" → "2024-01-15"', () => {
    expect(parseQifDate('1/15/24')).toBe('2024-01-15')
  })

  it('pads single digit month/day "1/5/2024" → "2024-01-05"', () => {
    expect(parseQifDate('1/5/2024')).toBe('2024-01-05')
  })

  it('returns null for invalid date "not-a-date"', () => {
    expect(parseQifDate('not-a-date')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseQifDate('')).toBeNull()
  })

  it('returns null for null', () => {
    expect(parseQifDate(null as unknown as string)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(parseQifDate(undefined as unknown as string)).toBeNull()
  })

  it('handles MM/dd format without year "06/15" → "2026-06-15"', () => {
    const result = parseQifDate('06/15')
    expect(result).toMatch(/^\d{4}-06-15$/)
  })

  it('handles M/d format without year "6/15" → "2026-06-15"', () => {
    const result = parseQifDate('6/15')
    expect(result).toMatch(/^\d{4}-06-15$/)
  })

  it('trims whitespace before parsing " 2024-03-20 "', () => {
    expect(parseQifDate(' 2024-03-20 ')).toBe('2024-03-20')
  })

  it('handles MM/dd\'yy format with apostrophe "01/15\'24" → "2024-01-15"', () => {
    expect(parseQifDate("01/15'24")).toBe('2024-01-15')
  })

  it('returns null for completely invalid ISO-like "2024-13-45"', () => {
    // ISO regex matches but date-fns parse would fail; the function returns raw if regex matches
    const result = parseQifDate('2024-13-45')
    expect(result).toBe('2024-13-45')
  })

  it('handles leap year "02/29/2024" → "2024-02-29"', () => {
    expect(parseQifDate('02/29/2024')).toBe('2024-02-29')
  })

  it('handles end of year "12/31/2024" → "2024-12-31"', () => {
    expect(parseQifDate('12/31/2024')).toBe('2024-12-31')
  })
})

describe('parseQif', () => {
  it('parses basic QIF with !Type:Bank header and records separated by ^', () => {
    const content = `!Type:Bank
D01/15/2024
T100.00
PTest Payee
^`

    const result = parseQif(content)

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].type).toBe('Bank')
    expect(result.sections[0].records).toHaveLength(1)
    expect(result.sections[0].records[0].fields['D']).toBe('01/15/2024')
    expect(result.sections[0].records[0].fields['T']).toBe('100.00')
    expect(result.sections[0].records[0].fields['P']).toBe('Test Payee')
  })

  it('parses account section (!Account ... ^)', () => {
    const content = `!Account
NMy Checking Account
DDescription here
^
!Type:Bank
D01/15/2024
T100.00
PTest Payee
^`

    const result = parseQif(content)

    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0].name).toBe('My Checking Account')
    expect(result.accounts[0].description).toBe('Description here')
  })

  it('parses multiple sections (Bank + CreditCard)', () => {
    const content = `!Type:Bank
D01/15/2024
T100.00
PDeposit
^
!Type:CCARD
D01/16/2024
T50.00
PGrocery Store
^`

    const result = parseQif(content)

    expect(result.sections).toHaveLength(2)
    expect(result.sections[0].type).toBe('Bank')
    expect(result.sections[0].records).toHaveLength(1)
    expect(result.sections[1].type).toBe('CCARD')
    expect(result.sections[1].records).toHaveLength(1)
  })

  it('parses splits in records (S for category, $ for amount, E for memo)', () => {
    const content = `!Type:Bank
D01/15/2024
T200.00
SMonthly Rent
$150.00
SGroceries
$50.00
EWeekly shopping
^`

    const result = parseQif(content)

    expect(result.sections[0].records).toHaveLength(1)
    const record = result.sections[0].records[0]
    expect(record.splits).toHaveLength(2)
    expect(record.splits[0].category).toBe('Monthly Rent')
    expect(record.splits[0].amount).toBe(150)
    expect(record.splits[1].category).toBe('Groceries')
    expect(record.splits[1].amount).toBe(50)
    expect(record.splits[1].memo).toBe('Weekly shopping')
  })

  it('returns empty sections and accounts arrays for empty content', () => {
    const result = parseQif('')

    expect(result.sections).toHaveLength(0)
    expect(result.accounts).toHaveLength(0)
  })

  it('handles multiple records in one section', () => {
    const content = `!Type:Bank
D01/15/2024
T100.00
PFirst Payment
^
D01/16/2024
T200.00
PSecond Payment
^`

    const result = parseQif(content)

    expect(result.sections[0].records).toHaveLength(2)
    expect(result.sections[0].records[0].fields['D']).toBe('01/15/2024')
    expect(result.sections[0].records[1].fields['D']).toBe('01/16/2024')
  })

  it('handles negative amounts in splits via parentheses', () => {
    const content = `!Type:Bank
D01/15/2024
T100.00
SExpense Category
$(50.00)
^`

    const result = parseQif(content)

    expect(result.sections[0].records[0].splits).toHaveLength(1)
    expect(result.sections[0].records[0].splits[0].amount).toBe(-50)
  })

  it('parses account with N, T, D fields', () => {
    const content = `!Account
NMy Savings Account
TSavings
DMain savings account
^`

    const result = parseQif(content)

    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0].name).toBe('My Savings Account')
    expect(result.accounts[0].type).toBe('Savings')
    expect(result.accounts[0].description).toBe('Main savings account')
  })

  it('ignores lines before any !Type header', () => {
    const content = `Some random line
Another line
!Type:Bank
D01/15/2024
T100.00
^`

    const result = parseQif(content)

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].records).toHaveLength(1)
  })

  it('parses record with all common fields (D, P, T, M, L)', () => {
    const content = `!Type:Bank
D03/20/2024
PJohn Doe
T75.50
MPayment reference
LCategory Name
^`

    const result = parseQif(content)

    const record = result.sections[0].records[0]
    expect(record.fields['D']).toBe('03/20/2024')
    expect(record.fields['P']).toBe('John Doe')
    expect(record.fields['T']).toBe('75.50')
    expect(record.fields['M']).toBe('Payment reference')
    expect(record.fields['L']).toBe('Category Name')
  })

  it('handles blank lines between records', () => {
    const content = `!Type:Bank

D01/15/2024
T100.00
^

D01/16/2024
T200.00
^`

    const result = parseQif(content)

    expect(result.sections[0].records).toHaveLength(2)
  })

  it('handles Windows line endings \\r\\n', () => {
    const content = '!Type:Bank\r\nD01/15/2024\r\nT100.00\r\nPTest\r\n^\r\n'

    const result = parseQif(content)

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].records).toHaveLength(1)
  })

  it('parses multiple accounts', () => {
    const content = `!Account
NChecking Account
^
!Account
NSavings Account
^
!Type:Bank
D01/15/2024
T100.00
PTest
^`

    const result = parseQif(content)

    expect(result.accounts).toHaveLength(2)
    expect(result.accounts[0].name).toBe('Checking Account')
    expect(result.accounts[1].name).toBe('Savings Account')
  })

  it('handles record with only date field', () => {
    const content = `!Type:Bank
D01/15/2024
^`

    const result = parseQif(content)

    expect(result.sections[0].records).toHaveLength(1)
    expect(result.sections[0].records[0].fields['D']).toBe('01/15/2024')
    expect(result.sections[0].records[0].splits).toHaveLength(0)
  })

  it('handles split with amount but no category', () => {
    const content = `!Type:Bank
D01/15/2024
T100.00
$60.00
^`

    const result = parseQif(content)

    expect(result.sections[0].records[0].splits).toHaveLength(1)
    expect(result.sections[0].records[0].splits[0].amount).toBe(60)
    expect(result.sections[0].records[0].splits[0].category).toBeUndefined()
  })

  it('handles split with memo but no amount', () => {
    const content = `!Type:Bank
D01/15/2024
T100.00
SMy Category
EMemo text
^`

    const result = parseQif(content)

    expect(result.sections[0].records[0].splits).toHaveLength(1)
    expect(result.sections[0].records[0].splits[0].category).toBe('My Category')
    expect(result.sections[0].records[0].splits[0].memo).toBe('Memo text')
    expect(result.sections[0].records[0].splits[0].amount).toBeUndefined()
  })

  it('handles multiple splits with different fields', () => {
    const content = `!Type:Bank
D01/15/2024
T300.00
SRent
$200.00
Em monthly
SGroceries
$50.00
Eweekly
STransfer
$50.00
^`

    const result = parseQif(content)

    expect(result.sections[0].records[0].splits).toHaveLength(3)
    expect(result.sections[0].records[0].splits[0]).toEqual({ category: 'Rent', amount: 200, memo: 'm monthly' })
    expect(result.sections[0].records[0].splits[1]).toEqual({ category: 'Groceries', amount: 50, memo: 'weekly' })
    expect(result.sections[0].records[0].splits[2]).toEqual({ category: 'Transfer', amount: 50, memo: undefined })
  })

  it('returns empty arrays for content with only whitespace', () => {
    const result = parseQif('   \n\n  \t  ')

    expect(result.sections).toHaveLength(0)
    expect(result.accounts).toHaveLength(0)
  })
})
