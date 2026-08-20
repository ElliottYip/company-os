import type { OfficeScene } from "../core/office.ts";
import type { OfficeRendererInfo, OfficeRendererPort } from "../ports/office-renderer-port.ts";
import { t } from "./i18n/zh-CN.ts";

const fishByIndex = [
  new URL("./assets/fish/raft-fish-bumble.png", import.meta.url).href,
  new URL("./assets/fish/raft-fish-fizz.png", import.meta.url).href,
  new URL("./assets/fish/raft-fish-honey.png", import.meta.url).href,
];

export class OfficeDomRenderer implements OfficeRendererPort {
  readonly #element: HTMLElement;

  constructor(element: HTMLElement) {
    this.#element = element;
  }

  describe(): OfficeRendererInfo {
    return {
      rendererId: "company-os-dom-structural-preview",
      mode: "STRUCTURAL_PREVIEW",
      officeSceneVersions: ["1.0"],
      assetManifestVersions: ["1.0"],
      actionSequenceVersions: ["1.0"],
    };
  }

  async render(scene: OfficeScene): Promise<void> {
    this.#element.replaceChildren();
    this.#element.dataset.renderer = "pre-3d-structural-preview";
    this.#element.setAttribute("aria-label", t("office.previewAria"));

    for (const module of scene.modules) {
      if (module.kind === "CORRIDOR") {
        continue;
      }
      const room = document.createElement("section");
      room.className = `office-room office-room--${module.kind.toLowerCase()}`;
      room.dataset.moduleId = module.id;
      room.innerHTML = `<h3>${module.label}</h3><span>${module.capacity} 席</span>`;
      this.#element.append(room);
    }

    const previewLabel = document.createElement("p");
    previewLabel.className = "office-preview-label";
    previewLabel.textContent = t("office.previewLabel");
    this.#element.prepend(previewLabel);

    scene.entities.forEach((entity, index) => {
      const room = this.#element.querySelector<HTMLElement>(
        `[data-module-id="${entity.moduleId}"]`,
      );
      if (!room) return;
      const person = document.createElement("div");
      person.className = `office-entity office-entity--${entity.kind.toLowerCase()}`;
      person.setAttribute("role", "img");
      person.setAttribute(
        "aria-label",
        `${entity.kind === "AGENT" ? t("office.fixtureAgent") : t("office.accountableHuman")}，状态 ${entity.state}`,
      );
      if (entity.kind === "AGENT") {
        const image = document.createElement("img");
        image.src = fishByIndex[index % fishByIndex.length] ?? fishByIndex[0]!;
        image.alt = "";
        image.draggable = false;
        person.append(image);
      } else {
        person.textContent = "人";
      }
      const state = document.createElement("small");
      state.textContent = entity.state;
      person.append(state);
      room.append(person);
    });
  }
}
