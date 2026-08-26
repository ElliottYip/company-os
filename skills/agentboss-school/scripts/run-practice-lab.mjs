#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createSubmissionTemplate, readPracticeScenarios, scorePracticeSubmission, validatePracticeScenarios } from "./practice-lab-lib.mjs";

function usage() {
  console.error("Usage: node scripts/run-practice-lab.mjs --list | --scenario <id> [--round <n>] | --template <id> | --score <id> --submission <file> [--json]");
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const catalog = await readPracticeScenarios();
const catalogErrors = validatePracticeScenarios(catalog);
if (catalogErrors.length > 0) {
  for (const error of catalogErrors) console.error(error);
  process.exit(1);
}

if (process.argv.includes("--list")) {
  for (const scenario of catalog.scenarios) console.log(`${scenario.id}\t${scenario.title}\t${scenario.nodeId}`);
  process.exit(0);
}

const templateId = valueAfter("--template");
const scoreId = valueAfter("--score");
const scenarioId = valueAfter("--scenario");
const selectedId = templateId ?? scoreId ?? scenarioId;
const scenario = catalog.scenarios.find(({ id }) => id === selectedId);
if (!scenario) {
  usage();
  process.exit(1);
}

if (templateId) {
  console.log(JSON.stringify(createSubmissionTemplate(scenario), null, 2));
  process.exit(0);
}

if (scoreId) {
  const submissionPath = valueAfter("--submission");
  if (!submissionPath) {
    usage();
    process.exit(1);
  }
  const submission = JSON.parse(await readFile(submissionPath, "utf8"));
  const result = scorePracticeSubmission(scenario, submission);
  if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${scenario.title}: ${result.score}/100 (${result.passed ? "PASS" : "REVISE"})`);
    for (const item of result.criteria.filter(({ passed }) => !passed)) console.log(`- ${item.id}: ${item.feedback.trim()}`);
    console.log(`Boundary: ${result.machineAssessmentBoundary}`);
  }
  process.exit(result.passed ? 0 : 2);
}

const requestedRound = Number(valueAfter("--round") ?? 1);
const round = scenario.rounds.find((item) => item.round === requestedRound);
if (!round) {
  console.error(`Unknown round ${requestedRound} for ${scenario.id}`);
  process.exit(1);
}
console.log(`# ${scenario.title}`);
console.log(`\n${scenario.classification}`);
console.log(`\n目标：${scenario.objective}`);
console.log(`\n## 第 ${round.round} 轮：${round.title}`);
console.log(`\n${round.inject}`);
console.log("\n当前可用证据：");
for (const evidence of round.availableEvidence) console.log(`- ${evidence}`);
console.log("\n只依据当前证据更新同一份提交；不要假设后续轮次。使用 --template 生成空白工作件。\n");
