// Web Worker for heavy trade calculations to prevent UI blocking
import { Trade } from '../types/trade';

// Define message types for type safety
interface CalculationMessage {
  type: 'CALCULATE_TRADES';
  payload: {
    trades: Trade[];
    portfolioSizes: Record<string, number>;
    useCashBasis: boolean;
  };
}

interface CalculationResponse {
  type: 'CALCULATION_COMPLETE';
  payload: {
    calculatedTrades: Trade[];
    processingTime: number;
  };
}

// Heavy calculation functions (moved from main thread)
const calculateTradeMetrics = (trade: Trade, portfolioSize: number): Partial<Trade> => {
  const calculations: Partial<Trade> = {};
  
  // Calculate position size
  if (trade.entry && trade.initialQty) {
    calculations.positionSize = trade.entry * trade.initialQty;
  }

  // Calculate average entry price
  let totalQty = trade.initialQty || 0;
  let totalValue = (trade.entry || 0) * (trade.initialQty || 0);

  if (trade.pyramid1Qty && trade.pyramid1Price) {
    totalQty += trade.pyramid1Qty;
    totalValue += trade.pyramid1Price * trade.pyramid1Qty;
  }

  if (trade.pyramid2Qty && trade.pyramid2Price) {
    totalQty += trade.pyramid2Qty;
    totalValue += trade.pyramid2Price * trade.pyramid2Qty;
  }

  if (totalQty > 0) {
    calculations.avgEntry = totalValue / totalQty;
  }

  // Calculate exits
  let exitedQty = 0;
  let exitValue = 0;

  if (trade.exit1Qty && trade.exit1Price) {
    exitedQty += trade.exit1Qty;
    exitValue += trade.exit1Price * trade.exit1Qty;
  }

  if (trade.exit2Qty && trade.exit2Price) {
    exitedQty += trade.exit2Qty;
    exitValue += trade.exit2Price * trade.exit2Qty;
  }

  if (trade.exit3Qty && trade.exit3Price) {
    exitedQty += trade.exit3Qty;
    exitValue += trade.exit3Price * trade.exit3Qty;
  }

  calculations.exitedQty = exitedQty;
  calculations.openQty = totalQty - exitedQty;

  if (exitedQty > 0) {
    calculations.avgExitPrice = exitValue / exitedQty;
  }

  // Calculate P&L
  const avgEntry = calculations.avgEntry || trade.avgEntry || 0;
  const avgExit = calculations.avgExitPrice || trade.avgExitPrice || 0;
  const cmp = trade.cmp || 0;

  if (exitedQty > 0) {
    calculations.realisedAmount = (avgExit - avgEntry) * exitedQty;
  }

  // Calculate unrealized P&L for open positions
  const openQty = calculations.openQty || 0;
  if (openQty > 0 && cmp > 0) {
    (calculations as any).unrealizedPL = (cmp - avgEntry) * openQty;
  }

  // Calculate total P&L
  const realised = calculations.realisedAmount || 0;
  const unrealised = (calculations as any).unrealizedPL || 0;
  calculations.plRs = realised + unrealised;

  // Calculate portfolio impact
  if (portfolioSize > 0) {
    calculations.pfImpact = ((calculations.plRs || 0) / portfolioSize) * 100;
  }

  // Calculate stock move percentage
  if (avgEntry > 0 && cmp > 0) {
    calculations.stockMove = ((cmp - avgEntry) / avgEntry) * 100;
  }

  // Calculate allocation percentage
  const positionSize = calculations.positionSize || 0;
  if (portfolioSize > 0 && positionSize > 0) {
    calculations.allocation = (positionSize / portfolioSize) * 100;
  }

  // Calculate holding days
  if (trade.entryDate) {
    const entryDate = new Date(trade.entryDate);
    const currentDate = new Date();
    const diffTime = Math.abs(currentDate.getTime() - entryDate.getTime());
    calculations.holdingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return calculations;
};

// Process all trades with optimized batch processing
const processTradesInBatches = (
  trades: Trade[], 
  portfolioSizes: Record<string, number>,
  useCashBasis: boolean
): Trade[] => {
  const batchSize = 50; // Process in batches to prevent blocking
  const results: Trade[] = [];
  
  for (let i = 0; i < trades.length; i += batchSize) {
    const batch = trades.slice(i, i + batchSize);
    
    const processedBatch = batch.map(trade => {
      // Get portfolio size for the trade's month/year
      const tradeDate = new Date(trade.entryDate || Date.now());
      const monthKey = `${tradeDate.getMonth() + 1}-${tradeDate.getFullYear()}`;
      const portfolioSize = portfolioSizes[monthKey] || 100000; // Default portfolio size
      
      const calculations = calculateTradeMetrics(trade, portfolioSize);
      
      return {
        ...trade,
        ...calculations
      };
    });
    
    results.push(...processedBatch);
    
    // Yield control back to main thread periodically
    if (i % (batchSize * 4) === 0) {
      // Post progress update
      self.postMessage({
        type: 'PROGRESS_UPDATE',
        payload: {
          processed: results.length,
          total: trades.length,
          percentage: Math.round((results.length / trades.length) * 100)
        }
      });
    }
  }
  
  return results;
};

// Main worker message handler
self.onmessage = (event: MessageEvent<CalculationMessage>) => {
  const { type, payload } = event.data;
  
  if (type === 'CALCULATE_TRADES') {
    const startTime = performance.now();
    
    try {
      const { trades, portfolioSizes, useCashBasis } = payload;
      
      // Process trades in optimized batches
      const calculatedTrades = processTradesInBatches(trades, portfolioSizes, useCashBasis);
      
      const endTime = performance.now();
      const processingTime = Math.round(endTime - startTime);
      
      // Send results back to main thread
      const response: CalculationResponse = {
        type: 'CALCULATION_COMPLETE',
        payload: {
          calculatedTrades,
          processingTime
        }
      };
      
      self.postMessage(response);
      
    } catch (error) {
      // Send error back to main thread
      self.postMessage({
        type: 'CALCULATION_ERROR',
        payload: {
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      });
    }
  }
};

// Export types for main thread usage
export type { CalculationMessage, CalculationResponse };
