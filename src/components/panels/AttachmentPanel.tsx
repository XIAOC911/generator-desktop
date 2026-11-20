import { useRef, useState, useCallback } from 'react';
import { editorStore } from '@/app/store/editorStore';
import { useEditorStore } from '@/app/store/useEditorStore';
import { createId } from '@/core/utils/id';

interface AttachmentPanelProps {
  compact?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/** 内置插图预设 */
const BUILTIN_ILLUSTRATIONS: Array<{ name: string; emoji: string }> = [
  { name: '🔥 热卖', emoji: '🔥' },
  { name: '✨ 新品', emoji: '✨' },
  { name: '💯 正品', emoji: '💯' },
  { name: '🎉 促销', emoji: '🎉' },
  { name: '⭐ 推荐', emoji: '⭐' },
  { name: '❤️ 喜欢', emoji: '❤️' },
  { name: '🏆 冠军', emoji: '🏆' },
  { name: '💰 省钱', emoji: '💰' },
  { name: '📦 包邮', emoji: '📦' },
  { name: '✅ 认证', emoji: '✅' },
  { name: '🚀 快速', emoji: '🚀' },
  { name: '🎯 精准', emoji: '🎯' },
  { name: '💎 高端', emoji: '💎' },
  { name: '🌟 爆款', emoji: '🌟' },
  { name: '🔔 提醒', emoji: '🔔' },
  { name: '📢 公告', emoji: '📢' },
];

export function AttachmentPanel({ compact, collapsed, onToggleCollapse }: AttachmentPanelProps) {
  const state = useEditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customIllustrations, setCustomIllustrations] = useState<
    Array<{ id: string; name: string; dataUrl: string }>
  >([]);
  const [activeCategory, setActiveCategory] = useState<'builtin' | 'custom'>('builtin');

  const addEmojiAsLayer = useCallback((emoji: string) => {
    const layer = {
      id: createId('text'),
      type: 'text' as const,
      text: emoji,
      x: state.canvas.size / 2,
      y: state.canvas.size / 2,
      scale: 80,
      rotation: 0,
      opacity: 100,
      filters: { brightness: 100, contrast: 100, saturate: 100, hue: 0 },
      visible: true,
      color: '#333333',
      fontFamily: 'Microsoft YaHei',
      bold: false,
      shadow: false,
      stroke: false,
    };
    editorStore.addLayer(layer);
  }, [state.canvas.size]);

  const addCustomImageAsLayer = useCallback((dataUrl: string) => {
    const layer = {
      id: createId('image'),
      type: 'image' as const,
      x: state.canvas.size / 2,
      y: state.canvas.size / 2,
      scale: 100,
      rotation: 0,
      opacity: 100,
      filters: { brightness: 100, contrast: 100, saturate: 100, hue: 0 },
      visible: true,
      previewUrl: dataUrl,
      sourceName: '插图',
      freeSourceLayer: true,
    };
    editorStore.addLayer(layer);
  }, [state.canvas.size]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const newItems = files.map((file) => ({
      id: createId('attach'),
      name: file.name,
      dataUrl: URL.createObjectURL(file),
    }));
    setCustomIllustrations((prev) => [...prev, ...newItems]);
    event.target.value = '';
  };

  const removeCustomIllustration = (id: string) => {
    setCustomIllustrations((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.dataUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  return (
    <section className={`panel-card ${collapsed ? 'panel-collapsed' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-icon">🏷️</span>
          附件插图
        </div>
        <button
          className="icon-button panel-collapse-toggle"
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? '展开' : '收起'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      <div className="hint" style={{ marginBottom: 8, fontSize: 11 }}>
        点击添加装饰元素到画布，然后可在图层面板调整位置和大小。
      </div>

      {/* Category tabs */}
      <div className="row-start" style={{ marginBottom: 8 }}>
        <button
          className={`button button-sm ${activeCategory === 'builtin' ? 'button-primary' : ''}`}
          onClick={() => setActiveCategory('builtin')}
        >
          内置装饰
        </button>
        <button
          className={`button button-sm ${activeCategory === 'custom' ? 'button-primary' : ''}`}
          onClick={() => setActiveCategory('custom')}
        >
          自定义插图
        </button>
      </div>

      {activeCategory === 'builtin' && (
        <>
          <div className="panel-subtitle" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            促销装饰
          </div>
          <div className="ai-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {BUILTIN_ILLUSTRATIONS.map((item) => (
              <button
                key={item.name}
                className="button button-sm"
                style={{
                  fontSize: 18,
                  padding: '6px 4px',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
                onClick={() => addEmojiAsLayer(item.emoji)}
                title={item.name}
              >
                <span style={{ fontSize: 22 }}>{item.emoji}</span>
                <span style={{ fontSize: 9, color: 'var(--color-text-secondary)' }}>{item.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {activeCategory === 'custom' && (
        <>
          <div className="panel-subtitle" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            上传插图
          </div>
          <label className="button button-sm" style={{ display: 'inline-flex', cursor: 'pointer', marginBottom: 8 }}>
            + 添加插图
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </label>

          {customIllustrations.length === 0 ? (
            <div className="hint" style={{ textAlign: 'center', padding: '20px 0' }}>
              暂无自定义插图<br />点击上方按钮上传
            </div>
          ) : (
            <div className="thumb-list" style={{ marginTop: 4 }}>
              {customIllustrations.map((item) => (
                <div key={item.id} className="thumb-item" style={{ aspectRatio: '1/1', cursor: 'pointer' }}>
                  <img
                    src={item.dataUrl}
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                    onClick={() => addCustomImageAsLayer(item.dataUrl)}
                  />
                  <div className="thumb-actions" style={{ position: 'absolute', top: 4, right: 4 }}>
                    <button
                      className="thumb-action"
                      onClick={(e) => { e.stopPropagation(); removeCustomIllustration(item.id); }}
                      title="删除"
                    >
                      ×
                    </button>
                  </div>
                  <div className="thumb-name">{item.name}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="hint" style={{ marginTop: 8, fontSize: 11 }}>
        提示：插图添加为自由图层，可在「图层」面板中调整位置、大小和旋转。
      </div>
    </section>
  );
}
