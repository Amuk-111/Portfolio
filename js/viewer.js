const container = document.getElementById('viewerContainer');
const overlay = document.getElementById('overlay');
const enterBtn = document.getElementById('enterBtn');
const crosshair = document.getElementById('crosshair');
const settingsPanel = document.getElementById('settingsPanel');
const fovRange = document.getElementById('fovRange');
const fovValue = document.getElementById('fovValue');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');

let canvas;
let ctx;
let active = false;
let paused = false;
let escapeActive = false;
let cameraX = 0;
let cameraZ = 0;
let cameraYaw = 0;
let cameraPitch = 0;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let isLooking = false;
let lastLookX = 0;
let lastLookY = 0;

const moveSpeed = 5.2;
const mouseSensitivity = 0.0022;
const maxPitch = Math.PI / 3;
const movementKeys = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Escape']);
let fov = 70;
const urlParams = new URLSearchParams(window.location.search);
const sceneModel = urlParams.get('model') || localStorage.getItem('selectedModel') || null;
if (urlParams.get('model')) {
  localStorage.setItem('selectedModel', urlParams.get('model'));
}
// three.js state
let threeRenderer = null;
let threeScene = null;
let threeCamera = null;
let gltfLoader = null;
let loadedModel = null;
let lastModelBBox = null;
let lastModelCenter = null;
let lastModelMaxDim = 0;
let enterTransition = null; // {startTime, duration, startX, startZ, targetX, targetZ}
let localFileInput = null;
let loadLocalBtn = null;

function init() {
  canvas = document.createElement('canvas');
  canvas.width = container.clientWidth * 2;
  canvas.height = container.clientHeight * 2;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.prepend(canvas);
  container.setAttribute('tabindex', '-1');

  // Initialize three.js renderer and scene
  if (typeof THREE !== 'undefined') {
    threeScene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(fov, container.clientWidth / container.clientHeight, 0.1, 1000);
    threeCamera.position.set(0, 1.6, 3);

    threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    threeRenderer.setPixelRatio(window.devicePixelRatio || 1);
    threeRenderer.setSize(container.clientWidth, container.clientHeight);
    threeRenderer.domElement.style.width = '100%';
    threeRenderer.domElement.style.height = '100%';
    threeRenderer.domElement.style.display = sceneModel ? 'block' : 'none';
    threeRenderer.domElement.style.position = 'absolute';
    threeRenderer.domElement.style.top = '0';
    threeRenderer.domElement.style.left = '0';
    container.prepend(threeRenderer.domElement);

    const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    threeScene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7.5);
    threeScene.add(dir);

    gltfLoader = new THREE.GLTFLoader();

    // Wire DRACO if available
    try {
      if (typeof THREE.DRACOLoader !== 'undefined') {
        const dracoLoader = new THREE.DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
        gltfLoader.setDRACOLoader(dracoLoader);
      }
    } catch (e) {
      console.warn('DRACO loader not initialized', e);
    }

    // Wire Meshopt decoder if present
    try {
      if (typeof MeshoptDecoder !== 'undefined') {
        gltfLoader.setMeshoptDecoder(MeshoptDecoder);
      }
    } catch (e) {
      console.warn('Meshopt decoder not available', e);
    }

    if (sceneModel) {
      loadModel(sceneModel);
    }
  }

  // local file support so viewer works without a server
  localFileInput = document.createElement('input');
  localFileInput.type = 'file';
  localFileInput.accept = '.glb,.gltf';
  localFileInput.style.display = 'none';
  document.body.appendChild(localFileInput);
  localFileInput.addEventListener('change', onLocalFileSelected);

  // create a small local-load button in the overlay
  try {
    const overlayCard = overlay.querySelector('.overlay-card');
    loadLocalBtn = document.createElement('button');
    loadLocalBtn.type = 'button';
    loadLocalBtn.className = 'btn btn-tertiary';
    loadLocalBtn.textContent = 'Load local .glb';
    loadLocalBtn.style.marginTop = '0.6rem';
    overlayCard.appendChild(loadLocalBtn);
    loadLocalBtn.addEventListener('click', () => localFileInput.click());
  } catch (e) {
    // ignore if overlay not present
  }

  ctx = canvas.getContext('2d');

  document.addEventListener('mousemove', onMouseMove);
  container.addEventListener('pointerdown', onLookStart);
  container.addEventListener('pointermove', onLookMove);
  container.addEventListener('pointerup', onLookEnd);
  container.addEventListener('pointercancel', onLookEnd);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  container.addEventListener('click', onContainerClick);
  enterBtn.addEventListener('click', enterScene);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onWindowBlur);
  fovRange.addEventListener('input', onFovChange);

  onResize();
  updateUi();
  animate();
}

function startEnterTransition() {
  if (!loadedModel || !lastModelCenter) return;
  const duration = 600; // ms
  const targetX = lastModelCenter.x;
  const targetZ = lastModelCenter.z + Math.max(1.6, lastModelMaxDim * 0.9);
  enterTransition = {
    startTime: performance.now(),
    duration,
    startX: cameraX,
    startZ: cameraZ,
    targetX,
    targetZ: targetZ
  };
}

function loadModel(fileName) {
  if (!gltfLoader) return;
  // remove previous
  if (loadedModel) {
    threeScene.remove(loadedModel);
    loadedModel.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose()); else c.material.dispose();
      }
    });
    loadedModel = null;
  }

  const url = `../gltf/${fileName}`;
  overlayText.textContent = 'Loading model…';
  gltfLoader.load(url, (gltf) => {
    loadedModel = gltf.scene || gltf.scenes[0];
    // center and scale
    const bbox = new THREE.Box3().setFromObject(loadedModel);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? 2 / maxDim : 1;
    loadedModel.scale.setScalar(scale);
    bbox.setFromObject(loadedModel);
    const center = bbox.getCenter(new THREE.Vector3());
    loadedModel.position.x -= center.x;
    loadedModel.position.y -= center.y;
    loadedModel.position.z -= center.z;

    // remember bbox/center/size for framing
    lastModelBBox = bbox;
    lastModelCenter = center;
    lastModelMaxDim = Math.max(size.x, size.y, size.z) * scale;

    threeScene.add(loadedModel);
    overlayText.textContent = 'Click to enter first-person view. Use W, A, S, D to move and your mouse to look around.';
    threeRenderer.domElement.style.display = 'block';
    canvas.style.display = 'none';
  }, undefined, (err) => {
    overlayText.textContent = `Failed to load model: ${err.message || err}`;
    console.error('GLTF load error', err);
  });
}

function updateUi() {
  const showOverlay = !active || paused;
  overlay.style.display = showOverlay ? 'flex' : 'none';
  crosshair.style.display = active && !paused ? 'block' : 'none';
  container.classList.toggle('scene-active', active && !paused);
  document.body.style.cursor = active && !paused ? 'none' : '';

  if (paused) {
    overlayTitle.textContent = 'Paused';
    overlayText.textContent = 'Adjust the field of view and press Esc to resume.';
    enterBtn.textContent = 'Resume';
    enterBtn.className = 'btn btn-secondary';
    settingsPanel.style.display = 'flex';
    settingsPanel.setAttribute('aria-hidden', 'false');
  } else if (!active) {
    const displayModelName = sceneModel ? sceneModel.replace(/\.[^/.]+$/, '') : null;
    overlayTitle.textContent = displayModelName ? `Explore: ${displayModelName}` : 'Explore the space';
    overlayText.textContent = 'Click to enter first-person view. Use W, A, S, D to move and your mouse to look around.';
    enterBtn.textContent = 'Enter Scene';
    enterBtn.className = 'btn btn-primary';
    settingsPanel.style.display = 'none';
    settingsPanel.setAttribute('aria-hidden', 'true');
  } else {
    settingsPanel.style.display = 'none';
    settingsPanel.setAttribute('aria-hidden', 'true');
  }

  if (!active && document.pointerLockElement === container) {
    document.exitPointerLock();
  }
}

function setSceneState(isActive) {
  active = isActive;
  paused = false;
  updateUi();
}

function onWindowBlur() {
  if (active && !paused) {
    paused = true;
    updateUi();
  }
}

function togglePause() {
  if (!active) return;

  paused = true;
  updateUi();
}

function resumeScene() {
  if (!active) return;

  paused = false;
  updateUi();
}

function onFovChange() {
  fov = Number(fovRange.value);
  fovValue.textContent = `${fov}°`;
  if (threeCamera) {
    threeCamera.fov = fov;
    threeCamera.updateProjectionMatrix();
  }
}

function enterScene() {
  if (active && !paused) return;

  if (!active) {
    setSceneState(true);
    // if a model is loaded, smoothly move the camera into a framed start position
    if (loadedModel) startEnterTransition();
  } else {
    paused = false;
    updateUi();
  }
}

function onContainerClick() {
  if (!active) {
    enterScene();
    return;
  }

  if (paused) {
    enterScene();
    return;
  }

  if (container.requestPointerLock) {
    container.requestPointerLock();
  }
}

function onLookStart(event) {
  if (!active || paused || event.target.closest('button, a, input')) return;
  isLooking = true;
  lastLookX = event.clientX;
  lastLookY = event.clientY;
  container.setPointerCapture(event.pointerId);
  container.classList.add('looking');
}

function onLookMove(event) {
  if (!isLooking || !active || paused || document.pointerLockElement === container) return;
  const deltaX = event.clientX - lastLookX;
  const deltaY = event.clientY - lastLookY;
  lastLookX = event.clientX;
  lastLookY = event.clientY;
  cameraYaw -= deltaX * mouseSensitivity;
  cameraPitch = Math.max(-maxPitch, Math.min(maxPitch, cameraPitch - deltaY * mouseSensitivity));
}

function onLookEnd(event) {
  isLooking = false;
  container.classList.remove('looking');
  try { container.releasePointerCapture(event.pointerId); } catch {}
}

function onMouseMove(event) {
  if (!active || paused) return;

  if (document.pointerLockElement !== container) return;

  cameraYaw -= event.movementX * mouseSensitivity;
  cameraPitch = Math.max(-maxPitch, Math.min(maxPitch, cameraPitch - event.movementY * mouseSensitivity));
}
function onKeyDown(event) {
  if (event.code === 'Escape') {
    if (!escapeActive) {
      escapeActive = true;
      if (active) {
        togglePause();
      }
    }
    event.preventDefault();
    return;
  }

  switch (event.code) {
    case 'KeyW':
      moveForward = true;
      break;
    case 'KeyS':
      moveBackward = true;
      break;
    case 'KeyA':
      moveLeft = true;
      break;
    case 'KeyD':
      moveRight = true;
      break;
  }

  if (movementKeys.has(event.code)) {
    event.preventDefault();
  }
}

function handleLoadedGltf(gltf, fileName) {
  loadedModel = gltf.scene || gltf.scenes[0];
  const bbox = new THREE.Box3().setFromObject(loadedModel);
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? (2.0 / maxDim) : 1.0;
  loadedModel.scale.setScalar(scale);
  bbox.setFromObject(loadedModel);
  const center = bbox.getCenter(new THREE.Vector3());
  loadedModel.position.x -= center.x;
  loadedModel.position.y -= center.y;
  loadedModel.position.z -= center.z;

  // remember bbox/center/size for framing
  lastModelBBox = bbox;
  lastModelCenter = center;
  lastModelMaxDim = Math.max(size.x, size.y, size.z) * scale;

  threeScene.add(loadedModel);
  overlayText.textContent = 'Click to enter first-person view. Use W, A, S, D to move and your mouse to look around.';
  threeRenderer.domElement.style.display = 'block';
  canvas.style.display = 'none';
  if (loadLocalBtn) loadLocalBtn.style.display = 'none';
}

function onLocalFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  overlayText.textContent = `Loading ${file.name}…`;
  const reader = new FileReader();
  reader.onload = () => {
    const buf = reader.result;
    try {
      gltfLoader.parse(buf, '', (gltf) => {
        handleLoadedGltf(gltf, file.name);
      }, (err) => {
        console.error('Local parse error', err);
        overlayText.textContent = 'Failed to parse local .glb';
      });
    } catch (err) {
      console.error('Local parse exception', err);
      overlayText.textContent = 'Failed to parse local .glb';
    }
  };
  reader.onerror = () => {
    overlayText.textContent = 'Failed to read local file';
  };
  reader.readAsArrayBuffer(file);
}

function onKeyUp(event) {
  if (event.code === 'Escape') {
    escapeActive = false;
  }

  switch (event.code) {
    case 'KeyW':
      moveForward = false;
      break;
    case 'KeyS':
      moveBackward = false;
      break;
    case 'KeyA':
      moveLeft = false;
      break;
    case 'KeyD':
      moveRight = false;
      break;
  }
}

function updateMovement(delta) {
  if (!active || paused) return;

  const forwardX = -Math.sin(cameraYaw);
  const forwardZ = -Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = -Math.sin(cameraYaw);

  const inputForward = (moveForward ? 1 : 0) - (moveBackward ? 1 : 0);
  const inputRight = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);

  let moveX = 0;
  let moveZ = 0;

  moveX += forwardX * inputForward;
  moveZ += forwardZ * inputForward;
  moveX += rightX * inputRight;
  moveZ += rightZ * inputRight;

  if (moveX !== 0 || moveZ !== 0) {
    const length = Math.hypot(moveX, moveZ) || 1;
    cameraX += (moveX / length) * moveSpeed * delta;
    cameraZ += (moveZ / length) * moveSpeed * delta;
  }
}

function projectPoint(x, y, z) {
  const dx = x - cameraX;
  const dy = y - 1.2;
  const dz = z - cameraZ;

  const rotatedX = dx * Math.cos(cameraYaw) - dz * Math.sin(cameraYaw);
  const rotatedZ = dx * Math.sin(cameraYaw) + dz * Math.cos(cameraYaw);

  const pitchCos = Math.cos(cameraPitch);
  const pitchSin = Math.sin(cameraPitch);
  const rotatedY = dy * pitchCos - rotatedZ * pitchSin;
  const finalZ = rotatedZ * pitchCos + dy * pitchSin;

  const depth = 0.35 + finalZ;
  if (depth <= 0.15) return null;

  const perspective = (fov * 1.6) / depth;
  const screenX = canvas.width / 2 + rotatedX * perspective;
  const screenY = canvas.height / 2 - rotatedY * perspective * 0.7;

  return { x: screenX, y: screenY, depth };
}

function drawScene() {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height / 2);
  sky.addColorStop(0, '#071120');
  sky.addColorStop(1, '#233b56');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height / 2);

  const ground = ctx.createLinearGradient(0, height / 2, 0, height);
  ground.addColorStop(0, '#243449');
  ground.addColorStop(1, '#111827');
  ctx.fillStyle = ground;
  ctx.fillRect(0, height / 2, width, height / 2);

  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;

  for (let i = -16; i <= 16; i += 1) {
    const start = projectPoint(i, 0, -16);
    const end = projectPoint(i, 0, 16);
    if (start && end) {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    const start2 = projectPoint(-16, 0, i);
    const end2 = projectPoint(16, 0, i);
    if (start2 && end2) {
      ctx.beginPath();
      ctx.moveTo(start2.x, start2.y);
      ctx.lineTo(end2.x, end2.y);
      ctx.stroke();
    }
  }

  const props = [
    { x: 4, y: 0.7, z: 8, color: '#c96a2a', size: 0.9 },
    { x: -5, y: 0.7, z: 6, color: '#6d8fb4', size: 0.8 },
    { x: 2, y: 0.7, z: -5, color: '#8fb06a', size: 0.7 },
    { x: -2, y: 0.7, z: -8, color: '#b7884e', size: 0.65 }
  ];

  props.forEach((prop) => {
    const topLeft = projectPoint(prop.x - prop.size / 2, prop.y + prop.size, prop.z - prop.size / 2);
    const topRight = projectPoint(prop.x + prop.size / 2, prop.y + prop.size, prop.z - prop.size / 2);
    const bottomLeft = projectPoint(prop.x - prop.size / 2, prop.y, prop.z + prop.size / 2);
    const bottomRight = projectPoint(prop.x + prop.size / 2, prop.y, prop.z + prop.size / 2);

    if (topLeft && topRight && bottomLeft && bottomRight) {
      ctx.fillStyle = prop.color;
      ctx.beginPath();
      ctx.moveTo(topLeft.x, topLeft.y);
      ctx.lineTo(topRight.x, topRight.y);
      ctx.lineTo(bottomRight.x, bottomRight.y);
      ctx.lineTo(bottomLeft.x, bottomLeft.y);
      ctx.closePath();
      ctx.fill();
    }
  });

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min(0.032, (now - (animate.lastTime || now)) / 1000);
  animate.lastTime = now;

  updateMovement(delta);
  // update three.js camera to match our first-person state
  if (threeCamera) {
    // if an enter transition is active, interpolate cameraX/Z
    if (enterTransition) {
      const now = performance.now();
      const progress = Math.min(1, (now - enterTransition.startTime) / enterTransition.duration);
      // ease out cubic
      const ease = (progress - 1) * (progress - 1) * (progress - 1) + 1;
      cameraX = enterTransition.startX + (enterTransition.targetX - enterTransition.startX) * ease;
      cameraZ = enterTransition.startZ + (enterTransition.targetZ - enterTransition.startZ) * ease;
      if ((now - enterTransition.startTime) >= enterTransition.duration) {
        enterTransition = null;
      }
    }

    threeCamera.position.x = cameraX;
    threeCamera.position.z = cameraZ;
    threeCamera.position.y = 1.2;
    threeCamera.rotation.order = 'YXZ';
    threeCamera.rotation.y = cameraYaw;
    threeCamera.rotation.x = cameraPitch;
  }

  if (threeRenderer && threeScene && threeCamera && loadedModel) {
    threeRenderer.render(threeScene, threeCamera);
  } else {
    drawScene();
  }
}

function onResize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  canvas.width = width * 2;
  canvas.height = height * 2;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx = canvas.getContext('2d');
  if (threeRenderer) {
    threeRenderer.setSize(width, height);
  }
  if (threeCamera) {
    threeCamera.aspect = width / height;
    threeCamera.updateProjectionMatrix();
  }
}

init();
