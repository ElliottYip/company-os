import fs from "node:fs/promises";
import path from "node:path";
import {
  FileBlob,
  PresentationFile,
} from "/Users/elliottye/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const ROOT = "/Users/elliottye/Documents/ChatGPT/os";
const WORK = path.join(ROOT, "tmp/fde-layout-fix/en-center");
const OUTPUT = path.join(ROOT, "outputs/fde-brochure-layout-fix-v61/FDE-AI-Upgrade-English-v61.pptx");
const RENDER_DIR = path.join(ROOT, "tmp/fde-layout-fix/en/final");

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

const presentation = await PresentationFile.importPptx(
  await FileBlob.load(path.join(WORK, "template-starter.pptx")),
);

const disclaimer = presentation.resolve("sh/n61wbmlo");
disclaimer.frame = { left: 446, top: 856, width: 268, height: 105 };
disclaimer.text.alignment = "center";
disclaimer.text.verticalAlignment = "middle";

await fs.mkdir(path.join(WORK, "final-layout"), { recursive: true });
await fs.mkdir(RENDER_DIR, { recursive: true });
for (let index = 0; index < presentation.slides.items.length; index += 1) {
  const slide = presentation.slides.items[index];
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  await writeBlob(
    path.join(RENDER_DIR, `${stem}.png`),
    await presentation.export({ slide, format: "png", scale: 2 }),
  );
  await fs.writeFile(
    path.join(WORK, "final-layout", `${stem}.layout.json`),
    await (await slide.export({ format: "layout" })).text(),
  );
}
await writeBlob(
  path.join(WORK, "final-montage.webp"),
  await presentation.export({ format: "webp", montage: true, scale: 1 }),
);
const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(OUTPUT);
