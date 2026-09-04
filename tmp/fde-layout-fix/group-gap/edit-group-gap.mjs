import fs from "node:fs/promises";
import path from "node:path";
import {
  FileBlob,
  PresentationFile,
} from "/Users/elliottye/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const ROOT = "/Users/elliottye/Documents/ChatGPT/os";
const OUTPUT_DIR = path.join(ROOT, "outputs/fde-brochure-layout-fix-v61");
const WORK = path.join(ROOT, "tmp/fde-layout-fix");

const textIds = [
  "sh/x4r21kru", "sh/r65knqtk", "sh/ove9o7yd", "sh/mtwrmxg7",
  "sh/wjy9sry9", "sh/ahwrqhgj", "sh/cnupgny5", "sh/t8byxkn2",
];
const ruleIds = [
  "sh/a10jqpsj", "sh/w3i1sfa9", "sh/q5wjelsz", "sh/9wnqhczy",
  "sh/nu58f2hs", "sh/xk7qlczu", "sh/bip8jmho", "sh/do3q9szq",
];

// Preserve the established 47 px within-group rhythm, adding a 12 px break
// only between rows four and five.
const rowTops = [470, 517, 564, 611, 670, 717, 764, 811];

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function applyGroupGap(presentation) {
  textIds.forEach((id, index) => {
    const object = presentation.resolve(id);
    object.frame = { ...object.frame, top: rowTops[index], height: 44 };
    object.text.fontSize = 14;
    object.text.lineSpacing = 1.15;
  });
  ruleIds.forEach((id, index) => {
    const object = presentation.resolve(id);
    object.frame = { ...object.frame, top: rowTops[index] + 21.65 };
  });
}

async function revise({ lang, filename }) {
  const deckPath = path.join(OUTPUT_DIR, filename);
  const presentation = await PresentationFile.importPptx(await FileBlob.load(deckPath));
  applyGroupGap(presentation);

  const renderDir = path.join(WORK, lang, "final");
  const layoutDir = path.join(renderDir, "layout");
  await fs.mkdir(layoutDir, { recursive: true });
  for (let index = 0; index < presentation.slides.items.length; index += 1) {
    const slide = presentation.slides.items[index];
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(
      path.join(renderDir, `${stem}.png`),
      await presentation.export({ slide, format: "png", scale: 2 }),
    );
    await fs.writeFile(
      path.join(layoutDir, `${stem}.layout.json`),
      await (await slide.export({ format: "layout" })).text(),
    );
  }
  await writeBlob(
    path.join(renderDir, "montage.webp"),
    await presentation.export({ format: "webp", montage: true, scale: 1 }),
  );
  await (await PresentationFile.exportPptx(presentation)).save(deckPath);
}

await revise({ lang: "en", filename: "FDE-AI-Upgrade-English-v61.pptx" });
await revise({ lang: "zh", filename: "FDE企业AI升级-中文-v61.pptx" });
