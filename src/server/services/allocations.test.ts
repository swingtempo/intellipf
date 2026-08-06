import { describe, expect, it } from 'vitest'
import { classifyTicker } from '#/server/services/allocations'

describe('classifyTicker', () => {
  describe('Equity tickers', () => {
    it('returns Equity for QQQ', () => { expect(classifyTicker('QQQ')).toBe('Equity') })
    it('returns Equity for SPY', () => { expect(classifyTicker('SPY')).toBe('Equity') })
    it('returns Equity for VTI', () => { expect(classifyTicker('VTI')).toBe('Equity') })
    it('returns Equity for VOO', () => { expect(classifyTicker('VOO')).toBe('Equity') })
    it('returns Equity for IVV', () => { expect(classifyTicker('IVV')).toBe('Equity') })
    it('returns Equity for VXUS', () => { expect(classifyTicker('VXUS')).toBe('Equity') })
    it('returns Equity for EEM', () => { expect(classifyTicker('EEM')).toBe('Equity') })
    it('returns Equity for IWM', () => { expect(classifyTicker('IWM')).toBe('Equity') })
    it('returns Equity for SCHB', () => { expect(classifyTicker('SCHB')).toBe('Equity') })
    it('returns Equity for SCHX', () => { expect(classifyTicker('SCHX')).toBe('Equity') })
    it('returns Equity for VEA', () => { expect(classifyTicker('VEA')).toBe('Equity') })
    it('returns Equity for VT', () => { expect(classifyTicker('VT')).toBe('Equity') })

    it('handles lowercase equity tickers', () => {
      expect(classifyTicker('spy')).toBe('Equity')
      expect(classifyTicker('qqq')).toBe('Equity')
      expect(classifyTicker('vti')).toBe('Equity')
    })

    it('handles mixed-case equity tickers', () => {
      expect(classifyTicker('SpY')).toBe('Equity')
      expect(classifyTicker('QqQ')).toBe('Equity')
    })
  })

  describe('Fixed Income tickers', () => {
    it('returns Fixed Income for BND', () => { expect(classifyTicker('BND')).toBe('Fixed Income') })
    it('returns Fixed Income for AGG', () => { expect(classifyTicker('AGG')).toBe('Fixed Income') })
    it('returns Fixed Income for TLT', () => { expect(classifyTicker('TLT')).toBe('Fixed Income') })
    it('returns Fixed Income for IEI', () => { expect(classifyTicker('IEI')).toBe('Fixed Income') })
    it('returns Fixed Income for SHY', () => { expect(classifyTicker('SHY')).toBe('Fixed Income') })
    it('returns Fixed Income for LQD', () => { expect(classifyTicker('LQD')).toBe('Fixed Income') })
    it('returns Fixed Income for HYG', () => { expect(classifyTicker('HYG')).toBe('Fixed Income') })
    it('returns Fixed Income for MUB', () => { expect(classifyTicker('MUB')).toBe('Fixed Income') })
    it('returns Fixed Income for GOVT', () => { expect(classifyTicker('GOVT')).toBe('Fixed Income') })
    it('returns Fixed Income for VGSH', () => { expect(classifyTicker('VGSH')).toBe('Fixed Income') })
    it('returns Fixed Income for VGIT', () => { expect(classifyTicker('VGIT')).toBe('Fixed Income') })
    it('returns Fixed Income for VGLT', () => { expect(classifyTicker('VGLT')).toBe('Fixed Income') })
    it('returns Fixed Income for BSV', () => { expect(classifyTicker('BSV')).toBe('Fixed Income') })
    it('returns Fixed Income for BIV', () => { expect(classifyTicker('BIV')).toBe('Fixed Income') })
    it('returns Fixed Income for BLV', () => { expect(classifyTicker('BLV')).toBe('Fixed Income') })
    it('returns Fixed Income for VCIT', () => { expect(classifyTicker('VCIT')).toBe('Fixed Income') })
    it('returns Fixed Income for VCSH', () => { expect(classifyTicker('VCSH')).toBe('Fixed Income') })
    it('returns Fixed Income for BNDX', () => { expect(classifyTicker('BNDX')).toBe('Fixed Income') })
    it('returns Fixed Income for IEF', () => { expect(classifyTicker('IEF')).toBe('Fixed Income') })
    it('returns Fixed Income for TLH', () => { expect(classifyTicker('TLH')).toBe('Fixed Income') })

    it('handles lowercase fixed income tickers', () => {
      expect(classifyTicker('bnd')).toBe('Fixed Income')
      expect(classifyTicker('agg')).toBe('Fixed Income')
      expect(classifyTicker('tlt')).toBe('Fixed Income')
    })
  })

  describe('Commodities tickers', () => {
    it('returns Commodities for GLD', () => { expect(classifyTicker('GLD')).toBe('Commodities') })
    it('returns Commodities for SLV', () => { expect(classifyTicker('SLV')).toBe('Commodities') })
    it('returns Commodities for USO', () => { expect(classifyTicker('USO')).toBe('Commodities') })
    it('returns Commodities for DBA', () => { expect(classifyTicker('DBA')).toBe('Commodities') })
    it('returns Commodities for PDBC', () => { expect(classifyTicker('PDBC')).toBe('Commodities') })
    it('returns Commodities for COMT', () => { expect(classifyTicker('COMT')).toBe('Commodities') })
    it('returns Commodities for IAU', () => { expect(classifyTicker('IAU')).toBe('Commodities') })
    it('returns Commodities for GLDM', () => { expect(classifyTicker('GLDM')).toBe('Commodities') })

    it('handles lowercase commodities tickers', () => {
      expect(classifyTicker('gld')).toBe('Commodities')
      expect(classifyTicker('slv')).toBe('Commodities')
    })
  })

  describe('Real Estate tickers', () => {
    it('returns Real Estate for VNQ', () => { expect(classifyTicker('VNQ')).toBe('Real Estate') })
    it('returns Real Estate for VNQI', () => { expect(classifyTicker('VNQI')).toBe('Real Estate') })
    it('returns Real Estate for IYR', () => { expect(classifyTicker('IYR')).toBe('Real Estate') })
    it('returns Real Estate for XLRE', () => { expect(classifyTicker('XLRE')).toBe('Real Estate') })
    it('returns Real Estate for SCHH', () => { expect(classifyTicker('SCHH')).toBe('Real Estate') })
    it('returns Real Estate for REM', () => { expect(classifyTicker('REM')).toBe('Real Estate') })
    it('returns Real Estate for O', () => { expect(classifyTicker('O')).toBe('Real Estate') })

    it('handles lowercase real estate tickers', () => {
      expect(classifyTicker('vnq')).toBe('Real Estate')
      expect(classifyTicker('iyR')).toBe('Real Estate')
    })
  })

  describe('Cash & Equivalents tickers', () => {
    it('returns Cash & Equivalents for BIL', () => { expect(classifyTicker('BIL')).toBe('Cash & Equivalents') })
    it('returns Cash & Equivalents for SHV', () => { expect(classifyTicker('SHV')).toBe('Cash & Equivalents') })
    it('returns Cash & Equivalents for MINT', () => { expect(classifyTicker('MINT')).toBe('Cash & Equivalents') })
    it('returns Cash & Equivalents for SMMT', () => { expect(classifyTicker('SMMT')).toBe('Cash & Equivalents') })
    it('returns Cash & Equivalents for FZFXX', () => { expect(classifyTicker('FZFXX')).toBe('Cash & Equivalents') })
    it('returns Cash & Equivalents for SPRXX', () => { expect(classifyTicker('SPRXX')).toBe('Cash & Equivalents') })

    it('handles lowercase cash tickers', () => {
      expect(classifyTicker('bil')).toBe('Cash & Equivalents')
      expect(classifyTicker('shv')).toBe('Cash & Equivalents')
    })
  })

  describe('Alternative tickers', () => {
    it('returns Alternative for BTC', () => { expect(classifyTicker('BTC')).toBe('Alternative') })
    it('returns Alternative for ETH', () => { expect(classifyTicker('ETH')).toBe('Alternative') })
    it('returns Alternative for GBTC', () => { expect(classifyTicker('GBTC')).toBe('Alternative') })
    it('returns Alternative for BITO', () => { expect(classifyTicker('BITO')).toBe('Alternative') })
    it('returns Alternative for EETH', () => { expect(classifyTicker('EETH')).toBe('Alternative') })

    it('handles lowercase alternative tickers', () => {
      expect(classifyTicker('btc')).toBe('Alternative')
      expect(classifyTicker('eth')).toBe('Alternative')
    })
  })

  describe('IAU priority - COMMODITIES checked before ALTERNATIVE', () => {
    it('classifies IAU as Commodities (not Alternative)', () => {
      // IAU appears in both COMMODITIES and ALTERNATIVE arrays, but COMMODITIES is checked first
      expect(classifyTicker('IAU')).toBe('Commodities')
    })

    it('classifies iau as Commodities (lowercase)', () => {
      expect(classifyTicker('iau')).toBe('Commodities')
    })
  })

  describe('Fallback: ticker ending with X', () => {
    it('returns Equity for ABCX', () => { expect(classifyTicker('ABCX')).toBe('Equity') })
    it('returns Equity for XYZ', () => { expect(classifyTicker('XYZ')).toBe('Equity') })
    it('returns Equity for TESTX', () => { expect(classifyTicker('TESTX')).toBe('Equity') })

    it('handles lowercase ticker ending with x', () => {
      expect(classifyTicker('abcx')).toBe('Equity')
    })
  })

  describe('Fallback: short ticker (<=5 chars)', () => {
    it('returns Equity for ABCDE (5 chars)', () => { expect(classifyTicker('ABCDE')).toBe('Equity') })
    it('returns Equity for ABCD (4 chars)', () => { expect(classifyTicker('ABCD')).toBe('Equity') })
    it('returns Equity for ABC (3 chars)', () => { expect(classifyTicker('ABC')).toBe('Equity') })
    it('returns Equity for AB (2 chars)', () => { expect(classifyTicker('AB')).toBe('Equity') })
    it('returns Equity for A (1 char)', () => { expect(classifyTicker('A')).toBe('Equity') })
  })

  describe('Edge cases: empty/whitespace/null-like handling', () => {
    it('returns Other for empty string', () => { expect(classifyTicker('')).toBe('Other') })

    it('returns Other for whitespace-only string', () => { expect(classifyTicker('   ')).toBe('Other') })

    it('returns Other for tab/newline strings', () => { expect(classifyTicker('\t\n')).toBe('Other') })

    it('trims leading/trailing whitespace from valid tickers', () => {
      expect(classifyTicker('  SPY  ')).toBe('Equity')
      expect(classifyTicker('  bnd  ')).toBe('Fixed Income')
      expect(classifyTicker('\tGLD\t')).toBe('Commodities')
    })

    it('returns Other for unknown long ticker not ending with X', () => {
      expect(classifyTicker('UNKNOWN1234567890')).toBe('Other')
    })
  })

  describe('Known tickers take priority over fallback rules', () => {
    it('FZFXX is Cash & Equivalents (not Equity via length<=5 or endsWith X)', () => {
      expect(classifyTicker('FZFXX')).toBe('Cash & Equivalents')
    })

    it('SPRXX is Cash & Equivalents (not Equity via endsWith X)', () => {
      expect(classifyTicker('SPRXX')).toBe('Cash & Equivalents')
    })

    it('BNDX is Fixed Income (not Equity via endsWith X)', () => {
      expect(classifyTicker('BNDX')).toBe('Fixed Income')
    })

    it('VNQI is Real Estate (not Equity via length<=5 and ends with I not X)', () => {
      expect(classifyTicker('VNQI')).toBe('Real Estate')
    })
  })
})
