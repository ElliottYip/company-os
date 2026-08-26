#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCaseIndex, readCaseCatalog, validateCaseCatalog } from "./case-rag-lib.mjs";
import {
  buildYearbookMarkdown,
  readJson,
  validateCompletionSubmission,
  validateIssuerKeyring,
  validateRevocations,
  validateYearbook,
} from "./credential-lib.mjs";
import { readResearch, validateLessonResearchRefs, validateResearch } from "./research-lib.mjs";
import { readPracticeScenarios, validatePracticeScenarios } from "./practice-lab-lib.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(skillRoot, "manifest.json");
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

async function exists(relativePath) {
  try {
    const info = await stat(resolve(skillRoot, relativePath));
    return info.isFile();
  } catch {
    return false;
  }
}

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  console.error(`INVALID manifest.json: ${error.message}`);
  process.exit(1);
}

const skillText = await readFile(resolve(skillRoot, "SKILL.md"), "utf8");
const frontmatterMatch = skillText.match(/^---\n([\s\S]*?)\n---/);
check(Boolean(frontmatterMatch), "SKILL.md must start with YAML frontmatter");
if (frontmatterMatch) {
  const frontmatterLines = frontmatterMatch[1].split("\n");
  const keys = frontmatterLines
    .map((line) => line.match(/^([a-z][a-z-]*):/)?.[1])
    .filter(Boolean);
  check(keys.length === 2 && keys.includes("name") && keys.includes("description"), "SKILL.md frontmatter must contain only name and description");
  const name = frontmatterLines.find((line) => line.startsWith("name:"))?.slice(5).trim();
  const description = frontmatterLines.find((line) => line.startsWith("description:"))?.slice(12).trim();
  check(name === "agentboss-school", "SKILL.md name must be agentboss-school");
  check(typeof name === "string" && name.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name), "SKILL.md name must be valid hyphen-case");
  check(typeof description === "string" && description.length > 0 && description.length <= 1024, "SKILL.md description must contain 1-1024 characters");
  check(!/[<>]/.test(description ?? ""), "SKILL.md description cannot contain angle brackets");
}
check(skillText.split("\n").length < 500, "SKILL.md must remain under 500 lines");

const licenseText = await readFile(resolve(skillRoot, "LICENSE"), "utf8");
check(licenseText.startsWith("MIT License\n"), "AgentBoss School must include the accepted MIT license");
check(licenseText.includes("Copyright (c) 2026 Company OS contributors"), "MIT license must identify Company OS contributors");
check(licenseText.includes("THE SOFTWARE IS PROVIDED \"AS IS\""), "MIT license warranty disclaimer is incomplete");

const openaiYaml = await readFile(resolve(skillRoot, "agents/openai.yaml"), "utf8");
const displayName = openaiYaml.match(/^  display_name: "([^"]+)"$/m)?.[1];
const shortDescription = openaiYaml.match(/^  short_description: "([^"]+)"$/m)?.[1];
const defaultPrompt = openaiYaml.match(/^  default_prompt: "([^"]+)"$/m)?.[1];
check(Boolean(displayName), "agents/openai.yaml requires a quoted display_name");
check(Boolean(shortDescription) && [...shortDescription].length >= 25 && [...shortDescription].length <= 64, "agents/openai.yaml short_description must contain 25-64 characters");
check(Boolean(defaultPrompt) && defaultPrompt.includes("$agentboss-school"), "agents/openai.yaml default_prompt must mention $agentboss-school");

check(manifest.name === "agentboss-school", "manifest name must be agentboss-school");
check(/^\d+\.\d+\.\d+$/.test(manifest.version), "manifest version must be semver");
check(manifest.schemaVersion === 1, "manifest schemaVersion must be 1");
check(manifest.updatePolicy === "explicit-opt-in", "updates must be explicit opt-in");
check(Array.isArray(manifest.courses) && manifest.courses.length > 0, "courses must be non-empty");
check(Array.isArray(manifest.nodes) && manifest.nodes.length > 0, "nodes must be non-empty");
check(Array.isArray(manifest.files) && manifest.files.length > 0, "files must be non-empty");
check(new Set(manifest.files ?? []).size === (manifest.files ?? []).length, "manifest files must not contain duplicates");

const courseIds = new Set();
const courseMaps = new Map();
for (const course of manifest.courses ?? []) {
  check(typeof course.id === "string" && /^[a-z][a-z-]*$/.test(course.id), `invalid course id: ${course.id}`);
  check(!courseIds.has(course.id), `duplicate course id: ${course.id}`);
  courseIds.add(course.id);
  check(await exists(course.map), `missing course map: ${course.map}`);
  check(manifest.files.includes(course.map), `manifest files must include course map: ${course.map}`);
  if (await exists(course.map)) courseMaps.set(course.id, await readFile(resolve(skillRoot, course.map), "utf8"));
}

const nodeIds = new Set();
for (const node of manifest.nodes ?? []) {
  check(typeof node.id === "string" && /^[a-z][a-z-]*\/[a-z0-9][a-z0-9-]*$/.test(node.id), `invalid node id: ${node.id}`);
  check(!nodeIds.has(node.id), `duplicate node id: ${node.id}`);
  nodeIds.add(node.id);
  check(courseIds.has(node.course), `node ${node.id} has unknown course: ${node.course}`);
  check(Array.isArray(node.prerequisites), `node ${node.id} prerequisites must be an array`);
  check(await exists(node.lesson), `missing lesson for ${node.id}: ${node.lesson}`);
  check(manifest.files.includes(node.lesson), `manifest files must include lesson: ${node.lesson}`);
  check(courseMaps.get(node.course)?.includes(`\`${node.id}\``), `course map ${node.course} is missing node: ${node.id}`);
}

const labNodeIds = new Set([
  "shared/demo-responsibility-loop",
  "shared/delegation-clinic",
  "shared/evaluation-lab",
  "shared/outcome-unknown-tabletop",
  "shared/agent-security-tabletop",
  "shared/team-pilot-studio",
]);
const expectedNodeIds = new Set([
  "role/not-a-prompt-engineer", "role/delegation-fit", "role/work-decomposition", "role/outcome-contract", "role/context-and-instructions", "role/orchestration-fit",
  "operations/lifecycle-control-loop", "operations/observe", "operations/intervene", "operations/evaluate-and-review", "operations/retry-and-outcome-unknown", "operations/cost-latency-budget",
  "governance/authority-and-least-privilege", "governance/data-boundary", "governance/prompt-injection-and-tool-risk", "governance/exact-action-approval", "governance/secrets-and-identity", "governance/incident-and-recovery",
  "team/role-design", "team/skill-as-process", "team/operating-review", "team/pilot", "team/value-and-economics", "team/change-and-handoff",
  ...labNodeIds,
]);
check(manifest.nodes.length === 30, "v0.7 must contain 24 core nodes and 6 Labs");
check(manifest.nodes.filter(({ id }) => labNodeIds.has(id)).length === 6, "v0.7 must contain all 6 declared Labs");
check(manifest.nodes.filter(({ id }) => !labNodeIds.has(id)).length === 24, "v0.7 must contain all 24 core knowledge nodes");
for (const id of expectedNodeIds) check(nodeIds.has(id), `v0.7 is missing canonical node: ${id}`);
for (const id of nodeIds) check(expectedNodeIds.has(id), `v0.7 contains an undeclared replacement node: ${id}`);

for (const node of manifest.nodes ?? []) {
  for (const prerequisite of node.prerequisites ?? []) {
    check(nodeIds.has(prerequisite), `node ${node.id} has unknown prerequisite: ${prerequisite}`);
    check(prerequisite !== node.id, `node ${node.id} cannot depend on itself`);
  }
}

const byId = new Map((manifest.nodes ?? []).map((node) => [node.id, node]));
const visiting = new Set();
const visited = new Set();
function visit(nodeId) {
  if (visiting.has(nodeId)) {
    errors.push(`curriculum cycle detected at ${nodeId}`);
    return;
  }
  if (visited.has(nodeId) || !byId.has(nodeId)) return;
  visiting.add(nodeId);
  for (const prerequisite of byId.get(nodeId).prerequisites ?? []) visit(prerequisite);
  visiting.delete(nodeId);
  visited.add(nodeId);
}
for (const nodeId of nodeIds) visit(nodeId);

let research;
try {
  research = await readResearch(skillRoot);
  const researchResult = validateResearch(research, nodeIds, courseIds);
  for (const error of researchResult.errors) errors.push(`research: ${error}`);
  research.sourceIds = researchResult.sourceIds;
  research.claimIds = researchResult.claimIds;
} catch (error) {
  errors.push(`research registries cannot be read: ${error.message}`);
}

const caseCatalog = await readCaseCatalog(skillRoot);
const caseCatalogErrors = await validateCaseCatalog(skillRoot, caseCatalog, nodeIds);
for (const error of caseCatalogErrors) errors.push(`case catalog: ${error}`);
if (caseCatalogErrors.length === 0) {
  const expectedCaseIndex = await buildCaseIndex(skillRoot, nodeIds);
  try {
    const storedCaseIndex = JSON.parse(await readFile(resolve(skillRoot, "rag/index.generated.json"), "utf8"));
    check(JSON.stringify(storedCaseIndex) === JSON.stringify(expectedCaseIndex), "case RAG index is stale; run node scripts/build-case-index.mjs");
  } catch (error) {
    errors.push(`case RAG index cannot be read: ${error.message}`);
  }
}

const defaultPositions = new Map((manifest.defaultPath ?? []).map((id, index) => [id, index]));
check(defaultPositions.size === (manifest.defaultPath ?? []).length, "defaultPath contains duplicate nodes");
for (const id of manifest.defaultPath ?? []) check(nodeIds.has(id), `defaultPath has unknown node: ${id}`);
for (const id of manifest.defaultPath ?? []) {
  const node = byId.get(id);
  for (const prerequisite of node?.prerequisites ?? []) {
    check(
      defaultPositions.has(prerequisite) && defaultPositions.get(prerequisite) < defaultPositions.get(id),
      `defaultPath must place ${prerequisite} before ${id}`,
    );
  }
}

for (const relativePath of manifest.files ?? []) {
  check(typeof relativePath === "string" && !relativePath.startsWith("/"), `manifest file must be relative: ${relativePath}`);
  check(!relativePath.includes(".."), `manifest file cannot traverse directories: ${relativePath}`);
  check(await exists(relativePath), `missing manifest file: ${relativePath}`);
}

const requiredLessonHeadings = [
  "## 学习结果",
  "## 核心概念",
  "## 决策框架",
  "## 来源",
  "## 讲授",
  "## 失败模式与边界",
  "## 实操",
  "## 完成证据",
  "## 降级路径",
  "## 下一节点信号",
];
const lessonParagraphOwners = new Map();
for (const node of manifest.nodes ?? []) {
  if (!(await exists(node.lesson))) continue;
  const lesson = await readFile(resolve(skillRoot, node.lesson), "utf8");
  for (const heading of requiredLessonHeadings) {
    check(lesson.includes(heading), `${node.lesson} missing heading: ${heading}`);
  }
  if (research?.sourceIds && research?.claimIds) {
    for (const error of validateLessonResearchRefs(lesson, node.lesson, research.sourceIds, research.claimIds)) errors.push(error);
  }
  check(/\[CLM-[0-9]{3}\]/.test(lesson), `${node.lesson} must cite at least one registered claim`);
  check(!/真实(?:客户|生产).*?(?:成功率|提升|降低)\s*\d+%/s.test(lesson), `${node.lesson} may contain an unsupported outcome claim`);
  for (const paragraph of lesson.split(/\n\s*\n/).map((value) => value.replace(/\s+/g, " ").trim()).filter((value) => value.length >= 120 && !value.startsWith("## "))) {
    const previous = lessonParagraphOwners.get(paragraph);
    check(!previous, `duplicated long lesson paragraph in ${previous} and ${node.lesson}`);
    if (!previous) lessonParagraphOwners.set(paragraph, node.lesson);
  }
}

const curriculumFramework = await readFile(resolve(skillRoot, "references/curriculum-framework.md"), "utf8");
for (const heading of ["## 1. 学校边界", "## 2. 能力模型", "## 5. 来源等级", "## 6. 冲突处理", "## 8. 成熟度与认证"]) {
  check(curriculumFramework.includes(heading), `curriculum framework missing heading: ${heading}`);
}
check(!curriculumFramework.includes("| 待建 |"), "v0.7 curriculum framework must not retain planned-only nodes");
check(skillText.includes("只有确定要教某个节点时才读取那个 lesson"), "SKILL.md must preserve progressive lesson loading");
const classroomRuntime = await readFile(resolve(skillRoot, "references/classroom-runtime.md"), "utf8");
for (const marker of [
  "第一幕·看见问题",
  "第二幕·学会决定",
  "第三幕·做出工件",
  "贯穿全校的连续案例",
  "学员工作件体系",
  "不是客户案例",
]) {
  check(classroomRuntime.includes(marker), `classroom runtime missing teaching contract: ${marker}`);
}
check(skillText.includes("references/classroom-runtime.md"), "SKILL.md must load the classroom runtime before teaching");
for (const marker of ["价值台账", "移交清单", "身份链", "介入决策记录"]) {
  check(classroomRuntime.includes(marker), `classroom runtime missing v0.7 work artifact: ${marker}`);
}
const practiceSystem = await readFile(resolve(skillRoot, "references/practice-system.md"), "utf8");
for (const marker of ["P1 · Worked Example", "P2 · Progressive Disclosure Lab", "P3 · Environment Lab", "双轨评分", "不能评为 `capable`"]) {
  check(practiceSystem.includes(marker), `practice system missing teaching contract: ${marker}`);
}
try {
  const practiceCatalog = await readPracticeScenarios(skillRoot);
  for (const error of validatePracticeScenarios(practiceCatalog, nodeIds)) errors.push(`practice: ${error}`);
  check(practiceCatalog.scenarios.length === 3, "v0.7 must contain 3 executable progressive-disclosure scenarios");
} catch (error) {
  errors.push(`practice catalog cannot be read: ${error.message}`);
}
check(skillText.includes("机器达到 80 分只表示结构检查通过"), "SKILL.md must preserve the machine-assessment boundary");
const knowledgeThickness = await readFile(resolve(skillRoot, "references/knowledge-thickness.md"), "utf8");
check(knowledgeThickness.includes(`快照版本：\`${manifest.version}\``), "knowledge thickness report must match the manifest version");
check(knowledgeThickness.includes(`| 正式 manifest 节点 | ${manifest.nodes.length} |`), "knowledge thickness report must disclose the current manifest node count");
const sourceTierCounts = Object.groupBy(research?.sourceRegistry?.sources ?? [], ({ evidenceTier }) => evidenceTier);
const sourceTierSummary = `${sourceTierCounts.A?.length ?? 0} 个 A、${sourceTierCounts.B?.length ?? 0} 个 B、${sourceTierCounts.D?.length ?? 0} 个 D`;
check(knowledgeThickness.includes(`${research?.sourceRegistry?.sources?.length ?? 0} | ${sourceTierSummary}`), "knowledge thickness report source count is stale");
check(knowledgeThickness.includes(`合成教学案例 | ${caseCatalog.cases.filter(({ caseType }) => caseType === "SYNTHETIC_SCENARIO").length}`), "knowledge thickness report case count is stale");
for (const nodeId of nodeIds) check(knowledgeThickness.includes(`\`${nodeId}\``), `knowledge thickness report is missing node: ${nodeId}`);
const openSourceResearch = await readFile(resolve(skillRoot, "references/open-source-research.md"), "utf8");
check(openSourceResearch.includes("Star 只用于发现候选"), "open-source policy must not treat stars as evidence");
check(openSourceResearch.includes("copiedAssets"), "open-source policy must disclose copied assets");

const intakeTemplate = await readFile(resolve(skillRoot, "references/cases/_case-intake-template.md"), "utf8");
for (const heading of [
  "## B. 授权与隐私门",
  "## E. 委派与 Agent 工作设计",
  "## H. 结果声明与证据",
  "## J. 可教学知识",
  "## M. 提交前自检",
  "## N. 内部审核结果（案例提供者不填）",
]) {
  check(intakeTemplate.includes(heading), `case intake template missing heading: ${heading}`);
}
check(intakeTemplate.includes("原始输入表不得直接进入 RAG"), "case intake template must prohibit direct RAG ingestion");

for (const schemaPath of [
  "credentials/completion-submission.schema.json",
  "credentials/credential.schema.json",
  "credentials/issuer-keys.schema.json",
  "credentials/revocations.schema.json",
  "credentials/yearbook.schema.json",
]) {
  try {
    await readJson(resolve(skillRoot, schemaPath));
  } catch (error) {
    errors.push(`${schemaPath} cannot be read as JSON: ${error.message}`);
  }
}

const [completionExample, issuerKeyring, revocations, yearbook] = await Promise.all([
  readJson(resolve(skillRoot, "credentials/completion-submission.example.json")),
  readJson(resolve(skillRoot, "credentials/issuer-keys.json")),
  readJson(resolve(skillRoot, "credentials/revocations.json")),
  readJson(resolve(skillRoot, "credentials/yearbook.json")),
]);
for (const error of validateCompletionSubmission(completionExample, manifest)) errors.push(`completion example: ${error}`);
for (const error of validateIssuerKeyring(issuerKeyring)) errors.push(`issuer keyring: ${error}`);
for (const error of validateRevocations(revocations)) errors.push(`revocations: ${error}`);
for (const error of validateYearbook(yearbook)) errors.push(`yearbook: ${error}`);
const expectedYearbook = buildYearbookMarkdown(yearbook);
const storedYearbook = await readFile(resolve(skillRoot, "YEARBOOK.md"), "utf8");
check(storedYearbook === expectedYearbook, "YEARBOOK.md is stale; run node scripts/build-yearbook.mjs");

const certification = await readFile(resolve(skillRoot, "references/certification.md"), "utf8");
check(certification.includes("Agent Boss Foundations Certificate"), "certification policy must declare the credential name");
check(certification.includes("yearbookConsent=false"), "certification policy must make Yearbook opt-in by default");
check(certification.includes("不要求购买 Agent Boss 陪跑或 FDE"), "certification policy must keep paid services out of the credential gate");
check(certification.includes("不是政府资质、学历、学位"), "certification policy must state the non-degree boundary");
check(certification.includes("不产生新的签名证书"), "advanced course completion must not silently expand the Foundations credential");
const servicePaths = await readFile(resolve(skillRoot, "references/service-paths.md"), "utf8");
check(servicePaths.includes("### 继续免费学习"), "service paths must keep the free course option");
check(servicePaths.includes("不自动发送消息"), "service paths must prohibit automatic outreach");

if (errors.length > 0) {
  console.error(`AgentBoss School curriculum validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`AgentBoss School ${manifest.version}: ${manifest.courses.length} courses, ${manifest.nodes.length} nodes, curriculum valid.`);
