import { useState, useRef, useCallback, useEffect } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Workspace } from './Workspace';
import { templateService } from '@/services/template.service';
import { projectService } from '@/services/project.service';

const MIN_SIDEBAR_WIDTH = 300;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 340;
const COMPACT_THRESHOLD = 360;

type Theme = 'dark' | 'light' | 'gradient';

const THEME_CLASSES: Record<Theme, string> = {
  dark: '',
  light: 'theme-light',
  gradient: 'theme-gradient',
};

export function ResizableLayout() {
  const [theme, setTheme] = useState<Theme>('gradient');
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  useEffect(() => {
    void templateService.loadTemplates().catch(() => undefined);
    void projectService.loadRecentProjects().catch(() => undefined);
    void projectService.initializePersistence().catch(() => undefined);
  }, []);

  // 当侧边栏宽度小于阈值时自动切换紧凑模式
  useEffect(() => {
    setIsCompact(sidebarWidth < COMPACT_THRESHOLD);
  }, [sidebarWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
    e.preventDefault();
  }, [sidebarWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const delta = e.clientX - dragStartXRef.current;
    const newWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, dragStartWidthRef.current + delta)
    );
    setSidebarWidth(newWidth);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className={`app-shell resizable-layout ${isCompact ? 'compact-layout' : ''}${THEME_CLASSES[theme] ? ` ${THEME_CLASSES[theme]}` : ''}`}
    >
      <Topbar theme={theme} onThemeChange={setTheme} />
      <div
        className="resizable-sidebar"
        style={{ width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
      >
        <Sidebar compact={isCompact} />
      </div>
      <div
        className={`resize-handle ${isDragging ? 'resize-handle-active' : ''}`}
        onMouseDown={handleMouseDown}
        title="拖拽调整宽度"
      >
        <div className="resize-handle-indicator" />
      </div>
      <div className="resizable-workspace">
        <Workspace />
      </div>
    </div>
  );
}
