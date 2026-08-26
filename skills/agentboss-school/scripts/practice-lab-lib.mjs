import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function readPracticeScenarios(root = skillRoot) {
  return JSON.parse(await readFile(resolve(root, "practice/scenarios.json"), "utf8"));
}

export function validatePracticeScenarios(catalog, nodeIds = new Set()) {
  const errors = [];
  if (catalog?.schemaVersion !== 1) errors.push("practice schemaVersion must be 1");
  if (!Array.isArray(catalog?.scenarios) || catalog.scenarios.length < 3) errors.push("practice catalog must contain at least 3 scenarios");
  const scenarioIds = new Set();
  for (const scenario of catalog?.scenarios ?? []) {
    if (!/^[a-z][a-z0-9-]+$/.test(scenario.id ?? "")) errors.push(`invalid practice scenario id: ${scenario.id}`);
    if (scenarioIds.has(scenario.id)) errors.push(`duplicate practice scenario id: ${scenario.id}`);
    scenarioIds.add(scenario.id);
    if (nodeIds.size > 0 && !nodeIds.has(scenario.nodeId)) errors.push(`practice scenario ${scenario.id} has unknown nodeId: ${scenario.nodeId}`);
    if (!String(scenario.classification ?? "").includes("SYNTHETIC_SCENARIO")) errors.push(`practice scenario ${scenario.id} must disclose synthetic classification`);
    if (!String(scenario.classification ?? "").includes("UNVERIFIED")) errors.push(`practice scenario ${scenario.id} must disclose unverified outcomes`);
    if (!Array.isArray(scenario.rounds) || scenario.rounds.length < 3) errors.push(`practice scenario ${scenario.id} must contain at least 3 rounds`);
    for (const [index, round] of (scenario.rounds ?? []).entries()) {
      if (round.round !== index + 1) errors.push(`practice scenario ${scenario.id} round numbering must be contiguous`);
      for (const field of ["availableEvidence", "allowedActions", "requiredEvidenceRefs", "requiredProhibitedActions", "requiredArtifactFields"]) {
        if (!Array.isArray(round[field]) || round[field].length === 0) errors.push(`practice scenario ${scenario.id} round ${round.round} requires ${field}`);
      }
      for (const evidence of round.requiredEvidenceRefs ?? []) {
        if (!(round.availableEvidence ?? []).includes(evidence)) errors.push(`practice scenario ${scenario.id} round ${round.round} requires unavailable evidence: ${evidence}`);
      }
    }
  }
  return errors;
}

const PLACEHOLDER_VALUES = new Set(["n/a", "na", "none", "null", "placeholder", "test", "todo", "tbd", "待填", "未知", "无"]);

function meaningfulText(value, minimumLength, minimumUniqueCharacters) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (normalized.length < minimumLength || PLACEHOLDER_VALUES.has(normalized)) return false;
  const compact = normalized.replace(/[\s\p{P}\p{S}]/gu, "");
  return new Set(compact).size >= minimumUniqueCharacters;
}

function explanatoryField(value) {
  return meaningfulText(value, 8, 4);
}

function ownerField(value) {
  return meaningfulText(value, 2, 2);
}

export function scorePracticeSubmission(scenario, submission) {
  const criteria = [];
  const award = (id, points, passed, feedback) => criteria.push({ id, points, awarded: passed ? points : 0, passed, feedback });
  award("scenario-binding", 5, submission?.schemaVersion === 1 && submission?.scenarioId === scenario.id, "提交必须绑定正确场景和 schemaVersion。\n");

  const submittedRounds = new Map((submission?.rounds ?? []).map((round) => [round.round, round]));
  award("round-completeness", 5, submittedRounds.size === scenario.rounds.length, "每轮都必须在同一提交中保留。\n");

  const roundPoints = 30 / scenario.rounds.length;
  const evidencePoints = 24 / scenario.rounds.length;
  const prohibitionPoints = 18 / scenario.rounds.length;
  const handoffPoints = 18 / scenario.rounds.length;
  for (const expected of scenario.rounds) {
    const actual = submittedRounds.get(expected.round);
    award(`round-${expected.round}-decision`, roundPoints, Boolean(actual) && expected.allowedActions.includes(actual.action), `第 ${expected.round} 轮动作必须与当前证据相容。\n`);
    award(
      `round-${expected.round}-evidence`,
      evidencePoints,
      Boolean(actual) && expected.requiredEvidenceRefs.every((item) => actual.evidenceRefs?.includes(item)),
      `第 ${expected.round} 轮必须引用决定所需证据。\n`,
    );
    award(
      `round-${expected.round}-prohibitions`,
      prohibitionPoints,
      Boolean(actual) && expected.requiredProhibitedActions.every((item) => actual.prohibitedActions?.includes(item)),
      `第 ${expected.round} 轮必须显式冻结危险动作。\n`,
    );
    award(
      `round-${expected.round}-handoff`,
      handoffPoints,
      Boolean(actual) && explanatoryField(actual.rationale) && ownerField(actual.owner) && explanatoryField(actual.resumeCondition),
      `第 ${expected.round} 轮需要理由、负责人和恢复条件。\n`,
    );
  }
  const rawScore = criteria.reduce((total, criterion) => total + criterion.awarded, 0);
  const score = Math.round(rawScore);
  const blockingFailures = criteria
    .filter(({ id, passed }) => !passed && (id.endsWith("-decision") || id.endsWith("-prohibitions") || id.endsWith("-handoff")))
    .map(({ id }) => id);
  return {
    scenarioId: scenario.id,
    score,
    passed: score >= 80 && blockingFailures.length === 0,
    blockingFailures,
    machineAssessmentBoundary: "只检查结构化决定、证据引用、禁止动作和责任交接；不证明真实环境能力，也不替代导师审阅推理质量。",
    criteria,
  };
}

export function createSubmissionTemplate(scenario) {
  return {
    schemaVersion: 1,
    scenarioId: scenario.id,
    rounds: scenario.rounds.map(({ round }) => ({
      round,
      action: "",
      rationale: "",
      evidenceRefs: [],
      prohibitedActions: [],
      owner: "",
      resumeCondition: "",
    })),
  };
}
