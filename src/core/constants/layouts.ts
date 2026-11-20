export type LayoutDefinition = {
  id: string;
  name: string;
  slots: number;
  containers: Array<{ x: number; y: number; w: number; h: number; rotation?: number }>;
};

export const LAYOUTS: Record<string, LayoutDefinition> = {
  '2_up_vertical': {
    id: '2_up_vertical',
    name: '2图上下',
    slots: 2,
    containers: [
      { x: 0, y: 0, w: 1080, h: 535 },
      { x: 0, y: 545, w: 1080, h: 535 }
    ]
  },
  '2_up_fan': {
    id: '2_up_fan',
    name: '2图对角',
    slots: 2,
    containers: [
      { x: 0, y: 0, w: 700, h: 700 },
      { x: 380, y: 380, w: 700, h: 700 }
    ]
  },
  '3_up_stream': {
    id: '3_up_stream',
    name: '3图流线',
    slots: 3,
    containers: [
      { x: 0, y: 0, w: 600, h: 600 },
      { x: 240, y: 240, w: 600, h: 600 },
      { x: 480, y: 480, w: 600, h: 600 }
    ]
  },
  '3_up_pyramid': {
    id: '3_up_pyramid',
    name: '3图金字塔',
    slots: 3,
    containers: [
      { x: 140, y: 10, w: 800, h: 520 },
      { x: 0, y: 520, w: 530, h: 560, rotation: -15 },
      { x: 550, y: 520, w: 530, h: 560, rotation: 15 }
    ]
  },
  '4_up_grid': {
    id: '4_up_grid',
    name: '4图田字格',
    slots: 4,
    containers: [
      { x: 0, y: 0, w: 540, h: 540 },
      { x: 540, y: 0, w: 540, h: 540 },
      { x: 0, y: 540, w: 540, h: 540 },
      { x: 540, y: 540, w: 540, h: 540 }
    ]
  },
  '5_up_pyramid': {
    id: '5_up_pyramid',
    name: '5图金字塔',
    slots: 5,
    containers: [
      { x: 90, y: 10, w: 900, h: 450 },
      { x: 0, y: 460, w: 540, h: 310 },
      { x: 540, y: 460, w: 540, h: 310 },
      { x: 0, y: 770, w: 540, h: 310 },
      { x: 540, y: 770, w: 540, h: 310 }
    ]
  }
};
