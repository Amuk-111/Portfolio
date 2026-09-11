Please place your .glb/.gltf files in this folder.

If you have models in the project root `gltf/` folder and want to move them here, run this from the project root in PowerShell or bash:

# PowerShell
Move-Item -Path .\gltf\*.glb -Destination .\website\gltf\
Move-Item -Path .\gltf\models.json -Destination .\website\gltf\

# bash
mv gltf/*.glb website/gltf/
mv gltf/models.json website/gltf/

After moving, update `website/gltf/models.json` with entries like:
[
  { "name": "City", "file": "city.glb" }
]
