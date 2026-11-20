import type { TextLayer } from '@/core/models/layer';

export function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.globalAlpha = layer.opacity / 100;
  ctx.fillStyle = layer.color;
  ctx.font = `${layer.bold ? 'bold ' : ''}${Math.max(18, layer.fontSize || layer.scale)}px ${layer.fontFamily}`;
  ctx.textAlign = layer.textAlign || 'center';
  ctx.textBaseline = 'middle';
  if (layer.shadow) {
    ctx.shadowColor = layer.shadowColor || 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = Math.max(0, layer.shadowBlur ?? 8);
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
  }
  if (layer.stroke) {
    ctx.lineWidth = Math.max(2, layer.scale / 15);
    ctx.strokeStyle = layer.strokeColor || '#ffffff';
    ctx.strokeText(layer.text, 0, 0);
  }
  ctx.fillText(layer.text, 0, 0);
  ctx.restore();
}
