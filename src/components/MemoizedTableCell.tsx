import React from 'react';
import { TableCell } from '@heroui/react';
import { Trade } from '../types/trade';

interface MemoizedTableCellProps {
  trade: Trade;
  columnKey: string;
  renderCell: (trade: Trade, columnKey: string) => React.ReactNode;
  className?: string;
}

// Memoized table cell component to prevent unnecessary re-renders
export const MemoizedTableCell = React.memo<MemoizedTableCellProps>(
  ({ trade, columnKey, renderCell, className }) => {
    return (
      <TableCell
        className={`trade-table-cell ${className || ''}`}
      >
        {renderCell(trade, columnKey)}
      </TableCell>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function for optimal re-rendering
    const prevTrade = prevProps.trade;
    const nextTrade = nextProps.trade;
    
    // Always re-render if trade ID changed
    if (prevTrade.id !== nextTrade.id) return false;
    
    // Always re-render if column key changed
    if (prevProps.columnKey !== nextProps.columnKey) return false;
    
    // For specific columns, check only relevant fields
    switch (nextProps.columnKey) {
      case 'name':
        return prevTrade.name === nextTrade.name;
      
      case 'tradeNo':
        return prevTrade.tradeNo === nextTrade.tradeNo;
      
      case 'entry':
        return prevTrade.entry === nextTrade.entry && 
               prevTrade.avgEntry === nextTrade.avgEntry;
      
      case 'cmp':
        return prevTrade.cmp === nextTrade.cmp;
      
      case 'positionStatus':
        return prevTrade.positionStatus === nextTrade.positionStatus;
      
      case 'plRs':
        return prevTrade.plRs === nextTrade.plRs &&
               prevTrade.realisedAmount === nextTrade.realisedAmount;
      
      case 'pfImpact':
        return prevTrade.pfImpact === nextTrade.pfImpact;
      
      case 'cummPf':
        return prevTrade.cummPf === nextTrade.cummPf;
      
      case 'stockMove':
        return prevTrade.stockMove === nextTrade.stockMove &&
               prevTrade.cmp === nextTrade.cmp &&
               prevTrade.avgEntry === nextTrade.avgEntry;
      
      case 'rewardRisk':
        return prevTrade.rewardRisk === nextTrade.rewardRisk;
      
      case 'holdingDays':
        return prevTrade.holdingDays === nextTrade.holdingDays;
      
      case 'allocation':
        return prevTrade.allocation === nextTrade.allocation;
      
      case 'positionSize':
        return prevTrade.positionSize === nextTrade.positionSize;
      
      case 'openQty':
        return prevTrade.openQty === nextTrade.openQty;
      
      case 'exitedQty':
        return prevTrade.exitedQty === nextTrade.exitedQty;
      
      case 'avgExitPrice':
        return prevTrade.avgExitPrice === nextTrade.avgExitPrice;
      
      case 'planFollowed':
        return prevTrade.planFollowed === nextTrade.planFollowed;
      
      case 'exitTrigger':
        return prevTrade.exitTrigger === nextTrade.exitTrigger;
      
      case 'proficiencyGrowthAreas':
        return JSON.stringify(prevTrade.proficiencyGrowthAreas) === 
               JSON.stringify(nextTrade.proficiencyGrowthAreas);
      
      case 'chartAttachments':
        return JSON.stringify(prevTrade.chartAttachments) === 
               JSON.stringify(nextTrade.chartAttachments);
      
      case 'notes':
        return prevTrade.notes === nextTrade.notes;
      
      case 'unrealizedPL':
        return prevTrade.cmp === nextTrade.cmp &&
               prevTrade.avgEntry === nextTrade.avgEntry &&
               prevTrade.openQty === nextTrade.openQty &&
               prevTrade.positionStatus === nextTrade.positionStatus;
      
      // For quantity fields
      case 'initialQty':
      case 'pyramid1Qty':
      case 'pyramid2Qty':
      case 'exit1Qty':
      case 'exit2Qty':
      case 'exit3Qty':
        return prevTrade[nextProps.columnKey as keyof Trade] === 
               nextTrade[nextProps.columnKey as keyof Trade];
      
      // For price fields
      case 'pyramid1Price':
      case 'pyramid2Price':
      case 'exit1Price':
      case 'exit2Price':
      case 'exit3Price':
      case 'sl':
      case 'tsl':
        return prevTrade[nextProps.columnKey as keyof Trade] === 
               nextTrade[nextProps.columnKey as keyof Trade];
      
      // For date fields
      case 'entryDate':
      case 'pyramid1Date':
      case 'pyramid2Date':
      case 'exit1Date':
      case 'exit2Date':
      case 'exit3Date':
        return prevTrade[nextProps.columnKey as keyof Trade] === 
               nextTrade[nextProps.columnKey as keyof Trade];
      
      default:
        // For unknown columns, do a shallow comparison of the specific field
        return prevTrade[nextProps.columnKey as keyof Trade] === 
               nextTrade[nextProps.columnKey as keyof Trade];
    }
  }
);

MemoizedTableCell.displayName = 'MemoizedTableCell';
