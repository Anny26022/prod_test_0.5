import React from "react";
import {
  Tooltip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { Trade } from "../../types/trade";
import { calcWeightedRewardRisk } from '../../utils/tradeCalculations';
import { metricVariants } from "../../utils/animations";
import { useAccountingCalculations, useAccountingMethodDisplay } from "../../hooks/use-accounting-calculations";
import { useGlobalFilter } from "../../context/GlobalFilterContext";
import { useAccountingMethod } from "../../context/AccountingMethodContext";
import { isTradeInGlobalFilter } from "../../utils/dateFilterUtils";

interface TopPerformerProps {
  label: string;
  value: string | number;
  stock?: string;
  date?: string;
  isPercentage?: boolean;
  isPositive?: boolean;
  isNegative?: boolean;
  index?: number;
}

// Format a date string to a readable format
function formatDate(dateString: string) {
  if (!dateString) return "-";
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString("en-IN", { 
      day: "numeric",
      month: "numeric",
      year: "numeric"
    });
  } catch {
    return dateString;
  }
}

const TopPerformer: React.FC<TopPerformerProps> = ({ 
  label, 
  value, 
  stock, 
  date, 
  isPercentage,
  isPositive,
  isNegative,
  index = 0
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <motion.div 
        className="relative flex flex-col gap-2 p-3 bg-content2 dark:bg-gray-900 border border-foreground-200/10 dark:border-gray-800 rounded-lg"
        variants={metricVariants}
        whileHover={{ x: 4 }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground-700 dark:text-gray-300">
              {label}
            </span>
          </div>
          <motion.div 
            className={`font-semibold text-sm ${
              isPositive ? 'text-success-600 dark:text-success-400' : 
              isNegative ? 'text-danger-600 dark:text-danger-400' : 
              'text-foreground-800 dark:text-white'
            }`}
            layout
          >
            {isPercentage ? `${value}%` : value}
          </motion.div>
        </div>
        
        {(stock || date) && (
          <div className="flex items-center justify-between text-xs">
            {stock && (
              <span className="text-foreground-600 dark:text-gray-400">
                {stock}
              </span>
            )}
            {date && (
              <span className="text-foreground-500 dark:text-gray-500">
                {date}
              </span>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

interface TopPerformersProps {
  trades: Trade[];
}

type MetricFilter = "stockMove" | "pfImpact" | "rewardRisk" | "plRs";

export const TopPerformers: React.FC<TopPerformersProps> = ({ trades }) => {
  const { accountingMethod } = useAccountingMethod();
  const useCashBasis = accountingMethod === 'cash';
  const { filter: globalFilter } = useGlobalFilter();

  // Filter trades based on global filter and accounting method
  const filteredTrades = React.useMemo(() => {
    if (globalFilter.type === 'all') {
      return trades; // No filtering for "All Time"
    }

    return trades.filter(trade => isTradeInGlobalFilter(trade, globalFilter, useCashBasis));
  }, [trades, globalFilter, useCashBasis]);

  const { tradesWithAccountingPL } = useAccountingCalculations(filteredTrades);
  const { displayName } = useAccountingMethodDisplay();
  const [metricFilter, setMetricFilter] = React.useState<MetricFilter>("stockMove");

  // Helper function to get the correct PF Impact value based on accounting method and filter
  const getPfImpactValue = React.useCallback((trade: any) => {
    if (metricFilter !== 'pfImpact') return 0;

    if (useCashBasis && globalFilter.type === 'all') {
      // For "All Time" in cash basis, sum up all PF impacts from expanded trades
      if (trade._expandedTrades && trade._expandedTrades.length > 0) {
        return trade._expandedTrades.reduce((sum: number, expandedTrade: any) => {
          return sum + (expandedTrade._cashPfImpact ?? 0);
        }, 0);
      }
      return trade.cummPf ?? trade._cashPfImpact ?? 0;
    } else if (useCashBasis) {
      // For specific periods in cash basis, use individual exit impact
      return trade._cashPfImpact ?? 0;
    } else {
      // In accrual basis, use individual PF impact
      return trade._accrualPfImpact ?? trade.pfImpact ?? 0;
    }
  }, [metricFilter, useCashBasis, globalFilter.type]);

  // Get top and bottom performers based on selected metric
  const { top, bottom } = React.useMemo(() => {
    if (!tradesWithAccountingPL || !tradesWithAccountingPL.length) return { top: null, bottom: null };

    // CRITICAL FIX: For cash basis, deduplicate trades to avoid showing same trade multiple times
    let uniqueTrades = tradesWithAccountingPL;
    if (useCashBasis) {
      const seenTradeIds = new Set();
      uniqueTrades = tradesWithAccountingPL.filter(trade => {
        const originalId = trade.id.split('_exit_')[0];
        if (seenTradeIds.has(originalId)) return false;
        seenTradeIds.add(originalId);
        return true;
      });
    }



    const sortedTrades = [...uniqueTrades].sort((a, b) => {
      let aValue, bValue;
      if (metricFilter === 'rewardRisk') {
        aValue = calcWeightedRewardRisk(a);
        bValue = calcWeightedRewardRisk(b);
      } else if (metricFilter === 'plRs') {
        // Use accounting method P/L from shared calculations
        aValue = a.accountingPL;
        bValue = b.accountingPL;
      } else if (metricFilter === 'pfImpact') {
        // CRITICAL FIX: For cash basis with "All Time" filter, calculate total PF impact
        // For specific periods or accrual basis, use individual PF impact
        if (useCashBasis && globalFilter.type === 'all') {
          // For "All Time" in cash basis, sum up all PF impacts from expanded trades
          const getTotalPfImpact = (trade: any) => {
            if (trade._expandedTrades && trade._expandedTrades.length > 0) {
              return trade._expandedTrades.reduce((sum: number, expandedTrade: any) => {
                return sum + (expandedTrade._cashPfImpact ?? 0);
              }, 0);
            }
            return trade.cummPf ?? trade._cashPfImpact ?? 0;
          };

          aValue = getTotalPfImpact(a);
          bValue = getTotalPfImpact(b);
        } else if (useCashBasis) {
          // For specific periods in cash basis, use individual exit impact
          aValue = a._cashPfImpact ?? 0;
          bValue = b._cashPfImpact ?? 0;
        } else {
          // In accrual basis, use individual PF impact
          aValue = a._accrualPfImpact ?? a.pfImpact ?? 0;
          bValue = b._accrualPfImpact ?? b.pfImpact ?? 0;
        }
      } else {
        aValue = a[metricFilter] || 0;
        bValue = b[metricFilter] || 0;
      }
      return bValue - aValue;
    });

    return {
      top: sortedTrades[0],
      bottom: sortedTrades[sortedTrades.length - 1]
    };
  }, [tradesWithAccountingPL, metricFilter]);

  // Format metric value based on type
  const formatMetricValue = (value: number, trade?: any) => {
    if (metricFilter === 'plRs') {
      // For P/L, use accounting method value from shared calculations
      const plValue = trade?.accountingPL ?? value;
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        useGrouping: true
      }).format(plValue);
    }
    if (metricFilter === 'rewardRisk' && trade) {
      const rr = calcWeightedRewardRisk(trade);
      const rrStr = rr % 1 === 0 ? rr.toFixed(0) : rr.toFixed(2);
      return `${rrStr}R`;
    }
    if (metricFilter === 'pfImpact' && trade) {
      // CRITICAL FIX: For cash basis with "All Time", calculate total PF impact
      let pfImpactValue = 0;

      if (useCashBasis && globalFilter.type === 'all') {
        // For "All Time" in cash basis, sum up all PF impacts from expanded trades
        if (trade._expandedTrades && trade._expandedTrades.length > 0) {
          pfImpactValue = trade._expandedTrades.reduce((sum: number, expandedTrade: any) => {
            return sum + (expandedTrade._cashPfImpact ?? 0);
          }, 0);
        } else {
          pfImpactValue = trade.cummPf ?? trade._cashPfImpact ?? 0;
        }
      } else if (useCashBasis) {
        // For specific periods in cash basis, use individual exit impact
        pfImpactValue = trade._cashPfImpact ?? 0;
      } else {
        // In accrual basis, use individual PF impact
        pfImpactValue = trade._accrualPfImpact ?? trade.pfImpact ?? 0;
      }

      const formatted = pfImpactValue.toFixed(2);
      return formatted.replace(/\.?0+$/, '');
    }
    // For percentage values, remove trailing zeros
    const formatted = value.toFixed(2);
    return formatted.replace(/\.?0+$/, '');
  };

  // Get metric label
  const getMetricLabel = () => {
    switch (metricFilter) {
      case "stockMove":
        return "Move";
      case "pfImpact":
        return "pf Impact";
      case "rewardRisk":
        return "R:R";
      case "plRs":
        return "P/L";
      default:
        return "";
    }
  };

  if (!trades || trades.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-default-500">
        No data available
      </div>
    );
  }

  if (!top || !bottom) {
    return (
      <div className="flex items-center justify-center p-4 text-default-500">
        No trades found for the selected period
      </div>
    );
  }

  // Check if we only have one unique trade
  const hasOnlyOneTrade = top.id === bottom.id ||
    (useCashBasis && top.id.split('_exit_')[0] === bottom.id.split('_exit_')[0]);

  return (
    <div className="space-y-4">
      {/* Accounting Method Indicator */}
      <div className="flex items-center gap-2 text-sm text-default-600">
        <Icon icon="lucide:trophy" className="w-4 h-4" />
        <span>Top performers using {displayName} Accounting</span>
      </div>

      <div className="flex justify-end">
        <Dropdown>
          <DropdownTrigger>
            <Button 
              variant="flat" 
              size="sm"
              className="bg-content2 dark:bg-gray-900 text-foreground dark:text-white min-w-[120px] h-9"
              endContent={<Icon icon="lucide:chevron-down" className="text-sm dark:text-gray-400" />}
            >
              {getMetricLabel()}
            </Button>
          </DropdownTrigger>
          <DropdownMenu 
            aria-label="Metric selection"
            className="dark:bg-gray-900"
            selectedKeys={[metricFilter]}
            selectionMode="single"
            onSelectionChange={(keys) => setMetricFilter(Array.from(keys)[0] as MetricFilter)}
          >
            <DropdownItem key="stockMove" className="dark:text-white dark:hover:bg-gray-800">Move %</DropdownItem>
            <DropdownItem key="pfImpact" className="dark:text-white dark:hover:bg-gray-800">Portfolio Impact</DropdownItem>
            <DropdownItem key="rewardRisk" className="dark:text-white dark:hover:bg-gray-800">Risk:Reward</DropdownItem>
            <DropdownItem key="plRs" className="dark:text-white dark:hover:bg-gray-800">P/L (₹)</DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>

      <div className="space-y-2">
        {hasOnlyOneTrade ? (
          // Show single trade information
          <TopPerformer
            label={getMetricLabel()}
            value={formatMetricValue(
              metricFilter === 'rewardRisk' ? calcWeightedRewardRisk(top) :
              metricFilter === 'plRs' ? top.accountingPL :
              metricFilter === 'pfImpact' ? getPfImpactValue(top) :
              top[metricFilter] || 0,
              top
            )}
            stock={top.name}
            date={top.date}
            isPercentage={metricFilter !== "plRs" && metricFilter !== "rewardRisk"}
            index={0}
          />
        ) : (
          // Show highest and lowest when multiple trades exist
          <>
            <TopPerformer
              label={`Highest ${getMetricLabel()}`}
              value={formatMetricValue(
                metricFilter === 'rewardRisk' ? calcWeightedRewardRisk(top) :
                metricFilter === 'plRs' ? top.accountingPL :
                metricFilter === 'pfImpact' ? getPfImpactValue(top) :
                top[metricFilter] || 0,
                top
              )}
              stock={top.name}
              date={top.date}
              isPercentage={metricFilter !== "plRs" && metricFilter !== "rewardRisk"}
              isPositive
              index={0}
            />
            <TopPerformer
              label={`Lowest ${getMetricLabel()}`}
              value={formatMetricValue(
                metricFilter === 'rewardRisk' ? calcWeightedRewardRisk(bottom) :
                metricFilter === 'plRs' ? bottom.accountingPL :
                metricFilter === 'pfImpact' ? getPfImpactValue(bottom) :
                bottom[metricFilter] || 0,
                bottom
              )}
              stock={bottom.name}
              date={bottom.date}
              isPercentage={metricFilter !== "plRs" && metricFilter !== "rewardRisk"}
              isNegative
              index={1}
            />
          </>
        )}
      </div>
    </div>
  );
};