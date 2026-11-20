import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react';
import { renderCanvasScene } from '@/core/renderer/canvas-renderer';
import { editorStore } from '@/app/store/editorStore';
import { useEditorStore } from '@/app/store/useEditorStore';
import { getLayerDimensions, hitLayerHandle, hitPsdProductSlot, hitTopLayer, type CanvasPoint } from '@/core/renderer/interaction';
import type { TextLayer } from '@/core/models/layer';
import { DEFAULT_FILTERS } from '@/core/constants/defaults';
import { CanvasOverlay } from './CanvasOverlay';

type DragMode = 'move' | 'resize' | 'rotate';

type DragSession = {
  layerId: string;
  mode: DragMode;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startScale: number;
  startRotation: number;
  startDistance: number;
  startAngle: number;
};

/** 读取图片的原始宽高，用于创建图层时保持长宽比 */
function loadImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 200, h: 200 }); // 加载失败降级为方形
    img.src = src;
  });
}

type TextEditSession = {
  layerId: string;
  value: string;
};

function getCanvasPoint(canvas: HTMLCanvasElement, event: ReactPointerEvent<HTMLCanvasElement>): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

export function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const renderIdRef = useRef(0);
  const [textEdit, setTextEdit] = useState<TextEditSession | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const state = useEditorStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 离屏 canvas：完全渲染后再一次性拷贝到可见画布，避免异步渲染过程中出现红色闪烁
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    const offscreen = offscreenRef.current;

    const render = async () => {
      const renderId = ++renderIdRef.current;
      const nextState = editorStore.getState();
      const size = nextState.canvas.size;

      console.log(`[CanvasStage] render#${renderId} bgType=${nextState.canvas.backgroundType} hasUrl=${!!nextState.canvas.backgroundImageUrl} hasPsdTemplate=${!!nextState.psdTemplates.find(t => t.id === nextState.canvas.backgroundPsdTemplateId)} layers=${nextState.layers.length}`);

      // 只在画布尺寸变化时重置
      if (canvas.width !== size) canvas.width = size;
      if (canvas.height !== size) canvas.height = size;
      if (offscreen.width !== size) offscreen.width = size;
      if (offscreen.height !== size) offscreen.height = size;

      try {
        // 先渲染到离屏画布（用户不可见）
        await renderCanvasScene(offscreen, nextState);
        // 如果在此期间有新的渲染请求，跳过后续（当前渲染已过时）
        if (renderId !== renderIdRef.current) return;
        // 一次性完整拷贝到可见画布 — 用户永远看不到半成品
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(offscreen, 0, 0);
          console.log(`[CanvasStage] render#${renderId} completed (drew to visible canvas)`);
        }
      } catch (err) {
        console.error('[Canvas Render] error:', err);
      }
    };

    render();
    return editorStore.subscribe(() => {
      void render();
    });
  }, []);

  useEffect(() => {
    if (textEdit) {
      textInputRef.current?.focus();
      textInputRef.current?.select();
    }
  }, [textEdit]);

  useEffect(() => {
    if (!textEdit) return;
    const layerStillExists = editorStore.getState().layers.some((layer) => layer.id === textEdit.layerId);
    if (!layerStillExists) {
      setTextEdit(null);
    }
  }, [state.layers, textEdit]);

  // Keyboard shortcuts: Delete/Backspace for layer removal, Ctrl+Z/Ctrl+Shift+Z for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      // Ctrl+Z / Ctrl+Shift+Z: undo / redo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        if (event.shiftKey) {
          event.preventDefault();
          editorStore.redo();
        } else {
          event.preventDefault();
          editorStore.undo();
        }
        return;
      }
      // Ctrl+Y: redo (alternative)
      if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
        event.preventDefault();
        editorStore.redo();
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      // Don't delete if user is typing in an input, textarea, or text editor
      const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ((event.target as HTMLElement)?.isContentEditable) return;
      const current = editorStore.getState();
      const active = current.layers.find((layer) => layer.id === current.activeLayerId);
      if (!active) return;
      event.preventDefault();
      editorStore.removeLayer(active.id);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeLayer = useMemo(
    () => state.layers.find((layer) => layer.id === state.activeLayerId),
    [state.activeLayerId, state.layers]
  );

  const editingLayer = useMemo(() => {
    if (!textEdit) return undefined;
    const layer = state.layers.find((item) => item.id === textEdit.layerId);
    return layer?.type === 'text' ? (layer as TextLayer) : undefined;
  }, [state.layers, textEdit]);

  const textEditorStyle = useMemo(() => {
    const canvas = canvasRef.current;
    if (!canvas || !editingLayer) return undefined;
    const widthRatio = canvas.clientWidth / canvas.width;
    const heightRatio = canvas.clientHeight / canvas.height;
    const { width } = getLayerDimensions(editingLayer);
    const fontSize = Math.max(18, editingLayer.scale) * heightRatio;

    return {
      left: `${editingLayer.x * widthRatio}px`,
      top: `${editingLayer.y * heightRatio}px`,
      width: `${Math.max(160, width * widthRatio + 24)}px`,
      fontSize: `${fontSize}px`,
      color: editingLayer.color,
      fontFamily: editingLayer.fontFamily,
      fontWeight: editingLayer.bold ? 700 : 400,
      transform: `translate(-50%, -50%) rotate(${editingLayer.rotation}deg)`
    };
  }, [editingLayer, state.canvas.size, textEdit]);

  const finishTextEditing = (commit: boolean) => {
    if (textEdit && commit) {
      editorStore.updateLayer(textEdit.layerId, { text: textEdit.value || '请输入文案' });
      editorStore.setActiveLayerId(textEdit.layerId);
    }
    setTextEdit(null);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (textEdit) {
      finishTextEditing(true);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = getCanvasPoint(canvas, event);
    const currentState = editorStore.getState();
    const activePsd = currentState.psdTemplates.find((t) => t.id === currentState.canvas.backgroundPsdTemplateId);

    // 先检查是否点击了 active 图层的操作手柄
    if (currentState.activeLayerId) {
      const selectedLayer = currentState.layers.find((layer) => layer.id === currentState.activeLayerId);
      if (selectedLayer) {
        const handle = hitLayerHandle(selectedLayer, point);
        if (handle) {
          dragRef.current = {
            layerId: selectedLayer.id,
            mode: handle,
            pointerId: event.pointerId,
            offsetX: point.x - selectedLayer.x,
            offsetY: point.y - selectedLayer.y,
            startScale: selectedLayer.scale,
            startRotation: selectedLayer.rotation,
            startDistance: Math.hypot(point.x - selectedLayer.x, point.y - selectedLayer.y),
            startAngle: Math.atan2(point.y - selectedLayer.y, point.x - selectedLayer.x)
          };
          canvas.setPointerCapture(event.pointerId);
          return;
        }
      }
    }

    const hitLayer = hitTopLayer(currentState.layers, point);
    if (!hitLayer && currentState.canvas.backgroundType === 'psd' && activePsd) {
      const hitSlot = hitPsdProductSlot(activePsd, currentState.canvas.size, point);
      if (hitSlot) {
        editorStore.setSelectedPsdSlotId(hitSlot.layerId);
        editorStore.setActiveLayerId(undefined);
        return;
      }
      if (currentState.selectedPsdSlotId) {
        editorStore.setSelectedPsdSlotId(undefined);
      }
    }
    if (!hitLayer) {
      editorStore.setActiveLayerId(undefined);
      return;
    }

    // 锁定图层不可拖拽编辑，但仍可选中查看属性
    if (hitLayer.locked) {
      // Ctrl/Cmd + Click: 可多选
      if (event.ctrlKey || event.metaKey) {
        editorStore.toggleLayerSelection(hitLayer.id);
        editorStore.setActiveLayerId(hitLayer.id);
      } else {
        editorStore.setActiveLayerId(hitLayer.id);
      }
      return;
    }

    // Ctrl/Cmd + Click: 切换多选
    if (event.ctrlKey || event.metaKey) {
      editorStore.toggleLayerSelection(hitLayer.id);
      editorStore.setActiveLayerId(hitLayer.id);
    } else {
      // 没按 Ctrl：单选，重置选中
      editorStore.setActiveLayerId(hitLayer.id);
    }

    dragRef.current = {
      layerId: hitLayer.id,
      mode: 'move',
      pointerId: event.pointerId,
      offsetX: point.x - hitLayer.x,
      offsetY: point.y - hitLayer.y,
      startScale: hitLayer.scale,
      startRotation: hitLayer.rotation,
      startDistance: Math.hypot(point.x - hitLayer.x, point.y - hitLayer.y),
      startAngle: Math.atan2(point.y - hitLayer.y, point.x - hitLayer.x)
    };
    canvas.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    if (!canvas || !drag || drag.pointerId !== event.pointerId) return;
    const point = getCanvasPoint(canvas, event);
    const currentState = editorStore.getState();
    const layer = currentState.layers.find((item) => item.id === drag.layerId);
    if (!layer) return;

    if (drag.mode === 'move') {
      editorStore.updateLayer(layer.id, {
        x: point.x - drag.offsetX,
        y: point.y - drag.offsetY
      });
      return;
    }

    if (drag.mode === 'resize') {
      const distance = Math.hypot(point.x - layer.x, point.y - layer.y);
      const nextScale = Math.max(24, Math.min(1000, drag.startScale * (distance / Math.max(1, drag.startDistance))));
      editorStore.updateLayer(layer.id, { scale: nextScale });
      return;
    }

    const angle = Math.atan2(point.y - layer.y, point.x - layer.x);
    const nextRotation = drag.startRotation + ((angle - drag.startAngle) * 180) / Math.PI;
    editorStore.updateLayer(layer.id, { rotation: Math.round(nextRotation) });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }
  };

  const handleDoubleClick = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = getCanvasPoint(canvas, event);
    const hitLayer = hitTopLayer(editorStore.getState().layers, point);
    if (hitLayer?.type !== 'text' || hitLayer.locked) return;
    editorStore.setActiveLayerId(hitLayer.id);
    setTextEdit({
      layerId: hitLayer.id,
      value: hitLayer.text
    });
  };

  const handleTextEditKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      finishTextEditing(true);
    }
    if (event.key === 'Escape') {
      finishTextEditing(false);
    }
  };

  return (
    <section className="stage-panel" style={{ position: 'relative' }}>
      <div className="stage-grid" />
      <div
        className="stage-canvas-wrap"
        style={{
          position: 'relative',
          maxWidth: '100%',
          outline: dragOver ? '3px dashed var(--color-accent)' : undefined,
          outlineOffset: 4,
          borderRadius: 8,
          transition: 'outline 0.15s'
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          // 只在真正离开容器时才取消高亮（避免进入子元素时闪烁）
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragOver(false);
          }
        }}
        onDrop={async (event) => {
          event.preventDefault();
          setDragOver(false);
          const raw = event.dataTransfer.getData('text/plain');
          if (!raw || !raw.startsWith('asset:')) return;
          const assetId = raw.slice(6);
          const currentState = editorStore.getState();
          const asset = currentState.sourceAssets.find((a) => a.id === assetId);
          if (!asset) return;

          const canvas = canvasRef.current;
          if (!canvas) return;

          // 加载图片原始尺寸，确保图层保持长宽比
          const dims = await loadImageDimensions(asset.previewUrl);
          // 优先使用用户在素材管理里设置的 defaultScale，否则自适应计算
          const canvasSize = currentState.canvas.size;
          const defaultScale = asset.defaultScale
            ? asset.defaultScale
            : Math.max(30, Math.min(180, Math.round(Math.min(canvasSize * 0.35 / dims.w, canvasSize * 0.35 / dims.h) * 100)));

          const activePsd = currentState.psdTemplates.find(
            (t) => t.id === currentState.canvas.backgroundPsdTemplateId
          );

          // PSD 模式：手动排版模式下拖入素材创建自由图层
          if (currentState.canvas.backgroundType === 'psd' && activePsd) {
            if (currentState.psdManualMode) {
              // 手动模式：创建自由图层，用户自行排版
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const x = (event.clientX - rect.left) * scaleX;
              const y = (event.clientY - rect.top) * scaleY;
              editorStore.addLayer({
                id: Math.random().toString(36).slice(2, 10),
                type: 'image',
                x, y,
                scale: defaultScale,
                rotation: 0,
                opacity: 100,
                filters: { ...DEFAULT_FILTERS },
                visible: true,
                sourceFileId: asset.id,
                sourceName: '素材图层',
                previewUrl: asset.previewUrl,
                originalPath: (asset as any).originalPath,
                freeSourceLayer: true,
                naturalWidth: dims.w,
                naturalHeight: dims.h,
              });
            } else {
              // 自动模式：选中素材，PSD 渲染自动替换产品层
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const point = {
                x: (event.clientX - rect.left) * scaleX,
                y: (event.clientY - rect.top) * scaleY
              };
              const hitSlot = hitPsdProductSlot(activePsd, currentState.canvas.size, point);
              const productLayerIds = Object.entries(activePsd.layerRoles ?? {})
                .filter(([, role]) => role === 'placeholder')
                .map(([id]) => id);
              const targetSlotId =
                currentState.selectedPsdSlotId ??
                hitSlot?.layerId ??
                productLayerIds[0] ??
                activePsd.selectedProductLayerId;
              if (targetSlotId) {
                editorStore.bindAssetToPsdSlot(activePsd.id, targetSlotId, assetId);
              } else {
                editorStore.toggleAssetSelection(assetId);
              }
            }
            return;
          }

          // 非 PSD 模式：新建一个图片叠加层
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const x = (event.clientX - rect.left) * scaleX;
          const y = (event.clientY - rect.top) * scaleY;

          editorStore.addLayer({
            id: Math.random().toString(36).slice(2, 10),
            type: 'image',
            x,
            y,
            scale: defaultScale,
            rotation: 0,
            opacity: 100,
            filters: { ...DEFAULT_FILTERS },
            visible: true,
            sourceFileId: asset.id,
            sourceName: currentState.psdManualMode ? '素材图层' : asset.name,
            previewUrl: asset.previewUrl,
            originalPath: (asset as any).originalPath,
            freeSourceLayer: true,
            naturalWidth: dims.w,
            naturalHeight: dims.h,
          });
        }}
      >
        <canvas
          ref={canvasRef}
          className="stage-canvas"
          style={{ width: '100%', height: 'auto' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        />
        <CanvasOverlay canvasRef={canvasRef} />
        {textEdit && editingLayer && textEditorStyle ? (
          <input
            ref={textInputRef}
            className="canvas-text-editor"
            value={textEdit.value}
            style={textEditorStyle}
            onChange={(event) => setTextEdit((current) => (current ? { ...current, value: event.target.value } : current))}
            onBlur={() => finishTextEditing(true)}
            onKeyDown={handleTextEditKeyDown}
            onPointerDown={(event) => event.stopPropagation()}
          />
        ) : null}
      </div>
    </section>
  );
}
