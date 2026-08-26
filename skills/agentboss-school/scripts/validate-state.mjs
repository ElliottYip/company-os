#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(skillRoot, "manifest.json"), "utf8"));
const knownNodes = new Set(manifest.nodes.map(({ id }) => id));
const paths = process.argv.slice(2);

if (paths.length === 0) {
  console.error("Usage: node scripts/validate-state.mjs <state.json> [more.json]");
  process.exit(2);
}

const levels = new Set(["unknown", "developing", "capable", "strong"]);
const statuses = new Set(["todo", "in-progress", "done", "skipped"]);
const courses = new Set(["role", "operations", "governance", "team", null]);
const serviceCategories = new Set(["none", "self-serve", "agentboss-coaching", "fde"]);
const serviceStatuses = new Set(["not-shown", "shown", "declined", "requested"]);
const forbiddenKey = /(?:credential|secret|password|passphrase|api[-_]?(?:key|token)|access[-_]?token|refresh[-_]?token|cookie|private[-_]?prompt|raw[-_]?(?:document|data|evidence|task|reasoning))/i;
const pemMaterial = /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/;
const errors = [];

function fail(path, message) {
  errors.push(`${path}: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function boundedString(value, maximum) {
  return typeof value === "string" && [...value].length <= maximum;
}

function semverParts(value) {
  const match = typeof value === "string" ? value.match(/^(\d+)\.(\d+)\.(\d+)$/) : null;
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function scan(value, path) {
  if (typeof value === "string") {
    if (pemMaterial.test(value)) fail(path, "contains private key or certificate material");
    if ([...value].length > 500) fail(path, "string exceeds 500 characters; store a short note or consented reference instead");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 200) fail(path, "array exceeds 200 entries");
    value.forEach((entry, index) => scan(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKey.test(key)) fail(`${path}.${key}`, "forbidden sensitive-data field");
    scan(entry, `${path}.${key}`);
  }
}

function validateState(state, path) {
  if (!isRecord(state)) {
    fail(path, "state must be a JSON object");
    return;
  }
  scan(state, path);
  if (state.schemaVersion !== 1) fail(path, "schemaVersion must be 1");
  const stateVersion = semverParts(state.curriculumVersion);
  const installedVersion = semverParts(manifest.version);
  if (!stateVersion) {
    fail(path, "curriculumVersion must be semver");
  } else if (stateVersion[0] !== installedVersion[0] || compareVersions(stateVersion, installedVersion) > 0) {
    fail(path, `curriculumVersion ${state.curriculumVersion} is not compatible with installed ${manifest.version}`);
  }
  if (typeof state.handle !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(state.handle)) fail(path, "handle is invalid");
  if (state.displayName !== null && !boundedString(state.displayName, 80)) fail(path, "displayName must be null or at most 80 characters");
  if (!isDate(state.enrolledAt)) fail(path, "enrolledAt must be YYYY-MM-DD");
  if (!isDate(state.lastSeenAt)) fail(path, "lastSeenAt must be YYYY-MM-DD");
  if (!courses.has(state.currentCourse)) fail(path, "currentCourse is invalid");
  if (state.lastNode !== null && !knownNodes.has(state.lastNode)) fail(path, "lastNode is unknown");
  if (state.nextRecommended !== null && !knownNodes.has(state.nextRecommended)) fail(path, "nextRecommended is unknown");

  const competencyKeys = ["delegation", "operations", "governance", "team_adoption"];
  if (!isRecord(state.competencies)) {
    fail(path, "competencies must be an object");
  } else {
    for (const key of competencyKeys) {
      const value = state.competencies[key];
      if (!isRecord(value) || !levels.has(value.level)) fail(path, `competencies.${key}.level is invalid`);
      if (value?.basis !== null && !boundedString(value?.basis, 240)) fail(path, `competencies.${key}.basis must be null or at most 240 characters`);
    }
  }

  if (!isRecord(state.nodes)) {
    fail(path, "nodes must be an object");
  } else {
    for (const [id, value] of Object.entries(state.nodes)) {
      if (!knownNodes.has(id)) fail(path, `nodes contains unknown node: ${id}`);
      if (!isRecord(value) || !statuses.has(value.status)) fail(path, `nodes.${id}.status is invalid`);
      if (!isRecord(value) || !levels.has(value.comprehension)) fail(path, `nodes.${id}.comprehension is invalid`);
      if (!boundedString(value?.evidenceNote, 240)) fail(path, `nodes.${id}.evidenceNote must be at most 240 characters`);
      if (!isDate(value?.at)) fail(path, `nodes.${id}.at must be YYYY-MM-DD`);
    }
  }

  if (!isRecord(state.labs)) fail(path, "labs must be an object");
  if (!Array.isArray(state.artifactReferences)) fail(path, "artifactReferences must be an array");
  if (typeof state.artifactStorageConsent !== "boolean") fail(path, "artifactStorageConsent must be boolean");
  if (Array.isArray(state.artifactReferences) && state.artifactReferences.length > 0 && state.artifactStorageConsent !== true) {
    fail(path, "artifact references require explicit storage consent");
  }
  for (const reference of state.artifactReferences ?? []) {
    const validReference = typeof reference === "string" && (isAbsolute(reference) || /^https:\/\//.test(reference));
    if (!validReference) fail(path, "artifactReferences entries must be absolute local paths or HTTPS URLs");
  }
  if (!Array.isArray(state.deferredQuestions)) fail(path, "deferredQuestions must be an array");
  if (!Array.isArray(state.log)) fail(path, "log must be an array");

  const service = state.serviceRecommendation;
  if (!isRecord(service)) {
    fail(path, "serviceRecommendation must be an object");
  } else {
    if (!serviceCategories.has(service.category)) fail(path, "serviceRecommendation.category is invalid");
    if (!serviceStatuses.has(service.status)) fail(path, "serviceRecommendation.status is invalid");
    if (service.basis !== null && !boundedString(service.basis, 240)) fail(path, "serviceRecommendation.basis must be null or at most 240 characters");
  }
}

for (const path of paths) {
  try {
    const state = JSON.parse(await readFile(path, "utf8"));
    validateState(state, path);
  } catch (error) {
    fail(path, `cannot parse JSON: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error(`AgentBoss School state validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${paths.length} AgentBoss School state file(s).`);
