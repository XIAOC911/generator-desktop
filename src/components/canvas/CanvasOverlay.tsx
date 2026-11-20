import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useEditorStore } from '@/app/store/useEditorStore';
import {
  computePsdCanvasMapping,
  findPsdLayerById,
  getPsdProductLayerIds,
  mapPsdBoundsToCanvas
} from '@/core/renderer/interaction';

type CanvasOverlayProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
};

export function CanvasOverlay({ canvasRef }: CanvasOverlayProps) {
  const state = useEditorStore();
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setRefreshTick((value) => value + 1));
    observer.observe(canvas);
    window.addEventListener('resize', handleWindowResize);
    function handleWindowResize() {
      setRefreshTick((value) => value + 1);
    }
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [canvasRef]);

  const overlaySlots = useMemo(() => {
    const canvas = canvasRef.current;
    if (!canvas) return [];
    if (state.canvas.backgroundType !== 'psd' || !state.canvas.backgroundPsdTemplateId) return [];
    const template = state.psdTemplates.find((item) => item.id === state.canvas.backgroundPsdTemplateId);
    if (!template) return [];

    const widthRatio = canvas.clientWidth / Math.max(1, canvas.width);
    const heightRatio = canvas.clientHeight / Math.max(1, canvas.height);
    const mapping = computePsdCanvasMapping(template.width, template.height, state.canvas.size);

    return getPsdProductLayerIds(template)
      .map((layerId) => {
        const layer = findPsdLayerById(template.layers, layerId);
        if (!layer?.visible || !layer.bounds) return null;
        const rect = mapPsdBoundsToCanvas(layer.bounds, mapping);
        return {
          layerId,
          layerName: layer.name,
          boundAssetName: template.slotBindings?.[layerId]?.assetName,
          selected: state.selectedPsdSlotId === layerId,
          left: rect.x * widthRatio,
          top: rect.y * heightRatio,
          width: rect.width * widthRatio,
          height: rect.height * heightRatio
        };
      })
      .filter(Boolean);
  }, [canvasRef, state.canvas.backgroundPsdTemplateId, state.canvas.backgroundType, state.canvas.size, state.psdTemplates, state.selectedPsdSlotId]);

  if (!overlaySlots.length) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none'
      }}
    >
      {overlaySlots.map((slot) => (
        <div
          key={slot!.layerId}
          style={{
            position: 'absolute',
            left: slot!.left,
            top: slot!.top,
            width: slot!.width,
            height: slot!.height,
            border: slot!.selected ? '2px solid #22c55e' : '2px dashed rgba(34,197,94,0.8)',
            background: slot!.selected ? 'rgba(34,197,94,0.14)' : 'rgba(34,197,94,0.06)',
            boxShadow: slot!.selected ? '0 0 0 2px rgba(255,255,255,0.35) inset' : undefined,
            borderRadius: 6,
            transition: 'all 0.12s ease'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -22,
              left: 0,
              maxWidth: '100%',
              padding: '2px 6px',
              fontSize: 10,
              lineHeight: '14px',
              color: '#fff',
              background: slot!.selected ? '#16a34a' : 'rgba(15,23,42,0.78)',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {slot!.layerName}{slot!.boundAssetName ? ` ← ${slot!.boundAssetName}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
