#!/usr/bin/env node

import { copyFile, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(skillRoot, "manifest.json"), "utf8"));

function usage() {
  console.log("Usage: node scripts/install.mjs [--target <skill-directory>] [--replace]");
}

function parseArguments(values) {
  let target = resolve(homedir(), ".codex/skills/agentboss-school");
  let replace = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--replace") {
      replace = true;
    } else if (value === "--target") {
      const next = values[index + 1];
      if (!next) throw new Error("--target requires a path");
      target = resolve(next);
      index += 1;
    } else if (value === "--help" || value === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }
  return { target, replace };
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function copyPackage(destination) {
  for (const relativePath of manifest.files) {
    const source = resolve(skillRoot, relativePath);
    const target = resolve(destination, relativePath);
    const targetRelative = relative(destination, target);
    if (targetRelative.startsWith("..") || isAbsolute(targetRelative)) throw new Error(`unsafe manifest path: ${relativePath}`);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

const options = parseArguments(process.argv.slice(2));
if (resolve(options.target) === skillRoot) throw new Error("install target cannot be the source package");

const targetParent = dirname(options.target);
await mkdir(targetParent, { recursive: true });
const targetExists = await pathExists(options.target);
if (targetExists && !options.replace) {
  throw new Error(`target already exists: ${options.target}; rerun with --replace to keep a backup and install explicitly`);
}

const stage = await mkdtemp(join(targetParent, ".agentboss-school-install-"));
let backup = null;
try {
  await copyPackage(stage);
  const validation = spawnSync(process.execPath, [resolve(stage, "scripts/validate-curriculum.mjs")], {
    encoding: "utf8",
  });
  if (validation.status !== 0) {
    throw new Error(`staged package failed validation: ${validation.stderr || validation.stdout}`);
  }

  if (targetExists) {
    const suffix = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    backup = resolve(targetParent, `${basename(options.target)}.backup-${suffix}`);
    await rename(options.target, backup);
  }

  try {
    await rename(stage, options.target);
  } catch (error) {
    if (backup) await rename(backup, options.target);
    throw error;
  }
} catch (error) {
  await rm(stage, { recursive: true, force: true });
  throw error;
}

console.log(`Installed AgentBoss School ${manifest.version} to ${options.target}`);
if (backup) console.log(`Previous installation retained at ${backup}`);
