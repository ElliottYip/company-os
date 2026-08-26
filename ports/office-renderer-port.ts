import type { OfficeScene } from "../core/office.ts";

export interface OfficeRendererCapabilities {
  readonly orthographicCamera: boolean;
  readonly horizontalOrbit: boolean;
  readonly lockedPitch: boolean;
  readonly wallOcclusionFade: boolean;
  readonly focusSelection: boolean;
}

export interface OfficeCameraPolicy {
  readonly projection: "ORTHOGRAPHIC";
  readonly pitchDegrees: number;
  readonly yaw: {
    readonly mode: "HORIZONTAL_ORBIT_WITH_SNAP";
    readonly snapDegrees: readonly number[];
  };
  readonly zoom: { readonly minimum: number; readonly maximum: number };
  readonly wallOcclusion: {
    readonly mode: "FADE_BLOCKING_WALLS";
    readonly blockingOpacity: number;
    readonly transitionMs: number;
    readonly preserveCollision: true;
  };
}

export interface OfficeRendererInfo {
  readonly rendererId: string;
  readonly mode: "STRUCTURAL_PREVIEW" | "PRODUCTION";
  readonly officeSceneVersions: readonly ["1.0", ...string[]];
  readonly assetManifestVersions: readonly ["1.0", ...string[]];
  readonly actionSequenceVersions: readonly ["1.0", ...string[]];
  readonly capabilities: OfficeRendererCapabilities;
}

export interface OfficeRendererPort {
  describe(): OfficeRendererInfo;
  render(scene: OfficeScene, options?: {
    readonly cameraPolicy?: OfficeCameraPolicy;
    readonly focusedModuleId?: string;
    readonly focusedEntityId?: string;
  }): Promise<void>;
}
