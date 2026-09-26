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
  const body = new THREE.Group();
  character.add(body);
  body.add(head);

  const ink = new THREE.MeshBasicMaterial({ color: 0x2a1a14 });
  const faceZ = 0.402;

  // Petit sourire : un demi-tore retourné.
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 8, 24, Math.PI), ink);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.07, faceZ);
  body.add(mouth);

  // Grands yeux ronds avec un reflet : c'est le reflet qui fait « mignon ».
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const makeEye = (x) => {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), ink);
    eye.position.set(x, 0.07, faceZ);
    eye.scale.y = 1.12;
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), shine);
    glint.position.set(0.024, 0.028, 0.001);
    const glintSmall = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), shine);
    glintSmall.position.set(-0.022, -0.026, 0.001);
    eye.add(glint, glintSmall);
    body.add(eye);
    return eye;
  };
  const leftEye = makeEye(-0.155);
  const rightEye = makeEye(0.155);

  const blush = new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.55, depthWrite: false });
  [-0.255, 0.255].forEach((x) => {
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.058, 24), blush);
    cheek.position.set(x, -0.04, faceZ);
    cheek.scale.y = 0.62;
    body.add(cheek);
  });

  const crossEyes = [-0.155, 0.155].map((x) => {
    const cross = new THREE.Group();
    const diagonalA = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.026, 0.004), ink);
    const diagonalB = diagonalA.clone();
    diagonalA.rotation.z = Math.PI / 4;
    diagonalB.rotation.z = -Math.PI / 4;
    cross.add(diagonalA, diagonalB);
    cross.position.set(x, 0.07, faceZ + 0.002);
    cross.visible = false;
    body.add(cross);
    return cross;
  });
  character.position.set(-2.8, 4.6, 0);
  scene.add(character);
  const pointer = new THREE.Vector2();
  const targetPointer = new THREE.Vector2();
  let direction = 1;
  let verticalVelocity = 0;
  let grounded = false;
  let clickBounce = false;
  let draggingPet = false;
  let ragdolling = false;
  let ragdollStartedAt = 0;
  let throwVelocity = new THREE.Vector3();
  let angularVelocity = 0;
  let lastDragPoint = new THREE.Vector3();
  let lastDragTime = 0;
  let lastFrameTime = 0;
  let lastInteractionTime = performance.now();
  let nextBlink = performance.now() + 1800;
  let petState = "falling";
  let nextPetAction = performance.now() + 1200;
  let idleUntil = 0;
  let blinkUntil = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const raycaster = new THREE.Raycaster();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const pointerPoint = new THREE.Vector3();

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.065;
  scene.add(shadow);

  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext("2d");
  const glowGradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  glowGradient.addColorStop(0, "rgba(255,255,255,1)");
  glowGradient.addColorStop(0.35, "rgba(255,200,150,0.8)");
  glowGradient.addColorStop(1, "rgba(255,140,60,0)");
  glowContext.fillStyle = glowGradient;
  glowContext.fillRect(0, 0, 64, 64);

  const SPARKS = 260;
  const sparkPosition = new Float32Array(SPARKS * 3);
  const sparkColor = new Float32Array(SPARKS * 4);
  const sparkVelocity = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkMaxLife = new Float32Array(SPARKS).fill(1);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPosition, 3));
  sparkGeometry.setAttribute("color", new THREE.BufferAttribute(sparkColor, 4));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({
    size: 0.18, map: new THREE.CanvasTexture(glowCanvas), vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkPalette = [new THREE.Color(0xffd2a0), new THREE.Color(0xf39a63), new THREE.Color(0xffffff), new THREE.Color(0xff7a3d)];
  let nextSpark = 0;
  const emit = (x, y, z, vx, vy, vz, life) => {
    const i = nextSpark;
    nextSpark = (nextSpark + 1) % SPARKS;
    const color = sparkPalette[Math.floor(Math.random() * sparkPalette.length)];
    sparkPosition.set([x, y, z], i * 3);
    sparkVelocity.set([vx, vy, vz], i * 3);
    sparkColor.set([color.r, color.g, color.b, 1], i * 4);
    sparkLife[i] = sparkMaxLife[i] = life;
  };

  const rings = Array.from({ length: 4 }, () => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 64),
      new THREE.MeshBasicMaterial({
        color: 0xf39a63, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.055;
    ring.userData = { age: 1, power: 0 };
    scene.add(ring);
    return ring;
  });
  let nextRing = 0;

  let squash = 0;
  let squashVelocity = 0;
  let shake = 0;
  let flash = 0;
  let dizzyUntil = 0;
  const baseCamera = camera.position.clone();
  const baseOrange = orangeLight.intensity;

  // Écrasement, étincelles, onde au sol, secousse, flash : tout part d'ici.
  const impact = (speed, x, y, time, wall = 0) => {
    if (reducedMotion || speed < 1.5) return;
    const s = Math.min(speed / 9, 1);
    if (!wall) squashVelocity += 9 * s;
    shake = Math.max(shake, 0.22 * s);
    flash = Math.max(flash, s);
    if (s > 0.5) dizzyUntil = time + 1200;
    const count = Math.round(10 + 45 * s);
    for (let n = 0; n < count; n++) {
      const angle = Math.random() * Math.PI * 2;
      const burst = (1 + Math.random() * 4.5) * (0.4 + s);
      if (wall) {
        emit(x, y + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4,
          -wall * burst * Math.random(), (Math.random() - 0.2) * burst, Math.sin(angle) * burst * 0.4,
          0.4 + Math.random() * 0.5);
      } else {
        emit(x + (Math.random() - 0.5) * 0.6, y + 0.03, (Math.random() - 0.5) * 0.5,
          Math.cos(angle) * burst, (0.6 + Math.random()) * burst, Math.sin(angle) * burst * 0.5,
          0.5 + Math.random() * 0.7);
      }
    }
    if (!wall) {
      const ring = rings[nextRing];
      nextRing = (nextRing + 1) % rings.length;
      ring.position.x = x;
      ring.userData.age = 0;
      ring.userData.power = s;
    }
  };

  const getPointerPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerPoint.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
      0.5
    );
    raycaster.setFromCamera(pointerPoint, camera);
    return raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3());
  };

  canvas.addEventListener("pointermove", (event) => {
    lastInteractionTime = performance.now();
    if (petState === "sleep") {
      petState = "walk";
      nextPetAction = performance.now() + 2200;
    }
    const rect = canvas.getBoundingClientRect();
    targetPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    targetPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    if (draggingPet) {
      // La capture du pointeur suit la souris hors du cadre : on lâche nous-mêmes.
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        releasePet(event.pointerId);
        return;
      }
      const point = getPointerPoint(event);
      if (point) {
        character.position.x = point.x;
        character.position.y = point.y;
        const now = performance.now();
        const elapsed = Math.max(16, now - lastDragTime);
        throwVelocity.copy(point).sub(lastDragPoint).multiplyScalar(1000 / elapsed);
        lastDragPoint.copy(point);
        lastDragTime = now;
      }
      return;
    }
  });
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointerPoint.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
      0.5
    );
    raycaster.setFromCamera(pointerPoint, camera);
    if (raycaster.intersectObject(head, false).length > 0) {
      lastInteractionTime = performance.now();
      draggingPet = true;
      ragdolling = false;
      dizzyUntil = 0;
      crossEyes.forEach((cross) => { cross.visible = false; });
      leftEye.visible = true;
      rightEye.visible = true;
      petState = "excited";
      const point = getPointerPoint(event);
      if (point) {
        lastDragPoint.copy(point);
        character.position.x = point.x;
        character.position.y = point.y;
      }
      lastDragTime = performance.now();
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    lastInteractionTime = performance.now();
    petState = "excited";
    clickBounce = true;
    canvas.setPointerCapture(event.pointerId);
  });
  const releasePet = (pointerId) => {
    if (!draggingPet) return;
    draggingPet = false;
    ragdolling = true;
    ragdollStartedAt = performance.now();
    throwVelocity.z = 0;
    throwVelocity.clampLength(0, 13);
    throwVelocity.y = Math.max(throwVelocity.y, 1.4);
    angularVelocity = (throwVelocity.x >= 0 ? 1 : -1) * (2.5 + Math.abs(throwVelocity.x) * 0.35);
    canvas.style.cursor = "grab";
    if (pointerId !== undefined) {
      try { canvas.releasePointerCapture(pointerId); } catch {}
    }
  };
  canvas.addEventListener("pointerup", (event) => releasePet(event.pointerId));
  canvas.addEventListener("lostpointercapture", (event) => releasePet(event.pointerId));
  window.addEventListener("blur", () => releasePet());
  canvas.addEventListener("pointercancel", () => {
    if (!draggingPet) return;
    draggingPet = false;
    ragdolling = true;
    ragdollStartedAt = performance.now();
    throwVelocity.set(0, 1.6, 0);
    angularVelocity = 2.5;
    canvas.style.cursor = "grab";
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
    const half = 0.4;
    const restY = floorY + half;
    // Demi-hauteur du cube incliné : c'est son coin le plus bas qui touche le sol.
    const reach = () => half * (Math.abs(Math.cos(character.rotation.z)) + Math.abs(Math.sin(character.rotation.z)));
    if (draggingPet) {
      character.rotation.z = THREE.MathUtils.lerp(character.rotation.z, 0, 0.2);
    } else if (ragdolling) {
      throwVelocity.y -= 9 * delta;
      character.position.addScaledVector(throwVelocity, delta);
      character.rotation.z += angularVelocity * delta;

      if (character.position.x > 2.8 || character.position.x < -2.8) {
        const wall = Math.sign(character.position.x);
        impact(Math.abs(throwVelocity.x), wall * 3.2, character.position.y, time, wall);
        character.position.x = THREE.MathUtils.clamp(character.position.x, -2.8, 2.8);
        throwVelocity.x *= -0.65;
        angularVelocity *= -0.75;
      }
      const speed = throwVelocity.length();
      if (!reducedMotion && speed > 2.5) {
        for (let n = 0; n < 2; n++) {
          emit(
            character.position.x + (Math.random() - 0.5) * 0.5,
            character.position.y + (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.3,
            -throwVelocity.x * 0.08, -throwVelocity.y * 0.08 + 0.4, 0,
            0.35 + Math.random() * 0.25
          );
        }
      }
      // Plafond au bord haut du cadre : un lancer vif ne fait plus sortir le cube de l'image.
      const ceilingY = 3.85;
      if (character.position.y + reach() >= ceilingY && throwVelocity.y > 0) {
        character.position.y = ceilingY - reach();
        shake = Math.max(shake, 0.06);
        throwVelocity.y *= -0.5;
      }
      if (character.position.y - reach() <= floorY && throwVelocity.y <= 0) {
        character.position.y = floorY + reach();
        impact(-throwVelocity.y, character.position.x, floorY, time);
        if (throwVelocity.y < -1.2) {
          throwVelocity.y *= -0.6;
          throwVelocity.x *= 0.75;
          angularVelocity = angularVelocity * 0.4 - (throwVelocity.x / half) * 0.35;
        } else {
          throwVelocity.set(0, 0, 0);
          angularVelocity = 0;
          ragdolling = false;
          grounded = true;
          character.rotation.z = Math.atan2(Math.sin(character.rotation.z), Math.cos(character.rotation.z));
          petState = "idle";
          idleUntil = time + 700;
          nextPetAction = idleUntil;
        }
      }
    } else if (reducedMotion) {
      character.position.y = restY;
      character.position.x = 0;
      grounded = true;
      petState = "idle";
    } else if (!grounded) {
      verticalVelocity -= 9 * delta;
      character.position.y += verticalVelocity * delta;
      if (character.position.y <= restY) {
        character.position.y = restY;
        impact(-verticalVelocity, character.position.x, floorY, time);
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
          verticalVelocity = 2.8;
          grounded = false;
          petState = "excited";
          nextPetAction = time + 700;
        }
      }
      // Se redresse sur une arête après un lancer, au lieu de sauter d'un coup à plat.
      character.rotation.z = THREE.MathUtils.lerp(character.rotation.z, 0, 0.12);
      character.position.y = floorY + reach();
    }
    const blinking = time < blinkUntil;
    if (!blinking && time > nextBlink) {
      blinkUntil = time + 130;
      nextBlink = time + 1800 + Math.random() * 2600;
    }
    const eyesClosed = blinking || petState === "sleep";
    leftEye.scale.y = rightEye.scale.y = eyesClosed ? 0.14 : 1.12;
    const smile = petState === "excited" ? 1.35 : petState === "sleep" ? 0.7 : 1;
    mouth.scale.set(smile, smile, 1);

    const dizzy = time < dizzyUntil;
    leftEye.visible = rightEye.visible = !dizzy;
    crossEyes.forEach((cross) => {
      cross.visible = dizzy;
      if (dizzy) cross.rotation.z += delta * 9;
    });

    // Gelée : un ressort peu amorti, il s'écrase puis tremblote.
    squashVelocity += (-squash * 260 - squashVelocity * 9) * delta;
    squash = THREE.MathUtils.clamp(squash + squashVelocity * delta, -0.3, 0.45);
    body.scale.set(1 + squash * 0.7, 1 - squash, 1 + squash * 0.7);
    body.position.y = -half * squash;

    const height = Math.max(0, character.position.y - reach() - floorY);
    const shadowScale = 1 / (1 + height * 0.45);
    shadow.position.x = character.position.x;
    shadow.scale.set(shadowScale * (1 + squash * 0.7), shadowScale, 1);
    shadow.material.opacity = 0.45 * shadowScale;

    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i] <= 0) continue;
      sparkLife[i] -= delta;
      const p = i * 3;
      sparkVelocity[p + 1] -= 7 * delta;
      sparkPosition[p] += sparkVelocity[p] * delta;
      sparkPosition[p + 1] += sparkVelocity[p + 1] * delta;
      sparkPosition[p + 2] += sparkVelocity[p + 2] * delta;
      if (sparkPosition[p + 1] < floorY + 0.02) {
        sparkPosition[p + 1] = floorY + 0.02;
        sparkVelocity[p + 1] *= -0.35;
        sparkVelocity[p] *= 0.7;
        sparkVelocity[p + 2] *= 0.7;
      }
      const fade = Math.max(sparkLife[i], 0) / sparkMaxLife[i];
      sparkColor[i * 4 + 3] = fade;
    }
    sparkGeometry.attributes.position.needsUpdate = true;
    sparkGeometry.attributes.color.needsUpdate = true;

    rings.forEach((ring) => {
      const data = ring.userData;
      if (data.age >= 1) {
        ring.material.opacity = 0;
        return;
      }
      data.age = Math.min(1, data.age + delta * 1.4);
      const eased = 1 - Math.pow(1 - data.age, 3);
      ring.scale.setScalar(0.2 + eased * (1.2 + 2.6 * data.power));
      ring.material.opacity = (1 - data.age) * 0.9 * data.power;
    });

    flash *= Math.exp(-5 * delta);
    head.material.emissive.setRGB(0.9 * flash, 0.4 * flash, 0.15 * flash);
    orangeLight.intensity = baseOrange + flash * 30;

    shake *= Math.exp(-7 * delta);
    camera.position.set(
      baseCamera.x + pointer.x * 0.35 + (Math.random() - 0.5) * shake,
      baseCamera.y + pointer.y * 0.18 + (Math.random() - 0.5) * shake,
      baseCamera.z
    );
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
