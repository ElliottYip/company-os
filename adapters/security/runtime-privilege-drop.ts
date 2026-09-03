export interface RuntimeIdentityProcess {
  getuid?: () => number;
  getgid?: () => number;
  setgroups?: (groups: readonly number[]) => void;
  setgid?: (gid: number) => void;
  setuid?: (uid: number) => void;
}

function identity(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throw new Error(`${name}_INVALID`);
  }
  return parsed;
}

/**
 * Allows a hardened container to read root-owned deployment secrets during
 * bootstrap and irreversibly shed root before it begins serving requests.
 */
export function dropRuntimePrivileges(
  environment: NodeJS.ProcessEnv = process.env,
  runtime: RuntimeIdentityProcess = process,
): void {
  const uid = identity(environment.COMPANY_OS_RUNTIME_UID, "COMPANY_OS_RUNTIME_UID");
  const gid = identity(environment.COMPANY_OS_RUNTIME_GID, "COMPANY_OS_RUNTIME_GID");
  if (uid === undefined && gid === undefined) return;
  if (uid === undefined || gid === undefined) throw new Error("COMPANY_OS_RUNTIME_IDENTITY_INCOMPLETE");
  if (!runtime.getuid || !runtime.getgid || !runtime.setgroups || !runtime.setgid || !runtime.setuid) {
    throw new Error("COMPANY_OS_RUNTIME_PRIVILEGE_DROP_UNAVAILABLE");
  }
  const currentUid = runtime.getuid();
  const currentGid = runtime.getgid();
  if (currentUid === uid && currentGid === gid) return;
  if (currentUid !== 0) throw new Error("COMPANY_OS_RUNTIME_PRIVILEGE_DROP_FORBIDDEN");
  runtime.setgroups([]);
  runtime.setgid(gid);
  runtime.setuid(uid);
  if (runtime.getuid() !== uid || runtime.getgid() !== gid) {
    throw new Error("COMPANY_OS_RUNTIME_PRIVILEGE_DROP_FAILED");
  }
}
