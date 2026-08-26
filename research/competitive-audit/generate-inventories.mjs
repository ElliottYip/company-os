import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const researchRoot = join(projectRoot, "research/competitive-audit");
const inventoryRoot = join(researchRoot, "inventories");
const assessmentRoot = join(researchRoot, "assessments");
const targets = JSON.parse(readFileSync(join(researchRoot, "targets.json"), "utf8"));
const mode = process.argv.includes("--check") ? "check"
  : process.argv.includes("--complete") ? "complete" : "write";

const requiredFields = [
  "function", "dependencyDirection", "keyDataModels", "lifecycle",
  "testAssessment", "designRationale", "companyOsProblem", "companyOsFit",
  "responsibilityConflict", "licenseAssessment", "decision", "evidence",
];

function git(sourceRoot, ...args) {
  return execFileSync("git", args, { cwd: sourceRoot, encoding: "utf8" }).trim();
}

function classify(path) {
  const lower = path.toLowerCase();
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|poetry\.lock|uv\.lock)$/.test(lower)) return "lockfile";
  if (/(^|\/)(vendor|third_party|third-party|node_modules)\//.test(lower)) return "vendored-third-party";
  if (/(^|\/)(patches|patch)\//.test(lower) || /\.patch$/.test(lower)) return "third-party-patch";
  if (/\.(png|jpe?g|gif|webp|ico|svg|mp4|mov|woff2?|ttf|zip|tgz|gz|pdf|dmg|deb|exe)$/i.test(path)) return "asset-or-binary";
  if (/(^|\/)(generated|dist|build)\//.test(lower) || /\.generated\.[^.]+$/.test(lower) || /\.map$/.test(lower)) return "generated-source";
  if (/(^|\/)(__tests__|tests?|test_|fixtures?|evals?|mocks?)(\/|$)/.test(lower) || /(^|\/)(test_[^/]+|[^/]+\.(test|spec))\.[^.]+$/.test(lower)) return "test-eval-or-fixture";
  if (/\.(md|mdx|rst)$/.test(lower) || /^(doc|docs)\//.test(lower)) return "documentation-or-instruction";
  if (/\.(ts|tsx|js|jsx|mjs|cjs|py|php|go|rs|java|kt|sql|sh|css|scss|html|vue|svelte)$/.test(lower)) return "first-party-source";
  return "configuration-or-metadata";
}

function childOrRoot(parts, index) {
  const value = parts[index];
  return !value || value.includes(".") ? "_root" : value;
}

function unitFor(targetId, path) {
  if (targetId === "paperclip") return null;
  const parts = path.split("/");
  if (["apps", "packages"].includes(parts[0]) && parts[1]) {
    if (parts[2] === "src") return `${parts[0]}:${parts[1]}/${childOrRoot(parts, 3)}`;
    return `${parts[0]}:${parts[1]}/${childOrRoot(parts, 2)}`;
  }
  if (targetId === "staffdeck") {
    if (parts[0] === "backend") return `backend:${childOrRoot(parts, 1)}`;
    if (parts[0] === "frontend-enterprise" && parts[1] === "src") return `frontend:${childOrRoot(parts, 2)}`;
  }
  if (targetId === "provision") {
    if (["app", "database", "tests", "config", "routes"].includes(parts[0])) return `${parts[0]}:${childOrRoot(parts, 1)}`;
    if (parts[0] === "resources" && parts[1] === "js") return `web:${childOrRoot(parts, 2)}`;
  }
  return `area:${parts[0]}`;
}

function renderTarget(target) {
  const sourceRoot = join(projectRoot, target.localPath);
  if (!existsSync(sourceRoot)) throw new Error(`${target.id}: checkout is missing`);
  const actualCommit = git(sourceRoot, "rev-parse", "HEAD");
  if (actualCommit !== target.commit) throw new Error(`${target.id}: source drift ${actualCommit}`);
  const raw = git(sourceRoot, "ls-files");
  const paths = raw ? raw.split("\n") : [];
  const units = new Map();
  const directories = new Map();
  const entries = paths.map((path) => {
    const unitId = unitFor(target.id, path);
    if (!unitId) throw new Error(`${target.id}: use its dedicated inventory gate`);
    const classification = classify(path);
    const unit = units.get(unitId) ?? { id: unitId, pathCount: 0, classifications: {} };
    unit.pathCount += 1;
    unit.classifications[classification] = (unit.classifications[classification] ?? 0) + 1;
    units.set(unitId, unit);
    const directory = dirname(path) === "." ? "." : dirname(path);
    const record = directories.get(directory) ?? { path: directory, pathCount: 0, unitIds: new Set(), classifications: {} };
    record.pathCount += 1;
    record.unitIds.add(unitId);
    record.classifications[classification] = (record.classifications[classification] ?? 0) + 1;
    directories.set(directory, record);
    return { path, unitId, classification, extension: extname(path).toLowerCase() || null };
  });
  return {
    schemaVersion: 1,
    generatedAt: targets.effectiveDate,
    source: {
      id: target.id, repository: target.repository, branch: target.branch,
      tag: target.tag, commit: target.commit, actualCommit,
      license: target.license, licenseFile: target.licenseFile,
      trackedPathCount: paths.length,
      commitCountAtPin: Number(git(sourceRoot, "rev-list", "--count", "HEAD")),
      latestCommit: git(sourceRoot, "log", "-1", "--format=%aI%x09%an%x09%s"),
    },
    completionRule: { noUnassignedTrackedPaths: true, completeUnitFields: requiredFields },
    units: [...units.values()].sort((a, b) => a.id.localeCompare(b.id)),
    directories: [...directories.values()].map((x) => ({ ...x, unitIds: [...x.unitIds].sort() })).sort((a, b) => a.path.localeCompare(b.path)),
    paths: entries,
  };
}

function validateCommittedSnapshot(target) {
  const inventoryPath = join(inventoryRoot, `${target.id}.json`);
  const assessmentPath = join(assessmentRoot, `${target.id}.json`);
  if (!existsSync(inventoryPath) || !existsSync(assessmentPath)) {
    throw new Error(`${target.id}: committed inventory or assessment is missing`);
  }
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  const assessments = JSON.parse(readFileSync(assessmentPath, "utf8"));
  if (inventory.source?.id !== target.id || inventory.source?.repository !== target.repository) {
    throw new Error(`${target.id}: committed inventory source identity drifted`);
  }
  if (inventory.source?.commit !== target.commit || inventory.source?.actualCommit !== target.commit) {
    throw new Error(`${target.id}: committed inventory pin drifted`);
  }
  if (inventory.source?.license !== target.license || inventory.source?.licenseFile !== target.licenseFile) {
    throw new Error(`${target.id}: committed license finding drifted`);
  }
  if (inventory.source?.trackedPathCount !== inventory.paths?.length) {
    throw new Error(`${target.id}: committed path count is inconsistent`);
  }
  const unitIds = new Set((inventory.units ?? []).map(({ id }) => id));
  if (!unitIds.size || (inventory.paths ?? []).some(({ path, unitId }) => !path || !unitIds.has(unitId))) {
    throw new Error(`${target.id}: committed inventory has unassigned paths`);
  }
  if (new Set(inventory.paths.map(({ path }) => path)).size !== inventory.paths.length) {
    throw new Error(`${target.id}: committed inventory contains duplicate paths`);
  }
  if (assessments.sourceCommit !== target.commit) {
    throw new Error(`${target.id}: committed assessments pin drifted`);
  }
  const assessmentIds = new Set((assessments.units ?? []).map(({ id }) => id));
  if (assessmentIds.size !== unitIds.size || [...unitIds].some((id) => !assessmentIds.has(id))) {
    throw new Error(`${target.id}: committed assessment coverage drifted`);
  }
  console.log(`${target.id}: verified committed evidence for ${inventory.paths.length} tracked paths in ${unitIds.size} units`);
}

mkdirSync(inventoryRoot, { recursive: true });
mkdirSync(assessmentRoot, { recursive: true });
const confirmed = targets.openSource.filter((target) => target.identityStatus === "CONFIRMED" && target.id !== "paperclip");
for (const target of confirmed) {
  if (mode === "check") {
    validateCommittedSnapshot(target);
    continue;
  }
  const inventory = renderTarget(target);
  const inventoryPath = join(inventoryRoot, `${target.id}.json`);
  const assessmentPath = join(assessmentRoot, `${target.id}.json`);
  const prior = existsSync(assessmentPath) ? JSON.parse(readFileSync(assessmentPath, "utf8")) : { units: [] };
  const priorById = new Map((prior.units ?? []).map((unit) => [unit.id, unit]));
  const assessments = {
    schemaVersion: 1,
    sourceCommit: target.commit,
    units: inventory.units.map((unit) => priorById.get(unit.id) ?? {
      id: unit.id, auditStatus: "PENDING", function: null,
      dependencyDirection: null, keyDataModels: null, lifecycle: null,
      testAssessment: null, designRationale: null, companyOsProblem: null,
      companyOsFit: null, responsibilityConflict: null,
      licenseAssessment: null, decision: null, evidence: [],
    }),
  };
  const renderedInventory = `${JSON.stringify(inventory, null, 2)}\n`;
  const renderedAssessments = `${JSON.stringify(assessments, null, 2)}\n`;
  if (mode === "complete") {
    if (!existsSync(inventoryPath) || readFileSync(inventoryPath, "utf8") !== renderedInventory) throw new Error(`${relative(projectRoot, inventoryPath)} is stale`);
    if (!existsSync(assessmentPath) || readFileSync(assessmentPath, "utf8") !== renderedAssessments) throw new Error(`${relative(projectRoot, assessmentPath)} is stale`);
  } else {
    writeFileSync(inventoryPath, renderedInventory);
    writeFileSync(assessmentPath, renderedAssessments);
  }
  if (mode === "complete") {
    const incomplete = assessments.units.filter((unit) => unit.auditStatus !== "COMPLETE" || requiredFields.some((field) => {
      const value = unit[field];
      return value === null || value === "" || (Array.isArray(value) && value.length === 0);
    }));
    if (incomplete.length) throw new Error(`${target.id}: ${incomplete.length} units incomplete`);
  }
  console.log(`${target.id}: ${inventory.paths.length} tracked paths, ${inventory.units.length} units`);
}

if (mode === "complete") {
  const unresolved = targets.openSource.filter((target) => target.identityStatus !== "CONFIRMED");
  const pendingCommercial = targets.commercial.filter((target) => target.status !== "COMPLETE");
  if (unresolved.length) throw new Error(`${unresolved.length} open-source identities unresolved`);
  if (pendingCommercial.length) throw new Error(`${pendingCommercial.length} commercial assessments incomplete`);
  execFileSync("node", [join(projectRoot, "research/paperclip/generate-repository-inventory.mjs"), "--complete"], { cwd: projectRoot, stdio: "inherit" });
}
