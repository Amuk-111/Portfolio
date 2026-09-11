Please place your .glb/.gltf files in this folder.

If you have models in a local source folder and want to publish them here, run this from the project root in PowerShell:

# PowerShell
Move-Item -Path .\source-models\*.glb -Destination .\gltf\
Move-Item -Path .\source-models\models.json -Destination .\gltf\

After moving, update `gltf/models.json` with entries like:
[
  { "name": "City", "file": "city.glb" }
]
