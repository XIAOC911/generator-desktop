import type { ImageLayer } from '@/core/models/layer';

interface Positioned {
  x: number;
  y: number;
  scale: number;
}

/**
 * Resolve overlaps between free layout layers by pushing them apart.
 * Uses an iterative overlap-push algorithm, applying gentle separations
 * until no significant collisions remain or max iterations reached.
 */
export function resolveFreeLayoutCollisions<T extends Positioned>(
  layers: T[],
  canvasSize = 1080
): T[] {
  if (layers.length <= 1) return layers;

  const margin = 60; // minimum distance from canvas edges
  const maxIterations = 8;
  const result = layers.map((layer) => ({ ...layer }));

  for (let iter = 0; iter < maxIterations; iter += 1) {
    let hasOverlap = false;

    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        const a = result[i];
        const b = result[j];

        // Approximate each layer as a circle with radius proportional to scale
        const aRadius = a.scale * 0.9;
        const bRadius = b.scale * 0.9;
        const minDist = aRadius + bRadius;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDist * 0.7 && dist > 0.1) {
          hasOverlap = true;
          const overlap = (minDist * 0.7 - dist) * 0.55; // gentle push
          const angle = Math.atan2(dy, dx);
          // Push b away from a
          (result[j] as T) = {
            ...b,
            x: Math.round(
              Math.max(margin, Math.min(canvasSize - margin, b.x + Math.cos(angle) * overlap))
            ),
            y: Math.round(
              Math.max(margin, Math.min(canvasSize - margin, b.y + Math.sin(angle) * overlap))
            )
          };
        }
      }
    }

    if (!hasOverlap) break;
  }

  return result;
}

/**
 * Pull free layout layers toward the canvas center to reduce whitespace,
 * then re-resolve any collisions introduced by the tightening.
 */
export function tightenFreeLayout<T extends Positioned>(
  layers: T[],
  canvasSize = 1080
): T[] {
  if (layers.length <= 1) return layers;

  // Compute current bounding center of all layers
  let sumX = 0;
  let sumY = 0;
  for (const layer of layers) {
    sumX += layer.x;
    sumY += layer.y;
  }
  const currentCenterX = sumX / layers.length;
  const currentCenterY = sumY / layers.length;
  const targetCenterX = canvasSize / 2;
  const targetCenterY = canvasSize / 2;

  // Pull layers toward canvas center
  const pullStrength = 0.22;
  const margin = 60;
  const tightened = layers.map((layer) => ({
    ...layer,
    x: Math.round(
      Math.max(margin, Math.min(canvasSize - margin, layer.x + (targetCenterX - currentCenterX) * pullStrength))
    ),
    y: Math.round(
      Math.max(margin, Math.min(canvasSize - margin, layer.y + (targetCenterY - currentCenterY) * pullStrength))
    )
  })) as T[];

  // Re-resolve any collisions introduced by tightening
  return resolveFreeLayoutCollisions(tightened, canvasSize);
}
