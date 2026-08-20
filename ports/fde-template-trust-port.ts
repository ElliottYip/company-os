import type { FdeTemplate } from "../core/fde-template.ts";

export type FdeTemplateTrustDecision =
  | {
      readonly trusted: true;
      readonly verifiedDigest: string;
      readonly publisherId: string;
    }
  | { readonly trusted: false; readonly code: string };

/** Deployment-owned signature/trust verification boundary. */
export interface FdeTemplateTrustPort {
  verify(template: FdeTemplate): Promise<FdeTemplateTrustDecision>;
}
