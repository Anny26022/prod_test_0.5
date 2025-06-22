import { supabase } from '../lib/supabase'
import { AuthService } from './authService'
import type { Trade, ChartImage, CapitalChange } from '../types/trade'
import { v4 as uuidv4 } from 'uuid'

// Simple hash function for browser compatibility
const simpleHash = (str: string): string => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

// Helper function to convert legacy trade IDs to UUIDs
const convertToUUID = (id: string): string => {
  // If it's already a valid UUID, return it
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (uuidRegex.test(id)) {
    return id
  }

  // For legacy IDs, create a deterministic UUID based on the original ID
  // This ensures the same legacy ID always maps to the same UUID
  const hash1 = simpleHash(id)
  const hash2 = simpleHash(id + '_salt1')
  const hash3 = simpleHash(id + '_salt2')
  const hash4 = simpleHash(id + '_salt3')

  // Format as UUID v4
  return [
    hash1.substr(0, 8),
    hash2.substr(0, 4),
    '4' + hash3.substr(0, 3), // Version 4
    ((parseInt(hash4.substr(0, 1), 16) & 0x3) | 0x8).toString(16) + hash4.substr(1, 3), // Variant bits
    (hash1 + hash2).substr(0, 12)
  ].join('-')
}

// Map to store legacy ID to UUID conversions
const idMappings = new Map<string, string>()

// Helper function to convert database row to Trade object
const dbRowToTrade = (row: any): Trade => {
  // Convert UUID back to original ID if it was mapped
  let originalId = row.id
  for (const [legacyId, uuid] of idMappings.entries()) {
    if (uuid === row.id) {
      originalId = legacyId
      break
    }
  }

  return {
    id: originalId,
    tradeNo: row.trade_no,
    date: row.date,
    name: row.name,
    entry: Number(row.entry || 0),
    avgEntry: Number(row.avg_entry || 0),
    sl: Number(row.sl || 0),
    tsl: Number(row.tsl || 0),
    buySell: row.buy_sell as 'Buy' | 'Sell',
    cmp: Number(row.cmp || 0),
    setup: row.setup || '',
    baseDuration: row.base_duration || '',
    initialQty: Number(row.initial_qty || 0),
    pyramid1Price: Number(row.pyramid1_price || 0),
    pyramid1Qty: Number(row.pyramid1_qty || 0),
    pyramid1Date: row.pyramid1_date || '',
    pyramid2Price: Number(row.pyramid2_price || 0),
    pyramid2Qty: Number(row.pyramid2_qty || 0),
    pyramid2Date: row.pyramid2_date || '',
    positionSize: Number(row.position_size || 0),
    allocation: Number(row.allocation || 0),
    slPercent: Number(row.sl_percent || 0),
    exit1Price: Number(row.exit1_price || 0),
    exit1Qty: Number(row.exit1_qty || 0),
    exit1Date: row.exit1_date || '',
    exit2Price: Number(row.exit2_price || 0),
    exit2Qty: Number(row.exit2_qty || 0),
    exit2Date: row.exit2_date || '',
    exit3Price: Number(row.exit3_price || 0),
    exit3Qty: Number(row.exit3_qty || 0),
    exit3Date: row.exit3_date || '',
    openQty: Number(row.open_qty || 0),
    exitedQty: Number(row.exited_qty || 0),
    avgExitPrice: Number(row.avg_exit_price || 0),
    stockMove: Number(row.stock_move || 0),
    rewardRisk: Number(row.reward_risk || 0),
    holdingDays: Number(row.holding_days || 0),
    positionStatus: row.position_status as 'Open' | 'Closed' | 'Partial',
    realisedAmount: Number(row.realised_amount || 0),
    plRs: Number(row.pl_rs || 0),
    pfImpact: Number(row.pf_impact || 0),
    cummPf: Number(row.cumm_pf || 0),
    planFollowed: Boolean(row.plan_followed),
    exitTrigger: row.exit_trigger || '',
    proficiencyGrowthAreas: row.proficiency_growth_areas || '',
    sector: row.sector || '',
    openHeat: Number(row.open_heat || 0),
    notes: row.notes || '',
    chartAttachments: row.chart_attachments || {},
    _userEditedFields: row.user_edited_fields || [],
    _cmpAutoFetched: Boolean(row.cmp_auto_fetched),
    _needsRecalculation: Boolean(row.needs_recalculation),
  }
}

// Helper function to convert Trade object to database insert/update format
const tradeToDbRow = (trade: Trade, userId: string) => {
  // Convert legacy ID to UUID and store mapping
  const uuid = convertToUUID(trade.id)
  idMappings.set(trade.id, uuid)

  return {
    id: uuid,
    user_id: userId,
    trade_no: trade.tradeNo,
    date: trade.date,
    name: trade.name,
    entry: trade.entry,
    avg_entry: trade.avgEntry,
    sl: trade.sl,
    tsl: trade.tsl,
    buy_sell: trade.buySell,
    cmp: trade.cmp,
    setup: trade.setup,
    base_duration: trade.baseDuration,
    initial_qty: trade.initialQty,
    pyramid1_price: trade.pyramid1Price,
    pyramid1_qty: trade.pyramid1Qty,
    pyramid1_date: trade.pyramid1Date || null,
    pyramid2_price: trade.pyramid2Price,
    pyramid2_qty: trade.pyramid2Qty,
    pyramid2_date: trade.pyramid2Date || null,
    position_size: trade.positionSize,
    allocation: trade.allocation,
    sl_percent: trade.slPercent,
    exit1_price: trade.exit1Price,
    exit1_qty: trade.exit1Qty,
    exit1_date: trade.exit1Date || null,
    exit2_price: trade.exit2Price,
    exit2_qty: trade.exit2Qty,
    exit2_date: trade.exit2Date || null,
    exit3_price: trade.exit3Price,
    exit3_qty: trade.exit3Qty,
    exit3_date: trade.exit3Date || null,
    open_qty: trade.openQty,
    exited_qty: trade.exitedQty,
    avg_exit_price: trade.avgExitPrice,
    stock_move: trade.stockMove,
    reward_risk: trade.rewardRisk,
    holding_days: trade.holdingDays,
    position_status: trade.positionStatus,
    realised_amount: trade.realisedAmount,
    pl_rs: trade.plRs,
    pf_impact: trade.pfImpact,
    cumm_pf: trade.cummPf,
    plan_followed: trade.planFollowed,
    exit_trigger: trade.exitTrigger,
    proficiency_growth_areas: trade.proficiencyGrowthAreas,
    sector: trade.sector,
    open_heat: trade.openHeat,
    notes: trade.notes,
    chart_attachments: trade.chartAttachments || {},
    user_edited_fields: trade._userEditedFields || [],
    cmp_auto_fetched: trade._cmpAutoFetched || false,
    needs_recalculation: trade._needsRecalculation || false,
  }
}

export class SupabaseService {
  // ===== TRADES =====
  
  static async getAllTrades(): Promise<Trade[]> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .order('trade_no', { ascending: true })

      if (error) throw error

      return data.map(dbRowToTrade)
    } catch (error) {
      console.error('❌ Failed to get trades from Supabase:', error)
      return []
    }
  }

  static async getTrade(id: string): Promise<Trade | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      // Convert legacy ID to UUID for lookup
      const uuid = convertToUUID(id)
      idMappings.set(id, uuid)

      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('id', uuid)
        .eq('user_id', userId)
        .single()

      if (error) throw error

      return data ? dbRowToTrade(data) : null
    } catch (error) {
      console.error('❌ Failed to get trade from Supabase:', error)
      return null
    }
  }

  static async saveTrade(trade: Trade): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const dbRow = tradeToDbRow(trade, userId)
      const uuid = dbRow.id

      // Check if trade exists using UUID
      const { data: existingTrade } = await supabase
        .from('trades')
        .select('id')
        .eq('id', uuid)
        .eq('user_id', userId)
        .single()

      if (existingTrade) {
        // Update existing trade
        const { error } = await supabase
          .from('trades')
          .update(dbRow)
          .eq('id', uuid)
          .eq('user_id', userId)

        if (error) throw error
      } else {
        // Insert new trade
        const { error } = await supabase
          .from('trades')
          .insert(dbRow)

        if (error) throw error
      }

      return true
    } catch (error) {
      console.error('❌ Failed to save trade to Supabase:', error)
      return false
    }
  }

  static async saveAllTrades(trades: Trade[]): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      // Delete all existing trades for the user
      const { error: deleteError } = await supabase
        .from('trades')
        .delete()
        .eq('user_id', userId)

      if (deleteError) throw deleteError

      // Convert all trades to database format with UUID conversion
      const dbRows = trades.map(trade => tradeToDbRow(trade, userId))

      // Insert all new trades in batches to avoid payload size limits
      const batchSize = 100
      for (let i = 0; i < dbRows.length; i += batchSize) {
        const batch = dbRows.slice(i, i + batchSize)
        const { error: insertError } = await supabase
          .from('trades')
          .insert(batch)

        if (insertError) throw insertError
      }

      console.log(`✅ Successfully saved ${trades.length} trades to Supabase`)
      return true
    } catch (error) {
      console.error('❌ Failed to save all trades to Supabase:', error)
      return false
    }
  }

  static async deleteTrade(id: string): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      // Convert legacy ID to UUID for deletion
      const uuid = convertToUUID(id)

      const { error } = await supabase
        .from('trades')
        .delete()
        .eq('id', uuid)
        .eq('user_id', userId)

      if (error) throw error

      // Remove from mapping
      idMappings.delete(id)

      console.log(`✅ Deleted trade: ${id}`)
      return true
    } catch (error) {
      console.error('❌ Failed to delete trade from Supabase:', error)
      return false
    }
  }

  // ===== USER PREFERENCES =====
  
  static async getUserPreferences(): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows returned

      return data || null
    } catch (error) {
      console.error('❌ Failed to get user preferences from Supabase:', error)
      return null
    }
  }

  static async saveUserPreferences(preferences: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          ...preferences,
          user_id: userId
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      return true
    } catch (error) {
      console.error('❌ Failed to save user preferences to Supabase:', error)
      return false
    }
  }

  // ===== PORTFOLIO DATA =====
  
  static async getPortfolioData(): Promise<any[]> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('portfolio_data')
        .select('*')
        .eq('user_id', userId)

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('❌ Failed to get portfolio data from Supabase:', error)
      return []
    }
  }

  static async savePortfolioData(data: any[]): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      // Delete existing portfolio data
      const { error: deleteError } = await supabase
        .from('portfolio_data')
        .delete()
        .eq('user_id', userId)

      if (deleteError) throw deleteError

      // Insert new portfolio data
      const dataWithUserId = data.map(item => ({ ...item, user_id: userId }))

      const { error: insertError } = await supabase
        .from('portfolio_data')
        .insert(dataWithUserId)

      if (insertError) throw insertError

      console.log(`✅ Saved ${data.length} portfolio records to Supabase`)
      return true
    } catch (error) {
      console.error('❌ Failed to save portfolio data to Supabase:', error)
      return false
    }
  }

  // ===== TRADE SETTINGS =====

  static async getTradeSettings(): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('trade_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get trade settings from Supabase:', error)
      return null
    }
  }

  static async saveTradeSettings(settings: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('trade_settings')
        .upsert({
          ...settings,
          user_id: userId
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      return true
    } catch (error) {
      console.error('❌ Failed to save trade settings to Supabase:', error)
      return false
    }
  }

  // ===== TAX DATA =====

  static async getTaxData(year: number): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('tax_data')
        .select('*')
        .eq('user_id', userId)
        .eq('year', year)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get tax data from Supabase:', error)
      return null
    }
  }

  static async saveTaxData(year: number, data: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('tax_data')
        .upsert({
          user_id: userId,
          year,
          data
        }, {
          onConflict: 'user_id,year'
        })

      if (error) throw error

      console.log(`✅ Saved tax data for year ${year}`)
      return true
    } catch (error) {
      console.error('❌ Failed to save tax data to Supabase:', error)
      return false
    }
  }

  // ===== MILESTONES DATA =====

  static async getMilestonesData(): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('milestones_data')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get milestones data from Supabase:', error)
      return null
    }
  }

  static async saveMilestonesData(achievements: any[]): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('milestones_data')
        .upsert({
          user_id: userId,
          achievements
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      console.log('✅ Saved milestones data to Supabase')
      return true
    } catch (error) {
      console.error('❌ Failed to save milestones data to Supabase:', error)
      return false
    }
  }

  // ===== MISC DATA =====

  static async getMiscData(key: string): Promise<any> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('misc_data')
        .select('value')
        .eq('user_id', userId)
        .eq('key', key)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data?.value || null
    } catch (error) {
      console.error('❌ Failed to get misc data from Supabase:', error)
      return null
    }
  }

  static async saveMiscData(key: string, value: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('misc_data')
        .upsert({
          user_id: userId,
          key,
          value
        }, {
          onConflict: 'user_id,key'
        })

      if (error) throw error

      return true
    } catch (error) {
      console.error('❌ Failed to save misc data to Supabase:', error)
      return false
    }
  }

  static async deleteMiscData(key: string): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('misc_data')
        .delete()
        .eq('user_id', userId)
        .eq('key', key)

      if (error) throw error

      console.log(`✅ Deleted misc data: ${key}`)
      return true
    } catch (error) {
      console.error('❌ Failed to delete misc data from Supabase:', error)
      return false
    }
  }

  // ===== CHART IMAGE BLOBS =====

  static async saveChartImageBlob(imageBlob: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('chart_image_blobs')
        .insert({ ...imageBlob, user_id: userId })

      if (error) throw error

      console.log(`📸 Saved chart image blob: ${imageBlob.filename} (${imageBlob.size_bytes} bytes)`)
      return true
    } catch (error) {
      console.error('❌ Failed to save chart image blob:', error)
      return false
    }
  }

  static async getChartImageBlob(blobId: string): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('chart_image_blobs')
        .select('*')
        .eq('user_id', userId)
        .eq('id', blobId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null
        }
        throw error
      }

      return data
    } catch (error) {
      console.error('❌ Failed to get chart image blob:', error)
      return null
    }
  }

  static async getChartImageBlob(id: string): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('chart_image_blobs')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get chart image blob:', error)
      return null
    }
  }

  static async getTradeChartImageBlobs(tradeId: string): Promise<any[]> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('chart_image_blobs')
        .select('*')
        .eq('trade_id', tradeId)
        .eq('user_id', userId)

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('❌ Failed to get trade chart image blobs:', error)
      return []
    }
  }

  static async deleteChartImageBlob(id: string): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('chart_image_blobs')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)

      if (error) throw error

      console.log(`🗑️ Deleted chart image blob: ${id}`)
      return true
    } catch (error) {
      console.error('❌ Failed to delete chart image blob:', error)
      return false
    }
  }

  static async deleteTradeChartImageBlobs(tradeId: string): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('chart_image_blobs')
        .delete()
        .eq('trade_id', tradeId)
        .eq('user_id', userId)

      if (error) throw error

      console.log(`🗑️ Deleted chart image blobs for trade: ${tradeId}`)
      return true
    } catch (error) {
      console.error('❌ Failed to delete trade chart image blobs:', error)
      return false
    }
  }

  static async updateChartImageBlobTradeId(blobId: string, newTradeId: string): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('chart_image_blobs')
        .update({ trade_id: newTradeId })
        .eq('id', blobId)
        .eq('user_id', userId)

      if (error) throw error

      console.log(`📸 Updated chart image blob trade ID: ${blobId} -> ${newTradeId}`)
      return true
    } catch (error) {
      console.error('❌ Failed to update chart image blob trade ID:', error)
      return false
    }
  }

  // ===== DASHBOARD CONFIG =====

  static async getDashboardConfig(): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('dashboard_config')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get dashboard config from Supabase:', error)
      return null
    }
  }

  static async saveDashboardConfig(config: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('dashboard_config')
        .upsert({
          user_id: userId,
          config
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      console.log('✅ Saved dashboard config to Supabase')
      return true
    } catch (error) {
      console.error('❌ Failed to save dashboard config to Supabase:', error)
      return false
    }
  }

  // ===== COMMENTARY DATA =====

  static async getCommentaryData(year: string): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('commentary_data')
        .select('*')
        .eq('user_id', userId)
        .eq('year', year)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get commentary data from Supabase:', error)
      return null
    }
  }

  static async saveCommentaryData(year: string, data: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('commentary_data')
        .upsert({
          user_id: userId,
          year,
          data
        }, {
          onConflict: 'user_id,year'
        })

      if (error) throw error

      console.log(`✅ Saved commentary data for year ${year}`)
      return true
    } catch (error) {
      console.error('❌ Failed to save commentary data to Supabase:', error)
      return false
    }
  }

  // ===== UTILITIES =====

  static async clearAllData(): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      // Delete all user data from all tables
      const tables = [
        'trades',
        'chart_image_blobs',
        'user_preferences',
        'portfolio_data',
        'tax_data',
        'milestones_data',
        'misc_data',
        'trade_settings',
        'dashboard_config',
        'commentary_data'
      ]

      for (const table of tables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('user_id', userId)

        if (error) throw error
      }

      console.log('✅ Cleared all user data from Supabase')
      return true
    } catch (error) {
      console.error('❌ Failed to clear all data from Supabase:', error)
      return false
    }
  }
}
