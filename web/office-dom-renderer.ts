import type { OfficeScene } from "../core/office.ts";
import type { OrganizationDraft } from "../core/organization.ts";
import type { OfficeRendererInfo, OfficeRendererPort } from "../ports/office-renderer-port.ts";
import {
  PERSON_OFFICE_DESTINATIONS,
  PERSON_OFFICE_MODULES,
  PERSON_OFFICE_OCCLUDERS,
  PERSON_OFFICE_WORKSTATIONS,
  officeStageDepth,
  officeStageRoute,
  officeStageTravelDurationMs,
  type OfficeStagePoint,
} from "./office-person-stage.ts";

interface ActorVisualSet {
  readonly work: string;
  readonly transit: string;
  readonly talk: string;
  readonly movement: "WALK" | "SWIM";
}

const HUMAN_VISUALS: ActorVisualSet = {
  work: new URL("./assets/characters/stage/human-work-rear-v1.webp", import.meta.url).href,
  transit: new URL("./assets/characters/stage/human-walk-left-sheet-v1.webp", import.meta.url).href,
  talk: new URL("./assets/characters/stage/human-talk-left-sheet-v1.webp", import.meta.url).href,
  movement: "WALK",
};

const AGENT_VISUALS = {
  "fish-bumble": {
    work: new URL("./assets/characters/stage/bumble-work-rear-v1.webp", import.meta.url).href,
    transit: new URL("./assets/characters/stage/bumble-swim-left-sheet-v1.webp", import.meta.url).href,
    talk: new URL("./assets/characters/stage/bumble-talk-left-sheet-v1.webp", import.meta.url).href,
    movement: "SWIM",
  },
  "fish-fizz": {
    work: new URL("./assets/characters/stage/fizz-work-rear-v1.webp", import.meta.url).href,
    transit: new URL("./assets/characters/stage/fizz-swim-left-sheet-v1.webp", import.meta.url).href,
    talk: new URL("./assets/characters/stage/fizz-talk-left-sheet-v1.webp", import.meta.url).href,
    movement: "SWIM",
  },
  "fish-honey": {
    work: new URL("./assets/characters/stage/honey-work-rear-v1.webp", import.meta.url).href,
    transit: new URL("./assets/characters/stage/honey-swim-left-sheet-v1.webp", import.meta.url).href,
    talk: new URL("./assets/characters/stage/honey-talk-left-sheet-v1.webp", import.meta.url).href,
    movement: "SWIM",
  },
} as const;

type ActorVisualState = "WORK" | "WALK" | "SWIM" | "IDLE" | "VISIT_TALK" | "HOST_TALK";

interface StageActor {
  readonly id: string;
  readonly name: string;
  readonly kind: "HUMAN" | "AGENT";
  readonly state: string;
  readonly visuals: ActorVisualSet;
  readonly initialPoint: OfficeStagePoint;
}

function agentVisuals(assetId: string, index: number): ActorVisualSet {
  const exact = AGENT_VISUALS[assetId as keyof typeof AGENT_VISUALS];
  if (exact) return exact;
  return Object.values(AGENT_VISUALS)[index % Object.values(AGENT_VISUALS).length]!;
}

export class OfficeDomRenderer implements OfficeRendererPort {
  readonly #element: HTMLElement;
  readonly #organization: OrganizationDraft;
  #selectedHumanId: string | null = null;
  #selectedActorId: string | null = null;
  readonly #positions = new Map<string, OfficeStagePoint>();

  constructor(element: HTMLElement, organization: OrganizationDraft) {
    this.#element = element;
    this.#organization = organization;
    this.#selectedHumanId = organization.humans[0]?.id ?? null;
  }

  describe(): OfficeRendererInfo {
    return {
      rendererId: "company-os-person-office-stage-2-5d",
      mode: "STRUCTURAL_PREVIEW",
      officeSceneVersions: ["1.0"],
      assetManifestVersions: ["1.0"],
      actionSequenceVersions: ["1.0"],
      capabilities: {
        orthographicCamera: true,
        horizontalOrbit: false,
        lockedPitch: true,
        wallOcclusionFade: true,
        focusSelection: true,
      },
    };
  }

  async render(scene: OfficeScene): Promise<void> {
    this.#element.replaceChildren();
    this.#element.classList.remove("office-canvas--3d");
    this.#element.classList.add("office-canvas--2-5d");
    this.#element.dataset.renderer = "person-office-stage-2-5d";
    this.#element.setAttribute("aria-label", "真人负责人团队 2.5D 互动办公室");

    const shell = document.createElement("section");
    shell.className = "office-person-shell";
    const tree = document.createElement("nav");
    tree.className = "office-person-tree";
    tree.setAttribute("aria-label", "公司真人责任关系");
    const treeTitle = document.createElement("div");
    treeTitle.className = "office-person-tree-title";
    const treeKicker = document.createElement("span");
    treeKicker.textContent = "责任关系";
    const treeCompany = document.createElement("strong");
    treeCompany.textContent = this.#organization.company.name;
    treeTitle.append(treeKicker, treeCompany);
    tree.append(treeTitle);

    const stageColumn = document.createElement("section");
    stageColumn.className = "office-person-column";
    const stageHeader = document.createElement("header");
    stageHeader.className = "office-person-header";
    const stageIdentity = document.createElement("div");
    const stageLegend = document.createElement("p");
    stageLegend.textContent = "选择人物后点击地面移动；拖动空白处浏览可继续延伸的办公室。";
    stageHeader.append(stageIdentity, stageLegend);

    const stage = document.createElement("div");
    stage.className = "office-person-stage";
    stage.setAttribute("role", "application");
    stage.tabIndex = 0;
    stage.setAttribute("aria-label", "可拖动浏览、可移动角色并具有前后遮挡的开放式 2.5D 办公室");
    const world = document.createElement("div");
    world.className = "office-person-world";
    const moduleLayer = document.createElement("div");
    moduleLayer.className = "office-person-modules";
    moduleLayer.setAttribute("aria-hidden", "true");
    for (const module of PERSON_OFFICE_MODULES) {
      const image = document.createElement("img");
      image.className = `office-person-module office-person-module--${module.kind.toLocaleLowerCase()}`;
      image.src = module.image;
      image.alt = "";
      image.draggable = false;
      image.style.left = `${module.x}%`;
      image.style.top = `${module.y}%`;
      image.style.width = `${module.width}%`;
      image.style.zIndex = String(officeStageDepth(module.depth));
      moduleLayer.append(image);
    }
    const actorLayer = document.createElement("div");
    actorLayer.className = "office-person-actors";
    const occlusionLayer = document.createElement("div");
    occlusionLayer.className = "office-person-occlusion";
    occlusionLayer.setAttribute("aria-hidden", "true");
    for (const occluder of PERSON_OFFICE_OCCLUDERS) {
      const module = PERSON_OFFICE_MODULES.find(({ id }) => id === occluder.moduleId);
      if (!module) continue;
      const image = document.createElement("img");
      image.className = `office-person-module office-person-module--occluder office-person-module--${module.kind.toLocaleLowerCase()}`;
      image.src = module.image;
      image.alt = "";
      image.draggable = false;
      image.style.left = `${module.x}%`;
      image.style.top = `${module.y}%`;
      image.style.width = `${module.width}%`;
      image.style.clipPath = occluder.clipPath;
      image.style.zIndex = String(officeStageDepth(occluder.depth));
      occlusionLayer.append(image);
    }
    const labelLayer = document.createElement("div");
    labelLayer.className = "office-person-labels";
    world.append(moduleLayer, actorLayer, occlusionLayer, labelLayer);
    stage.append(world);

    const destinations = document.createElement("div");
    destinations.className = "office-person-destinations";
    destinations.setAttribute("aria-label", "移动人物到指定地点");
    for (const point of PERSON_OFFICE_DESTINATIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.destination = point.id;
      button.textContent = point.label;
      destinations.append(button);
    }
    const liveStatus = document.createElement("figcaption");
    liveStatus.className = "office-person-live-status";
    liveStatus.setAttribute("role", "status");
    liveStatus.setAttribute("aria-live", "polite");
    stageColumn.append(stageHeader, stage, destinations, liveStatus);
    shell.append(tree, stageColumn);
    this.#element.append(shell);

    const drawTree = (): void => {
      tree.querySelectorAll(".office-person-tree-department").forEach((node) => node.remove());
      for (const department of this.#organization.departments) {
        const group = document.createElement("section");
        group.className = "office-person-tree-department";
        const heading = document.createElement("h3");
        heading.textContent = department.name;
        group.append(heading);
        for (const human of this.#organization.humans.filter(({ departmentId }) => departmentId === department.id)) {
          const agents = this.#organization.agents.filter(({ accountableHumanId }) => accountableHumanId === human.id);
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.humanId = human.id;
          button.setAttribute("aria-current", human.id === this.#selectedHumanId ? "page" : "false");
          const avatar = document.createElement("span");
          avatar.setAttribute("aria-hidden", "true");
          avatar.textContent = human.name.slice(0, 1);
          const copy = document.createElement("span");
          const name = document.createElement("strong");
          name.textContent = human.name;
          const title = document.createElement("small");
          title.textContent = human.title;
          copy.append(name, title);
          const count = document.createElement("em");
          count.textContent = String(agents.length);
          button.append(avatar, copy, count);
          button.addEventListener("click", () => {
            this.#selectedHumanId = human.id;
            this.#selectedActorId = null;
            drawTree();
            drawOffice();
          });
          group.append(button);
        }
        tree.append(group);
      }
    };

    const actorsById = new Map<string, StageActor>();
    const motionTokens = new Map<string, symbol>();
    const frameTimers = new Map<string, ReturnType<typeof setInterval>>();
    const talkPartners = new Map<string, string>();

    const stopFrames = (actorId: string): void => {
      const timer = frameTimers.get(actorId);
      if (timer) clearInterval(timer);
      frameTimers.delete(actorId);
    };

    const setVisualState = (
      actor: StageActor,
      element: HTMLElement,
      state: ActorVisualState,
      facing: "left" | "right" = "left",
    ): void => {
      stopFrames(actor.id);
      element.dataset.visualState = state;
      element.dataset.facing = facing;
      const visual = element.querySelector<HTMLElement>(".office-person-actor-visual");
      if (!visual) return;
      const isDeskPose = state === "WORK" || state === "HOST_TALK";
      const isTalk = state === "VISIT_TALK";
      visual.style.backgroundImage = `url("${isDeskPose ? actor.visuals.work : isTalk ? actor.visuals.talk : actor.visuals.transit}")`;
      visual.style.backgroundSize = isDeskPose ? "contain" : "200% 200%";
      visual.style.backgroundPosition = isDeskPose ? "center" : "0% 0%";
      if (isDeskPose) return;
      const frames = ["0% 0%", "100% 0%", "0% 100%", "100% 100%"] as const;
      let frame = 0;
      frameTimers.set(actor.id, setInterval(() => {
        frame = (frame + 1) % frames.length;
        visual.style.backgroundPosition = frames[frame]!;
      }, isTalk ? 230 : actor.visuals.movement === "SWIM" ? 150 : 125));
    };

    const endConversation = (actorId: string): void => {
      const partnerId = talkPartners.get(actorId);
      if (!partnerId) return;
      talkPartners.delete(actorId);
      talkPartners.delete(partnerId);
      const partner = actorsById.get(partnerId);
      const partnerElement = actorLayer.querySelector<HTMLElement>(`[data-actor-id="${CSS.escape(partnerId)}"]`);
      if (partner && partnerElement) setVisualState(partner, partnerElement, "WORK");
    };

    const labelOffset = (point: OfficeStagePoint): number => (point.id.startsWith("desk-") ? 13 : 8);

    const animateStageSegment = (
      actorId: string,
      element: HTMLElement,
      token: symbol,
      from: OfficeStagePoint,
      to: OfficeStagePoint,
    ): Promise<boolean> => new Promise((resolve) => {
      const startedAt = performance.now();
      const duration = officeStageTravelDurationMs(from, to);
      const label = labelLayer.querySelector<HTMLElement>(`[data-label-for="${CSS.escape(actorId)}"]`);
      const fromLabelOffset = labelOffset(from);
      const toLabelOffset = labelOffset(to);
      const tick = (now: number): void => {
        if (motionTokens.get(actorId) !== token) {
          resolve(false);
          return;
        }
        const progress = Math.min(1, (now - startedAt) / duration);
        // Smooth acceleration/deceleration avoids the mechanical slide while
        // retaining a predictable path and deterministic end position.
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        const x = from.x + (to.x - from.x) * eased;
        const y = from.y + (to.y - from.y) * eased;
        const offset = fromLabelOffset + (toLabelOffset - fromLabelOffset) * eased;
        element.style.left = `${x}%`;
        element.style.top = `${y}%`;
        element.style.zIndex = String(officeStageDepth(y));
        if (label) {
          label.style.left = `${x}%`;
          label.style.top = `${y - offset}%`;
        }
        this.#positions.set(actorId, { id: "in-transit", label: "移动中", x, y });
        if (progress < 1) requestAnimationFrame(tick);
        else resolve(true);
      };
      requestAnimationFrame(tick);
    });

    const moveActor = async (actorId: string, point: OfficeStagePoint): Promise<void> => {
      const actor = actorsById.get(actorId);
      const element = actorLayer.querySelector<HTMLElement>(`[data-actor-id="${CSS.escape(actorId)}"]`);
      if (!actor || !element) return;
      endConversation(actorId);
      const from = this.#positions.get(actorId) ?? actor.initialPoint;
      const token = Symbol(actorId);
      motionTokens.set(actorId, token);
      let facing: "left" | "right" = point.x < from.x ? "left" : "right";
      liveStatus.textContent = `${actor.name} 正在${actor.visuals.movement === "SWIM" ? "游向" : "走向"}${point.label}（确定性演示动画）`;
      let cursor = from;
      for (const waypoint of officeStageRoute(from, point)) {
        if (motionTokens.get(actorId) !== token) return;
        if (Math.abs(waypoint.x - cursor.x) > 0.1) facing = waypoint.x < cursor.x ? "left" : "right";
        setVisualState(actor, element, actor.visuals.movement, facing);
        const completed = await animateStageSegment(actorId, element, token, cursor, waypoint);
        if (!completed) return;
        cursor = waypoint;
      }
      this.#positions.set(actorId, point);
      const finalState: ActorVisualState = point.id.startsWith("desk-") ? "WORK" : "IDLE";
      setVisualState(actor, element, finalState, facing);
      liveStatus.textContent = `${actor.name} 已到达${point.label} · ${finalState === "WORK" ? "工作动画" : "待机动画"}`;
    };

    const startConversation = async (visitorId: string, hostId: string): Promise<void> => {
      const visitor = actorsById.get(visitorId);
      const host = actorsById.get(hostId);
      const hostElement = actorLayer.querySelector<HTMLElement>(`[data-actor-id="${CSS.escape(hostId)}"]`);
      const visitorElement = actorLayer.querySelector<HTMLElement>(`[data-actor-id="${CSS.escape(visitorId)}"]`);
      if (!visitor || !host || !hostElement || !visitorElement) return;
      endConversation(visitorId);
      endConversation(hostId);
      const hostPoint = this.#positions.get(hostId) ?? host.initialPoint;
      const visitorPoint: OfficeStagePoint = {
        id: `visit-${hostId}`,
        label: `${host.name}工位旁`,
        x: hostPoint.x > 65 ? hostPoint.x - 9 : hostPoint.x + 9,
        y: hostPoint.y + 1,
      };
      await moveActor(visitorId, visitorPoint);
      const visitorFacing = visitorPoint.x < hostPoint.x ? "right" : "left";
      setVisualState(visitor, visitorElement, "VISIT_TALK", visitorFacing);
      setVisualState(host, hostElement, "HOST_TALK", visitorFacing === "left" ? "right" : "left");
      talkPartners.set(visitorId, hostId);
      talkPartners.set(hostId, visitorId);
      liveStatus.textContent = `${visitor.name} 正在${host.name}工位旁交流；两人播放成对交流动画。`;
    };

    const drawOffice = (): void => {
      actorLayer.replaceChildren();
      labelLayer.replaceChildren();
      const human = this.#organization.humans.find(({ id }) => id === this.#selectedHumanId) ?? this.#organization.humans[0];
      if (!human) return;
      const agents = this.#organization.agents.filter(({ accountableHumanId }) => accountableHumanId === human.id).slice(0, 5);
      const humanScene = scene.entities.find(({ id }) => id === human.id);
      const agentInitialPoints: readonly OfficeStagePoint[] = [
        PERSON_OFFICE_WORKSTATIONS[2]!,
        { id: "team-visitor", label: "协作工位旁", x: 40, y: 52 },
        PERSON_OFFICE_WORKSTATIONS[1]!,
        PERSON_OFFICE_WORKSTATIONS[3]!,
        PERSON_OFFICE_WORKSTATIONS[4]!,
      ];
      const actors: readonly StageActor[] = [
        {
          id: human.id,
          name: human.name,
          kind: "HUMAN",
          state: humanScene?.state ?? "AVAILABLE",
          visuals: HUMAN_VISUALS,
          initialPoint: PERSON_OFFICE_WORKSTATIONS[0]!,
        },
        ...agents.map((agent, index): StageActor => ({
          id: agent.id,
          name: agent.name,
          kind: "AGENT",
          state: scene.entities.find(({ id }) => id === agent.id)?.state ?? "WAITING",
          visuals: agentVisuals(agent.avatarId, index),
          initialPoint: agentInitialPoints[index]!,
        })),
      ];
      actorsById.clear();
      actors.forEach((actor) => actorsById.set(actor.id, actor));
      const identityRole = document.createElement("span");
      identityRole.textContent = human.title;
      const identityName = document.createElement("strong");
      identityName.textContent = `${human.name}的办公室`;
      const identityCount = document.createElement("small");
      identityCount.textContent = `1 位真人负责人 · ${agents.length} 个演示 Agent · 最多 5 个`;
      stageIdentity.replaceChildren(identityRole, identityName, identityCount);
      for (const actor of actors) {
        const position = this.#positions.get(actor.id) ?? actor.initialPoint;
        this.#positions.set(actor.id, position);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `office-person-actor office-person-actor--${actor.kind.toLocaleLowerCase()}`;
        button.dataset.actorId = actor.id;
        button.dataset.actorName = actor.name;
        button.setAttribute("aria-pressed", actor.id === this.#selectedActorId ? "true" : "false");
        button.setAttribute("aria-label", `选择${actor.kind === "HUMAN" ? "真人负责人" : "演示 Agent"}${actor.name}，当前状态 ${actor.state}`);
        button.style.left = `${position.x}%`;
        button.style.top = `${position.y}%`;
        button.style.zIndex = String(officeStageDepth(position.y));
        const visual = document.createElement("span");
        visual.className = "office-person-actor-visual";
        visual.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.className = "office-person-actor-label";
        label.dataset.labelFor = actor.id;
        label.style.left = `${position.x}%`;
        label.style.top = `${position.y - (position.id.startsWith("desk-") ? 13 : 8)}%`;
        const labelName = document.createElement("strong");
        labelName.textContent = actor.name;
        const labelState = document.createElement("small");
        labelState.textContent = actor.state;
        label.append(labelName, labelState);
        button.append(visual);
        setVisualState(actor, button, position.id.startsWith("desk-") ? "WORK" : "IDLE");
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          if (this.#selectedActorId && this.#selectedActorId !== actor.id) {
            void startConversation(this.#selectedActorId, actor.id);
            return;
          }
          this.#selectedActorId = actor.id;
          actorLayer.querySelectorAll<HTMLElement>("[data-actor-id]").forEach((node) => {
            node.setAttribute("aria-pressed", String(node.dataset.actorId === actor.id));
          });
          liveStatus.textContent = `已选择 ${actor.name}；点击地面或选择地点移动。`;
        });
        actorLayer.append(button);
        labelLayer.append(label);
      }
      liveStatus.textContent = `${human.name}团队办公室 · 所有 Agent 均为演示角色 · 点击角色后可移动`;
    };

    let cameraX = 0;
    let cameraY = 0;
    let dragStart: { readonly pointerX: number; readonly pointerY: number; readonly cameraX: number; readonly cameraY: number } | null = null;
    let dragged = false;
    const applyCamera = (): void => {
      world.style.setProperty("--office-camera-x", `${cameraX}px`);
      world.style.setProperty("--office-camera-y", `${cameraY}px`);
    };
    stage.addEventListener("pointerdown", (event) => {
      if ((event.target as Element).closest(".office-person-actor")) return;
      dragStart = { pointerX: event.clientX, pointerY: event.clientY, cameraX, cameraY };
      dragged = false;
      stage.setPointerCapture(event.pointerId);
      stage.dataset.panning = "true";
    });
    stage.addEventListener("pointermove", (event) => {
      if (!dragStart) return;
      const deltaX = event.clientX - dragStart.pointerX;
      const deltaY = event.clientY - dragStart.pointerY;
      if (Math.hypot(deltaX, deltaY) > 4) dragged = true;
      cameraX = dragStart.cameraX + deltaX;
      cameraY = dragStart.cameraY + deltaY;
      applyCamera();
    });
    const finishPan = (event: PointerEvent): void => {
      if (!dragStart) return;
      dragStart = null;
      stage.releasePointerCapture(event.pointerId);
      stage.dataset.panning = "false";
      if (dragged) liveStatus.textContent = "已移动观察位置；开放画布没有房间外框，组织扩展时可继续编译更多区域。";
    };
    stage.addEventListener("pointerup", finishPan);
    stage.addEventListener("pointercancel", finishPan);
    stage.addEventListener("keydown", (event) => {
      const distance = event.shiftKey ? 72 : 32;
      if (event.key === "ArrowLeft") cameraX += distance;
      else if (event.key === "ArrowRight") cameraX -= distance;
      else if (event.key === "ArrowUp") cameraY += distance;
      else if (event.key === "ArrowDown") cameraY -= distance;
      else if (event.key === "Home") cameraX = cameraY = 0;
      else return;
      event.preventDefault();
      applyCamera();
    });
    stage.addEventListener("click", (event) => {
      if (dragged) {
        dragged = false;
        return;
      }
      if (!this.#selectedActorId) {
        liveStatus.textContent = "请先选择一位真人或演示 Agent。";
        return;
      }
      const bounds = world.getBoundingClientRect();
      const x = Math.max(-100, Math.min(200, ((event.clientX - bounds.left) / bounds.width) * 100));
      const y = Math.max(-100, Math.min(200, ((event.clientY - bounds.top) / bounds.height) * 100));
      void moveActor(this.#selectedActorId, { id: "free-floor", label: "指定位置", x, y });
    });
    destinations.querySelectorAll<HTMLButtonElement>("[data-destination]").forEach((button) => {
      button.addEventListener("click", () => {
        const point = PERSON_OFFICE_DESTINATIONS.find(({ id }) => id === button.dataset.destination);
        if (!this.#selectedActorId || !point) {
          liveStatus.textContent = "请先选择一位真人或演示 Agent。";
          return;
        }
        void moveActor(this.#selectedActorId, point);
      });
    });
    drawTree();
    drawOffice();
  }
}
