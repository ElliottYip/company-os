import assert from "node:assert/strict";
import test from "node:test";
import { checkWebVisualContract, checkWebVisualContractSources } from "../scripts/check-web-visual-contract.mjs";

test("the complete Web style system consumes one semantic visual contract", async () => {
  assert.deepEqual(await checkWebVisualContract(), { checkedFiles: 3, status: "PASS" });
});

test("the visual contract rejects page-local typography and arbitrary breakpoints", () => {
  assert.throws(() => checkWebVisualContractSources([
    ["web/family-ui.css", `
      .family-ui { ${[
        "--family-font-ui", "--family-font-mono", "--type-page-title", "--type-detail-title",
        "--type-section-title", "--type-panel-title", "--type-body", "--type-control",
        "--type-supporting", "--type-label", "--type-micro", "--type-metric",
        "--weight-regular", "--weight-medium", "--weight-semibold", "--leading-title",
        "--leading-body", "--leading-compact", "--layout-page-max", "--layout-page-gutter",
        "--layout-section-inset", "--layout-row-inset", "--control-height",
        "--control-height-comfortable", "--overlay-edge", "--overlay-modal-width", "--overlay-drawer-width",
      ].map((token) => `${token}: 1;`).join(" ")} }
    `],
    ["web/styles.css", `.page-stage { width: 100%; max-width: var(--layout-page-max); margin-inline: auto; } .control-organization { margin: 0; } .rogue { font: 15px fantasy; font-family: fantasy; font-size: var(--type-rogue); line-height: 1.4; font-weight: 550; } @media (max-width: 777px) {}`],
    ["web/workforce-graph/workforce-graph.css", ""],
  ]), /font-size must use the shared semantic contract[\s\S]*font-weight must use the shared semantic contract[\s\S]*line-height must use the shared semantic contract[\s\S]*font-family must use the shared semantic contract[\s\S]*font must use the shared semantic contract[\s\S]*uncontracted max-width breakpoint 777px[\s\S]*page-level product surfaces must preserve centered margins/);
});
