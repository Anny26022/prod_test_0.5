import React, { useState, useEffect, useRef } from 'react';
import { Card, CardBody, CardHeader, Button, Chip } from '@heroui/react';
import { Icon } from '@iconify/react';

interface PerformanceMetrics {
  loadTime: number;
  renderTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  apiResponseTime: number;
  fps: number;
  bundleSize: number;
}

interface PerformanceMonitorProps {
  isVisible?: boolean;
  onToggle?: () => void;
}

// High-performance monitoring component for development
export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  isVisible = false,
  onToggle
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    loadTime: 0,
    renderTime: 0,
    memoryUsage: 0,
    cacheHitRate: 0,
    apiResponseTime: 0,
    fps: 0,
    bundleSize: 0
  });

  const [isMonitoring, setIsMonitoring] = useState(false);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const animationIdRef = useRef<number>();

  // Monitor FPS
  useEffect(() => {
    if (!isMonitoring) return;

    const measureFPS = () => {
      frameCountRef.current++;
      const currentTime = performance.now();
      
      if (currentTime - lastTimeRef.current >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / (currentTime - lastTimeRef.current));
        
        setMetrics(prev => ({ ...prev, fps }));
        
        frameCountRef.current = 0;
        lastTimeRef.current = currentTime;
      }
      
      animationIdRef.current = requestAnimationFrame(measureFPS);
    };

    animationIdRef.current = requestAnimationFrame(measureFPS);

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isMonitoring]);

  // Monitor memory usage
  useEffect(() => {
    if (!isMonitoring) return;

    const measureMemory = () => {
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        const usedMB = Math.round(memInfo.usedJSHeapSize / 1024 / 1024);
        setMetrics(prev => ({ ...prev, memoryUsage: usedMB }));
      }
    };

    const interval = setInterval(measureMemory, 2000);
    return () => clearInterval(interval);
  }, [isMonitoring]);

  // Monitor page load performance
  useEffect(() => {
    const measureLoadTime = () => {
      if ('navigation' in performance) {
        const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const loadTime = Math.round(navTiming.loadEventEnd - (navTiming as any).navigationStart);
        setMetrics(prev => ({ ...prev, loadTime }));
      }
    };

    if (document.readyState === 'complete') {
      measureLoadTime();
    } else {
      window.addEventListener('load', measureLoadTime);
      return () => window.removeEventListener('load', measureLoadTime);
    }
  }, []);

  // Monitor render performance
  useEffect(() => {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const renderEntries = entries.filter(entry => entry.entryType === 'measure');
      
      if (renderEntries.length > 0) {
        const avgRenderTime = renderEntries.reduce((sum, entry) => sum + entry.duration, 0) / renderEntries.length;
        setMetrics(prev => ({ ...prev, renderTime: Math.round(avgRenderTime) }));
      }
    });

    observer.observe({ entryTypes: ['measure'] });
    return () => observer.disconnect();
  }, []);

  const toggleMonitoring = () => {
    setIsMonitoring(!isMonitoring);
  };

  const getPerformanceStatus = (metric: keyof PerformanceMetrics, value: number) => {
    const thresholds = {
      loadTime: { good: 2000, warning: 4000 },
      renderTime: { good: 16, warning: 33 },
      memoryUsage: { good: 50, warning: 100 },
      fps: { good: 55, warning: 30 },
      apiResponseTime: { good: 500, warning: 1000 }
    };

    const threshold = thresholds[metric as keyof typeof thresholds];
    if (!threshold) return 'default';

    if (metric === 'fps') {
      if (value >= threshold.good) return 'success';
      if (value >= threshold.warning) return 'warning';
      return 'danger';
    } else {
      if (value <= threshold.good) return 'success';
      if (value <= threshold.warning) return 'warning';
      return 'danger';
    }
  };

  const formatValue = (metric: keyof PerformanceMetrics, value: number) => {
    switch (metric) {
      case 'loadTime':
      case 'renderTime':
      case 'apiResponseTime':
        return `${value}ms`;
      case 'memoryUsage':
        return `${value}MB`;
      case 'fps':
        return `${value} FPS`;
      case 'cacheHitRate':
        return `${value}%`;
      case 'bundleSize':
        return `${(value / 1024).toFixed(1)}KB`;
      default:
        return value.toString();
    }
  };

  if (!isVisible) {
    return (
      <Button
        isIconOnly
        size="sm"
        variant="flat"
        onPress={onToggle}
        className="fixed bottom-4 right-4 z-50 bg-background/80 backdrop-blur-sm"
      >
        <Icon icon="lucide:activity" className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 bg-background/95 backdrop-blur-md border shadow-lg">
      <CardHeader className="flex justify-between items-center pb-2">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:activity" className="h-4 w-4" />
          <span className="text-sm font-semibold">Performance Monitor</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            onPress={toggleMonitoring}
            className="min-w-0 px-2"
          >
            <Icon 
              icon={isMonitoring ? "lucide:pause" : "lucide:play"} 
              className="h-3 w-3" 
            />
          </Button>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={onToggle}
            className="min-w-0"
          >
            <Icon icon="lucide:x" className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      
      <CardBody className="pt-0 space-y-3">
        {Object.entries(metrics).map(([key, value]) => {
          const metricKey = key as keyof PerformanceMetrics;
          const status = getPerformanceStatus(metricKey, value);
          
          return (
            <div key={key} className="flex justify-between items-center">
              <span className="text-xs text-default-600 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </span>
              <Chip
                size="sm"
                color={status}
                variant="flat"
                className="text-xs"
              >
                {formatValue(metricKey, value)}
              </Chip>
            </div>
          );
        })}
        
        <div className="pt-2 border-t border-divider">
          <div className="flex justify-between items-center text-xs">
            <span className="text-default-600">Status</span>
            <Chip
              size="sm"
              color={metrics.fps >= 55 && metrics.loadTime <= 2000 ? 'success' : 'warning'}
              variant="flat"
            >
              {metrics.fps >= 55 && metrics.loadTime <= 2000 ? 'Optimal' : 'Needs Optimization'}
            </Chip>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};

// Hook for performance monitoring
export const usePerformanceMonitor = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [metrics, setMetrics] = useState<Partial<PerformanceMetrics>>({});

  const startTiming = (label: string) => {
    performance.mark(`${label}-start`);
  };

  const endTiming = (label: string) => {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
    
    const measure = performance.getEntriesByName(label, 'measure')[0];
    return Math.round(measure.duration);
  };

  const measureAsync = async <T,>(label: string, asyncFn: () => Promise<T>): Promise<T> => {
    startTiming(label);
    try {
      const result = await asyncFn();
      const duration = endTiming(label);
      console.log(`⚡ ${label} completed in ${duration}ms`);
      return result;
    } catch (error) {
      endTiming(label);
      throw error;
    }
  };

  const toggle = () => setIsVisible(!isVisible);

  return {
    isVisible,
    toggle,
    startTiming,
    endTiming,
    measureAsync,
    PerformanceMonitor: () => (
      <PerformanceMonitor isVisible={isVisible} onToggle={toggle} />
    )
  };
};
