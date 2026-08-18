import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = join(projectRoot, "work/upstream-audit/paperclip");
const manifestPath = join(projectRoot, "research/paperclip/audit-manifest.json");
const outputPath = join(projectRoot, "research/paperclip/repository-inventory.json");
const assessmentPath = join(projectRoot, "research/paperclip/unit-assessments.json");
const batchesPath = join(projectRoot, "research/paperclip/audit-batches");
const auditManifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function git(...args) {
  return execFileSync("git", args, { cwd: sourceRoot, encoding: "utf8" }).trim();
}

function trackedPaths() {
  const output = git("ls-files");
  return output ? output.split("\n") : [];
}

function packageUnit(path) {
  const parts = path.split("/");
  if (parts[0] !== "packages") return null;
  if (parts[1] === "adapters" && parts[2]) return `package:adapter/${parts[2]}`;
  if (parts[1] === "plugins" && parts[2] === "sandbox-providers" && parts[3]) {
    if (parts[4] === "bridge-template") return `package:plugin-sandbox/${parts[3]}/bridge-template`;
    return `package:plugin-sandbox/${parts[3]}`;
  }
  if (parts[1] === "plugins" && parts[2] === "examples" && parts[3]) {
    return `package:plugin-example/${parts[3]}`;
  }
  if (parts[1] === "plugins" && parts[2]) return `package:plugin/${parts[2]}`;
  return parts[1] ? `package:${parts[1]}` : "area:packages";
}

function moduleStem(fileName) {
  return fileName
    .replace(/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i, "")
    .replace(/\.(ts|tsx|js|jsx|mjs|cjs|md|json)$/i, "");
}

function applicationUnit(path, root) {
  const parts = path.split("/");
  if (parts[0] !== root) return null;
  if (parts[1] !== "src") return `application:${root}/${parts[1] ?? "root"}`;
  const area = parts[2] ?? "root";
  if (root === "ui" && ["components", "pages", "lib", "api", "adapters"].includes(area)) {
    const child = parts[3]?.includes(".") ? moduleStem(parts[3]) : (parts[3] ?? "_root");
    return `application:ui/${area}/${child}`;
  }
  if (root === "server" && area === "services") {
    const child = parts[3]?.includes(".") ? moduleStem(parts[3]) : (parts[3] ?? "_root");
    return `application:server/services/${child}`;
  }
  if (root === "server" && ["routes", "__tests__"].includes(area) && parts[3]) {
    return `application:server/${area}/${moduleStem(parts[3])}`;
  }
  if (root === "cli" && parts[3]) {
    const child = parts[3].includes(".") ? moduleStem(parts[3]) : parts[3];
    return `application:cli/${area}/${child}`;
  }
  return `application:${root}/${area}`;
}

function unitFor(path) {
  return packageUnit(path)
    ?? applicationUnit(path, "server")
    ?? applicationUnit(path, "ui")
    ?? applicationUnit(path, "cli")
    ?? `area:${path.split("/")[0]}`;
}

function classificationFor(path) {
  const lower = path.toLowerCase();
  if (path === "pnpm-lock.yaml") return "lockfile";
  if (path.startsWith("patches/")) return "third-party-patch";
  if (/(^|\/)(vendor|third_party|third-party)\//.test(lower)) return "vendored-third-party";
  if (/\.(png|jpe?g|gif|webp|ico|svg|mp4|mov|woff2?|ttf|zip|gz)$/i.test(path)) return "asset-or-binary";
  if (/\.generated\.[^.]+$/.test(path) || /(^|\/)generated\//.test(path)) return "generated-source";
  if (/(^|\/)(__tests__|tests?|fixtures|evals)(\/|$)/.test(path)
    || /\.(test|spec)\.[^.]+$/.test(path)) return "test-eval-or-fixture";
  if (/\.(md|mdx)$/.test(lower) || /^(doc|docs|releases|skills|skills-releases)\//.test(path)) {
    return "documentation-or-instruction";
  }
  if (/\.(ts|tsx|js|jsx|mjs|cjs|sql|sh|css|html)$/.test(lower)) return "first-party-source";
  return "configuration-or-metadata";
}

function packageDependencies(unitId) {
  let packageRoot = null;
  if (unitId === "application:server/root" || unitId.startsWith("application:server/")) packageRoot = "server";
  else if (unitId === "application:ui/root" || unitId.startsWith("application:ui/")) packageRoot = "ui";
  else if (unitId === "application:cli/root" || unitId.startsWith("application:cli/")) packageRoot = "cli";
  else if (unitId.startsWith("package:adapter/")) packageRoot = `packages/adapters/${unitId.slice("package:adapter/".length)}`;
  else if (unitId.startsWith("package:plugin-sandbox/")) packageRoot = `packages/plugins/sandbox-providers/${unitId.slice("package:plugin-sandbox/".length).split("/")[0]}`;
  else if (unitId.startsWith("package:plugin-example/")) packageRoot = `packages/plugins/examples/${unitId.slice("package:plugin-example/".length)}`;
  else if (unitId.startsWith("package:plugin/")) packageRoot = `packages/plugins/${unitId.slice("package:plugin/".length)}`;
  else if (unitId.startsWith("package:")) packageRoot = `packages/${unitId.slice("package:".length)}`;
  if (!packageRoot) return null;
  try {
    const data = JSON.parse(readFileSync(join(sourceRoot, packageRoot, "package.json"), "utf8"));
    return {
      packageRoot,
      name: data.name ?? null,
      dependencies: Object.keys(data.dependencies ?? {}).sort(),
      devDependencies: Object.keys(data.devDependencies ?? {}).sort(),
      peerDependencies: Object.keys(data.peerDependencies ?? {}).sort(),
    };
  } catch {
    return { packageRoot, name: null, dependencies: [], devDependencies: [], peerDependencies: [] };
  }
}

const paths = trackedPaths();
const units = new Map();
const entries = paths.map((path) => {
  const unitId = unitFor(path);
  const classification = classificationFor(path);
  const unit = units.get(unitId) ?? {
    id: unitId,
    auditStatus: "INVENTORIED",
    pathCount: 0,
    classifications: {},
    package: packageDependencies(unitId),
    function: null,
    dependencyDirection: null,
    keyDataModels: null,
    lifecycle: null,
    testAssessment: null,
    designRationale: null,
    companyOsProblem: null,
    companyOsFit: null,
    responsibilityConflict: null,
    decision: null,
    evidence: [],
  };
  unit.pathCount += 1;
  unit.classifications[classification] = (unit.classifications[classification] ?? 0) + 1;
  units.set(unitId, unit);
  return { path, unitId, classification };
});
const directoryMap = new Map();
for (const entry of entries) {
  const directory = dirname(entry.path) === "." ? "." : dirname(entry.path);
  const record = directoryMap.get(directory) ?? {
    path: directory,
    auditStatus: "INVENTORIED",
    pathCount: 0,
    unitIds: new Set(),
    classifications: {},
  };
  record.pathCount += 1;
  record.unitIds.add(entry.unitId);
  record.classifications[entry.classification] = (record.classifications[entry.classification] ?? 0) + 1;
  directoryMap.set(directory, record);
}

const inventory = {
  schemaVersion: 1,
  generatedAt: "2026-08-18",
  source: {
    repository: auditManifest.repository,
    tag: auditManifest.tag,
    commit: auditManifest.commit,
    actualCommit: git("rev-parse", "HEAD"),
    trackedPathCount: paths.length,
  },
  completionRule: {
    noUnassignedTrackedPaths: true,
    completeUnitFields: [
      "function", "dependencyDirection", "keyDataModels", "lifecycle",
      "testAssessment", "designRationale", "companyOsProblem", "companyOsFit",
      "responsibilityConflict", "decision", "evidence",
    ],
  },
  units: [...units.values()].map(({ function: _function, dependencyDirection: _dependencyDirection,
    keyDataModels: _keyDataModels, lifecycle: _lifecycle, testAssessment: _testAssessment,
    designRationale: _designRationale, companyOsProblem: _companyOsProblem,
    companyOsFit: _companyOsFit, responsibilityConflict: _responsibilityConflict,
    decision: _decision, evidence: _evidence, ...unit }) => unit)
    .sort((a, b) => a.id.localeCompare(b.id)),
  directories: [...directoryMap.values()].map((record) => ({
    ...record,
    unitIds: [...record.unitIds].sort(),
  })).sort((a, b) => a.path.localeCompare(b.path)),
  paths: entries,
};

if (inventory.source.actualCommit !== inventory.source.commit) {
  throw new Error(`Paperclip checkout drifted: ${inventory.source.actualCommit}`);
}
if (inventory.paths.length !== paths.length || inventory.paths.some((entry) => !entry.unitId)) {
  throw new Error("One or more tracked paths are not assigned to an audit unit");
}

const rendered = `${JSON.stringify(inventory, null, 2)}\n`;
const batchFiles = readdirSync(batchesPath).filter((name) => name.endsWith(".json")).sort();
const batchUnits = batchFiles.flatMap((name) => {
  const batch = JSON.parse(readFileSync(join(batchesPath, name), "utf8"));
  if (batch.sourceCommit !== auditManifest.commit) throw new Error(`${name} source commit does not match audit pin`);
  return batch.units ?? [];
});
const assessmentById = new Map();
for (const unit of batchUnits) {
  if (assessmentById.has(unit.id)) throw new Error(`duplicate assessment unit: ${unit.id}`);
  assessmentById.set(unit.id, unit);
}
const inventoryUnitIds = new Set(inventory.units.map((unit) => unit.id));
const unknownAssessmentIds = [...assessmentById.keys()].filter((id) => !inventoryUnitIds.has(id));
if (unknownAssessmentIds.length) {
  throw new Error(`unknown assessment units: ${unknownAssessmentIds.join(", ")}`);
}
const assessments = {
  schemaVersion: 1,
  sourceCommit: auditManifest.commit,
  units: inventory.units.map((unit) => assessmentById.get(unit.id) ?? {
    id: unit.id,
    auditStatus: "PENDING",
    function: null,
    dependencyDirection: null,
    keyDataModels: null,
    lifecycle: null,
    testAssessment: null,
    designRationale: null,
    companyOsProblem: null,
    companyOsFit: null,
    responsibilityConflict: null,
    decision: null,
    evidence: [],
  }),
};
const renderedAssessments = `${JSON.stringify(assessments, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== rendered) throw new Error(`${relative(projectRoot, outputPath)} is stale; run with --write`);
  const currentAssessments = readFileSync(assessmentPath, "utf8");
  if (currentAssessments !== renderedAssessments) {
    throw new Error(`${relative(projectRoot, assessmentPath)} is stale; run with --write`);
  }
  const assessmentIds = new Set(assessments.units.map((unit) => unit.id));
  const missing = inventory.units.filter((unit) => !assessmentIds.delete(unit.id));
  if (missing.length || assessmentIds.size) {
    throw new Error(`assessment coverage drift: ${missing.length} missing, ${assessmentIds.size} unexpected`);
  }
  console.log(`Paperclip inventory covers ${paths.length} tracked paths in ${units.size} auditable units.`);
} else if (process.argv.includes("--complete")) {
  const incomplete = assessments.units.filter((unit) =>
    unit.auditStatus !== "COMPLETE" ||
    inventory.completionRule.completeUnitFields.some((field) => {
      const value = unit[field];
      return value === null || value === "" || (Array.isArray(value) && value.length === 0);
    }));
  if (incomplete.length) throw new Error(`${incomplete.length} audit units are not complete`);
  console.log(`All ${units.size} Paperclip audit units are complete.`);
} else {
  writeFileSync(outputPath, rendered);
  writeFileSync(assessmentPath, renderedAssessments);
  console.log(`Wrote ${relative(projectRoot, outputPath)} with ${paths.length} paths and ${units.size} units.`);
}
