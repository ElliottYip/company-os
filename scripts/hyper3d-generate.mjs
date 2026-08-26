#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const API_BASE = "https://api.hyper3d.com/api/v2";
const DEADLINE_MS = 20 * 60 * 1000;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeName(value) {
  return basename(value).replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function apiJson(apiKey, path, options = {}) {
  for (;;) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...options.headers,
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "5");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.max(1, retryAfter) * 1000));
      continue;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) {
      throw new Error(`Hyper3D ${path} failed (${response.status}): ${body.error ?? body.message ?? "unknown error"}`);
    }
    return body;
  }
}

async function pollUntilDone(apiKey, subscriptionKey) {
  const startedAt = Date.now();
  let delayMs = 5_000;
  for (;;) {
    if (Date.now() - startedAt >= DEADLINE_MS) throw new Error("Hyper3D generation timed out after 20 minutes.");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    const status = await apiJson(apiKey, "/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription_key: subscriptionKey }),
    });
    const states = (status.jobs ?? []).map((job) => job.status);
    if (states.includes("Failed")) throw new Error("Hyper3D generation job failed.");
    if (states.length > 0 && states.every((state) => state === "Done")) return;
    delayMs = Math.min(delayMs + 5_000, 30_000);
  }
}

async function downloadOutputs(downloads, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const outputRecords = [];
  for (const item of downloads.list ?? []) {
    if (!item.url || !item.name) continue;
    const response = await fetch(item.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Unable to download ${item.name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const name = safeName(item.name);
    const path = join(outputDirectory, name);
    await writeFile(path, bytes);
    outputRecords.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  if (outputRecords.length === 0) throw new Error("Hyper3D returned no downloadable outputs.");
  return outputRecords;
}

async function generateAsset({ apiKey, root, workDirectory, defaults, asset }) {
  const outputDirectory = resolve(root, asset.outputDirectory);
  const metadataPath = join(outputDirectory, "generation.json");
  if (existsSync(metadataPath)) {
    process.stdout.write(`${asset.id}: already complete; skipped\n`);
    return;
  }

  const configuredSources = asset.sources ?? (asset.source ? [asset.source] : []);
  const sourcePaths = configuredSources.map((source) => resolve(root, source));
  if (sourcePaths.some((path) => !path)) throw new Error(`${asset.id}: source image path is invalid.`);
  if (!sourcePaths.length && !asset.prompt) {
    throw new Error(`${asset.id}: either source images or a text prompt is required.`);
  }
  const sourceBytes = await Promise.all(sourcePaths.map((path) => readFile(path)));
  const jobStatePath = join(workDirectory, `${asset.id}.json`);
  let jobState;
  if (existsSync(jobStatePath)) {
    jobState = JSON.parse(await readFile(jobStatePath, "utf8"));
    process.stdout.write(`${asset.id}: resuming submitted task ${jobState.taskUuid}\n`);
  } else {
    const request = { ...defaults, ...asset.request };
    const form = new FormData();
    sourceBytes.forEach((bytes, index) => {
      form.append("images", new Blob([bytes], { type: "image/png" }), basename(sourcePaths[index]));
    });
    form.append("prompt", asset.prompt);
    for (const [key, value] of Object.entries(request)) {
      if (Array.isArray(value)) value.forEach((entry) => form.append(key, String(entry)));
      else form.append(key, String(value));
    }
    const generation = await apiJson(apiKey, "/rodin", { method: "POST", body: form });
    jobState = {
      taskUuid: generation.uuid,
      subscriptionKey: generation.jobs?.subscription_key,
      consumed: generation.consumed,
      submittedAt: new Date().toISOString(),
    };
    if (!jobState.taskUuid || !jobState.subscriptionKey) throw new Error("Hyper3D response omitted task identifiers.");
    await atomicJson(jobStatePath, jobState);
    process.stdout.write(`${asset.id}: submitted (${jobState.consumed} credits)\n`);
  }

  await pollUntilDone(apiKey, jobState.subscriptionKey);
  const downloads = await apiJson(apiKey, "/download", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task_uuid: jobState.taskUuid }),
  });
  const outputs = await downloadOutputs(downloads, outputDirectory);
  await atomicJson(metadataPath, {
    schemaVersion: "1.0",
    assetId: asset.id,
    provider: "Hyper3D Rodin",
    taskUuid: jobState.taskUuid,
    generatedAt: new Date().toISOString(),
    consumedCredits: jobState.consumed,
    generationMode: sourcePaths.length ? "IMAGE_TO_3D" : "TEXT_TO_3D",
    sources: sourcePaths.map((path, index) => ({
      path: configuredSources[index],
      sha256: sha256(sourceBytes[index]),
    })),
    request: { ...defaults, ...asset.request, prompt: asset.prompt },
    outputs,
  });
  await unlink(jobStatePath).catch(() => {});
  process.stdout.write(`${asset.id}: downloaded ${outputs.map(({ name }) => name).join(", ")}\n`);
}

const configFlag = process.argv.indexOf("--config");
if (configFlag < 0 || !process.argv[configFlag + 1]) throw new Error("Usage: hyper3d-generate.mjs --config <path>");
const concurrencyFlag = process.argv.indexOf("--concurrency");
const concurrency = concurrencyFlag >= 0 ? Number(process.argv[concurrencyFlag + 1]) : 1;
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
  throw new Error("--concurrency must be an integer from 1 to 8.");
}
const apiKey = process.env.RODIN_API_KEY;
if (!apiKey) throw new Error("RODIN_API_KEY must be provided through the environment.");

const root = process.cwd();
const configPath = resolve(root, process.argv[configFlag + 1]);
const config = JSON.parse(await readFile(configPath, "utf8"));
const workDirectory = resolve(root, "work/hyper3d-jobs");
await mkdir(workDirectory, { recursive: true, mode: 0o700 });
let nextAssetIndex = 0;
async function worker() {
  for (;;) {
    const index = nextAssetIndex++;
    if (index >= config.assets.length) return;
    await generateAsset({ apiKey, root, workDirectory, defaults: config.defaults, asset: config.assets[index] });
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, config.assets.length) }, () => worker()));
