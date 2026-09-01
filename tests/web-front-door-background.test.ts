import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mount = await readFile(new URL("../web/mount.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");

async function digest(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(new URL(path, import.meta.url))).digest("hex");
}

test("the public front door reuses the Generator fish-shadow media contract", async () => {
  assert.match(mount, /class="front-door-fish" aria-hidden="true"/);
  assert.match(mount, /fish-shadow-loop-desktop\.mp4" media="\(min-width: 768px\)"/);
  assert.match(mount, /fish-shadow-loop-mobile\.mp4/);
  assert.match(mount, /autoplay muted loop playsinline preload="metadata"/);
  assert.match(mount, /const attemptFrontDoorFishPlayback = \(\): void =>/);
  assert.match(mount, /video\.defaultMuted = true;/);
  assert.match(mount, /void video\.play\(\)\.catch\(\(\) => undefined\);/);
  assert.match(mount, /addEventListener\("loadeddata", attemptFrontDoorFishPlayback\)/);
  assert.match(mount, /addEventListener\("canplay", attemptFrontDoorFishPlayback\)/);
  assert.match(mount, /addEventListener\("visibilitychange", handleFrontDoorFishVisibility\)/);
  assert.match(mount, /addEventListener\("pageshow", handleFrontDoorFishPageShow\)/);
  assert.match(styles, /\.front-door-fish video\s*\{[^}]*mix-blend-mode:\s*darken;[^}]*mask-image:\s*radial-gradient/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.front-door-fish video\s*\{\s*display:\s*none;/);
  assert.doesNotMatch(styles, /\.company-front-door::before/);

  assert.equal(await digest("../web/public/media/hero/fish-shadow-poster.jpg"), "e9877726ddd2a0fb53fead993e590103aa110427acbe8a2c29076e4ba663cfe6");
  assert.equal(await digest("../web/public/media/hero/fish-shadow-loop-desktop.mp4"), "f989acb54fffdaa1d8229e55df8d514a34940841b2b13a0a57ca3fc9684008a7");
  assert.equal(await digest("../web/public/media/hero/fish-shadow-loop-mobile.mp4"), "34896dc1cf619db28da5665f4bda1401549f0c8504749ec7eef76df2adbe9dde");
});
