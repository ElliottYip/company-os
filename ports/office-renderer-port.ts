import type { OfficeScene } from "../core/office.ts";

export interface OfficeRendererInfo {
  readonly rendererId: string;
  readonly mode: "STRUCTURAL_PREVIEW" | "PRODUCTION";
  readonly officeSceneVersions: readonly ["1.0", ...string[]];
  readonly assetManifestVersions: readonly ["1.0", ...string[]];
  readonly actionSequenceVersions: readonly ["1.0", ...string[]];
}

export interface OfficeRendererPort {
  describe(): OfficeRendererInfo;
  render(scene: OfficeScene): Promise<void>;
}
