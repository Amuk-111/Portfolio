import * as THREE from "three";

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

  const desk = new THREE.Group();
  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 0.18, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x3a2922, roughness: 0.8 })
  );
  deskTop.position.y = -1.55;
  desk.add(deskTop);
  const deskEdge = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 0.06, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xf39a63, emissive: 0x3a1608 })
  );
  deskEdge.position.set(0, -1.43, 1.3);
  desk.add(deskEdge);
  scene.add(desk);

  const character = new THREE.Group();
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color: 0xf39a63, roughness: 0.48 })
  );
  head.position.y = 0.95;
  character.add(head);

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.07, 0.025),
    new THREE.MeshBasicMaterial({ color: 0x241713 })
  );
  mouth.position.set(0, 0.83, 0.414);
  character.add(mouth);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.55, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xf7f3ed, roughness: 0.7 })
  );
  body.position.y = 0.35;
  character.add(body);

  const limbMaterial = new THREE.MeshStandardMaterial({ color: 0xf7f3ed, roughness: 0.7 });
  const limbs = [];
  const addLimb = (from, to) => {
    const direction = new THREE.Vector3().subVectors(to, from);
    const limb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, direction.length(), 8),
      limbMaterial
    );
    limb.position.copy(from).add(to).multiplyScalar(0.5);
    limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    character.add(limb);
    limbs.push(limb);
  };
  addLimb(new THREE.Vector3(-0.08, 0.56, 0), new THREE.Vector3(-0.42, 0.15, 0));
  addLimb(new THREE.Vector3(0.08, 0.56, 0), new THREE.Vector3(0.42, 0.15, 0));
  addLimb(new THREE.Vector3(-0.08, 0.1, 0), new THREE.Vector3(-0.28, -0.55, 0));
  addLimb(new THREE.Vector3(0.08, 0.1, 0), new THREE.Vector3(0.28, -0.55, 0));
  character.position.set(-2.8, 4.2, 0);
  scene.add(character);
  fallback.classList.add("hidden");

  const pointer = new THREE.Vector2();
  const targetPointer = new THREE.Vector2();
  let direction = 1;
  let verticalVelocity = 0;
  let grounded = false;
  let walkTime = 0;
  let clickBounce = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    targetPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    targetPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  });
  canvas.addEventListener("pointerdown", (event) => {
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
    pointer.lerp(targetPointer, 0.07);
    const floorY = -0.85;
    if (reducedMotion) {
      character.position.y = floorY;
      character.position.x = 0;
      grounded = true;
    } else if (!grounded) {
      verticalVelocity -= 9 * 0.016;
      character.position.y += verticalVelocity * 0.016;
      if (character.position.y <= floorY) {
        character.position.y = floorY;
        verticalVelocity = 0;
        grounded = true;
      }
    } else {
      if (clickBounce) {
        verticalVelocity = 4.2;
        grounded = false;
        clickBounce = false;
      }
      character.position.x += direction * 0.018;
      if (character.position.x > 2.8 || character.position.x < -2.8) {
        direction *= -1;
        character.rotation.y = direction < 0 ? Math.PI : 0;
      }
      walkTime += 0.12;
      limbs[2].rotation.z = Math.sin(walkTime) * 0.35;
      limbs[3].rotation.z = -Math.sin(walkTime) * 0.35;
      character.position.y = floorY + Math.abs(Math.sin(walkTime * 2)) * 0.025;
    }
    character.rotation.z = THREE.MathUtils.lerp(character.rotation.z, -pointer.x * 0.12, 0.08);
    head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, pointer.y * 0.18, 0.08);
    head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, pointer.x * 0.22, 0.08);
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
