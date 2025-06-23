import { DatabaseService } from '../db/database'
import { SupabaseService } from './supabaseService'
import { AuthService } from './authService'

export interface MigrationProgress {
  step: string
  current: number
  total: number
  message: string
  completed: boolean
  error?: string
}

export type MigrationProgressCallback = (progress: MigrationProgress) => void

export class MigrationService {
  /**
   * Migrate all data from IndexedDB to Supabase
   */
  static async migrateToSupabase(
    onProgress?: MigrationProgressCallback
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if user is authenticated
      const isAuthenticated = await AuthService.isAuthenticated()
      if (!isAuthenticated) {
        return { success: false, error: 'User must be authenticated to migrate data' }
      }

      const steps = [
        'trades',
        'userPreferences',
        'portfolioData',
        'taxData',
        'milestonesData',
        'miscData',
        'chartImageBlobs'
      ]

      let currentStep = 0
      const totalSteps = steps.length

      const updateProgress = (step: string, message: string, error?: string) => {
        if (onProgress) {
          onProgress({
            step,
            current: currentStep,
            total: totalSteps,
            message,
            completed: currentStep === totalSteps,
            error
          })
        }
      }

      // Step 1: Migrate Trades
      currentStep++
      updateProgress('trades', 'Migrating trades...')

      try {
        const trades = await DatabaseService.getAllTrades()

        if (trades.length > 0) {
          const success = await SupabaseService.saveAllTrades(trades)
          if (!success) {
            throw new Error('Failed to save trades to Supabase')
          }
        }

        } catch (error) {
        const errorMsg = `Failed to migrate trades: ${error}`
        updateProgress('trades', errorMsg, errorMsg)
        return { success: false, error: errorMsg }
      }

      // Step 2: Migrate User Preferences
      currentStep++
      updateProgress('userPreferences', 'Migrating user preferences...')

      try {
        const preferences = await DatabaseService.getUserPreferences()
        if (preferences) {
          const success = await SupabaseService.saveUserPreferences(preferences)
          if (!success) {
            throw new Error('Failed to save user preferences to Supabase')
          }
        }
        } catch (error) {
        const errorMsg = `Failed to migrate user preferences: ${error}`
        updateProgress('userPreferences', errorMsg, errorMsg)
        return { success: false, error: errorMsg }
      }

      // Step 3: Migrate Portfolio Data
      currentStep++
      updateProgress('portfolioData', 'Migrating portfolio data...')

      try {
        const portfolioData = await DatabaseService.getPortfolioData()
        if (portfolioData && portfolioData.length > 0) {
          const success = await SupabaseService.savePortfolioData(portfolioData)
          if (!success) {
            throw new Error('Failed to save portfolio data to Supabase')
          }
        }
        } catch (error) {
        const errorMsg = `Failed to migrate portfolio data: ${error}`
        updateProgress('portfolioData', errorMsg, errorMsg)
        return { success: false, error: errorMsg }
      }

      // Step 4: Migrate Tax Data
      currentStep++
      updateProgress('taxData', 'Migrating tax data...')

      try {
        const taxData = await DatabaseService.getTaxData(new Date().getFullYear())
        if (taxData) {
          const success = await SupabaseService.saveTaxData(taxData.year, taxData.data)
          if (!success) {
            throw new Error(`Failed to save tax data for year ${taxData.year}`)
          }
        }
        } catch (error) {
        const errorMsg = `Failed to migrate tax data: ${error}`
        updateProgress('taxData', errorMsg, errorMsg)
        return { success: false, error: errorMsg }
      }

      // Step 5: Migrate Milestones Data
      currentStep++
      updateProgress('milestonesData', 'Migrating milestones data...')

      try {
        const milestonesData = await DatabaseService.getMilestonesData()
        if (milestonesData && milestonesData.achievements) {
          const success = await SupabaseService.saveMilestonesData(milestonesData.achievements)
          if (!success) {
            throw new Error('Failed to save milestones data to Supabase')
          }
        }
        } catch (error) {
        const errorMsg = `Failed to migrate milestones data: ${error}`
        updateProgress('milestonesData', errorMsg, errorMsg)
        return { success: false, error: errorMsg }
      }

      // Step 6: Migrate Misc Data
      currentStep++
      updateProgress('miscData', 'Migrating miscellaneous data...')

      try {
        // Get all misc data keys and migrate them
        const miscKeys = [
          'tradeSettings',
          'dashboardConfig',
          'commentaryData',
          'globalFilters',
          'chartSettings'
        ]

        for (const key of miscKeys) {
          try {
            const data = await DatabaseService.getMiscData(key)
            if (data !== null) {
              const success = await SupabaseService.saveMiscData(key, data)
              if (!success) {
                }
            }
          } catch (error) {
            }
        }
        } catch (error) {
        const errorMsg = `Failed to migrate miscellaneous data: ${error}`
        updateProgress('miscData', errorMsg, errorMsg)
        return { success: false, error: errorMsg }
      }

      // Step 7: Migrate Chart Image Blobs
      currentStep++
      updateProgress('chartImageBlobs', 'Migrating chart images...')

      try {
        const chartBlobs = await DatabaseService.getAllChartImageBlobs()

        for (const blob of chartBlobs) {
          const success = await SupabaseService.saveChartImageBlob(blob)
          if (!success) {
            }
        }
        } catch (error) {
        const errorMsg = `Failed to migrate chart images: ${error}`
        updateProgress('chartImageBlobs', errorMsg, errorMsg)
        return { success: false, error: errorMsg }
      }

      // Migration completed successfully
      updateProgress('completed', 'Migration completed successfully!')
      return { success: true }

    } catch (error) {
      const errorMsg = `Migration failed: ${error}`
      if (onProgress) {
        onProgress({
          step: 'error',
          current: 0,
          total: 0,
          message: errorMsg,
          completed: false,
          error: errorMsg
        })
      }

      return { success: false, error: errorMsg }
    }
  }

  /**
   * Check if there's existing data in IndexedDB that can be migrated
   * Only show migration for users with substantial data (trades, charts, portfolio)
   * NOT for users who only have preferences
   */
  static async hasDataToMigrate(): Promise<boolean> {
    try {
      const [trades, chartBlobs, portfolioData] = await Promise.all([
        DatabaseService.getAllTrades(),
        DatabaseService.getAllChartImageBlobs(),
        DatabaseService.getPortfolioData()
      ])

      // Check if there's any substantial data to migrate
      // Exclude users who only have preferences
      const hasTradeData = trades.length > 0
      const hasChartData = chartBlobs.length > 0
      const hasPortfolioInfo = portfolioData.length > 0

      // Only show migration if user has trades, charts, or portfolio data
      return hasTradeData || hasChartData || hasPortfolioInfo
    } catch (error) {
      return false
    }
  }

  /**
   * Get a summary of data that would be migrated
   */
  static async getMigrationSummary(): Promise<{
    trades: number
    chartImages: number
    hasPreferences: boolean
    hasPortfolioData: boolean
  }> {
    try {
      const [trades, chartBlobs, preferences, portfolioData] = await Promise.all([
        DatabaseService.getAllTrades(),
        DatabaseService.getAllChartImageBlobs(),
        DatabaseService.getUserPreferences(),
        DatabaseService.getPortfolioData()
      ])

      return {
        trades: trades.length,
        chartImages: chartBlobs.length,
        hasPreferences: !!preferences,
        hasPortfolioData: portfolioData.length > 0
      }
    } catch (error) {
      return {
        trades: 0,
        chartImages: 0,
        hasPreferences: false,
        hasPortfolioData: false
      }
    }
  }

  /**
   * Clear IndexedDB data after successful migration (optional)
   */
  static async clearIndexedDBData(): Promise<boolean> {
    try {
      await DatabaseService.clearAllData()
      return true
    } catch (error) {
      return false
    }
  }
}
