import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = process.cwd();
const trackedFiles = new Set(
  execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean),
);

function assertTracked(path, label) {
  const repositoryPath = relative(root, path).replaceAll("\\", "/");
  if (!trackedFiles.has(repositoryPath)) {
    throw new Error(`${label} is not tracked by Git: ${repositoryPath}`);
  }
}

const manifestPath = resolve(root, "web/public/assets/3d/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const requiredActions = new Set(manifest.actions);
const requiredNodes = new Set(manifest.anchors);

if (manifest.schemaVersion !== "1.0" || manifest.contract !== "AssetManifest 1.0") {
  throw new Error("Unsupported 3D asset manifest contract.");
}
if (manifest.assets.length !== 3) throw new Error("Canonical fish catalog must contain exactly three assets.");

function parseGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) throw new Error("Invalid GLB magic.");
  if (bytes.readUInt32LE(4) !== 2) throw new Error("Only glTF 2.0 GLB assets are accepted.");
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error("GLB byte length does not match its header.");
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error("GLB JSON chunk is missing.");
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
}

async function validateAssetFile(asset) {
  if (!asset.src.startsWith("/assets/3d/") || !asset.src.endsWith(".glb")) {
    throw new Error(`Invalid asset URL: ${asset.src}`);
  }
  const path = resolve(root, "web/public", asset.src.slice(1));
  assertTracked(path, `${asset.id}: runtime asset`);
  const bytes = await readFile(path);
  const metadata = await stat(path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (metadata.size !== asset.bytes) throw new Error(`${asset.id}: byte count mismatch.`);
  if (digest !== asset.sha256) throw new Error(`${asset.id}: SHA-256 mismatch.`);
  return parseGlb(bytes);
}

for (const asset of manifest.assets) {
  if (!/^fish-(bumble|fizz|honey)-3d-v\d+$/.test(asset.id)) throw new Error(`Invalid canonical asset ID: ${asset.id}`);
  const gltf = await validateAssetFile(asset);
  if (gltf.meshes?.length !== 1) throw new Error(`${asset.id}: expected one mesh.`);
  if (gltf.skins?.length !== 1) throw new Error(`${asset.id}: expected one skin.`);
  const actions = new Set((gltf.animations ?? []).map((item) => item.name));
  const nodes = new Set((gltf.nodes ?? []).map((item) => item.name));
  for (const action of requiredActions) if (!actions.has(action)) throw new Error(`${asset.id}: missing action ${action}.`);
  for (const node of requiredNodes) if (!nodes.has(node)) throw new Error(`${asset.id}: missing anchor ${node}.`);
}

const environmentManifest = JSON.parse(await readFile(resolve(root, "web/public/assets/3d/environment/manifest.json"), "utf8"));
if (environmentManifest.schemaVersion !== "1.0" || environmentManifest.assets.length < 50) {
  throw new Error("Environment manifest must expose at least 50 versioned assets.");
}
if (environmentManifest.rooms.length < 8) throw new Error("Environment manifest must define at least eight room types.");
const environmentIds = new Set();
async function validateSourceBlend(asset) {
  const source = asset.sourceBlend;
  if (!source?.path?.startsWith("assets/3d/environment/sources/") || !source.path.endsWith(".blend")) {
    throw new Error(`${asset.id}: missing independent Blender source.`);
  }
  const path = resolve(root, source.path);
  assertTracked(path, `${asset.id}: Blender source`);
  const bytes = await readFile(path);
  const metadata = await stat(path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (metadata.size !== source.bytes) throw new Error(`${asset.id}: source Blender byte count mismatch.`);
  if (digest !== source.sha256) throw new Error(`${asset.id}: source Blender SHA-256 mismatch.`);
}
for (const asset of environmentManifest.assets) {
  if (!asset.id || environmentIds.has(asset.id)) throw new Error(`Duplicate or missing environment asset ID: ${asset.id}`);
  environmentIds.add(asset.id);
  if (!asset.semanticRole || !asset.kind || !asset.interactionSlots?.length || !asset.anchorPoints?.length) {
    throw new Error(`${asset.id}: incomplete semantic contract.`);
  }
  if (Object.values(asset.bounds ?? {}).some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error(`${asset.id}: invalid bounds.`);
  }
  const collision = asset.collisionBounds;
  if (collision?.shape !== "BOX" || !collision.center || !collision.size) {
    throw new Error(`${asset.id}: missing collision bounds.`);
  }
  if (Object.values(collision.center).some((value) => !Number.isFinite(value)) ||
      Object.values(collision.size).some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error(`${asset.id}: invalid collision bounds.`);
  }
  await validateAssetFile(asset);
  await validateSourceBlend(asset);
}

const requiredRoomKinds = new Set([
  "ENTRANCE", "RECEPTION", "DEPARTMENT", "PROJECT_ROOM",
  "MEETING_ROOM", "PANTRY", "RESTROOM", "CORRIDOR",
]);
for (const room of environmentManifest.rooms) {
  requiredRoomKinds.delete(room.kind);
  for (const assetId of room.assets) {
    if (!environmentIds.has(assetId)) throw new Error(`${room.id}: unknown environment asset ${assetId}.`);
  }
}
if (requiredRoomKinds.size) throw new Error(`Missing room kinds: ${[...requiredRoomKinds].join(", ")}`);

const roomManifest = JSON.parse(await readFile(resolve(root, "web/public/assets/3d/rooms/manifest.json"), "utf8"));
if (roomManifest.schemaVersion !== "1.0" || roomManifest.contract !== "OfficeRoomAsset 1.0" || roomManifest.rooms.length !== 8) {
  throw new Error("Room asset manifest contract is incomplete.");
}
for (const room of roomManifest.rooms) {
  if (room.placements < 7 || !room.assetIds?.length || room.assetIds.some((id) => !environmentIds.has(id))) {
    throw new Error(`${room.id}: invalid room composition.`);
  }
  if (room.assetIds.some((id) => id.startsWith("ceiling-light-"))) {
    throw new Error(`${room.id}: ceiling-light assets are forbidden in the approved room composition.`);
  }
  await validateAssetFile(room);
  const previewPath = resolve(root, room.preview);
  assertTracked(previewPath, `${room.id}: preview`);
  await stat(previewPath);
}
const canonicalFishIds = new Set(manifest.assets.map(({ id }) => id));
const fixtureIds = roomManifest.showcase?.fixtureCharacterIds ?? [];
if (fixtureIds.length !== 3 || fixtureIds.some((id) => !canonicalFishIds.has(id))) {
  throw new Error("Showcase must use exactly the three approved fish as explicit fixtures.");
}
const showcasePreviewPath = resolve(root, roomManifest.showcase.preview);
assertTracked(showcasePreviewPath, "Room showcase preview");
await stat(showcasePreviewPath);

const detailRoomManifest = JSON.parse(await readFile(resolve(root, "web/public/assets/3d/detail/rooms/manifest.json"), "utf8"));
if (detailRoomManifest.schemaVersion !== "1.0" || detailRoomManifest.contract !== "OfficeRoomAsset 1.0" || detailRoomManifest.rooms.length !== 1) {
  throw new Error("Focused detail-room manifest contract is incomplete.");
}
const receptionDetail = detailRoomManifest.rooms[0];
if (receptionDetail.kind !== "RECEPTION" || receptionDetail.referenceRole !== "ART_DIRECTION_CAMERA_MATCH") {
  throw new Error("Focused reception detail must be a reference-matched room.");
}
if (!receptionDetail.assetIds?.length || receptionDetail.assetIds.some((id) => !id.startsWith("reference-matched-"))) {
  throw new Error("Focused reception detail contains an unowned visual component.");
}
if (!receptionDetail.interactiveSlots?.includes("receptionist") || !receptionDetail.interactiveSlots.includes("monitor")) {
  throw new Error("Focused reception detail must preserve live entity and screen slots.");
}
await validateAssetFile(receptionDetail);
const receptionPreviewPath = resolve(root, receptionDetail.preview);
const receptionReferencePath = resolve(root, receptionDetail.reference);
assertTracked(receptionPreviewPath, "Focused reception preview");
assertTracked(receptionReferencePath, "Focused reception reference");
await stat(receptionPreviewPath);
await stat(receptionReferencePath);

console.log(
  `3D asset guard passed: ${manifest.assets.length} canonical fish, ` +
  `${environmentManifest.assets.length} environment assets, ${roomManifest.rooms.length} room modules, ` +
  `${detailRoomManifest.rooms.length} focused detail room.`,
);
