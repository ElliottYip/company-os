import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { OfficeScene } from "../core/office.ts";
import type {
  OfficeCameraPolicy,
  OfficeRendererInfo,
  OfficeRendererPort,
} from "../ports/office-renderer-port.ts";
import { COMPANY_OS_3D_CAMERA_POLICY } from "./office-3d-renderer-policy.ts";

interface RoomAssetRecord {
  readonly kind: string;
  readonly src: string;
}

interface RoomAssetManifest {
  readonly rooms: readonly RoomAssetRecord[];
}

const ROOM_POSITIONS: Readonly<Record<string, readonly [number, number]>> = {
  ENTRANCE: [-9.5, -7],
  RECEPTION: [-1, -7],
  PANTRY: [7.5, -7],
  CORRIDOR: [0, -1.8],
  DEPARTMENT: [-9.5, 4],
  PROJECT_ROOM: [0, 4],
  MEETING_ROOM: [9, 4],
  RESTROOM: [9.5, -1.8],
};

const FISH_ASSETS: Readonly<Record<string, string>> = {
  "fish-bumble": "/assets/3d/fish-bumble-3d-v4.glb",
  "fish-fizz": "/assets/3d/fish-fizz-3d-v3.glb",
  "fish-honey": "/assets/3d/fish-honey-3d-v2.glb",
};

function materialList(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}

function isWall(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh && (
    /_(?:back|left|right)$/i.test(object.name) ||
    /OcclusionWall_(?:Right|Front)/i.test(object.name)
  );
}

export class OfficeThreeRenderer implements OfficeRendererPort {
  readonly #element: HTMLElement;
  #disposed = false;
  #frame = 0;
  #resizeObserver: ResizeObserver | null = null;
  #renderer: THREE.WebGLRenderer | null = null;
  #scene: THREE.Scene | null = null;
  #controls: OrbitControls | null = null;

  constructor(element: HTMLElement) {
    this.#element = element;
  }

  describe(): OfficeRendererInfo {
    return {
      rendererId: "company-os-three-office",
      mode: "PRODUCTION",
      officeSceneVersions: ["1.0"],
      assetManifestVersions: ["1.0"],
      actionSequenceVersions: ["1.0"],
      capabilities: {
        orthographicCamera: true,
        horizontalOrbit: true,
        lockedPitch: true,
        wallOcclusionFade: true,
        focusSelection: true,
      },
    };
  }

  async render(sceneContract: OfficeScene, options: {
    readonly cameraPolicy?: OfficeCameraPolicy;
    readonly focusedModuleId?: string;
    readonly focusedEntityId?: string;
  } = {}): Promise<void> {
    const policy = options.cameraPolicy ?? COMPANY_OS_3D_CAMERA_POLICY;
    this.dispose();
    this.#disposed = false;
    this.#element.replaceChildren();
    this.#element.dataset.renderer = "three-office-1.0";
    this.#element.classList.add("office-canvas--3d");
    this.#element.setAttribute("aria-label", "可水平旋转的 Company OS 3D 办公室演示场景");

    const canvas = document.createElement("canvas");
    canvas.className = "office-three-canvas";
    this.#element.append(canvas);
    const toolbar = document.createElement("div");
    toolbar.className = "office-three-toolbar";
    toolbar.innerHTML = `<span>拖动旋转 · 俯角固定 · 遮挡墙自动淡出</span>
      <button type="button" data-detail="reception" aria-label="聚焦高细节前台" disabled>前台</button>
      <button type="button" data-orbit="left" aria-label="向左旋转办公室">↶</button>
      <button type="button" data-orbit="right" aria-label="向右旋转办公室">↷</button>`;
    this.#element.append(toolbar);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.#renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new THREE.Scene();
    this.#scene = scene;
    scene.background = new THREE.Color(0xeadfce);
    const camera = new THREE.OrthographicCamera(-16, 16, 12, -12, 0.1, 120);
    camera.position.set(24, 21, 24);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    const controls = new OrbitControls(camera, canvas);
    this.#controls = controls;
    controls.target.set(0, 0.7, -0.5);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minZoom = policy.zoom.minimum;
    controls.maxZoom = policy.zoom.maximum;
    const polar = THREE.MathUtils.degToRad(90 - policy.pitchDegrees);
    controls.minPolarAngle = polar;
    controls.maxPolarAngle = polar;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xfff4df, 0x8d8274, 3.1));
    const key = new THREE.DirectionalLight(0xffe2bd, 4.2);
    key.position.set(-12, 24, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcbdcff, 2.2);
    fill.position.set(16, 12, -8);
    scene.add(fill);

    const loader = new GLTFLoader();
    const roomTemplates = new Map<string, Promise<THREE.Group>>();
    const loadRoom = async (src: string): Promise<THREE.Group> => {
      let template = roomTemplates.get(src);
      if (!template) {
        template = loader.loadAsync(src).then((gltf) => gltf.scene);
        roomTemplates.set(src, template);
      }
      return (await template).clone(true);
    };
    const [roomManifest] = await Promise.all([
      fetch("/assets/3d/rooms/manifest.json").then(async (response) => {
        if (!response.ok) throw new Error("OFFICE_ROOM_MANIFEST_LOAD_FAILED");
        return await response.json() as RoomAssetManifest;
      }),
    ]);
    if (this.#disposed) return;
    const roomByKind = new Map(roomManifest.rooms.map((room) => [room.kind, room]));
    const walls: THREE.Mesh[] = [];
    const detailWalls: THREE.Mesh[] = [];
    const moduleCenters = new Map<string, THREE.Vector3>();
    const moduleScenes = new Map<string, THREE.Group>();
    const moduleKinds = new Map<string, string>();
    const departmentOffsets = new Map<string, number>();

    await Promise.all(sceneContract.modules.map(async (module) => {
      const room = roomByKind.get(module.kind);
      if (!room) return;
      const roomScene = await loadRoom(room.src);
      if (this.#disposed) return;
      const base = ROOM_POSITIONS[module.kind] ?? [0, 0];
      const repeat = departmentOffsets.get(module.kind) ?? 0;
      departmentOffsets.set(module.kind, repeat + 1);
      const position = new THREE.Vector3(base[0] + repeat * 11, 0, -base[1]);
      roomScene.position.copy(position);
      roomScene.userData.moduleId = module.id;
      roomScene.traverse((object) => {
        object.userData.moduleId = module.id;
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
        if (isWall(object)) {
          object.material = materialList(object.material).map((value) => value.clone());
          walls.push(object);
        }
      });
      moduleCenters.set(module.id, position.clone().add(new THREE.Vector3(0, 0.8, 0)));
      moduleScenes.set(module.id, roomScene);
      moduleKinds.set(module.id, module.kind);
      scene.add(roomScene);
    }));

    const mixers: THREE.AnimationMixer[] = [];
    const entityScenes: THREE.Object3D[] = [];
    await Promise.all(sceneContract.entities.map(async (entity, index) => {
      const center = moduleCenters.get(entity.moduleId);
      if (!center) return;
      if (entity.kind === "HUMAN") {
        const human = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.34, 0.55, 6, 14),
          new THREE.MeshStandardMaterial({ color: 0xa76542, roughness: 0.86 }),
        );
        body.castShadow = true;
        human.add(body);
        human.position.copy(center).add(new THREE.Vector3(-1.1, 0.75, 0.8));
        human.userData.moduleId = entity.moduleId;
        entityScenes.push(human);
        scene.add(human);
        return;
      }
      const key = Object.keys(FISH_ASSETS).find((candidate) => entity.assetId.includes(candidate)) ?? "fish-bumble";
      const gltf = await loader.loadAsync(FISH_ASSETS[key]!);
      if (this.#disposed) return;
      gltf.scene.scale.setScalar(0.55);
      gltf.scene.position.copy(center).add(new THREE.Vector3(index * 1.35 - 0.7, 0.64, -0.6));
      gltf.scene.rotation.y = index * 0.7;
      gltf.scene.userData.moduleId = entity.moduleId;
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      entityScenes.push(gltf.scene);
      scene.add(gltf.scene);
      if (gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(gltf.scene);
        const idle = gltf.animations.find((clip) => /idle/i.test(clip.name)) ?? gltf.animations[0];
        if (idle) mixer.clipAction(idle).play();
        mixers.push(mixer);
      }
    }));

    const focus = options.focusedModuleId ? moduleCenters.get(options.focusedModuleId) : undefined;
    if (focus) controls.target.copy(focus);
    let wallFadeTarget = focus;
    let detailActive = false;
    const raycaster = new THREE.Raycaster();
    const updateWallFade = (): void => {
      if (detailActive && wallFadeTarget) {
        const offset = camera.position.clone().sub(wallFadeTarget);
        const horizontalSide = offset.x >= 0 ? "Right" : "Left";
        const depthSide = offset.z >= 0 ? "Front" : "Back";
        for (const wall of detailWalls) {
          const blocksView = wall.name.includes(horizontalSide) || wall.name.includes(depthSide);
          const opacity = blocksView ? policy.wallOcclusion.blockingOpacity : 1;
          for (const material of materialList(wall.material)) {
            material.transparent = opacity < 1;
            material.opacity = opacity;
            material.depthWrite = opacity === 1;
            material.needsUpdate = true;
          }
        }
        return;
      }
      const blockers = new Set<THREE.Mesh>();
      const targets = wallFadeTarget ? [wallFadeTarget] : [...moduleCenters.values()];
      for (const target of targets) {
        const direction = target.clone().sub(camera.position);
        const targetDistance = direction.length();
        raycaster.set(camera.position, direction.normalize());
        for (const hit of raycaster.intersectObjects(walls, false)) {
          if (hit.distance < targetDistance - 0.25 && hit.object instanceof THREE.Mesh) blockers.add(hit.object);
        }
      }
      for (const wall of walls) {
        const opacity = blockers.has(wall) ? policy.wallOcclusion.blockingOpacity : 1;
        for (const material of materialList(wall.material)) {
          material.transparent = opacity < 1;
          material.opacity = opacity;
          material.depthWrite = opacity === 1;
          material.needsUpdate = true;
        }
      }
    };

    const snapCamera = (direction = 0): void => {
      const offset = camera.position.clone().sub(controls.target);
      const radius = Math.hypot(offset.x, offset.z);
      const current = Math.atan2(offset.z, offset.x);
      const step = Math.PI / 2;
      const snapped = Math.round((current - Math.PI / 4) / step) * step + Math.PI / 4 + direction * step;
      camera.position.set(
        controls.target.x + Math.cos(snapped) * radius,
        controls.target.y + Math.tan(polar) * radius,
        controls.target.z + Math.sin(snapped) * radius,
      );
      camera.lookAt(controls.target);
      controls.update();
      updateWallFade();
    };
    controls.addEventListener("change", updateWallFade);
    controls.addEventListener("end", () => snapCamera());
    toolbar.querySelector<HTMLButtonElement>("[data-orbit=left]")?.addEventListener("click", () => snapCamera(-1));
    toolbar.querySelector<HTMLButtonElement>("[data-orbit=right]")?.addEventListener("click", () => snapCamera(1));
    const detailButton = toolbar.querySelector<HTMLButtonElement>("[data-detail=reception]");
    const receptionEntry = [...moduleKinds].find(([, kind]) => kind === "RECEPTION");
    let receptionDetail: THREE.Group | null = null;
    detailButton?.removeAttribute("disabled");
    detailButton?.addEventListener("click", () => {
      void (async () => {
        if (!receptionEntry) return;
        const [moduleId] = receptionEntry;
        const baseRoom = moduleScenes.get(moduleId);
        const center = moduleCenters.get(moduleId);
        if (!baseRoom || !center) return;
        detailButton.disabled = true;
        try {
          if (!detailActive && !receptionDetail) {
            detailButton.textContent = "加载…";
            const detailManifest = await fetch("/assets/3d/detail/rooms/manifest.json").then(async (response) => {
              if (!response.ok) throw new Error("OFFICE_DETAIL_MANIFEST_LOAD_FAILED");
              return await response.json() as RoomAssetManifest;
            });
            const detailRoom = detailManifest.rooms.find((room) => room.kind === "RECEPTION");
            if (!detailRoom) throw new Error("OFFICE_RECEPTION_DETAIL_MISSING");
            const [gltf, receptionist] = await Promise.all([
              loader.loadAsync(detailRoom.src),
              loader.loadAsync(FISH_ASSETS["fish-honey"]!),
            ]);
            if (this.#disposed) return;
            receptionDetail = gltf.scene;
            receptionist.scene.name = "DemoFixture_ReceptionistFish";
            receptionist.scene.userData.companyOsFixture = true;
            receptionist.scene.userData.fixtureLabel = "演示前台 Agent（非真实 Agent）";
            receptionist.scene.scale.setScalar(0.40);
            receptionist.scene.position.set(0.18, 0.68, -1.28);
            receptionist.scene.rotation.y = Math.PI;
            receptionist.scene.traverse((object) => {
              if (object instanceof THREE.Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
              }
            });
            receptionDetail.add(receptionist.scene);
            receptionDetail.position.copy(baseRoom.position);
            receptionDetail.userData.moduleId = moduleId;
            receptionDetail.traverse((object) => {
              object.userData.moduleId = moduleId;
              if (object instanceof THREE.Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
              }
              if (object instanceof THREE.Mesh && /OcclusionWall_/i.test(object.name)) {
                object.material = materialList(object.material).map((value) => value.clone());
                detailWalls.push(object);
              }
            });
            scene.add(receptionDetail);
          }
          detailActive = !detailActive;
          for (const roomScene of moduleScenes.values()) roomScene.visible = !detailActive;
          for (const entityScene of entityScenes) {
            entityScene.visible = !detailActive || entityScene.userData.moduleId === moduleId;
          }
          baseRoom.visible = !detailActive;
          if (receptionDetail) receptionDetail.visible = detailActive;
          controls.target.copy(detailActive ? center : new THREE.Vector3(0, 0.7, -0.5));
          wallFadeTarget = detailActive ? center : focus;
          controls.maxZoom = detailActive ? 3.4 : policy.zoom.maximum;
          camera.zoom = detailActive ? 2.80 : 1;
          renderer.toneMappingExposure = detailActive ? 0.94 : 1.2;
          scene.background = new THREE.Color(detailActive ? 0xcfc0ac : 0xeadfce);
          camera.updateProjectionMatrix();
          detailButton.textContent = detailActive ? "全公司" : "前台";
          detailButton.setAttribute("aria-label", detailActive ? "返回全公司办公室" : "聚焦高细节前台");
          detailButton.setAttribute("aria-pressed", String(detailActive));
          snapCamera();
        } catch {
          detailButton.textContent = "前台不可用";
          detailButton.dataset.failed = "true";
        } finally {
          detailButton.disabled = false;
        }
      })();
    });

    const resize = (): void => {
      const width = Math.max(1, this.#element.clientWidth);
      const height = Math.max(1, this.#element.clientHeight);
      renderer.setSize(width, height, false);
      const viewHeight = 26;
      camera.left = -(viewHeight * width / height) / 2;
      camera.right = (viewHeight * width / height) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
    };
    this.#resizeObserver = new ResizeObserver(resize);
    this.#resizeObserver.observe(this.#element);
    resize();
    snapCamera();
    let previousFrameTime = performance.now();
    const animate = (frameTime: number): void => {
      if (this.#disposed) return;
      const delta = Math.min((frameTime - previousFrameTime) / 1000, 0.05);
      previousFrameTime = frameTime;
      mixers.forEach((mixer) => mixer.update(delta));
      controls.update();
      renderer.render(scene, camera);
      this.#frame = requestAnimationFrame(animate);
    };
    this.#frame = requestAnimationFrame(animate);
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#frame) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#controls?.dispose();
    this.#controls = null;
    this.#scene?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of materialList(object.material)) {
        for (const candidate of Object.values(material)) {
          if (candidate instanceof THREE.Texture) candidate.dispose();
        }
        material.dispose();
      }
    });
    this.#scene?.clear();
    this.#scene = null;
    this.#renderer?.dispose();
    this.#renderer = null;
  }
}
