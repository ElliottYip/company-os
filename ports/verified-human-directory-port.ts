import type { Identifier } from "../core/control-plane.ts";

/** Server-side lookup of an already verified external identity; never exposes tokens. */
export interface VerifiedHumanDirectoryPort {
  findVerifiedHumanIdByEmail(email: string): Promise<Identifier | null>;
}
