import * as THREE from "three";
import { OrbitControls } from "./libs/package/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "./libs/package/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "./libs/package/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "./libs/package/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "./libs/package/examples/jsm/environments/RoomEnvironment.js";

const container = document.getElementById("viewerContainer");
const statusBox = document.getElementById("viewerStatus");
const statusText = document.getElementById("viewerStatusText");
const progressBar = document.getElementById("viewerProgress");
const hint = document.getElementById("viewerHint");
const resetButton = document.getElementById("resetViewBtn");
const localButton = document.getElementById("loadLocalBtn");
const localInput = document.getElementById("localFileInput");
const menuToggle = document.querySelector(".viewer-menu-toggle");
const nav = document.getElementById("viewerNav");

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    const open = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!open));
    nav.classList.toggle("is-open", !open);
  });
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.useLegacyLights = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1714);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);

const sun = new THREE.DirectionalLight(0xfff1e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xfff5eb, 0x3a2922, 0.6));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1, 96),
  new THREE.ShadowMaterial({ opacity: 0.35 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.8;
controls.screenSpacePanning = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotate = !reducedMotion;
controls.autoRotateSpeed = 0.7;

const draco = new DRACOLoader();
draco.setDecoderPath("../js/libs/package/examples/jsm/libs/draco/gltf/");
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

let model = null;
let homeView = null;
let flight = null;
let lastInteraction = 0;
const keys = new Set();

function showStatus(text, progress = null) {
  statusBox.hidden = false;
  statusText.textContent = text;
  progressBar.parentElement.hidden = progress === null;
  if (progress !== null) progressBar.style.width = `${Math.round(progress * 100)}%`;
}

function noteInteraction() {
  lastInteraction = performance.now();
  controls.autoRotate = false;
  flight = null;
  hint.classList.add("is-faded");
}

function flyTo(view, duration = 1200) {
  if (reducedMotion) {
    camera.position.copy(view.position);
    controls.target.copy(view.target);
    return;
  }
  flight = {
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
    view,
    start: performance.now(),
    duration,
  };
}

function disposeModel() {
  if (!model) return;
  scene.remove(model);
  model.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material && material.dispose());
  });
  model = null;
}

function showModel(gltf) {
  disposeModel();
  model = gltf.scene || gltf.scenes[0];

  // Même échelle pour tous les modèles : 4 unités sur la plus grande
  // dimension, posé au sol et centré. Le cadrage et l'ombre en dépendent.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = 4 / (Math.max(size.x, size.y, size.z) || 1);
  model.scale.multiplyScalar(scale);
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  scene.add(model);

  box.setFromObject(model);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius;
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05;

  camera.near = distance / 200;
  camera.far = distance * 30;
  camera.updateProjectionMatrix();
  controls.minDistance = radius * 0.35;
  controls.maxDistance = distance * 3;

  ground.scale.setScalar(radius * 3);
  sun.position.set(radius * 1.6, radius * 3, radius * 1.2);
  sun.target.position.copy(sphere.center);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -radius * 1.5;
  shadowCamera.right = shadowCamera.top = radius * 1.5;
  shadowCamera.near = 0.1;
  shadowCamera.far = radius * 8;
  shadowCamera.updateProjectionMatrix();

  const direction = new THREE.Vector3(0.9, 0.55, 1).normalize();
  homeView = {
    target: sphere.center.clone(),
    position: sphere.center.clone().addScaledVector(direction, distance),
  };
  // Arrivée : on part de loin et on glisse jusqu'au cadrage.
  camera.position.copy(sphere.center).addScaledVector(direction, distance * 2.2);
  controls.target.copy(sphere.center);
  flyTo(homeView, 1600);
  controls.autoRotate = !reducedMotion;
  statusBox.hidden = true;
}

function loadFromUrl(file) {
  showStatus("Loading model…", 0);
  loader.load(
    `../gltf/${encodeURIComponent(file)}`,
    showModel,
    (event) => {
      if (event.lengthComputable) showStatus("Loading model…", event.loaded / event.total);
    },
    (error) => {
      console.error("Model load failed", error);
      showStatus("This model could not be loaded.");
    }
  );
}

async function pickModel() {
  const fromUrl = new URLSearchParams(window.location.search).get("model");
  if (fromUrl) return fromUrl;
  try {
    const stored = localStorage.getItem("selectedModel");
    if (stored) return stored;
  } catch {}
  const response = await fetch("../gltf/models.json");
  const models = await response.json();
  return models[0] && models[0].file;
}

localButton.addEventListener("click", () => localInput.click());
localInput.addEventListener("change", () => {
  const file = localInput.files && localInput.files[0];
  if (!file) return;
  showStatus(`Opening ${file.name}…`);
  file.arrayBuffer()
    .then((buffer) => loader.parse(buffer, "", showModel, (error) => {
      console.error("Local parse failed", error);
      showStatus("This file could not be read.");
    }))
    .catch(() => showStatus("This file could not be read."));
});

resetButton.addEventListener("click", () => {
  if (!homeView) return;
  noteInteraction();
  flyTo(homeView);
});

controls.addEventListener("start", noteInteraction);

const handledKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_"]);
window.addEventListener("keydown", (event) => {
  if (event.target.closest("input, textarea, select")) return;
  if (event.key === "r" || event.key === "R") {
    if (homeView) {
      noteInteraction();
      flyTo(homeView);
    }
    return;
  }
  if (!handledKeys.has(event.key)) return;
  event.preventDefault();
  keys.add(event.key);
  noteInteraction();
});
window.addEventListener("keyup", (event) => keys.delete(event.key));
window.addEventListener("blur", () => keys.clear());

const spherical = new THREE.Spherical();
const offset = new THREE.Vector3();

function applyKeys(delta) {
  if (keys.size === 0) return;
  offset.copy(camera.position).sub(controls.target);
  spherical.setFromVector3(offset);
  const turn = 1.4 * delta;
  if (keys.has("ArrowLeft")) spherical.theta -= turn;
  if (keys.has("ArrowRight")) spherical.theta += turn;
  if (keys.has("ArrowUp")) spherical.phi -= turn * 0.7;
  if (keys.has("ArrowDown")) spherical.phi += turn * 0.7;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.05, controls.maxPolarAngle);
  if (keys.has("+") || keys.has("=")) spherical.radius *= Math.exp(-1.5 * delta);
  if (keys.has("-") || keys.has("_")) spherical.radius *= Math.exp(1.5 * delta);
  spherical.radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
  lastInteraction = performance.now();
}

function resize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setSize(width, height);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  if (flight) {
    const t = Math.min(1, (now - flight.start) / flight.duration);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(flight.fromPosition, flight.view.position, eased);
    controls.target.lerpVectors(flight.fromTarget, flight.view.target, eased);
    if (t >= 1) flight = null;
  }
  applyKeys(delta);

  if (!reducedMotion && !controls.autoRotate && !flight && now - lastInteraction > 8000) {
    controls.autoRotate = true;
    hint.classList.remove("is-faded");
  }

  controls.update();
  renderer.render(scene, camera);
});

pickModel()
  .then((file) => (file ? loadFromUrl(file) : showStatus("No model available yet.")))
  .catch(() => showStatus("No model available yet."));
