#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const argument = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return resolve(process.cwd(), process.argv[index + 1]);
};

const manifestPath = argument("--manifest");
const outputPath = argument("--output");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const views = [
  "01-front.png",
  "02-rear.png",
  "03-left.png",
  "04-right.png",
  "05-front-three-quarter.png",
];

const assets = manifest.assets.map((asset) => {
  if (!/^[a-z0-9-]+$/.test(asset.id)) throw new Error(`Invalid asset id: ${asset.id}`);
  if (!/^v\d+$/.test(asset.version)) throw new Error(`Invalid version: ${asset.version}`);
  if (!Number.isInteger(asset.seed) || !asset.prompt) throw new Error(`Incomplete asset: ${asset.id}`);
  const sourceRoot = `assets/3d/environment/hyper3d-sources/${asset.id}/multiview-${asset.version}`;
  return {
    id: `${asset.id}-multiview-${asset.version}`,
    sources: views.map((view) => `${sourceRoot}/${view}`),
    outputDirectory: `assets/3d/environment/hyper3d-generated-multiview/${asset.id}/${asset.version}`,
    prompt: asset.prompt,
    request: { seed: asset.seed },
  };
});

const config = {
  schemaVersion: "1.0",
  batchId: manifest.batchId,
  defaults: {
    tier: "Gen-2.5-Medium",
    mesh_mode: "Quad",
    quality: "medium",
    geometry_file_format: "glb",
    material: "PBR",
    texture_mode: "medium",
    geometry_instruct_mode: "faithful",
    use_original_alpha: false,
    texture_delight: true,
    preview_render: true,
  },
  assets,
};

await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${assets.length} assets to ${outputPath}`);
