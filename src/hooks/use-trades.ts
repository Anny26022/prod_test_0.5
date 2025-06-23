import React from "react";
import { Trade } from "../types/trade";
import { mockTrades } from "../data/mock-trades";
import { useTruePortfolioWithTrades } from "./use-true-portfolio-with-trades";
import { useGlobalFilter } from "../context/GlobalFilterContext";
import { isInGlobalFilter } from "../utils/dateFilterUtils";
import { useAccountingMethod } from "../context/AccountingMethodContext";
import { getTradeDateForAccounting, getExitDatesWithFallback } from "../utils/accountingUtils";
import {
  calcAvgEntry,
  calcPositionSize,
  calcAllocation,
  calcSLPercent,
  calcOpenQty,
  calcExitedQty,
  calcAvgExitPrice,
  calcStockMove,
  calcRewardRisk,
  calcHoldingDays,
  calcRealisedAmount,
  calcPFImpact,
  calcRealizedPL_FIFO
} from "../utils/tradeCalculations";
import { calculateTradePL } from "../utils/accountingUtils";
import { SupabaseService } from "../services/supabaseService";
// Migrated from IndexedDB to Supabase with authentication

// Define SortDirection type compatible with HeroUI Table
type SortDirection = "ascending" | "descending";

export interface SortDescriptor {
  column: string;
  direction: SortDirection;
}

// Key for localStorage - Standardized to 'trades_data'
const STORAGE_KEY = 'trades_data';
const TRADE_SETTINGS_KEY = 'tradeSettings';
const MISC_DATA_PREFIX = 'misc_';

// Supabase helpers
async function getTradesFromSupabase(): Promise<Trade[]> {
  if (typeof window === 'undefined') return []; // In a server-side environment, return empty array

  try {
    console.log('📥 Loading trades from Supabase...')
    const trades = await SupabaseService.getAllTrades();
    console.log(`✅ Loaded ${trades.length} trades from Supabase`)
    return trades;
  } catch (error) {
    console.error('❌ Error loading trades from Supabase:', error)
    return []; // Always return empty array on error to prevent mock data
  }
}

async function saveTradesToSupabase(trades: Trade[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    console.log('🚀 Attempting to save trades to Supabase:', trades.length)
    const success = await SupabaseService.saveAllTrades(trades);

    if (success) {
      console.log('✅ Trades saved successfully to Supabase')
    } else {
      console.error('❌ Failed to save trades to Supabase')
    }

    return success;
  } catch (error) {
    console.error('❌ Error in saveTradesToSupabase:', error)
    return false;
  }
}

async function getTradeSettings() {
  if (typeof window === 'undefined') return null;
  try {
    const settings = await SupabaseService.getTradeSettings();
    return settings;
  } catch (error) {
    return null;
  }
}

async function saveTradeSettings(settings: any): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    return await SupabaseService.saveTradeSettings(settings);
  } catch (error) {
    return false;
  }
}

async function clearAllTradeAndSettingsData(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    // Clear all Supabase data
    const success = await SupabaseService.clearAllData();

    // Also clear any remaining localStorage data for legacy cleanup
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        keysToRemove.push(key);
      }
    }

    // Remove keys that match our patterns
    keysToRemove.forEach(key => {
      if (key.startsWith(MISC_DATA_PREFIX) ||
          key.startsWith('tradeBackup_') ||
          key.startsWith('tradeModal_') ||
          key === 'yearlyStartingCapitals' ||
          key === 'capitalChanges' ||
          key === 'monthlyStartingCapitalOverrides' ||
          key === 'globalFilter' ||
          key === 'heroui-theme' ||
          key === 'userPreferences' ||
          key === 'accountingMethod' ||
          key === 'dashboardConfig' ||
          key === 'milestones' ||
          key === 'achievements' ||
          key.includes('trade') ||
          key.includes('portfolio') ||
          key.includes('settings') ||
          key.includes('config')) {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          // Silent cleanup
        }
      }
    });

    // Clear sessionStorage as well
    try {
      sessionStorage.clear();
    } catch (error) {
      // Silent cleanup
    }

    return success;
  } catch (error) {
    return false;
  }
}

// Utility to recalculate all calculated fields for all trades
// This function is now a pure function and takes getTruePortfolioSize and accounting method as explicit arguments.
// Added skipExpensiveCalculations flag to optimize bulk imports
function recalculateAllTrades(
  trades: Trade[],
  getTruePortfolioSize: (month: string, year: number) => number,
  useCashBasis: boolean = false,
  skipExpensiveCalculations: boolean = false
): Trade[] {
  // Sort trades by date (or tradeNo as fallback) for cummPf calculation
  const sorted = [...trades].sort((a, b) => {
    if (a.date && b.date) {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    return (a.tradeNo || '').localeCompare(b.tradeNo || '');
  });

  let runningCummPf = 0;

  // If skipping expensive calculations, return trades with minimal processing
  if (skipExpensiveCalculations) {
    return sorted.map(trade => ({
      ...trade,
      name: (trade.name || '').toUpperCase(),
      // Keep existing calculated values or set minimal defaults
      avgEntry: trade.avgEntry || trade.entry || 0,
      positionSize: trade.positionSize || 0,
      allocation: trade.allocation || 0,
      slPercent: trade.slPercent || 0,
      openQty: trade.openQty || trade.initialQty || 0,
      exitedQty: trade.exitedQty || 0,
      avgExitPrice: trade.avgExitPrice || 0,
      stockMove: trade.stockMove || 0,
      holdingDays: trade.holdingDays || 0,
      realisedAmount: trade.realisedAmount || 0,
      plRs: trade.plRs || 0,
      pfImpact: trade.pfImpact || 0,
      cummPf: trade.cummPf || 0,
      // Mark as needing recalculation
      _needsRecalculation: true
    }));
  }

  // First pass for individual trade calculations
  const calculatedTrades = sorted.map((trade) => {
    // Original entry and pyramid entries for calculations
    const allEntries = [
      { price: Number(trade.entry || 0), qty: Number(trade.initialQty || 0) },
      { price: Number(trade.pyramid1Price || 0), qty: Number(trade.pyramid1Qty || 0) },
      { price: Number(trade.pyramid2Price || 0), qty: Number(trade.pyramid2Qty || 0) }
    ].filter(e => e.qty > 0 && e.price > 0); // Filter out entries with 0 qty or price

    const avgEntry = calcAvgEntry(allEntries);
    const totalInitialQty = allEntries.reduce((sum, e) => sum + e.qty, 0);
    const positionSize = calcPositionSize(avgEntry, totalInitialQty);

    // Get the true portfolio size for the trade's entry date (for allocation calculation)
    let tradePortfolioSize = 100000; // Default fallback
    if (trade.date && getTruePortfolioSize) { // Use the passed getTruePortfolioSize
      const tradeDate = new Date(trade.date);
      const month = tradeDate.toLocaleString('default', { month: 'short' });
      const year = tradeDate.getFullYear();
      try {
        tradePortfolioSize = getTruePortfolioSize(month, year) || 100000;
      } catch (error) {
        tradePortfolioSize = 100000; // Fallback
      }
    }

    const allocation = calcAllocation(positionSize, tradePortfolioSize);
    const slPercent = calcSLPercent(trade.sl, trade.entry);

    // Exit legs
    const allExits = [
      { price: Number(trade.exit1Price || 0), qty: Number(trade.exit1Qty || 0) },
      { price: Number(trade.exit2Price || 0), qty: Number(trade.exit2Qty || 0) },
      { price: Number(trade.exit3Price || 0), qty: Number(trade.exit3Qty || 0) }
    ].filter(e => e.qty > 0 && e.price > 0); // Filter out exits with 0 qty or price

    const exitedQty = allExits.reduce((sum, e) => sum + e.qty, 0);
    const openQty = totalInitialQty - exitedQty;
    const avgExitPrice = calcAvgExitPrice(allExits); // Avg price of actual exits

    const stockMove = calcStockMove(
      avgEntry,
      avgExitPrice,
      trade.cmp,
      openQty,
      exitedQty,
      trade.positionStatus,
      trade.buySell
    );

    const rewardRisk = calcRewardRisk(
      trade.cmp || avgExitPrice || trade.entry,
      trade.entry,
      trade.sl,
      trade.positionStatus,
      avgExitPrice,
      openQty,
      exitedQty,
      trade.buySell
    );

    const pyramidDates = [];
    if (trade.pyramid1Date && trade.pyramid1Qty) pyramidDates.push({ date: trade.pyramid1Date, qty: trade.pyramid1Qty });
    if (trade.pyramid2Date && trade.pyramid2Qty) pyramidDates.push({ date: trade.pyramid2Date, qty: trade.pyramid2Qty });

    const exitDatesForHolding = [];
    if (trade.exit1Date && trade.exit1Qty) exitDatesForHolding.push({ date: trade.exit1Date, qty: trade.exit1Qty });
    if (trade.exit2Date && trade.exit2Qty) exitDatesForHolding.push({ date: trade.exit2Date, qty: trade.exit2Qty });
    if (trade.exit3Date && trade.exit3Qty) exitDatesForHolding.push({ date: trade.exit3Date, qty: trade.exit3Qty });

    let primaryExitDateForHolding: string | null = null;
    if (allExits.length > 0) {
        const validExitDates = [trade.exit1Date, trade.exit2Date, trade.exit3Date].filter(Boolean) as string[];
        if (validExitDates.length > 0) {
            primaryExitDateForHolding = validExitDates.sort((a,b) => new Date(a).getTime() - new Date(b).getTime())[0];
        }
    }
    if (trade.positionStatus !== "Open" && !primaryExitDateForHolding && allExits.length > 0) {
        primaryExitDateForHolding = trade.date;
    }

    const holdingDays = calcHoldingDays(
        trade.date,
        primaryExitDateForHolding,
        pyramidDates,
        exitDatesForHolding
    );

    const realisedAmount = calcRealisedAmount(exitedQty, avgExitPrice);

    const entryLotsForFifo = allEntries.map(e => ({ price: e.price, qty: e.qty }));
    const exitLotsForFifo = allExits.map(e => ({ price: e.price, qty: e.qty }));

    const plRs = exitedQty > 0 ? calcRealizedPL_FIFO(entryLotsForFifo, exitLotsForFifo, trade.buySell as 'Buy' | 'Sell') : 0;

    // Calculate accounting-aware P/L and PF Impact using correct portfolio size
    const accountingAwarePL = calculateTradePL({...trade, plRs}, useCashBasis);
    const accountingAwarePortfolioSize = getTruePortfolioSize ?
      (() => {
        try {
          const relevantDate = getTradeDateForAccounting(trade, useCashBasis);
          const date = new Date(relevantDate);
          const month = date.toLocaleString('default', { month: 'short' });
          const year = date.getFullYear();
          return getTruePortfolioSize(month, year) || 100000;
        } catch {
          return 100000;
        }
      })() : 100000;
    const pfImpact = calcPFImpact(accountingAwarePL, accountingAwarePortfolioSize);

    const finalOpenQty = Math.max(0, openQty);

    // Destructure to omit openHeat if it exists on the trade object from localStorage
    const { openHeat, ...restOfTrade } = trade as any; // Use 'as any' for robust destructuring if openHeat might not exist

    // Calculate position status based on quantities ONLY if user has never manually set it
    let calculatedPositionStatus = restOfTrade.positionStatus; // Keep existing by default

    const hasUserEditedPositionStatus = restOfTrade._userEditedFields?.includes('positionStatus');
    if (!hasUserEditedPositionStatus) {
      // Auto-calculate position status only if user hasn't manually set it
      if (finalOpenQty <= 0 && exitedQty > 0) {
        calculatedPositionStatus = 'Closed';
      } else if (exitedQty > 0 && finalOpenQty > 0) {
        calculatedPositionStatus = 'Partial';
      } else {
        calculatedPositionStatus = 'Open';
      }

    }

    // Preserve user-controlled fields that should not be auto-updated
    const userControlledFields = ['positionStatus', 'buySell', 'setup', 'exitTrigger', 'proficiencyGrowthAreas', 'planFollowed', 'notes', 'tradeNo'];
    const preservedFields: Record<string, any> = {};

    userControlledFields.forEach(field => {
      if (restOfTrade._userEditedFields?.includes(field) && restOfTrade[field as keyof Trade] !== undefined) {
        preservedFields[field] = restOfTrade[field as keyof Trade];
      }
    });

    return {
      ...restOfTrade,
      // Apply calculated fields
      name: (restOfTrade.name || '').toUpperCase(),
      avgEntry,
      positionSize,
      allocation,
      slPercent,
      openQty: finalOpenQty,
      exitedQty,
      avgExitPrice,
      stockMove,
      holdingDays,
      realisedAmount,
      plRs,
      pfImpact,
      positionStatus: calculatedPositionStatus, // Use calculated or preserved status
      cummPf: 0, // Placeholder, will be updated in second pass
      // Preserve user-edited fields
      ...preservedFields,
      // Always preserve the user edit tracking
      _userEditedFields: restOfTrade._userEditedFields || []
    };
  });

  // Second pass for cumulative calculations like cummPf
  // Note: We'll calculate accounting-aware values at display time to improve performance
  return calculatedTrades.map((trade, idx) => {
    if (idx === 0) runningCummPf = 0; // Reset for each fresh calculation run

    // For cumulative PF, we still need to calculate based on accounting method
    // but we'll store both accrual and cash basis values to avoid recalculation
    const accrualPL = trade.plRs || 0;
    const cashPL = calculateTradePL(trade, true); // Cash basis P/L

    // Helper function to get portfolio size based on accounting method
    const getPortfolioSizeForAccounting = (useCashBasisForCalc: boolean) => {
      if (!getTruePortfolioSize) return 100000;

      try {
        const relevantDate = getTradeDateForAccounting(trade, useCashBasisForCalc);
        const date = new Date(relevantDate);
        const month = date.toLocaleString('default', { month: 'short' });
        const year = date.getFullYear();
        return getTruePortfolioSize(month, year) || 100000;
      } catch {
        return 100000;
      }
    };

    // Get portfolio sizes for both accounting methods
    const accrualPortfolioSize = getPortfolioSizeForAccounting(false); // Entry date portfolio
    const cashPortfolioSize = getPortfolioSizeForAccounting(true);     // Exit date portfolio

    // Calculate PF impact using correct portfolio size for each method
    const accrualPfImpact = trade.positionStatus !== 'Open' ?
      calcPFImpact(accrualPL, accrualPortfolioSize) : 0;
    const cashPfImpact = trade.positionStatus !== 'Open' ?
      calcPFImpact(cashPL, cashPortfolioSize) : 0;

    // Use the appropriate method for cumulative calculation
    const currentPfImpact = useCashBasis ? cashPfImpact : accrualPfImpact;
    runningCummPf += currentPfImpact;

    // Store both values to avoid recalculation at display time
    return {
      ...trade,
      // Store both accounting method values
      _accrualPL: accrualPL,
      _cashPL: cashPL,
      _accrualPfImpact: accrualPfImpact,
      _cashPfImpact: cashPfImpact,
      cummPf: runningCummPf,
    };
  });
}

// Define ALL_COLUMNS here, as it's closely tied to the hook's state
const ALL_COLUMNS = [
  'tradeNo', 'date', 'name', 'setup', 'buySell', 'entry', 'sl', 'slPercent', 'tsl', 'cmp',
  'initialQty', 'pyramid1Price', 'pyramid1Qty', 'pyramid1Date', 'pyramid2Price', 'pyramid2Qty', 'pyramid2Date',
  'positionSize', 'allocation', 'exit1Price', 'exit1Qty', 'exit1Date', 'exit2Price', 'exit2Qty', 'exit2Date',
  'exit3Price', 'exit3Qty', 'exit3Date', 'openQty', 'exitedQty', 'avgExitPrice', 'stockMove', 'openHeat',
  'rewardRisk', 'holdingDays', 'positionStatus', 'realisedAmount', 'plRs', 'pfImpact', 'cummPf',
  'planFollowed', 'exitTrigger', 'proficiencyGrowthAreas', 'unrealizedPL', 'actions', 'notes'
];

// All columns enabled by default as requested
const DEFAULT_VISIBLE_COLUMNS = [
  'tradeNo', 'date', 'name', 'setup', 'buySell', 'entry', 'avgEntry', 'sl', 'slPercent', 'tsl', 'cmp',
  'initialQty', 'pyramid1Price', 'pyramid1Qty', 'pyramid1Date', 'pyramid2Price', 'pyramid2Qty', 'pyramid2Date',
  'positionSize', 'allocation', 'exit1Price', 'exit1Qty', 'exit1Date', 'exit2Price', 'exit2Qty', 'exit2Date',
  'exit3Price', 'exit3Qty', 'exit3Date', 'openQty', 'exitedQty', 'avgExitPrice', 'stockMove', 'openHeat',
  'rewardRisk', 'holdingDays', 'positionStatus', 'realisedAmount', 'plRs', 'pfImpact', 'cummPf',
  'planFollowed', 'exitTrigger', 'proficiencyGrowthAreas', 'chartAttachments', 'actions', 'unrealizedPL', 'notes'
];

export const useTrades = () => {
  const [trades, setTrades] = React.useState<Trade[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRecalculating, setIsRecalculating] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [sortDescriptor, setSortDescriptor] = React.useState<SortDescriptor>({ column: 'tradeNo', direction: 'ascending' });
  const [visibleColumns, setVisibleColumns] = React.useState<string[]>(DEFAULT_VISIBLE_COLUMNS);
  const { filter: globalFilter } = useGlobalFilter();
  const { accountingMethod } = useAccountingMethod();
  const useCashBasis = accountingMethod === 'cash';

  // Track previous accounting method to avoid unnecessary recalculations
  const prevAccountingMethodRef = React.useRef<string>(accountingMethod);

  // Get true portfolio functions - use empty array to avoid circular dependency
  const { portfolioSize, getPortfolioSize } = useTruePortfolioWithTrades([]);

  // Memoize the recalculation helper that wraps the pure `recalculateAllTrades` function.
  // Use a stable reference to getPortfolioSize to prevent infinite loops
  const stableGetPortfolioSize = React.useCallback((month: string, year: number) => {
    return getPortfolioSize(month, year);
  }, [getPortfolioSize]);

  const recalculateTradesWithCurrentPortfolio = React.useCallback((tradesToRecalculate: Trade[], skipExpensiveCalculations: boolean = false) => {
    return recalculateAllTrades(tradesToRecalculate, stableGetPortfolioSize, useCashBasis, skipExpensiveCalculations);
  }, [stableGetPortfolioSize, useCashBasis]);

  // Performance optimization: Cache expensive calculations
  const calculationCache = React.useRef(new Map<string, any>());
  const lastCalculationHash = React.useRef<string>('');

  // PERFORMANCE OPTIMIZATION: Smart memoization with incremental updates
  const processedTrades = React.useMemo(() => {
    const startTime = performance.now();

    // Create a lightweight hash for change detection
    const currentHash = `${trades.length}-${searchQuery}-${statusFilter}-${sortDescriptor.column}-${sortDescriptor.direction}-${globalFilter}-${accountingMethod}`;

    // Return cached result if nothing changed
    if (currentHash === lastCalculationHash.current && calculationCache.current.has('processedTrades')) {
      const cached = calculationCache.current.get('processedTrades');
      console.log(`⚡ Processed trades from cache in ${Math.round(performance.now() - startTime)}ms`);
      return cached;
    }

    let filtered = trades;

    // Optimized search filter with early termination
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(trade => {
        // Check most common fields first for early termination
        return trade.name?.toLowerCase().includes(query) ||
               trade.tradeNo?.toLowerCase().includes(query) ||
               trade.setup?.toLowerCase().includes(query) ||
               trade.notes?.toLowerCase().includes(query);
      });
    }

    // Apply status filter (most selective first)
    if (statusFilter) {
      filtered = filtered.filter(trade => trade.positionStatus === statusFilter);
    }

    // Apply global date filter with optimized date checking
    if (globalFilter && globalFilter !== 'all') {
      filtered = filtered.filter(trade => isInGlobalFilter(trade, globalFilter));
    }

    // Optimized sorting with stable sort
    if (sortDescriptor.column) {
      const column = sortDescriptor.column as keyof Trade;
      const isDescending = sortDescriptor.direction === 'descending';

      filtered = [...filtered].sort((a, b) => {
        const aValue = a[column];
        const bValue = b[column];

        // Handle null/undefined values
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return isDescending ? 1 : -1;
        if (bValue == null) return isDescending ? -1 : 1;

        // Optimized comparison
        let result = 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          result = aValue - bValue;
        } else {
          result = String(aValue).localeCompare(String(bValue));
        }

        return isDescending ? -result : result;
      });
    }

    // Cache the result
    calculationCache.current.set('processedTrades', filtered);
    lastCalculationHash.current = currentHash;

    const endTime = performance.now();
    console.log(`⚡ Processed ${filtered.length} trades in ${Math.round(endTime - startTime)}ms`);

    return filtered;
  }, [trades, searchQuery, statusFilter, sortDescriptor, globalFilter, accountingMethod]);

  // Memory usage monitor
  React.useEffect(() => {
    const checkMemoryUsage = () => {
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        const usedMB = memInfo.usedJSHeapSize / 1024 / 1024;
        const limitMB = memInfo.jsHeapSizeLimit / 1024 / 1024;

        if (usedMB > limitMB * 0.8) { // If using more than 80% of available memory

          // Force garbage collection if available
          if (window.gc) {
            try {
              window.gc();

            } catch (error) {

            }
          }
        }
      }
    };

    const interval = setInterval(checkMemoryUsage, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Performance optimization: Cache for expensive calculations
  const tradesCache = React.useRef(new Map<string, Trade[]>());
  const settingsCache = React.useRef<any>(null);
  const lastLoadTime = React.useRef<number>(0);

  // Load from Supabase with aggressive caching and background processing
  React.useEffect(() => {
    const loadData = async () => {
      const startTime = performance.now();

      // Check if we have recent cached data (within 30 seconds)
      const now = Date.now();
      if (now - lastLoadTime.current < 30000 && tradesCache.current.has('trades')) {
        const cachedTrades = tradesCache.current.get('trades')!;
        setTrades(cachedTrades);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        // Load data in parallel for maximum speed
        const [loadedTrades, settings] = await Promise.all([
          getTradesFromSupabase(),
          settingsCache.current || getTradeSettings()
        ]);

        // Cache settings for future use
        if (settings) {
          settingsCache.current = settings;
        }

        // CRITICAL PERFORMANCE OPTIMIZATION:
        // Skip expensive calculations on initial load - do them in background
        const quickTrades = loadedTrades.length > 0 ?
          recalculateTradesWithCurrentPortfolio(loadedTrades, true) : []; // Skip expensive calculations

        // Extract settings values
        const savedSearchQuery = settings?.search_query || '';
        const savedStatusFilter = settings?.status_filter || '';

        // Set state immediately with quick calculations for instant UI
        setTrades(quickTrades);
        setSearchQuery(savedSearchQuery);
        setStatusFilter(savedStatusFilter);
        setSortDescriptor(settings?.sort_descriptor || { column: 'tradeNo', direction: 'ascending' });
        setVisibleColumns(settings?.visible_columns || DEFAULT_VISIBLE_COLUMNS);

        // Cache the data
        tradesCache.current.set('trades', quickTrades);
        lastLoadTime.current = now;

        // Mark as loaded immediately for fast UI
        setIsLoading(false);

        // BACKGROUND PROCESSING: Do full calculations after UI is ready
        setTimeout(async () => {
          if (loadedTrades.length > 0) {
            const fullyCalculatedTrades = recalculateTradesWithCurrentPortfolio(loadedTrades, false);
            setTrades(fullyCalculatedTrades);
            tradesCache.current.set('trades', fullyCalculatedTrades);
          }
        }, 100); // Small delay to let UI render first

      } catch (error) {
        console.error('Failed to load trades:', error);
        setTrades([]);
      } finally {
        const endTime = performance.now();
        console.log(`⚡ Trade loading completed in ${Math.round(endTime - startTime)}ms`);
      }
    };

    loadData();
  }, []); // Empty dependency array means it runs only once on mount.

  // Save trade settings to IndexedDB
  React.useEffect(() => {
    if (!isLoading) {
      const settings = {
        search_query: searchQuery,
        status_filter: statusFilter,
        sort_descriptor: sortDescriptor,
        visible_columns: visibleColumns
      };
      saveTradeSettings(settings);
    }
  }, [searchQuery, statusFilter, sortDescriptor, visibleColumns, isLoading]);

  // DISABLED: This effect was causing race conditions with user input
  // localStorage saving is now handled directly in updateTrade, addTrade, deleteTrade functions
  // React.useEffect(() => {
  //   if (trades.length > 0 || !isLoading) {
  //     const timeoutId = setTimeout(() => {
  //       saveTradesToLocalStorage(trades);
  //     }, 100);
  //     return () => clearTimeout(timeoutId);
  //   }
  // }, [trades, isLoading]);

  // Recalculate trades when accounting method changes (optimized to prevent excessive re-renders)
  React.useEffect(() => {
    // Only recalculate if accounting method actually changed
    if (prevAccountingMethodRef.current !== accountingMethod && !isLoading && trades.length > 0) {

      // Debounce the recalculation to prevent rapid successive calls
      const timeoutId = setTimeout(() => {
        // Use the pure function directly to avoid circular dependency
        const recalculatedTrades = recalculateAllTrades(trades, stableGetPortfolioSize, useCashBasis, false);
        setTrades(recalculatedTrades);
      }, 100); // Small delay to batch any rapid changes

      // Update the ref to track the new accounting method
      prevAccountingMethodRef.current = accountingMethod;

      return () => clearTimeout(timeoutId);
    }
  }, [accountingMethod]); // Only depend on accounting method to avoid circular dependencies

  const addTrade = React.useCallback(async (trade: Trade) => {
    // CRITICAL FIX: Update chart blob tradeIds if this trade has chart attachments
    if (trade.chartAttachments && (trade.chartAttachments.beforeEntry || trade.chartAttachments.afterExit)) {
      try {
        // Update beforeEntry blob if exists
        if (trade.chartAttachments.beforeEntry?.storage === 'blob' && trade.chartAttachments.beforeEntry.blobId) {
          await SupabaseService.updateChartImageBlobTradeId(trade.chartAttachments.beforeEntry.blobId, trade.id);
          }

        // Update afterExit blob if exists
        if (trade.chartAttachments.afterExit?.storage === 'blob' && trade.chartAttachments.afterExit.blobId) {
          await SupabaseService.updateChartImageBlobTradeId(trade.chartAttachments.afterExit.blobId, trade.id);
          }
      } catch (error) {
        }
    }

    setTrades(prev => {
      // Add new trade to the array
      const combinedTrades = [...prev, trade];

      // Sort all trades by date to ensure proper chronological order (with safe date parsing)
      combinedTrades.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);

        // Handle invalid dates by putting them at the end
        if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;

        return dateA.getTime() - dateB.getTime();
      });

      // Reassign sequential trade numbers based on chronological order
      combinedTrades.forEach((t, index) => {
        t.tradeNo = String(index + 1);
      });

      // Use the memoized recalculation helper
      const newTrades = recalculateTradesWithCurrentPortfolio(combinedTrades);
      // Persist to Supabase asynchronously
      saveTradesToSupabase(newTrades).then(success => {
        if (!success) {
          }
      }).catch(error => {
        });

      return newTrades;
    });
  }, [recalculateTradesWithCurrentPortfolio]); // Dependency on the memoized helper

  // Debounced update function to prevent excessive recalculations
  const debouncedRecalculateRef = React.useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = React.useRef<Map<string, Trade>>(new Map());
  const updateCallbacksRef = React.useRef<Map<string, () => void>>(new Map());

  const updateTrade = React.useCallback(async (updatedTrade: Trade, onComplete?: () => void) => {
    // CRITICAL FIX: Update chart blob tradeIds if this trade has chart attachments
    if (updatedTrade.chartAttachments && (updatedTrade.chartAttachments.beforeEntry || updatedTrade.chartAttachments.afterExit)) {
      try {
        // Update beforeEntry blob if exists
        if (updatedTrade.chartAttachments.beforeEntry?.storage === 'blob' && updatedTrade.chartAttachments.beforeEntry.blobId) {
          await SupabaseService.updateChartImageBlobTradeId(updatedTrade.chartAttachments.beforeEntry.blobId, updatedTrade.id);
          }

        // Update afterExit blob if exists
        if (updatedTrade.chartAttachments.afterExit?.storage === 'blob' && updatedTrade.chartAttachments.afterExit.blobId) {
          await SupabaseService.updateChartImageBlobTradeId(updatedTrade.chartAttachments.afterExit.blobId, updatedTrade.id);
          }
      } catch (error) {
        }
    }

    // Store pending update
    pendingUpdatesRef.current.set(updatedTrade.id, updatedTrade);
    // Store callback if provided
    if (onComplete) {
      updateCallbacksRef.current.set(updatedTrade.id, onComplete);
    }

    // Clear existing debounce timer
    if (debouncedRecalculateRef.current) {
      clearTimeout(debouncedRecalculateRef.current);
      }

    // Schedule debounced recalculation
    debouncedRecalculateRef.current = setTimeout(() => {
      // Get all pending updates and callbacks
      const pendingUpdates = Array.from(pendingUpdatesRef.current.values());
      const callbacks = Array.from(updateCallbacksRef.current.values());
      // Clear pending updates and callbacks
      pendingUpdatesRef.current.clear();
      updateCallbacksRef.current.clear();

      // Apply all pending updates and recalculate
      setTrades(currentTrades => {
        const updatedTrades = currentTrades.map(trade => {
          // CRITICAL FIX: Handle cash basis expanded trade IDs
          // Find pending updates by checking both exact ID match and original ID match
          const pendingUpdate = pendingUpdates.find(update => {
            // Direct match (for accrual basis or exact expanded trade match)
            if (update.id === trade.id) return true;

            // Original ID match (for cash basis expanded trades)
            const originalUpdateId = update.id.includes('_exit_') ? update.id.split('_exit_')[0] : update.id;
            const originalTradeId = trade.id.includes('_exit_') ? trade.id.split('_exit_')[0] : trade.id;

            // Match if both resolve to the same original trade ID
            return originalUpdateId === originalTradeId;
          });

          if (pendingUpdate) {
            // CRITICAL: For cash basis updates, we need to merge the changes into the original tradeiginal trade
            // but preserve the original trade ID (not the expanded ID)
            const updatedTrade = { ...pendingUpdate, id: trade.id };
            return updatedTrade;
          }
          return trade;
        });

        const recalculatedTrades = recalculateTradesWithCurrentPortfolio(updatedTrades);

        saveTradesToSupabase(recalculatedTrades).then(saveSuccess => {
          });

        // Execute all callbacks after update is complete
        callbacks.forEach(callback => {
          try {
            callback();
          } catch (error) {
            }
        });

        return recalculatedTrades;
      });
    }, 200); // Reduced to 200ms to prevent race conditions with user input
  }, [recalculateTradesWithCurrentPortfolio]);

  const deleteTrade = React.useCallback(async (id: string) => {
    // CRITICAL FIX: Handle cash basis expanded trade IDs
    // Extract original trade ID from expanded IDs like "original_id_exit_0"
    const originalTradeId = id.includes('_exit_') ? id.split('_exit_')[0] : id;

    // First, delete associated chart images
    try {
      const { ChartImageService } = await import('../services/chartImageService');
      const chartImagesDeleted = await ChartImageService.deleteTradeChartImages(originalTradeId);
      } catch (error) {
      // Continue with trade deletion even if chart deletion fails
    }

    setTrades(prev => {
      // Find the trade to delete using the original ID
      const tradeToDelete = prev.find(trade => trade.id === originalTradeId);
      if (!tradeToDelete) {
        console.warn('Trade not found for deletion:', originalTradeId);
        return prev; // Return unchanged if trade not found
      }

      // Filter out the trade using the original ID
      const filteredTrades = prev.filter(trade => trade.id !== originalTradeId);
      // Use the memoized recalculation helper
      const newTrades = recalculateTradesWithCurrentPortfolio(filteredTrades);
      // Persist to Supabase
      saveTradesToSupabase(newTrades).then(saveSuccess => {
        });

      return newTrades;
    });
  }, [recalculateTradesWithCurrentPortfolio]);

  // Bulk import function for better performance with optimized calculations
  const bulkImportTrades = React.useCallback((importedTrades: Trade[]) => {
    const startTime = performance.now();

    setTrades(prev => {
      // Combine existing trades with imported trades
      const combinedTrades = [...importedTrades, ...prev];

      // Sort all trades by date to ensure proper chronological order (with safe date parsing)
      combinedTrades.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);

        // Handle invalid dates by putting them at the end
        if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;

        return dateA.getTime() - dateB.getTime();
      });

      // Reassign sequential trade numbers based on chronological order
      combinedTrades.forEach((trade, index) => {
        trade.tradeNo = String(index + 1);
      });

      // First pass: Skip expensive calculations for faster import
      const quickProcessedTrades = recalculateTradesWithCurrentPortfolio(combinedTrades, true);
      // Save to Supabase asynchronously
      saveTradesToSupabase(quickProcessedTrades).then(success => {
        });

      const endTime = performance.now();
      // Schedule full recalculation in the background after a short delay
      setTimeout(() => {
        const recalcStartTime = performance.now();
        setIsRecalculating(true);

        setTrades(currentTrades => {
          const fullyCalculatedTrades = recalculateTradesWithCurrentPortfolio(currentTrades, false);
          // Save fully calculated trades to Supabase
          saveTradesToSupabase(fullyCalculatedTrades).then(success => {
            });

          const recalcEndTime = performance.now();

          setIsRecalculating(false);
          return fullyCalculatedTrades;
        });
      }, 100); // Small delay to allow UI to update

      return quickProcessedTrades;
    });
  }, [recalculateTradesWithCurrentPortfolio]);

  const clearAllTrades = React.useCallback(async () => {
    const success = await clearAllTradeAndSettingsData();

    if (success) {
      // Reset all React state to initial values
      setTrades([]);
      setSearchQuery('');
      setStatusFilter('');
      setSortDescriptor({ column: 'tradeNo', direction: 'ascending' });
      setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
      setIsLoading(false);

      // Force garbage collection if available (Chrome DevTools)
      if (window.gc) {
        try {
          window.gc();
          } catch (error) {
          }
      }

      // Clear any cached data in memory
      if (typeof window !== 'undefined') {
        // Clear any global variables that might hold trade data
        (window as any).tradeCache = undefined;
        (window as any).portfolioCache = undefined;
        (window as any).settingsCache = undefined;
      }

      return true;
    }

    return false;
  }, []);

  // Helper function to get accounting-aware values for display (FIXED - always calculate)
  const getAccountingAwareValues = React.useCallback((trade: Trade) => {
    // CRITICAL FIX: For cash basis, properly handle expanded trades to get total P/L
    let plRs = 0;
    let realisedAmount = 0;

    if (useCashBasis && trade._expandedTrades && trade._expandedTrades.length > 0) {
      // For cash basis with expanded trades, sum up all exit P/L and values
      plRs = trade._expandedTrades.reduce((sum, expandedTrade) => {
        return sum + calculateTradePL(expandedTrade, true);
      }, 0);

      realisedAmount = trade._expandedTrades.reduce((sum, expandedTrade) => {
        if (expandedTrade._cashBasisExit) {
          const exitValue = expandedTrade._cashBasisExit.qty * expandedTrade._cashBasisExit.price;
          return sum + exitValue;
        }
        return sum;
      }, 0);
    } else {
      // For accrual basis or trades without expanded data, use the standard calculation
      plRs = calculateTradePL(trade, useCashBasis);
      realisedAmount = trade.realisedAmount || (trade.exitedQty * trade.avgExitPrice) || 0;
    }

    // Calculate portfolio impact based on the calculated P/L
    const currentPortfolioSize = getPortfolioSize ?
      (() => {
        const tradeDate = new Date(trade.date);
        const month = tradeDate.toLocaleString('default', { month: 'short' });
        const year = tradeDate.getFullYear();
        return getPortfolioSize(month, year);
      })() : portfolioSize;

    const pfImpact = currentPortfolioSize > 0 ? (plRs / currentPortfolioSize) * 100 : 0;

    return {
      plRs,
      realisedAmount,
      pfImpact,
    };
  }, [useCashBasis, calculateTradePL, getPortfolioSize, portfolioSize]);

  // Helper function to group expanded trades for display
  const groupTradesForDisplay = React.useCallback((expandedTrades: Trade[]) => {
    if (!useCashBasis) return expandedTrades;

    const groupedMap = new Map<string, Trade>();
    const expandedTradesMap = new Map<string, Trade[]>();

    expandedTrades.forEach(trade => {
      const originalId = trade.id.split('_exit_')[0];

      if (trade._cashBasisExit) {
        // This is an expanded trade for cash basis
        if (!expandedTradesMap.has(originalId)) {
          expandedTradesMap.set(originalId, []);
        }
        expandedTradesMap.get(originalId)!.push(trade);
      } else {
        // This is an original trade (open position or single exit)
        groupedMap.set(originalId, trade);
      }
    });

    // Merge expanded trades back into single display entries
    expandedTradesMap.forEach((expandedTrades, originalId) => {
      if (expandedTrades.length === 0) return;

      // Use the first expanded trade as base and aggregate the cash basis data
      const baseTrade = expandedTrades[0];
      const aggregatedTrade: Trade = {
        ...baseTrade,
        id: originalId, // Use original ID for display
        // Aggregate P/L from all exits for display
        plRs: expandedTrades.reduce((sum, t) => sum + (calculateTradePL(t, true) || 0), 0),
        // Keep the latest exit date for sorting
        _cashBasisExit: expandedTrades.reduce((latest, current) => {
          if (!latest || !current._cashBasisExit) return current._cashBasisExit;
          if (!latest.date || !current._cashBasisExit.date) return latest;
          return new Date(current._cashBasisExit.date) > new Date(latest.date) ? current._cashBasisExit : latest;
        }, expandedTrades[0]._cashBasisExit),
        // Store expanded trades for backend calculations
        _expandedTrades: expandedTrades
      };

      groupedMap.set(originalId, aggregatedTrade);
    });

    return Array.from(groupedMap.values());
  }, [useCashBasis, calculateTradePL]);

  const filteredTrades = React.useMemo(() => {
    let result = [...trades];

    // For cash basis, we need to handle trade filtering differently
    // Instead of filtering trades, we need to expand trades with multiple exits
    if (useCashBasis) {
      // Expand trades with multiple exits into separate entries for cash basis
      const expandedTrades: Trade[] = [];
      const debugExpandedMap: Record<string, Trade[]> = {};

      result.forEach(trade => {
        if (trade.positionStatus === 'Closed' || trade.positionStatus === 'Partial') {
          // Get all exits for this trade
          const exits = [
            { date: trade.exit1Date, qty: trade.exit1Qty || 0, price: trade.exit1Price || 0 },
            { date: trade.exit2Date, qty: trade.exit2Qty || 0, price: trade.exit2Price || 0 },
            { date: trade.exit3Date, qty: trade.exit3Qty || 0, price: trade.exit3Price || 0 }
          ].filter(exit => exit.date && exit.date.trim() !== '' && exit.qty > 0);

          if (exits.length > 0) {
            // Create a trade entry for each exit (for cash basis)
            exits.forEach((exit, exitIndex) => {
              const expandedTrade: Trade = {
                ...trade,
                id: trade.id + '_exit_' + exitIndex,
                _cashBasisExit: {
                  date: exit.date,
                  qty: exit.qty,
                  price: exit.price
                }
              };
              expandedTrades.push(expandedTrade);
              if (!debugExpandedMap[trade.id]) debugExpandedMap[trade.id] = [];
              debugExpandedMap[trade.id].push(expandedTrade);
            });
          } else {

            // Fallback: if no individual exit data, use the original trade
            expandedTrades.push(trade);
            if (!debugExpandedMap[trade.id]) debugExpandedMap[trade.id] = [];
            debugExpandedMap[trade.id].push(trade);
          }
        } else {
          // For open positions, include as-is
          expandedTrades.push(trade);
        }
      });

      // CRITICAL FIX: Apply global filter to expanded trades BEFORE grouping
      // This ensures trades with multiple exits are properly filtered by each exit date
      const filteredExpandedTrades = expandedTrades.filter(trade => {
        const relevantDate = getTradeDateForAccounting(trade, useCashBasis);
        return isInGlobalFilter(relevantDate, globalFilter);
      });

      // Group filtered expanded trades for display while preserving backend calculations
      result = groupTradesForDisplay(filteredExpandedTrades);
    } else {
      // Apply global filter using accounting method-aware date for accrual basis
      result = result.filter(trade => {
        const relevantDate = getTradeDateForAccounting(trade, useCashBasis);
        return isInGlobalFilter(relevantDate, globalFilter);
      });
    }

    // Apply search filter
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(trade =>
        trade.name.toLowerCase().includes(lowerQuery) ||
        trade.setup.toLowerCase().includes(lowerQuery) ||
        trade.tradeNo.toLowerCase().includes(lowerQuery)
      );
    }

    // Apply status filter
    if (statusFilter) {
      result = result.filter(trade => trade.positionStatus === statusFilter);
    }

    // Apply sorting
    if (sortDescriptor.column && sortDescriptor.direction) {
      result.sort((a, b) => {
        const aValue = a[sortDescriptor.column as keyof Trade];
        const bValue = b[sortDescriptor.column as keyof Trade];

        let comparison = 0;
        // Handle different data types for sorting
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          // Special handling for date strings if your date format is sortable as string
          if (sortDescriptor.column === 'date' || String(sortDescriptor.column).endsWith('Date')) {
            comparison = new Date(aValue).getTime() - new Date(bValue).getTime();
          } else {
            comparison = aValue.localeCompare(bValue);
          }
        } else if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
          comparison = (aValue === bValue) ? 0 : aValue ? -1 : 1;
        } else {
          // Fallback for other types or mixed types (treat as strings)
          const StringA = String(aValue !== null && aValue !== undefined ? aValue : "");
          const StringB = String(bValue !== null && bValue !== undefined ? bValue : "");
          comparison = StringA.localeCompare(StringB);
        }

        // For cash basis, add secondary sorting to handle expanded trades properly
        if (useCashBasis && comparison === 0) {
          // If primary sort values are equal, sort by exit date for cash basis
          const aExitDate = a._cashBasisExit?.date || a.date || '';
          const bExitDate = b._cashBasisExit?.date || b.date || '';

          if (aExitDate && bExitDate) {
            const aTime = new Date(aExitDate).getTime();
            const bTime = new Date(bExitDate).getTime();
            comparison = aTime - bTime;
          }
        }

        return sortDescriptor.direction === "ascending" ? comparison : -comparison;
      });
    }

    // CRITICAL FIX: Recalculate cumulative PF based on display order
    // This ensures cumulative values make sense based on how trades are actually shown
    let runningDisplayCummPf = 0;
    result = result.map((trade) => {
      // For cash basis grouped trades, recalculate PF impact from expanded trades if available
      let currentPfImpact = 0;
      if (useCashBasis && trade._expandedTrades && trade._expandedTrades.length > 0) {
        // Calculate total PF impact from all expanded trades
        const totalPL = trade._expandedTrades.reduce((sum, expandedTrade) => {
          return sum + calculateTradePL(expandedTrade, true);
        }, 0);
        // Get portfolio size for PF impact calculation
        const tradeDate = new Date(trade.date);
        const month = tradeDate.toLocaleString('default', { month: 'short' });
        const year = tradeDate.getFullYear();
        const portfolioSize = getPortfolioSize ? getPortfolioSize(month, year) : 100000;
        currentPfImpact = portfolioSize > 0 ? (totalPL / portfolioSize) * 100 : 0;
      } else {
        // Use cached values or fallback calculation
        currentPfImpact = useCashBasis
          ? (trade._cashPfImpact ?? 0)
          : (trade._accrualPfImpact ?? trade.pfImpact ?? 0);
      }

      // Only include PF Impact from closed/partial trades in cumulative calculation
      if (trade.positionStatus !== 'Open') {
        runningDisplayCummPf += currentPfImpact;
      }

      return {
        ...trade,
        cummPf: runningDisplayCummPf // Update with display-order cumulative PF
      };
    });

    return result;
  }, [trades, globalFilter, searchQuery, statusFilter, sortDescriptor, useCashBasis]);

  return {
    trades: filteredTrades, // Filtered and expanded trades for display
    originalTrades: trades, // Original trades for unrealized P/L calculation
    addTrade,
    updateTrade,
    deleteTrade,
    bulkImportTrades,
    isLoading,
    isRecalculating,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    sortDescriptor,
    setSortDescriptor,
    visibleColumns,
    setVisibleColumns,
    clearAllTrades,
    getAccountingAwareValues // Helper for getting accounting-aware display values
  };
};
