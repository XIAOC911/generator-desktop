import type { MattingRequest, MattingResult } from '@/core/models/matting';

export interface MattingProvider {
  name: string;
  cutout(input: MattingRequest): Promise<MattingResult>;
}
