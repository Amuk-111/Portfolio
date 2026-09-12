import * as THREE from "three";
import { TextGeometry } from "./libs/package/examples/jsm/geometries/TextGeometry.js";
import { FontLoader } from "./libs/package/examples/jsm/loaders/FontLoader.js";

const modelList = document.getElementById("modelList");
const enterButton = document.getElementById("enterModelBtn");

async function loadModels() {
  try {
    const response = await fetch("gltf/models.json");
    if (!response.ok) throw new Error(`Model list request failed (${response.status})`);
    const models = await response.json();

    if (!Array.isArray(models) || models.length === 0) {
      modelList.textContent = "No models available yet.";
      return;
    }

    const list = document.createElement("ul");
    models.forEach((model, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = model.name || model.file;
      button.addEventListener("click", () => {
        localStorage.setItem("selectedModel", model.file);
        enterButton.href = `pages/viewer.html?model=${encodeURIComponent(model.file)}`;
        list.querySelectorAll("button").forEach((entry) => entry.classList.remove("selected"));
        button.classList.add("selected");
      });
      item.append(button);
      list.append(item);
      if (index === 0) button.click();
    });
    modelList.replaceChildren(list);
  } catch (error) {
    console.error("Could not load model list.", error);
    modelList.textContent = "Models are unavailable right now.";
  }
}

function initHero() {
  const canvas = document.getElementById("hero3dText");
  if (!canvas) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 1.4, 10);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  scene.add(new THREE.HemisphereLight(0xfff5eb, 0x25201d, 2.4));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
  keyLight.position.set(4, 5, 8);
  scene.add(keyLight);
  const orangeLight = new THREE.PointLight(0xf39a63, 8, 10);
  orangeLight.position.set(-3, 2, 3);
  scene.add(orangeLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a2922, roughness: 0.86, metalness: 0.04 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1.07, -0.8);
  scene.add(floor);
  const windowSill = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.12, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xf39a63, emissive: 0x3a1608 })
  );
  windowSill.position.set(0, -1.01, 2.85);
  scene.add(windowSill);

  const character = new THREE.Group();
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xf39a63, roughness: 0.48 })
  );
  head.position.y = 0.4;
  character.add(head);

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.07, 0.025),
    new THREE.MeshBasicMaterial({ color: 0x241713 })
  );
  mouth.position.set(0, 0.28, 0.414);
  character.add(mouth);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x241713 });
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.025), eyeMaterial);
  const rightEye = leftEye.clone();
  leftEye.position.set(-0.17, 0.53, 0.414);
  rightEye.position.set(0.17, 0.53, 0.414);
  character.add(leftEye, rightEye);
  character.position.set(-2.8, 4.2, 0);
  scene.add(character);
  const pointer = new THREE.Vector2();
  const targetPointer = new THREE.Vector2();
  let direction = 1;
  let verticalVelocity = 0;
  let grounded = false;
  let clickBounce = false;
  let lastFrameTime = 0;
  let lastInteractionTime = performance.now();
  let nextBlink = performance.now() + 1800;
  let petState = "falling";
  let nextPetAction = performance.now() + 1200;
  let idleUntil = 0;
  let blinkUntil = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  canvas.addEventListener("pointermove", (event) => {
    lastInteractionTime = performance.now();
    if (petState === "sleep") {
      petState = "walk";
      nextPetAction = performance.now() + 2200;
    }
    const rect = canvas.getBoundingClientRect();
    targetPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    targetPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  });
  canvas.addEventListener("pointerdown", (event) => {
    lastInteractionTime = performance.now();
    petState = "excited";
    clickBounce = true;
    canvas.setPointerCapture(event.pointerId);
  });

  const resize = () => {
    const rect = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), true);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();

  const animate = (time) => {
    requestAnimationFrame(animate);
    const delta = Math.min(0.04, (time - (lastFrameTime || time)) / 1000);
    lastFrameTime = time;
    pointer.lerp(targetPointer, 0.07);
    const floorY = -1.06;
    if (reducedMotion) {
      character.position.y = floorY;
      character.position.x = 0;
      grounded = true;
      petState = "idle";
    } else if (!grounded) {
      verticalVelocity -= 9 * delta;
      character.position.y += verticalVelocity * delta;
      if (character.position.y <= floorY) {
        character.position.y = floorY;
        verticalVelocity = 0;
        grounded = true;
        petState = "idle";
        idleUntil = time + 800;
        nextPetAction = idleUntil;
      }
    } else {
      if (clickBounce) {
        verticalVelocity = 4.2;
        grounded = false;
        clickBounce = false;
        petState = "excited";
      } else if (time - lastInteractionTime > 7000) {
        petState = "sleep";
      } else if (petState === "sleep") {
        petState = "idle";
        idleUntil = time + 700;
        nextPetAction = idleUntil;
      } else if (time >= nextPetAction) {
        if (petState === "idle" || petState === "excited") {
          petState = "walk";
          direction = Math.random() > 0.5 ? 1 : -1;
          nextPetAction = time + 1800 + Math.random() * 2600;
        } else if (petState === "walk") {
          petState = "idle";
          idleUntil = time + 900 + Math.random() * 1600;
          nextPetAction = idleUntil;
        }
      }
      if (petState === "walk") {
        character.position.x += direction * delta * 1.35;
        if (character.position.x > 2.8 || character.position.x < -2.8) {
          direction *= -1;
          character.position.x = THREE.MathUtils.clamp(character.position.x, -2.8, 2.8);
          petState = "idle";
          idleUntil = time + 700;
          nextPetAction = idleUntil;
        }
      }
      character.position.y = floorY;
    }
    const blinking = time < blinkUntil;
    if (!blinking && time > nextBlink) {
      blinkUntil = time + 130;
      nextBlink = time + 1800 + Math.random() * 2600;
    }
    leftEye.scale.y = blinking ? 0.12 : 1;
    rightEye.scale.y = blinking ? 0.12 : 1;
    mouth.scale.x = petState === "excited" ? 1.35 : petState === "sleep" ? 0.65 : 1;
    mouth.rotation.z = petState === "sleep" ? -0.35 : 0;
    renderer.render(scene, camera);
  };
  requestAnimationFrame(animate);
}

function initHeadline() {
  const canvas = document.getElementById("heroHeadline3d");
  const fallback = document.getElementById("heroHeadlineFallback");
  if (!canvas) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  camera.position.z = 14;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 2.4));
  const light = new THREE.DirectionalLight(0xf39a63, 2.4);
  light.position.set(-3, 4, 7);
  scene.add(light);

  const group = new THREE.Group();
  scene.add(group);
  const pointer = new THREE.Vector2();
  const targetPointer = new THREE.Vector2();
  let dragging = false;
  let previousPointer = new THREE.Vector2();
  const lines = [
    { text: "THOMAS LOGE", size: 1.1, color: 0xf7f3ed, y: 0.55 },
    { text: "FULL-STACK DEVELOPER", size: 0.42, color: 0xf39a63, y: -0.55 },
    { text: "REACT · TYPESCRIPT · NODE.JS · 3D", size: 0.23, color: 0xa69f96, y: -1.05 }
  ];

  new FontLoader().load("./js/libs/package/examples/fonts/typeface/helvetiker_regular.typeface.json", (font) => {
    lines.forEach((line) => {
      const geometry = new TextGeometry(line.text, {
        font, size: line.size, height: 0.08, curveSegments: 6,
        bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.01, bevelSegments: 2
      });
      geometry.center();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: line.color, metalness: 0.18, roughness: 0.3
      }));
      mesh.position.y = line.y;
      group.add(mesh);
    });
    fallback.classList.add("hidden");
  }, undefined, (error) => console.error("3D headline failed to load.", error));

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    targetPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    targetPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    if (dragging) {
      group.rotation.y += (event.clientX - previousPointer.x) * 0.012;
      group.rotation.x += (event.clientY - previousPointer.y) * 0.008;
      previousPointer.set(event.clientX, event.clientY);
    }
  });
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    previousPointer.set(event.clientX, event.clientY);
    canvas.setPointerCapture(event.pointerId);
  });
  const stopDragging = (event) => {
    dragging = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch {}
  };
  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);

  const resize = () => {
    const rect = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), true);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", resize);
  resize();
  const animate = () => {
    requestAnimationFrame(animate);
    pointer.lerp(targetPointer, 0.07);
    if (!dragging) {
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, pointer.x * 0.16, 0.06);
      group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, -pointer.y * 0.08, 0.06);
    }
    renderer.render(scene, camera);
  };
  requestAnimationFrame(animate);
}

function initProjectCards() {
  document.querySelectorAll("[data-project-card]").forEach((card) => {
    const toggle = card.querySelector(".project-toggle");
    let dragging = false;
    let startX = 0;
    let startY = 0;

    toggle.addEventListener("click", () => {
      const expanded = card.classList.toggle("is-expanded");
      toggle.setAttribute("aria-expanded", String(expanded));
    });

    card.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      card.setPointerCapture(event.pointerId);
    });

    card.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      const rect = card.getBoundingClientRect();
      const tilt = ((event.clientX - rect.left) / rect.width - 0.5) * 5;
      card.style.transform = `translate3d(${deltaX * 0.22}px, ${deltaY * 0.22}px, 0) rotate(${tilt}deg)`;
    });

    const releaseCard = (event) => {
      if (!dragging) return;
      dragging = false;
      card.style.transform = "";
      try { card.releasePointerCapture(event.pointerId); } catch {}
    };
    card.addEventListener("pointerup", releaseCard);
    card.addEventListener("pointercancel", releaseCard);
  });
}

function initScrollReveal() {
  const revealItems = document.querySelectorAll(".section-block, .sidebar, .viewer-promo");
  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      currentObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  revealItems.forEach((item) => observer.observe(item));
}

loadModels();
initHero();
initHeadline();
initProjectCards();
initScrollReveal();
