# Website

The website is a static portfolio with:

- A responsive portfolio homepage.
- An interactive Three.js headline.
- A model selector backed by `gltf/models.json`.
- A first-person 3D viewer at `pages/viewer.html`.

The shared page styling lives in `css/styles.css`. Homepage behavior is in
`js/home.js`; viewer behavior remains isolated in `js/viewer.js`.

Run it from the repository root with:

```powershell
python -m http.server 8765 --directory .\website
```
