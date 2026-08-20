import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type { AppendResult, EventDataStorePort } from "./event-data-store-port.ts";

export interface OutboxPublicationDraft {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly topic: string;
  readonly partitionKey: string;
  readonly payload: unknown;
  readonly occurredAt: string;
}

export interface OutboxPublication extends OutboxPublicationDraft {
  readonly sequence: number;
  readonly status: "PENDING" | "DELIVERED";
  readonly deliveredAt: string | null;
}

export interface DurableCommitCommand {
  readonly event: CompanyDomainEvent;
  readonly publications: readonly OutboxPublicationDraft[];
  readonly expectedEventSequence: number;
}

export interface DurableCommitResult extends AppendResult {
  readonly publicationSequences: readonly number[];
}

export interface ProjectionCheckpoint {
  readonly companyId: Identifier;
  readonly projectionName: string;
  readonly eventSequence: number;
  readonly updatedAt: string;
}

export interface SaveProjectionCheckpointCommand extends ProjectionCheckpoint {
  readonly expectedEventSequence: number;
}

/**
 * Atomic persistence boundary for events, external publications, and replayable
 * read-model cursors. Implementations must persist the event and every outbox
 * publication as one transaction.
 */
export interface DurableControlPlaneStorePort extends EventDataStorePort {
  commit(command: DurableCommitCommand): Promise<DurableCommitResult>;
  readPendingPublications(
    companyId: Identifier,
    options: { readonly afterSequence: number; readonly limit: number },
  ): Promise<readonly OutboxPublication[]>;
  markPublicationDelivered(
    companyId: Identifier,
    publicationId: Identifier,
    deliveredAt: string,
  ): Promise<void>;
  loadProjectionCheckpoint(
    companyId: Identifier,
    projectionName: string,
  ): Promise<ProjectionCheckpoint | null>;
  saveProjectionCheckpoint(command: SaveProjectionCheckpointCommand): Promise<void>;
  exportBackup(companyId: Identifier): Promise<string>;
  restoreBackup(companyId: Identifier, source: string): Promise<void>;
}
