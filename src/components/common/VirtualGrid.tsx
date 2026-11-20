import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface VirtualGridProps<T> {
  items: T[];
  itemHeight: number;
  itemWidth: number;
  columns: number;
  gap?: number;
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
  containerHeight?: number;
  className?: string;
}

/**
 * 虚拟网格列表 — 只渲染可视区内的元素，大幅减少 500+ 素材时的 DOM 节点数。
 */
export function VirtualGrid<T>({
  items,
  itemHeight,
  itemWidth,
  columns,
  gap = 4,
  overscan = 2,
  renderItem,
  containerHeight,
  className
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(containerHeight || 400);

  const rowHeight = itemHeight + gap;
  const totalRows = Math.ceil(items.length / columns);
  const totalHeight = totalRows * rowHeight + gap;

  // 计算可见行范围
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + viewHeight) / rowHeight) + overscan);

  // 可见项
  const visibleItems = items.slice(startRow * columns, endRow * columns);

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop);
    }
  }, []);

  // 监听容器尺寸变化
  useEffect(() => {
    const el = containerRef.current;
    if (!el || containerHeight) return;
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setViewHeight(h);
    });
    observer.observe(el);
    setViewHeight(el.clientHeight);
    return () => observer.disconnect();
  }, [containerHeight]);

  return (
    <div
      ref={containerRef}
      className={className}
      onScroll={handleScroll}
      style={{
        overflowY: 'auto',
        height: containerHeight ?? '100%',
        willChange: 'transform',
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, i) => {
          const globalIndex = startRow * columns + i;
          const row = Math.floor(globalIndex / columns);
          const col = globalIndex % columns;
          return (
            <div
              key={(item as any).id ?? globalIndex}
              style={{
                position: 'absolute',
                top: row * rowHeight + gap,
                left: col * (itemWidth + gap) + gap,
                width: itemWidth,
                height: itemHeight,
              }}
            >
              {renderItem(item, globalIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
