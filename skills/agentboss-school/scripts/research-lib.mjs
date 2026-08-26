import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function readResearch(skillRoot) {
  const [sourceRegistry, claimMap, openSourceProjects] = await Promise.all([
    readJson(resolve(skillRoot, "research/source-registry.json")),
    readJson(resolve(skillRoot, "research/claim-map.json")),
    readJson(resolve(skillRoot, "research/open-source-projects.json")),
  ]);
  return { sourceRegistry, claimMap, openSourceProjects };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function validateResearch({ sourceRegistry, claimMap, openSourceProjects }, nodeIds, courseIds) {
  const errors = [];
  const sourceIds = new Set();
  const validAreas = new Set([...nodeIds, ...courseIds, "case-rag", "certification", "governance", "operations", "team"]);

  if (sourceRegistry?.schemaVersion !== 1) errors.push("source registry schemaVersion must be 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceRegistry?.reviewedAt ?? "")) errors.push("source registry reviewedAt must be a date");
  for (const source of sourceRegistry?.sources ?? []) {
    if (!/^SRC-[A-Z0-9-]+$/.test(source.id ?? "")) errors.push(`invalid source id: ${source.id}`);
    if (sourceIds.has(source.id)) errors.push(`duplicate source id: ${source.id}`);
    sourceIds.add(source.id);
    if (!/^https:\/\//.test(source.url ?? "")) errors.push(`${source.id} must use an HTTPS source URL`);
    if (!["A", "B", "C", "D", "E"].includes(source.evidenceTier)) errors.push(`${source.id} has invalid evidence tier`);
    if (!["ACTIVE", "CONTEXT_ONLY", "DEPRECATED"].includes(source.status)) errors.push(`${source.id} has invalid status`);
    if (!Array.isArray(source.appliesTo) || source.appliesTo.length === 0) errors.push(`${source.id} must declare applicability`);
    for (const area of source.appliesTo ?? []) {
      if (!validAreas.has(area)) errors.push(`${source.id} applies to unknown area: ${area}`);
    }
    if (!source.use?.trim() || !source.limitations?.trim()) errors.push(`${source.id} must explain use and limitations`);
  }

  const claimIds = new Set();
  const sourcesUsedByClaims = new Set();
  if (claimMap?.schemaVersion !== 1) errors.push("claim map schemaVersion must be 1");
  for (const claim of claimMap?.claims ?? []) {
    if (!/^CLM-[0-9]{3}$/.test(claim.id ?? "")) errors.push(`invalid claim id: ${claim.id}`);
    if (claimIds.has(claim.id)) errors.push(`duplicate claim id: ${claim.id}`);
    claimIds.add(claim.id);
    if (!validAreas.has(claim.primaryNode)) errors.push(`${claim.id} has unknown primary node: ${claim.primaryNode}`);
    for (const area of claim.alsoUsedBy ?? []) {
      if (!validAreas.has(area)) errors.push(`${claim.id} also applies to unknown area: ${area}`);
    }
    for (const sourceId of claim.sourceIds ?? []) {
      if (!sourceIds.has(sourceId)) errors.push(`${claim.id} references unknown source: ${sourceId}`);
      sourcesUsedByClaims.add(sourceId);
    }
    if (claim.kind !== "AGENTBOSS_POLICY" && (claim.sourceIds?.length ?? 0) === 0) errors.push(`${claim.id} needs at least one source`);
    const sources = (claim.sourceIds ?? []).map((id) => sourceRegistry.sources.find((source) => source.id === id));
    if (claim.status === "SUPPORTED" && sources.length > 0 && sources.every((source) => source?.status === "DEPRECATED")) {
      errors.push(`${claim.id} cannot be supported only by deprecated sources`);
    }
    if (!claim.statement?.trim() || !claim.scope?.trim() || !claim.limitations?.trim() || !claim.resolution?.trim()) {
      errors.push(`${claim.id} must contain statement, scope, limitations, and resolution`);
    }
  }
  for (const sourceId of sourceIds) {
    if (!sourcesUsedByClaims.has(sourceId)) errors.push(`${sourceId} is not mapped to any claim`);
  }

  if (openSourceProjects?.schemaVersion !== 1) errors.push("open-source registry schemaVersion must be 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(openSourceProjects?.capturedAt ?? "")) errors.push("open-source registry capturedAt must be a date");
  const reviewedProjectIds = new Set();
  for (const project of openSourceProjects?.projects ?? []) {
    if (reviewedProjectIds.has(project.sourceId)) errors.push(`duplicate open-source review: ${project.sourceId}`);
    reviewedProjectIds.add(project.sourceId);
    const source = sourceRegistry.sources.find((item) => item.id === project.sourceId);
    if (!source) errors.push(`open-source review has unknown source: ${project.sourceId}`);
    if (source && source.sourceType !== "OPEN_SOURCE_PROJECT") errors.push(`${project.sourceId} is not registered as an open-source project`);
    if (!/^https:\/\/github\.com\//.test(project.repository ?? "")) errors.push(`${project.sourceId} must link to GitHub`);
    if (!/^https:\/\//.test(project.licenseUrl ?? "")) errors.push(`${project.sourceId} must link to its license`);
    if (!Array.isArray(project.copiedAssets) || project.copiedAssets.length !== 0) {
      errors.push(`${project.sourceId} copied assets require a dedicated attribution review before inclusion`);
    }
  }
  for (const source of sourceRegistry?.sources ?? []) {
    if (source.sourceType === "OPEN_SOURCE_PROJECT" && !reviewedProjectIds.has(source.id)) {
      errors.push(`${source.id} is missing an open-source copyright review`);
    }
  }

  return { errors, sourceIds, claimIds };
}

export function validateLessonResearchRefs(lesson, relativePath, sourceIds, claimIds) {
  const errors = [];
  const referencedSources = new Set(lesson.match(/SRC-[A-Z0-9-]+/g) ?? []);
  const referencedClaims = new Set(lesson.match(/CLM-[0-9]{3}/g) ?? []);
  for (const id of referencedSources) if (!sourceIds.has(id)) errors.push(`${relativePath} references unknown source: ${id}`);
  for (const id of referencedClaims) if (!claimIds.has(id)) errors.push(`${relativePath} references unknown claim: ${id}`);
  return errors;
}
