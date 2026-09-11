# Thomas Secret Garden

Personal portfolio and interactive 3D showcase for Thomas Logé.

## Project layout

```text
.
├── index.html        # Portfolio homepage
├── css/              # Shared page styles
├── js/               # Homepage and viewer modules
├── pages/            # Secondary pages, including the 3D viewer
└── gltf/             # Published .glb/.gltf models and model metadata
├── assets/           # Blender source assets and downloaded materials
├── portfoliopic/     # Portfolio imagery
└── *.blend           # Working Blender scene files
```

## Website development

The website is intentionally dependency-light. Three.js is vendored in
`js/libs/`, so the static site can be opened or hosted without a
package install.

Because the homepage uses ES modules and fetches `gltf/models.json`, use a
local static server during development:

```powershell
python -m http.server 8765 --directory .
```

Then open <http://127.0.0.1:8765>.

The 3D viewer can also load a local `.glb` or `.gltf` file through its
fallback upload control.

## Adding a model

1. Add the published `.glb` or `.gltf` file to `gltf/`.
2. Add an entry to `gltf/models.json`:

   ```json
   [
     { "name": "City", "file": "city.glb" }
   ]
   ```

3. Select the model from the homepage and open the 3D viewer.

## Conventions

- Keep homepage presentation in `index.html` and `css/styles.css`.
- Keep homepage behavior in `js/home.js`.
- Keep viewer behavior in `js/viewer.js`.
- Keep source `.blend` files outside the repository root; only publish optimized
  viewer assets into `gltf/`.
- Do not commit generated archives, Blender backup files, or local tooling
  caches.
