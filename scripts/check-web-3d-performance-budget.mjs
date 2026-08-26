import { gzipSync } from "node:zlib";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const distAssets = resolve(root, "web/dist/assets");
const files = await readdir(distAssets);
const jsFiles = files.filter((file) => file.endsWith(".js"));
const initial = jsFiles.find((file) => file.startsWith("index-"));
const office3d = jsFiles.find((file) => file.startsWith("office-three-renderer-"));
if (!initial) throw new Error("Expected an initial Company OS JavaScript chunk.");

async function size(file) {
  const bytes = await readFile(resolve(distAssets, file));
  return { raw: bytes.length, gzip: gzipSync(bytes).length };
}

const initialSize = await size(initial);
const office3dSize = office3d ? await size(office3d) : null;
const initialSource = await readFile(resolve(distAssets, initial), "utf8");
if (/\.glb\b|office-three-renderer|three\.module/i.test(initialSource)) {
  throw new Error("The default Workforce graph must not bundle the 3D runtime or GLB paths.");
}
const roomManifest = JSON.parse(await readFile(resolve(root, "web/public/assets/3d/rooms/manifest.json"), "utf8"));
const detailManifest = JSON.parse(await readFile(resolve(root, "web/public/assets/3d/detail/rooms/manifest.json"), "utf8"));
const roomBytes = roomManifest.rooms.map((room) => room.bytes);
const totalRoomBytes = roomBytes.reduce((total, bytes) => total + bytes, 0);
const maximumRoomBytes = Math.max(...roomBytes);
const receptionDetailBytes = detailManifest.rooms.find((room) => room.kind === "RECEPTION")?.bytes ?? Infinity;
const candidateBytes = (await stat(resolve(
  root,
  "assets/3d/environment/web-candidates/reception-bell/v1/reception-bell.glb",
))).size;

const limits = {
  // React Flow is the only substantial first-screen Web dependency. This
  // remains much smaller than loading a 3D engine and keeps the full app under
  // a 160 kB gzip JavaScript budget.
  initialRaw: 500_000,
  initialGzip: 160_000,
  lazy3dRaw: 700_000,
  lazy3dGzip: 180_000,
  totalRooms: 7_000_000,
  singleRoom: 1_500_000,
  // The reference-matched room is isolated behind an explicit user action.
  // This budget buys continuous architecture and coordinated room art without
  // adding a byte to the initial page or lightweight office overview.
  focusedDetailRoom: 4_200_000,
  admittedGeneratedProp: 250_000,
};
const measurements = { initialSize, office3dSize, totalRoomBytes, maximumRoomBytes, receptionDetailBytes, candidateBytes };

for (const [value, limit, label] of [
  [initialSize.raw, limits.initialRaw, "initial JS raw"],
  [initialSize.gzip, limits.initialGzip, "initial JS gzip"],
  ...(office3dSize ? [
    [office3dSize.raw, limits.lazy3dRaw, "lazy 3D JS raw"],
    [office3dSize.gzip, limits.lazy3dGzip, "lazy 3D JS gzip"],
  ] : []),
  [totalRoomBytes, limits.totalRooms, "eight room GLBs"],
  [maximumRoomBytes, limits.singleRoom, "largest room GLB"],
  [receptionDetailBytes, limits.focusedDetailRoom, "focused reception detail GLB"],
  [candidateBytes, limits.admittedGeneratedProp, "admitted generated prop"],
]) {
  if (value > limit) throw new Error(`${label} exceeds budget: ${value} > ${limit}`);
}

console.log("Web 3D performance budget passed", measurements);
