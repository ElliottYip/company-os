import { spawnSync } from "node:child_process";

const IMMUTABLE_IMAGE = /^[a-z0-9][a-z0-9./_-]*@sha256:[a-f0-9]{64}$/;

export async function inspectOciImageUsers(images, supplied = {}) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 16 ||
      images.some((image) => typeof image !== "string" || !IMMUTABLE_IMAGE.test(image)) ||
      new Set(images).size !== images.length) throw new Error("OCI_IMAGE_USER_IMAGE_SET_INVALID");
  const run = supplied.run ?? runDocker;
  const inspections = [];
  for (const image of images) {
    const declared = await run(["docker", "image", "inspect", "--format", "{{json .Config.User}}", image]);
    if (!declared.ok) throw new Error("OCI_IMAGE_USER_DECLARATION_INSPECTION_FAILED");
    let declaredUser;
    try { declaredUser = JSON.parse(declared.stdout.trim()); } catch {
      throw new Error("OCI_IMAGE_USER_DECLARATION_INSPECTION_INVALID");
    }
    if (typeof declaredUser !== "string") {
      throw new Error("OCI_IMAGE_USER_DECLARATION_INSPECTION_INVALID");
    }
    const base = ["docker", "run", "--rm", "--pull", "never", "--network", "none", "--read-only",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true", "--entrypoint", "/bin/cat", image];
    const passwd = await run([...base, "/etc/passwd"]); const group = await run([...base, "/etc/group"]);
    if (!passwd.ok || !group.ok || passwd.stdout.length < 4 || group.stdout.length < 4) {
      throw new Error("OCI_IMAGE_USER_ACCOUNT_DATABASE_INSPECTION_FAILED");
    }
    inspections.push({ image, declaredUser, passwdContents: passwd.stdout, groupContents: group.stdout });
  }
  return inspections;
}

function runDocker(argv) {
  const result = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 120_000,
    maxBuffer: 1_048_576, stdio: ["ignore", "pipe", "pipe"] });
  return Promise.resolve({ ok: result.status === 0 && !result.error, stdout: result.stdout ?? "" });
}
