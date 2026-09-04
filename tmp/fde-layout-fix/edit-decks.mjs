import fs from "node:fs/promises";
import path from "node:path";
import {
  FileBlob,
  PresentationFile,
} from "/Users/elliottye/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const ROOT = "/Users/elliottye/Documents/ChatGPT/os";
const WORK = path.join(ROOT, "tmp/fde-layout-fix");
const OUT = path.join(ROOT, "outputs/fde-brochure-layout-fix-v61");

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function setFrame(object, patch) {
  object.frame = { ...object.frame, ...patch };
}

function normalizeEightRows(presentation) {
  const textIds = [
    "sh/x4r21kru", "sh/r65knqtk", "sh/ove9o7yd", "sh/mtwrmxg7",
    "sh/wjy9sry9", "sh/ahwrqhgj", "sh/cnupgny5", "sh/t8byxkn2",
  ];
  const ruleIds = [
    "sh/a10jqpsj", "sh/w3i1sfa9", "sh/q5wjelsz", "sh/9wnqhczy",
    "sh/nu58f2hs", "sh/xk7qlczu", "sh/bip8jmho", "sh/do3q9szq",
  ];
  const tops = [477, 524, 571, 618, 665, 712, 759, 806];
  textIds.forEach((id, index) => {
    const textBox = presentation.resolve(id);
    setFrame(textBox, { top: tops[index], height: 44 });
    textBox.text.fontSize = 14;
    textBox.text.lineSpacing = 1.15;
  });
  ruleIds.forEach((id, index) => {
    setFrame(presentation.resolve(id), { top: tops[index] + 21.65 });
  });
}

function tightenCta(presentation) {
  const leftIds = [
    "sh/q903ad4n", "sh/dcbm583y", "sh/sb2lcnmd", "sh/a543mx4r",
    "sh/wvupgz6t", "sh/atc7epon", "sh/bulo7u58", "sh/9sj65kn2",
    "sh/mps7a5or", "sh/0nap8f6l", "sh/1oj61kn6",
  ];
  for (const id of leftIds) {
    const object = presentation.resolve(id);
    setFrame(object, { left: object.frame.left + 18 });
  }
  for (const id of ["sh/hkbm5wzu", "im/xsza54n2"]) {
    const object = presentation.resolve(id);
    setFrame(object, { left: object.frame.left - 18 });
  }
}

async function exportDeck({ lang, input, output }) {
  const presentation = await PresentationFile.importPptx(await FileBlob.load(input));
  normalizeEightRows(presentation);
  tightenCta(presentation);

  if (lang === "en") {
    setFrame(presentation.resolve("sh/vmdcj2xw"), { top: 322 });
    setFrame(presentation.resolve("sh/zep4byhs"), { top: 732, height: 36 });
  }

  const qaDir = path.join(WORK, lang, "final");
  const layoutDir = path.join(qaDir, "layout");
  await fs.mkdir(layoutDir, { recursive: true });
  for (let index = 0; index < presentation.slides.items.length; index += 1) {
    const slide = presentation.slides.items[index];
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(path.join(qaDir, `${stem}.png`), await presentation.export({ slide, format: "png", scale: 2 }));
    await fs.writeFile(path.join(layoutDir, `${stem}.layout.json`), await (await slide.export({ format: "layout" })).text());
  }
  await writeBlob(path.join(qaDir, "montage.webp"), await presentation.export({ format: "webp", montage: true, scale: 1 }));
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(output);
}

await fs.mkdir(OUT, { recursive: true });
await exportDeck({
  lang: "en",
  input: path.join(WORK, "en/template-starter.pptx"),
  output: path.join(OUT, "FDE-AI-Upgrade-English-v61.pptx"),
});
await exportDeck({
  lang: "zh",
  input: path.join(WORK, "zh/template-starter.pptx"),
  output: path.join(OUT, "FDE企业AI升级-中文-v61.pptx"),
});
