import type { RedriveConnectorCommands } from "../../application/redrive-connector-commands.ts";

/** Thin process-lifecycle adapter; recovery policy remains in application. */
export function startConnectorCommandSupervisor(
  redrive: RedriveConnectorCommands,
  options: { readonly intervalMs: number; readonly onError?: (error: unknown) => void },
): () => void {
  if (!Number.isInteger(options.intervalMs) || options.intervalMs < 1_000) {
    throw new Error("CONNECTOR_SUPERVISOR_INTERVAL_INVALID");
  }
  let stopped = false;
  const run = () => {
    if (stopped) return;
    void redrive.tick().catch((error) => options.onError?.(error));
  };
  run();
  const timer = setInterval(run, options.intervalMs);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
