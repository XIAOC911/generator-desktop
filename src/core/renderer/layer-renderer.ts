import type { AppState } from '@/core/models/project';
import type { Layer } from '@/core/models/layer';
import { drawImageLayer } from './image-renderer';
import { drawTextLayer } from './text-renderer';
import { getLayerDimensions, getLayerWorldHandlePosition } from './interaction';

function drawSelection(ctx: CanvasRenderingContext2D, layer: Layer) {
  const { width, height } = getLayerDimensions(layer);
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#409eff';
  ctx.strokeRect(-width / 2, -height / 2, width, height);
  ctx.setLineDash([]);
  ctx.restore();

  const resize = getLayerWorldHandlePosition(layer, 'resize');
  const rotate = getLayerWorldHandlePosition(layer, 'rotate');

  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#409eff';
  ctx.fillRect(resize.x - 6, resize.y - 6, 12, 12);
  ctx.strokeRect(resize.x - 6, resize.y - 6, 12, 12);

  ctx.beginPath();
  ctx.moveTo(layer.x, layer.y);
  ctx.lineTo(rotate.x, rotate.y);
  ctx.strokeStyle = '#94a3b8';
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = '#06b6d4';
  ctx.arc(rotate.x, rotate.y, 8, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export async function drawLayerCollection(ctx: CanvasRenderingContext2D, state: AppState) {
  const selectedIds = new Set(state.selectedLayerIds || []);
  for (const layer of state.layers) {
    if (!(layer.visible ?? true)) continue;

    if (layer.type === 'image') {
      await drawImageLayer(ctx, layer);
    } else {
      drawTextLayer(ctx, layer);
    }

    if (selectedIds.has(layer.id)) {
      drawSelection(ctx, layer);
    }
  }
}
