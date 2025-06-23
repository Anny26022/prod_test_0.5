import React, { useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@heroui/react';
import { Trade } from '../types/trade';

interface VirtualizedTableProps {
  trades: Trade[];
  columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
  }>;
  renderCell: (trade: Trade, columnKey: string) => React.ReactNode;
  onSortChange?: (descriptor: { column: string; direction: 'ascending' | 'descending' }) => void;
  sortDescriptor?: { column: string; direction: 'ascending' | 'descending' };
  className?: string;
  estimateSize?: number;
  overscan?: number;
}

// High-performance virtualized table component
export const VirtualizedTable = React.memo<VirtualizedTableProps>(({
  trades,
  columns,
  renderCell,
  onSortChange,
  sortDescriptor,
  className = '',
  estimateSize = 60, // Estimated row height in pixels
  overscan = 5 // Number of items to render outside visible area
}) => {
  const parentRef = React.useRef<HTMLDivElement>(null);

  // Memoize row data to prevent unnecessary re-renders
  const memoizedRows = useMemo(() => {
    return trades.map((trade, index) => ({
      id: trade.id,
      index,
      trade,
      key: `${trade.id}-${trade.tradeNo}-${trade.positionStatus}` // Include status for proper re-rendering
    }));
  }, [trades]);

  // Virtual scrolling configuration
  const virtualizer = useVirtualizer({
    count: memoizedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    // Performance optimization: use smooth scrolling
    // scrollBehavior: 'smooth' // Removed due to type incompatibility
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Memoized table header to prevent re-renders
  const tableHeader = useMemo(() => (
    <TableHeader>
      {columns.map((column) => (
        <TableColumn
          key={column.key}
          allowsSorting={column.sortable}
          className="sticky-header gpu-accelerated"
        >
          {column.label}
        </TableColumn>
      ))}
    </TableHeader>
  ), [columns]);

  return (
    <div className={`virtual-scroll-container ${className}`}>
      <Table
        aria-label="Virtualized trade table"
        className="trade-table gpu-accelerated"
        sortDescriptor={sortDescriptor}
        onSortChange={onSortChange}
      >
        {tableHeader}
        <TableBody>
          <div
            ref={parentRef}
            className="virtual-scroll-container custom-scrollbar"
            style={{
              height: '600px', // Fixed height for virtualization
              overflow: 'auto',
            }}
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualItems.map((virtualRow) => {
                const rowData = memoizedRows[virtualRow.index];
                if (!rowData) return null;

                return (
                  <div
                    key={rowData.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="virtual-scroll-item"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <TableRow className="trade-table-row hover:bg-default-50 dark:hover:bg-gray-800 dark:bg-gray-900 group gpu-accelerated">
                      {columns.map((column) => (
                        <TableCell
                          key={`${rowData.id}-${column.key}`}
                          className="trade-table-cell"
                        >
                          {renderCell(rowData.trade, column.key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </div>
                );
              })}
            </div>
          </div>
        </TableBody>
      </Table>
    </div>
  );
});

VirtualizedTable.displayName = 'VirtualizedTable';

// Hook for managing virtualized table state
export const useVirtualizedTable = (
  initialData: Trade[] = [],
  initialPageSize: number = 50
) => {
  const [data, setData] = React.useState<Trade[]>(initialData);
  const [isVirtualized, setIsVirtualized] = React.useState(false);
  
  // Auto-enable virtualization for large datasets
  React.useEffect(() => {
    setIsVirtualized(data.length > 100); // Enable virtualization for >100 items
  }, [data.length]);

  const updateData = React.useCallback((newData: Trade[]) => {
    setData(newData);
  }, []);

  const toggleVirtualization = React.useCallback(() => {
    setIsVirtualized(prev => !prev);
  }, []);

  return {
    data,
    isVirtualized,
    updateData,
    toggleVirtualization,
    shouldVirtualize: data.length > 100
  };
};

// Performance monitoring hook for virtual scrolling
export const useVirtualScrollPerformance = () => {
  const [metrics, setMetrics] = React.useState({
    renderTime: 0,
    scrollFPS: 0,
    memoryUsage: 0
  });

  React.useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const measurePerformance = () => {
      const currentTime = performance.now();
      frameCount++;

      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        
        setMetrics(prev => ({
          ...prev,
          scrollFPS: fps,
          memoryUsage: 'memory' in performance ? 
            Math.round(((performance as any).memory?.usedJSHeapSize || 0) / 1024 / 1024) : 0
        }));

        frameCount = 0;
        lastTime = currentTime;
      }

      animationId = requestAnimationFrame(measurePerformance);
    };

    animationId = requestAnimationFrame(measurePerformance);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, []);

  return metrics;
};

// Optimized cell renderer with memoization
export const createMemoizedCellRenderer = (
  renderFunction: (trade: Trade, columnKey: string) => React.ReactNode
) => {
  const cache = new Map<string, React.ReactNode>();
  
  return React.memo((trade: Trade, columnKey: string) => {
    const cacheKey = `${trade.id}-${columnKey}-${trade[columnKey as keyof Trade]}`;
    
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    
    const result = renderFunction(trade, columnKey);
    cache.set(cacheKey, result);
    
    // Limit cache size to prevent memory leaks
    if (cache.size > 1000) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    return result;
  });
};
