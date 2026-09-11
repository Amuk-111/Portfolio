document.addEventListener('DOMContentLoaded', () => {
  const modelListEl = document.getElementById('modelList');
  const enterBtn = document.getElementById('enterModelBtn');
  const candidateManifests = [
    'gltf/models.json',       // when server root is website/
    './gltf/models.json',
    '../gltf/models.json',    // when index is inside website/ and server root is project root
    '/gltf/models.json'       // absolute from server root
  ];

  // Try a script-relative path based on where this script is served from.
  try {
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const s = scripts[i];
      if (!s.src) continue;
      if (s.src.indexOf('js/models.js') !== -1 || s.src.endsWith('/models.js')) {
        const url = new URL(s.src, location.href);
        const scriptBase = url.href.replace(/\/js\/.*$/, '/');
        candidateManifests.unshift(scriptBase + 'gltf/models.json');
        break;
      }
    }
  } catch (e) {
    // ignore
  }
  let manifestBase = '';

  function setSelectedModel(fileName) {
    if (!fileName) {
      enterBtn.href = 'pages/viewer.html';
      localStorage.removeItem('selectedModel');
      return;
    }

    localStorage.setItem('selectedModel', fileName);
    enterBtn.href = `pages/viewer.html?model=${encodeURIComponent(fileName)}`;
  }

  function tryFetchManifests(list) {
    if (!list.length) return Promise.reject(new Error('No manifest candidates'));
    const url = list[0];
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error('Failed to load models manifest');
      manifestBase = url.replace(/models\.json$/, '');
      return res.json();
    }).catch(() => tryFetchManifests(list.slice(1)));
  }

  tryFetchManifests(candidateManifests).then((list) => {
    renderModels(list);
  }).catch((err) => {
    // fallback: try inline manifest script tag
    const inline = document.getElementById('models-manifest');
    if (inline) {
      try {
        const parsed = JSON.parse(inline.textContent);
        // manifestBase relative to current document
        manifestBase = 'gltf/';
        renderModels(parsed);
        return;
      } catch (e) {
        console.warn('Inline manifest parse failed', e);
      }
    }

    const advice = location.protocol === 'file:' ? ' (serve files over HTTP, e.g. `python -m http.server`)':'';
    modelListEl.innerHTML = `<p class="muted">Error loading models: ${err.message}${advice}</p>`;
  });

  function renderModels(list) {
    modelListEl.innerHTML = '';
    if (!Array.isArray(list) || list.length === 0) {
      modelListEl.innerHTML = '<p class="muted">No models found. Drop .glb files into the project `gltf/` folder and update `gltf/models.json`.</p>';
      setSelectedModel(localStorage.getItem('selectedModel'));
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'models-ul';

    list.forEach((m) => {
      const li = document.createElement('li');
      li.className = 'model-item';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-tertiary';
      btn.textContent = m.name || m.file || 'Unnamed model';
      btn.addEventListener('click', () => {
        const file = m.file || m;
        setSelectedModel(file);
        // update preview if available
        if (window.__previewLoadModel) window.__previewLoadModel(manifestBase + file);
        // highlight selection
        Array.from(ul.querySelectorAll('button')).forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });

      li.appendChild(btn);
      ul.appendChild(li);
    });

    modelListEl.appendChild(ul);

    // restore previous selection if present
    const prev = localStorage.getItem('selectedModel');
    if (prev) {
      const foundBtn = Array.from(ul.querySelectorAll('button')).find(b => b.textContent === prev || prev === encodeURIComponent(prev));
      if (foundBtn) {
        foundBtn.click();
      } else {
        setSelectedModel(prev);
      }
    } else {
      // if no previous, auto-select first and show preview
      const first = ul.querySelector('button');
      if (first) first.click();
    }

    // initialize preview renderer
    initPreview(manifestBase, list[0]);
  }

  // --- Preview integration ---
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  function initPreview(baseUrl, sample) {
    const previewPanel = document.querySelector('.preview-panel');
    if (!previewPanel) return;

    // dynamically load three.js and GLTFLoader
    const threeUrl = 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.min.js';
    const loaderUrl = 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/js/loaders/GLTFLoader.js';

    Promise.resolve()
      .then(() => loadScriptOnce(threeUrl))
      .then(() => loadScriptOnce(loaderUrl))
      .then(() => {
        // create renderer
        const previewCanvas = document.createElement('canvas');
        previewCanvas.style.width = '100%';
        previewCanvas.style.height = '160px';
        previewCanvas.style.display = 'block';
        previewCanvas.style.background = 'transparent';
        previewCanvas.style.cursor = 'pointer';
        previewPanel.prepend(previewCanvas);

        const renderer = new THREE.WebGLRenderer({ canvas: previewCanvas, alpha: true, antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(previewPanel.clientWidth, 160);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, previewPanel.clientWidth / 160, 0.1, 1000);
        camera.position.set(0, 0.8, 2.5);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
        scene.add(hemi);
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(5, 10, 7.5);
        scene.add(dir);

        const loader = new THREE.GLTFLoader();

        let current = null;
        function disposeCurrent() {
          if (!current) return;
          scene.remove(current);
          current.traverse((c) => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
              if (Array.isArray(c.material)) c.material.forEach(m => m.dispose()); else c.material.dispose();
            }
          });
          current = null;
        }

        function previewLoadModel(url) {
          disposeCurrent();
          loader.load(url, (gltf) => {
            current = gltf.scene || gltf.scenes[0];
            const bbox = new THREE.Box3().setFromObject(current);
            const size = bbox.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = maxDim > 0 ? (1.6 / maxDim) : 1.0;
            current.scale.setScalar(scale);
            bbox.setFromObject(current);
            const center = bbox.getCenter(new THREE.Vector3());
            current.position.x -= center.x;
            current.position.y -= center.y;
            current.position.z -= center.z;
            scene.add(current);
          }, undefined, (e) => {
            console.warn('Preview load error', e);
          });
        }

        // expose for selection
        window.__previewLoadModel = previewLoadModel;

        // load sample (first listed) if present
        const initialFile = (sample && (sample.file || sample)) || null;
        if (initialFile) previewLoadModel(baseUrl + initialFile);

        function renderLoop() {
          requestAnimationFrame(renderLoop);
          if (current) current.rotation.y += 0.005;
          renderer.render(scene, camera);
        }
        renderLoop();

        // responsive
        window.addEventListener('resize', () => {
          renderer.setSize(previewPanel.clientWidth, 160);
          camera.aspect = previewPanel.clientWidth / 160;
          camera.updateProjectionMatrix();
        });

        // clicking preview enters viewer with current selection
        previewCanvas.addEventListener('click', () => {
          const sel = localStorage.getItem('selectedModel');
          if (sel) window.location.href = `website/pages/viewer.html?model=${encodeURIComponent(sel)}`;
          else window.location.href = 'website/pages/viewer.html';
        });
      }).catch((err) => {
        console.warn('Preview initialization failed', err);
      });
  }
});
