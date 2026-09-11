import * as THREE from "three";
import { FontLoader } from "./libs/package/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "./libs/package/examples/jsm/geometries/TextGeometry.js";

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
  const fallback = document.getElementById("heroTitleFallback");
  if (!canvas) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.z = 16;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 2.5));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.8);
  keyLight.position.set(4, 5, 8);
  scene.add(keyLight);
  const orangeLight = new THREE.DirectionalLight(0xf39a63, 2.2);
  orangeLight.position.set(-4, -1, 5);
  scene.add(orangeLight);

  const textGroup = new THREE.Group();
  scene.add(textGroup);
  const mouse = new THREE.Vector2();
  const targetMouse = new THREE.Vector2();
  const dragOffset = new THREE.Vector2();
  const targetDragOffset = new THREE.Vector2();
  let isDragging = false;
  let previousPointer = new THREE.Vector2();
  const lines = [
    { text: "THOMAS LOGE", size: 1.15, height: 0.18, color: 0xf7f3ed },
    { text: "FULL-STACK DEVELOPER", size: 0.52, height: 0.1, color: 0xf39a63 },
    { text: "REACT · TYPESCRIPT · 3D", size: 0.3, height: 0.06, color: 0xa69f96 }
  ];

  new FontLoader().load("./js/libs/package/examples/fonts/typeface/helvetiker_regular.typeface.json", (font) => {
    fallback.classList.add("hidden");
    lines.forEach((line, index) => {
      const geometry = new TextGeometry(line.text, {
        font, size: line.size, height: line.height, curveSegments: 7,
        bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelSegments: 2
      });
      geometry.center();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: line.color, metalness: 0.2, roughness: 0.28
      }));
      mesh.position.y = 1.1 - index * 1.1;
      textGroup.add(mesh);
    });
  }, undefined, (error) => console.error("3D headline failed to load.", error));

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    targetMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    targetMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    if (isDragging) {
      targetDragOffset.x += (event.clientX - previousPointer.x) * 0.012;
      targetDragOffset.y -= (event.clientY - previousPointer.y) * 0.012;
      previousPointer.set(event.clientX, event.clientY);
    }
  });
  canvas.addEventListener("pointerdown", (event) => {
    isDragging = true;
    previousPointer.set(event.clientX, event.clientY);
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture(event.pointerId);
  });
  const stopDragging = (event) => {
    isDragging = false;
    canvas.style.cursor = "grab";
    targetDragOffset.set(0, 0);
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

  const animate = (time) => {
    requestAnimationFrame(animate);
    mouse.lerp(targetMouse, 0.06);
    dragOffset.lerp(targetDragOffset, 0.08);
    textGroup.rotation.y = THREE.MathUtils.lerp(textGroup.rotation.y, mouse.x * 0.15, 0.05);
    textGroup.rotation.x = THREE.MathUtils.lerp(textGroup.rotation.x, -mouse.y * 0.08, 0.05);
    textGroup.position.x = dragOffset.x;
    textGroup.position.y = Math.sin(time * 0.0008) * 0.03 + dragOffset.y;
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

function initSkillConstellation() {
  const detail = document.getElementById("skillDetail");
  const descriptions = {
    react: "React turns CRM workflows into focused, real-time tools people can use quickly.",
    crm: "Zoho CRM is where integrations, automation, and useful interfaces meet.",
    "3d": "3D modeling brings technical drawings and spaces into something people can explore.",
    api: "APIs connect the product layers: messages, leads, services, and deployments."
  };

  document.querySelectorAll("[data-skill]").forEach((node) => {
    node.addEventListener("click", () => {
      document.querySelectorAll("[data-skill]").forEach((entry) => entry.classList.remove("active"));
      node.classList.add("active");
      detail.textContent = descriptions[node.dataset.skill];
    });
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
initProjectCards();
initSkillConstellation();
initScrollReveal();
