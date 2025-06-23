/**
 * Debug utility to identify trades causing numeric overflow
 * Use this to find problematic data before running the database migration
 */

import { Trade } from '../types/trade'
import { validateTradeForDatabase, validateTradesBatch } from './databaseValidation'

// Current database constraints (before migration)
const OLD_DB_CONSTRAINTS = {
  STANDARD_NUMERIC: 9999.9999,  // precision 8, scale 4
  LARGE_AMOUNT: 9999.9999,      // Same as standard before migration
  PERCENTAGE: 999.9999,         // Smaller percentage limit
  INTEGER: 999999
}

/**
 * Check if a trade would cause overflow with current database schema
 */
export function checkTradeOverflow(trade: Trade): {
  hasOverflow: boolean
  overflowFields: Array<{
    field: string
    value: number
    limit: number
    type: string
  }>
} {
  const overflowFields: Array<{
    field: string
    value: number
    limit: number
    type: string
  }> = []

  // Check all numeric fields against OLD constraints
  const checks = [
    // Price fields
    { field: 'entry', value: trade.entry, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    { field: 'avgEntry', value: trade.avgEntry, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    { field: 'sl', value: trade.sl, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    { field: 'tsl', value: trade.tsl, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    { field: 'cmp', value: trade.cmp, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    { field: 'pyramid1Price', value: trade.pyramid1Price, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    { field: 'pyramid2Price', value: trade.pyramid2Price, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    { field: 'exit1Price', value: trade.exit1Price, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    { field: 'exit2Price', value: trade.exit2Price, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    { field: 'exit3Price', value: trade.exit3Price, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    { field: 'avgExitPrice', value: trade.avgExitPrice, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'price' },
    
    // Quantity fields
    { field: 'initialQty', value: trade.initialQty, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'quantity' },
    { field: 'pyramid1Qty', value: trade.pyramid1Qty, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'quantity' },
    { field: 'pyramid2Qty', value: trade.pyramid2Qty, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'quantity' },
    { field: 'exit1Qty', value: trade.exit1Qty, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'quantity' },
    { field: 'exit2Qty', value: trade.exit2Qty, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'quantity' },
    { field: 'exit3Qty', value: trade.exit3Qty, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'quantity' },
    { field: 'openQty', value: trade.openQty, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'quantity' },
    { field: 'exitedQty', value: trade.exitedQty, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'quantity' },
    
    // Amount fields (these are most likely to overflow)
    { field: 'positionSize', value: trade.positionSize, limit: OLD_DB_CONSTRAINTS.LARGE_AMOUNT, type: 'amount' },
    { field: 'realisedAmount', value: trade.realisedAmount, limit: OLD_DB_CONSTRAINTS.LARGE_AMOUNT, type: 'amount' },
    { field: 'plRs', value: trade.plRs, limit: OLD_DB_CONSTRAINTS.LARGE_AMOUNT, type: 'amount' },
    
    // Percentage fields
    { field: 'allocation', value: trade.allocation, limit: OLD_DB_CONSTRAINTS.PERCENTAGE, type: 'percentage' },
    { field: 'slPercent', value: trade.slPercent, limit: OLD_DB_CONSTRAINTS.PERCENTAGE, type: 'percentage' },
    { field: 'pfImpact', value: trade.pfImpact, limit: OLD_DB_CONSTRAINTS.PERCENTAGE, type: 'percentage' },
    { field: 'cummPf', value: trade.cummPf, limit: OLD_DB_CONSTRAINTS.PERCENTAGE, type: 'percentage' },
    { field: 'stockMove', value: trade.stockMove, limit: OLD_DB_CONSTRAINTS.PERCENTAGE, type: 'percentage' },
    { field: 'openHeat', value: trade.openHeat, limit: OLD_DB_CONSTRAINTS.PERCENTAGE, type: 'percentage' },
    
    // Other numeric fields
    { field: 'rewardRisk', value: trade.rewardRisk, limit: OLD_DB_CONSTRAINTS.STANDARD_NUMERIC, type: 'ratio' },
  ]

  checks.forEach(check => {
    if (typeof check.value === 'number' && !isNaN(check.value)) {
      if (Math.abs(check.value) > check.limit) {
        overflowFields.push({
          field: check.field,
          value: check.value,
          limit: check.limit,
          type: check.type
        })
      }
    }
  })

  return {
    hasOverflow: overflowFields.length > 0,
    overflowFields
  }
}

/**
 * Analyze all trades and find overflow issues
 */
export function analyzeTradesForOverflow(trades: Trade[]): {
  totalTrades: number
  problematicTrades: number
  overflowSummary: {
    [fieldName: string]: {
      count: number
      maxValue: number
      trades: string[]
    }
  }
  detailedReport: Array<{
    trade: Trade
    overflowFields: Array<{
      field: string
      value: number
      limit: number
      type: string
    }>
  }>
} {
  const overflowSummary: {
    [fieldName: string]: {
      count: number
      maxValue: number
      trades: string[]
    }
  } = {}

  const detailedReport: Array<{
    trade: Trade
    overflowFields: Array<{
      field: string
      value: number
      limit: number
      type: string
    }>
  }> = []

  let problematicTrades = 0

  trades.forEach(trade => {
    const overflow = checkTradeOverflow(trade)
    
    if (overflow.hasOverflow) {
      problematicTrades++
      detailedReport.push({
        trade,
        overflowFields: overflow.overflowFields
      })

      overflow.overflowFields.forEach(field => {
        if (!overflowSummary[field.field]) {
          overflowSummary[field.field] = {
            count: 0,
            maxValue: 0,
            trades: []
          }
        }
        
        overflowSummary[field.field].count++
        overflowSummary[field.field].maxValue = Math.max(
          overflowSummary[field.field].maxValue,
          Math.abs(field.value)
        )
        overflowSummary[field.field].trades.push(
          `${trade.tradeNo} (${trade.name})`
        )
      })
    }
  })

  return {
    totalTrades: trades.length,
    problematicTrades,
    overflowSummary,
    detailedReport
  }
}

/**
 * Print a detailed overflow report to console
 */
export function printOverflowReport(trades: Trade[]): void {
  console.log('🔍 ANALYZING TRADES FOR NUMERIC OVERFLOW...')
  console.log('=' .repeat(60))
  
  const analysis = analyzeTradesForOverflow(trades)
  
  console.log(`📊 SUMMARY:`)
  console.log(`   Total trades: ${analysis.totalTrades}`)
  console.log(`   Problematic trades: ${analysis.problematicTrades}`)
  console.log(`   Success rate: ${((analysis.totalTrades - analysis.problematicTrades) / analysis.totalTrades * 100).toFixed(1)}%`)
  console.log('')

  if (analysis.problematicTrades === 0) {
    console.log('✅ No overflow issues found! All trades should save successfully.')
    return
  }

  console.log('❌ OVERFLOW ISSUES FOUND:')
  console.log('')

  // Print field-by-field summary
  Object.entries(analysis.overflowSummary).forEach(([fieldName, summary]) => {
    console.log(`🔴 Field: ${fieldName}`)
    console.log(`   Affected trades: ${summary.count}`)
    console.log(`   Max value found: ${summary.maxValue.toLocaleString()}`)
    console.log(`   Current limit: ${OLD_DB_CONSTRAINTS.STANDARD_NUMERIC.toLocaleString()}`)
    console.log(`   Sample trades: ${summary.trades.slice(0, 3).join(', ')}${summary.trades.length > 3 ? '...' : ''}`)
    console.log('')
  })

  console.log('🔧 SOLUTION:')
  console.log('1. Run the SQL migration script: supabase_numeric_overflow_fix.sql')
  console.log('2. This will increase database field limits to handle larger values')
  console.log('3. After migration, your trades should save successfully')
  console.log('')
  
  console.log('📋 DETAILED REPORT:')
  analysis.detailedReport.slice(0, 5).forEach((report, index) => {
    console.log(`${index + 1}. Trade: ${report.trade.tradeNo} (${report.trade.name})`)
    report.overflowFields.forEach(field => {
      console.log(`   - ${field.field}: ${field.value.toLocaleString()} (exceeds ${field.limit.toLocaleString()})`)
    })
    console.log('')
  })

  if (analysis.detailedReport.length > 5) {
    console.log(`... and ${analysis.detailedReport.length - 5} more trades with overflow issues`)
  }
}

/**
 * Quick check function you can call from browser console
 */
export function quickOverflowCheck(): void {
  // This function can be called from browser console to check current trades
  console.log('To use this function, call it with your trades array:')
  console.log('quickOverflowCheck(yourTradesArray)')
  console.log('')
  console.log('Example:')
  console.log('import { printOverflowReport } from "./src/utils/debugOverflow"')
  console.log('printOverflowReport(trades)')
}
