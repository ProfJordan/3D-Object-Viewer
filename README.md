# 3D Object Viewer

A lightweight local browser-based 3D model viewer built with Three.js and Vite.

## Features
- Drag and drop local 3D files into the browser
- Supports GLTF/GLB, OBJ/MTL, and FBX models
- Applies embedded or externally referenced textures when available
- Orbit controls, reset view, and lighting helpers

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite (usually http://localhost:5173/).

## Notes
- For the best experience, use GLB or GLTF files with embedded textures.
- OBJ/MTL uploads should include the related texture files in the same batch.
- A future enhancement could add rigged character animation support with a free animation pipeline such as Mixamo.
