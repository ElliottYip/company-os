import type { OfficeScene } from "../core/office.ts";

export interface OfficeRendererPort {
  render(scene: OfficeScene): Promise<void>;
}

