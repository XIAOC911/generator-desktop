import { useState } from 'react';
import { useEditorStore } from '@/app/store/useEditorStore';
import { projectService } from '@/services/project.service';

type Theme = 'dark' | 'light' | 'gradient';

export function Topbar({ theme, onThemeChange }: { theme: Theme; onThemeChange: (t: Theme) => void }) {
  const project = useEditorStore((state) => state.project);
  const [recentSelection, setRecentSelection] = useState('');

  return (
    <header className="app-topbar">
      {/* 品牌区域 */}
      <div className="topbar-brand">
        <div className="brand-logo">魔</div>
        <div>
          <div className="brand-title">电商魔丸</div>
        </div>
        <span className="brand-version">v4.9</span>
      </div>

      {/* 项目信息 */}
      <div className="topbar-project">
        <div className="project-info">
          <div className="project-name">
            {project.currentName}
            {project.dirty && <span className="project-dirty">未保存</span>}
          </div>
          <div className="project-path">
            {project.currentFilePath ?? '未保存到本地，建议先保存为项目文件。'}
            {project.lastSavedAt && ` · 上次保存 ${new Date(project.lastSavedAt).toLocaleString()}`}
          </div>
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className="topbar-actions">
        {/* 主题切换器 */}
        <div className="theme-switcher" title="切换主题">
          <div
            className={`theme-option theme-option-dark ${theme === 'dark' ? 'theme-option-active' : ''}`}
            onClick={() => onThemeChange('dark')}
            title="深色主题"
          />
          <div
            className={`theme-option theme-option-light ${theme === 'light' ? 'theme-option-active' : ''}`}
            onClick={() => onThemeChange('light')}
            title="浅色主题"
          />
          <div
            className={`theme-option theme-option-gradient ${theme === 'gradient' ? 'theme-option-active' : ''}`}
            onClick={() => onThemeChange('gradient')}
            title="渐变色主题"
          />
        </div>

        <div className="row-start">
          <button className="button button-ghost" onClick={() => projectService.newProject()}>
            <span>新建</span>
          </button>
          <button className="button button-ghost" onClick={() => projectService.openProject()}>
            <span>打开</span>
          </button>
          <button className="button button-primary" onClick={() => projectService.saveProject()}>
            <span>保存</span>
          </button>
          <button className="button button-ghost" onClick={() => projectService.saveProjectAs()}>
            <span>另存为</span>
          </button>
        </div>

        <select
          className="input"
          style={{ width: '160px', fontSize: '12px' }}
          value={recentSelection}
          onChange={(event) => {
            const value = event.target.value;
            setRecentSelection('');
            if (value) {
              void projectService.openRecentProject(value);
            }
          }}
        >
          <option value="">最近项目</option>
          {project.recentProjects.map((item) => (
            <option key={item.filePath} value={item.filePath}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
