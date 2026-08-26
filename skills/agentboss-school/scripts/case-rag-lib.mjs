import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const CASE_INDEX_VERSION = 1;
export const CASE_INDEX_GENERATOR_VERSION = "0.1.0";

const CASE_TYPES = new Set(["DEMO_FIXTURE", "SYNTHETIC_SCENARIO", "PROJECT_OWNED", "AUTHORIZED_CLIENT", "PUBLIC_SOURCE"]);
const CASE_STATUSES = new Set(["DRAFT", "VERIFIED", "RETIRED"]);
const EVIDENCE_QUALITIES = new Set(["ILLUSTRATIVE", "SOURCE_BACKED", "CLIENT_VERIFIED"]);
const CAPABILITIES = new Set(["delegation", "operations", "governance", "team-adoption", "fde"]);
const CLAIM_VERIFICATIONS = new Set(["UNVERIFIED", "SOURCE_BACKED", "CLIENT_VERIFIED"]);
const LANGUAGES = new Set(["zh-CN", "en"]);
const CASE_ID = /^case-[a-z0-9][a-z0-9-]{0,58}$/;
const TAG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CONTENT_PATH = /^references\/cases\/[a-z0-9][a-z0-9-]*\.md$/;
const SECRET_MATERIAL = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*\S+/i;
const STOP_WORDS = new Set(["the", "and", "for", "with", "that", "this", "是", "的", "了", "和", "与", "在", "如何"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.has(key));
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function validateString(value, label, minimum, maximum, errors) {
  if (typeof value !== "string" || [...value].length < minimum || [...value].length > maximum) {
    errors.push(`${label} must contain ${minimum}-${maximum} characters`);
  }
}

function validateUniqueStrings(value, label, options, errors) {
  if (!Array.isArray(value) || value.length < options.minimum || value.length > options.maximum) {
    errors.push(`${label} must contain ${options.minimum}-${options.maximum} entries`);
    return;
  }
  if (new Set(value).size !== value.length) errors.push(`${label} must not contain duplicates`);
  for (const item of value) {
    if (typeof item !== "string" || (options.allowed && !options.allowed.has(item)) || (options.pattern && !options.pattern.test(item))) {
      errors.push(`${label} contains invalid value: ${String(item)}`);
    }
  }
}

export async function readCaseCatalog(skillRoot) {
  const catalogPath = resolve(skillRoot, "rag/case-catalog.json");
  return JSON.parse(await readFile(catalogPath, "utf8"));
}

export async function validateCaseCatalog(skillRoot, catalog, knownNodes) {
  const errors = [];
  if (!isRecord(catalog) || !hasOnlyKeys(catalog, new Set(["schemaVersion", "cases"]))) {
    return ["catalog must be an object containing only schemaVersion and cases"];
  }
  if (catalog.schemaVersion !== 1) errors.push("catalog schemaVersion must be 1");
  if (!Array.isArray(catalog.cases)) return [...errors, "catalog cases must be an array"];

  const ids = new Set();
  for (const [index, entry] of catalog.cases.entries()) {
    const label = `cases[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    const allowedKeys = new Set([
      "id", "title", "summary", "language", "status", "caseType", "industries",
      "capabilities", "lessonNodes", "evidenceQuality", "isAnonymized", "source",
      "outcomeClaims", "contentFile", "updatedAt",
    ]);
    if (!hasOnlyKeys(entry, allowedKeys)) errors.push(`${label} contains unknown fields`);
    if (typeof entry.id !== "string" || !CASE_ID.test(entry.id)) errors.push(`${label}.id is invalid`);
    if (ids.has(entry.id)) errors.push(`${label}.id is duplicated`);
    ids.add(entry.id);
    validateString(entry.title, `${label}.title`, 1, 120, errors);
    validateString(entry.summary, `${label}.summary`, 1, 500, errors);
    if (!LANGUAGES.has(entry.language)) errors.push(`${label}.language is invalid`);
    if (!CASE_STATUSES.has(entry.status)) errors.push(`${label}.status is invalid`);
    if (!CASE_TYPES.has(entry.caseType)) errors.push(`${label}.caseType is invalid`);
    validateUniqueStrings(entry.industries, `${label}.industries`, { minimum: 1, maximum: 20, pattern: TAG }, errors);
    validateUniqueStrings(entry.capabilities, `${label}.capabilities`, { minimum: 1, maximum: 20, allowed: CAPABILITIES }, errors);
    validateUniqueStrings(entry.lessonNodes, `${label}.lessonNodes`, { minimum: 1, maximum: 20, allowed: knownNodes }, errors);
    if (!EVIDENCE_QUALITIES.has(entry.evidenceQuality)) errors.push(`${label}.evidenceQuality is invalid`);
    if (typeof entry.isAnonymized !== "boolean") errors.push(`${label}.isAnonymized must be boolean`);

    if (!isRecord(entry.source) || !hasOnlyKeys(entry.source, new Set(["label", "uri", "consentReference"]))) {
      errors.push(`${label}.source is invalid`);
    } else {
      validateString(entry.source.label, `${label}.source.label`, 1, 200, errors);
      if (entry.source.uri !== null && (typeof entry.source.uri !== "string" || entry.source.uri.length > 500)) errors.push(`${label}.source.uri is invalid`);
      if (entry.source.consentReference !== null && (typeof entry.source.consentReference !== "string" || entry.source.consentReference.length > 200)) errors.push(`${label}.source.consentReference is invalid`);
    }

    if (entry.caseType === "AUTHORIZED_CLIENT") {
      if (entry.isAnonymized !== true) errors.push(`${label} authorized client case must be anonymized`);
      if (!entry.source?.consentReference) errors.push(`${label} authorized client case requires consentReference`);
    }
    if (entry.caseType === "PUBLIC_SOURCE" && !/^https:\/\//.test(entry.source?.uri ?? "")) {
      errors.push(`${label} public source case requires an HTTPS source URI`);
    }
    if (entry.caseType === "SYNTHETIC_SCENARIO") {
      if (entry.evidenceQuality !== "ILLUSTRATIVE") errors.push(`${label} synthetic scenario must use ILLUSTRATIVE evidence`);
      if (entry.source?.uri !== null || entry.source?.consentReference !== null) errors.push(`${label} synthetic scenario cannot imply an external source or client consent`);
    }
    if (entry.evidenceQuality === "CLIENT_VERIFIED" && entry.caseType !== "AUTHORIZED_CLIENT" && entry.caseType !== "PROJECT_OWNED") {
      errors.push(`${label} CLIENT_VERIFIED evidence requires an authorized client or project-owned case`);
    }

    if (!Array.isArray(entry.outcomeClaims) || entry.outcomeClaims.length > 30) {
      errors.push(`${label}.outcomeClaims must contain 0-30 entries`);
    } else {
      for (const [claimIndex, claim] of entry.outcomeClaims.entries()) {
        const claimLabel = `${label}.outcomeClaims[${claimIndex}]`;
        if (!isRecord(claim) || !hasOnlyKeys(claim, new Set(["claim", "evidenceReference", "verification"]))) {
          errors.push(`${claimLabel} is invalid`);
          continue;
        }
        validateString(claim.claim, `${claimLabel}.claim`, 1, 500, errors);
        if (claim.evidenceReference !== null && (typeof claim.evidenceReference !== "string" || claim.evidenceReference.length > 500)) errors.push(`${claimLabel}.evidenceReference is invalid`);
        if (!CLAIM_VERIFICATIONS.has(claim.verification)) errors.push(`${claimLabel}.verification is invalid`);
        if (claim.verification !== "UNVERIFIED" && !claim.evidenceReference) errors.push(`${claimLabel} verified claim requires evidenceReference`);
        if (entry.caseType === "SYNTHETIC_SCENARIO" && claim.verification !== "UNVERIFIED") {
          errors.push(`${claimLabel} synthetic scenario outcome must remain UNVERIFIED`);
        }
      }
    }

    if (typeof entry.contentFile !== "string" || !CONTENT_PATH.test(entry.contentFile)) {
      errors.push(`${label}.contentFile is invalid`);
    } else {
      const contentPath = resolve(skillRoot, entry.contentFile);
      const relativePath = relative(skillRoot, contentPath);
      if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
        errors.push(`${label}.contentFile escapes the skill root`);
      } else {
        try {
          const content = await readFile(contentPath, "utf8");
          if (SECRET_MATERIAL.test(content)) errors.push(`${label}.contentFile may contain credential material`);
          if ([...content].length > 100_000) errors.push(`${label}.contentFile exceeds 100,000 characters`);
          if (entry.caseType === "SYNTHETIC_SCENARIO") {
            if (!content.includes("SYNTHETIC_SCENARIO / ILLUSTRATIVE")) errors.push(`${label}.contentFile must display the synthetic scenario label`);
            if (!content.includes("不是客户案例")) errors.push(`${label}.contentFile must state that it is not a client case`);
          }
        } catch (error) {
          errors.push(`${label}.contentFile cannot be read: ${error.message}`);
        }
      }
    }
    if (!validDate(entry.updatedAt)) errors.push(`${label}.updatedAt must be YYYY-MM-DD`);
  }
  return errors;
}

function normalizeText(value) {
  return value.normalize("NFKC").toLowerCase().replaceAll("\u0000", " ");
}

export function tokenize(value, language = "zh-CN") {
  const normalized = normalizeText(value);
  const terms = [];
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  for (const segment of segmenter.segment(normalized)) {
    const term = segment.segment.trim();
    if (segment.isWordLike && term.length > 0 && !STOP_WORDS.has(term)) terms.push(term);
  }
  const cjkRuns = normalized.match(/[\p{Script=Han}]+/gu) ?? [];
  for (const run of cjkRuns) {
    const characters = [...run];
    for (let size = 2; size <= 3; size += 1) {
      for (let index = 0; index <= characters.length - size; index += 1) {
        terms.push(characters.slice(index, index + size).join(""));
      }
    }
  }
  return terms;
}

function splitMarkdown(content) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const sections = [];
  let heading = "正文";
  let body = [];
  function flush() {
    const text = body.join("\n").trim();
    if (text) sections.push({ heading, text });
    body = [];
  }
  for (const line of lines) {
    const match = line.match(/^#{1,3}\s+(.+)$/);
    if (match) {
      flush();
      heading = match[1].trim();
    } else {
      body.push(line);
    }
  }
  flush();
  return sections;
}

function chunkSection(section, maximum = 1200) {
  const paragraphs = section.text.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ([...paragraph].length > maximum) {
      if (current) chunks.push(current);
      current = "";
      const characters = [...paragraph];
      for (let index = 0; index < characters.length; index += maximum) chunks.push(characters.slice(index, index + maximum).join(""));
    } else if (!current) {
      current = paragraph;
    } else if ([...current, "\n", ...paragraph].length <= maximum) {
      current += `\n\n${paragraph}`;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((text) => ({ heading: section.heading, text }));
}

function countTerms(terms) {
  const counts = {};
  for (const term of terms) counts[term] = (counts[term] ?? 0) + 1;
  return counts;
}

export async function calculateCorpusDigest(skillRoot, catalog) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(catalog));
  for (const entry of [...catalog.cases].sort((left, right) => left.id.localeCompare(right.id))) {
    hash.update(entry.id);
    hash.update(await readFile(resolve(skillRoot, entry.contentFile), "utf8"));
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function buildCaseIndex(skillRoot, knownNodes) {
  const catalog = await readCaseCatalog(skillRoot);
  const errors = await validateCaseCatalog(skillRoot, catalog, knownNodes);
  if (errors.length > 0) throw new Error(`case catalog validation failed:\n- ${errors.join("\n- ")}`);
  const chunks = [];
  for (const entry of catalog.cases.filter(({ status }) => status === "VERIFIED").sort((left, right) => left.id.localeCompare(right.id))) {
    const content = await readFile(resolve(skillRoot, entry.contentFile), "utf8");
    const sections = splitMarkdown(content).flatMap((section) => chunkSection(section));
    for (const [index, section] of sections.entries()) {
      const metadataText = `${entry.title} ${entry.title} ${entry.summary} ${entry.industries.join(" ")} ${entry.capabilities.join(" ")} ${entry.lessonNodes.join(" ")} ${section.heading}`;
      const terms = tokenize(`${metadataText} ${section.text}`, entry.language);
      chunks.push({
        chunkId: `${entry.id}#${String(index + 1).padStart(3, "0")}`,
        caseId: entry.id,
        title: entry.title,
        summary: entry.summary,
        language: entry.language,
        caseType: entry.caseType,
        industries: entry.industries,
        capabilities: entry.capabilities,
        lessonNodes: entry.lessonNodes,
        evidenceQuality: entry.evidenceQuality,
        source: entry.source,
        outcomeClaims: entry.outcomeClaims,
        heading: section.heading,
        text: section.text,
        termCounts: countTerms(terms),
        termLength: terms.length,
      });
    }
  }
  return {
    schemaVersion: CASE_INDEX_VERSION,
    generatorVersion: CASE_INDEX_GENERATOR_VERSION,
    corpusDigest: await calculateCorpusDigest(skillRoot, catalog),
    caseCount: catalog.cases.filter(({ status }) => status === "VERIFIED").length,
    chunks,
  };
}

export function retrieveCases(index, query, options = {}) {
  if (!index || index.schemaVersion !== CASE_INDEX_VERSION || !Array.isArray(index.chunks)) throw new Error("case index schema is invalid");
  const top = Number.isSafeInteger(options.top) && options.top > 0 ? Math.min(options.top, 20) : 3;
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return [];
  const filtered = index.chunks.filter((chunk) =>
    (!options.node || chunk.lessonNodes.includes(options.node)) &&
    (!options.industry || chunk.industries.includes(options.industry))
  );
  if (filtered.length === 0) return [];
  const averageLength = filtered.reduce((total, chunk) => total + chunk.termLength, 0) / filtered.length;
  const documentFrequency = new Map(queryTerms.map((term) => [term, filtered.filter((chunk) => chunk.termCounts[term]).length]));
  const k1 = 1.2;
  const b = 0.75;
  const scored = filtered.map((chunk) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = chunk.termCounts[term] ?? 0;
      if (!frequency) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (filtered.length - df + 0.5) / (df + 0.5));
      score += idf * ((frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * (chunk.termLength / averageLength))));
    }
    return { ...chunk, score };
  }).filter(({ score }) => score > 0);
  scored.sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId));
  return scored.slice(0, top).map(({ termCounts: _termCounts, termLength: _termLength, ...result }) => ({
    ...result,
    score: Number(result.score.toFixed(6)),
  }));
}
