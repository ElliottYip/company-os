export interface StagingRuntimeSnapshot {
  readonly expected: {
    readonly releaseId: string;
    readonly releaseVersion: string;
    readonly sourceRevision: string;
    readonly images: { readonly api: string; readonly web: string };
  };
  readonly startupState: null | {
    readonly state: "STARTING" | "STARTED_NOT_ACCEPTED" | "START_FAILED_REQUIRES_REVIEW";
    readonly releaseId: string;
    readonly sourceRevision: string;
    readonly acceptanceClaimed: boolean;
  };
  readonly containers: readonly {
    readonly service: string;
    readonly image: string;
    readonly status: string;
    readonly health: string | null;
  }[];
  readonly probes: { readonly apiReady: boolean; readonly webReachable: boolean };
}

export interface StagingRuntimeStatus {
  readonly schemaVersion: 1;
  readonly status: "NOT_STARTED" | "RUNNING_NOT_ACCEPTED" | "START_INCOMPLETE_REQUIRES_REVIEW" |
    "START_FAILED_REQUIRES_REVIEW" | "DEGRADED_REQUIRES_REVIEW";
  readonly acceptanceClaimed: false;
  readonly release: { readonly id: string; readonly version: string; readonly sourceRevision: string };
  readonly findings: readonly { readonly code: string; readonly subject: string }[];
}

export function evaluateStagingRuntimeStatus(snapshot: StagingRuntimeSnapshot): StagingRuntimeStatus {
  const release = { id: snapshot.expected.releaseId, version: snapshot.expected.releaseVersion,
    sourceRevision: snapshot.expected.sourceRevision };
  if (!snapshot.startupState) return { schemaVersion: 1, status: "NOT_STARTED",
    acceptanceClaimed: false, release, findings: [] };
  const findings: { code: string; subject: string }[] = [];
  const add = (code: string, subject: string) => findings.push({ code, subject });
  const stateStatus = snapshot.startupState.state === "STARTING" ? "START_INCOMPLETE_REQUIRES_REVIEW" :
    snapshot.startupState.state === "START_FAILED_REQUIRES_REVIEW" ? "START_FAILED_REQUIRES_REVIEW" : null;
  if (snapshot.startupState.state === "STARTING") add("STARTUP_STATE_INCOMPLETE", "startup-state");
  if (snapshot.startupState.state === "START_FAILED_REQUIRES_REVIEW") add("STARTUP_STATE_FAILED", "startup-state");
  if (snapshot.startupState.releaseId !== snapshot.expected.releaseId) {
    add("STARTUP_RELEASE_MISMATCH", "startup-state");
  }
  if (snapshot.startupState.sourceRevision !== snapshot.expected.sourceRevision) {
    add("STARTUP_SOURCE_MISMATCH", "startup-state");
  }
  if (snapshot.startupState.acceptanceClaimed) add("UNVERIFIED_ACCEPTANCE_CLAIM", "startup-state");
  for (const service of ["api", "web"] as const) {
    const records = snapshot.containers.filter((container) => container.service === service);
    if (records.length === 0) { add("CONTAINER_MISSING", service); continue; }
    if (records.length > 1) add("CONTAINER_DUPLICATE", service);
    const record = records[0] as StagingRuntimeSnapshot["containers"][number];
    if (record.image !== snapshot.expected.images[service]) add("CONTAINER_IMAGE_MISMATCH", service);
    if (record.status !== "running") add("CONTAINER_NOT_RUNNING", service);
    if (record.health !== "healthy") add("CONTAINER_NOT_HEALTHY", service);
  }
  if (!snapshot.probes.apiReady) add("API_NOT_READY", "api");
  if (!snapshot.probes.webReachable) add("WEB_NOT_REACHABLE", "web");
  return { schemaVersion: 1, status: stateStatus ?? (findings.length ? "DEGRADED_REQUIRES_REVIEW" : "RUNNING_NOT_ACCEPTED"),
    acceptanceClaimed: false, release, findings };
}
