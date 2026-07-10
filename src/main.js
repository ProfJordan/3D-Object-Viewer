import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";

function initViewer() {
  const app = document.getElementById("app");
  const fileInput = document.getElementById("file-input");
  const dropZone = document.getElementById("drop-zone");
  const resetButton = document.getElementById("reset-view");
  const exportButton = document.getElementById("export-image");
  const statusEl = document.getElementById("status");
  const materialListEl = document.getElementById("material-list");
  const toggleTexturesInput = document.getElementById("toggle-textures");
  const toggleWireframeInput = document.getElementById("toggle-wireframe");

  if (!app || !fileInput || !dropZone || !resetButton || !exportButton || !statusEl) {
    console.warn("Viewer DOM is not ready yet.");
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);
  scene.fog = new THREE.Fog(0x0f172a, 5, 50);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(3, 2.5, 4);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.setClearColor(0x0f172a, 1);
  renderer.domElement.style.display = "block";
  app.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.target.set(0, 0.75, 0);
  controls.minDistance = 0.25;
  controls.maxDistance = 500;
  controls.zoomSpeed = 1.0;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xbfe3ff, 0x2f2a27, 0.8);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(4, 8, 4);
  dirLight.castShadow = true;
  scene.add(dirLight);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 64),
    new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.92,
      metalness: 0.08,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(20, 20, 0x4b5563, 0x374151);
  grid.position.y = 0.001;
  scene.add(grid);

  let currentModel = null;
  let objectUrlsToRevoke = [];

  function cleanupObject(urls) {
    for (const url of urls) {
      URL.revokeObjectURL(url);
    }
  }

  function disposeHierarchy(object) {
    object.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    });
  }

  function removeCurrentModel() {
    if (currentModel) {
      scene.remove(currentModel);
      disposeHierarchy(currentModel);
      currentModel = null;
    }
  }

  function clearScene() {
    removeCurrentModel();
    cleanupObject(objectUrlsToRevoke);
    objectUrlsToRevoke = [];
  }

  function failLoad(message, error) {
    cleanupObject(objectUrlsToRevoke);
    objectUrlsToRevoke = [];
    currentModel = null;
    statusEl.textContent = message;
    console.error(error);
  }

  function applyDisplaySettings(object) {
    object.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!material) return;
        const visible = toggleTexturesInput?.checked ?? true;
        const wireframe = toggleWireframeInput?.checked ?? false;
        material.transparent = true;
        material.depthWrite = true;
        material.wireframe = wireframe;
        if (material.isMeshStandardMaterial || material.isMeshBasicMaterial || material.isMeshPhongMaterial) {
          material.needsUpdate = true;
          if (!visible) {
            material.color.setHex(0x111827);
            material.map = null;
            material.emissiveMap = null;
            material.normalMap = null;
            material.roughnessMap = null;
          } else {
            const originalMap = material.userData?.originalMap || material.map;
            const originalEmissiveMap = material.userData?.originalEmissiveMap || material.emissiveMap;
            const originalNormalMap = material.userData?.originalNormalMap || material.normalMap;
            const originalRoughnessMap = material.userData?.originalRoughnessMap || material.roughnessMap;
            material.map = originalMap || material.map;
            material.emissiveMap = originalEmissiveMap || material.emissiveMap;
            material.normalMap = originalNormalMap || material.normalMap;
            material.roughnessMap = originalRoughnessMap || material.roughnessMap;
          }
        }
      });
    });
  }

  function updateMaterialInspector(object) {
    const entries = [];
    object.traverse((child) => {
      if (!child.isMesh) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material, index) => {
        if (!material) return;
        const textureNames = [];
        if (material.map) textureNames.push(`map: ${material.map.name || "texture"}`);
        if (material.emissiveMap) textureNames.push(`emissive: ${material.emissiveMap.name || "texture"}`);
        if (material.normalMap) textureNames.push(`normal: ${material.normalMap.name || "texture"}`);
        if (material.roughnessMap) textureNames.push(`roughness: ${material.roughnessMap.name || "texture"}`);

        const label = `${child.name || "Mesh"}${materials.length > 1 ? ` (${index + 1})` : ""}`;
        entries.push({
          label,
          textureNames: textureNames.length ? textureNames : ["No textures detected"],
        });
      });
    });

    if (!entries.length) {
      materialListEl.innerHTML = "No mesh materials found.";
      return;
    }

    materialListEl.innerHTML = entries
      .map(
        (entry) => `
          <div class="material-item">
            <strong>${entry.label}</strong>
            ${entry.textureNames.map((texture) => `<div>${texture}</div>`).join("")}
          </div>
        `,
      )
      .join("");
  }

  function onModelLoaded(object, label) {
    removeCurrentModel();
    object.rotation.set(0, 0, 0);
    object.position.set(0, 0, 0);
    object.scale.set(1, 1, 1);

    let texturedMeshCount = 0;
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          const hasTexture = materials.some(
            (material) => material.map || material.emissiveMap || material.normalMap || material.roughnessMap,
          );
          if (hasTexture) texturedMeshCount += 1;
        }
      }
    });

    object.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!material) return;
        material.userData.originalMap = material.map ?? null;
        material.userData.originalEmissiveMap = material.emissiveMap ?? null;
        material.userData.originalNormalMap = material.normalMap ?? null;
        material.userData.originalRoughnessMap = material.roughnessMap ?? null;
      });
    });

    scene.add(object);
    currentModel = object;
    applyDisplaySettings(object);
    updateMaterialInspector(object);
    statusEl.textContent = `Loaded ${label}${texturedMeshCount ? ` • ${texturedMeshCount} textured mesh${texturedMeshCount > 1 ? "es" : ""}` : " • no textures detected"}`;
    fitCameraToObject(object);
  }

  function fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    box.getCenter(center);

    object.position.set(-center.x, -center.y, -center.z);
    object.updateMatrixWorld(true);

    const updatedBox = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    updatedBox.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = camera.fov * (Math.PI / 180);
    let distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.35;

    if (distance < 2) distance = 2;
    if (distance > 80) distance = 80;
    camera.position.set(distance, distance * 0.6, distance);
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
    controls.update();
  }

  function createAssetUrlMap(files) {
    const map = new Map();
    for (const file of files) {
      const relativePath = (file.webkitRelativePath || file.name)
        .replace(/\\/g, "/")
        .replace(/^\.\//, "");
      const normalizedPath = relativePath.toLowerCase();
      const basename = normalizedPath.split("/").pop();
      const objectUrl = URL.createObjectURL(file);

      map.set(normalizedPath, objectUrl);
      map.set(relativePath.toLowerCase(), objectUrl);
      map.set(file.name.toLowerCase(), objectUrl);
      map.set(basename, objectUrl);
      
      // Also map without extension for texture fallback
      const withoutExt = basename.replace(/\.[^.]+$/, '').toLowerCase();
      if (withoutExt) {
        map.set(withoutExt, objectUrl);
      }
    }
    return map;
  }

  function createLoadingManager(assetMap) {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => resolveAssetUrl(url, assetMap));
    manager.addHandler(/\.tga$/i, new TGALoader(manager));
    return manager;
  }

  function resolveAssetUrl(value, assetMap) {
    if (typeof value !== "string") return value;
    
    // Don't try to resolve blob URLs - they're already resolved
    if (value.startsWith("blob:")) {
      return value;
    }

    // First try the exact path
    let normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
    let direct = assetMap.get(normalized);
    if (direct) return direct;

    // If it's a .tga file, try to find .png or .jpg alternatives first
    if (normalized.endsWith('.tga')) {
      const baseName = normalized.replace(/\.tga$/i, '');
      const extensions = ['.png', '.jpg', '.jpeg'];
      for (const ext of extensions) {
        const altPath = baseName + ext;
        const altResolved = assetMap.get(altPath);
        if (altResolved) return altResolved;
      }
      // If no alternatives found, try to load the TGA
      direct = assetMap.get(normalized);
      if (direct) return direct;
    }

    // Try just the basename
    const basename = normalized.split("/").pop();
    const basenameResolved = assetMap.get(basename);
    if (basenameResolved) return basenameResolved;

    // If still not found and it's not a .tga, try alternative extensions
    if (!normalized.endsWith('.tga')) {
      const baseName = normalized.replace(/\.[^.]+$/, '');
      const extensions = ['.png', '.jpg', '.jpeg', '.tga'];
      for (const ext of extensions) {
        const altPath = baseName + ext;
        const altResolved = assetMap.get(altPath);
        if (altResolved) return altResolved;
      }
    }

    return value;
  }

  function replaceUriValues(value, assetMap) {
    if (Array.isArray(value)) {
      return value.map((entry) => replaceUriValues(entry, assetMap));
    }

    if (value && typeof value === "object") {
      const cloned = {};
      for (const [key, childValue] of Object.entries(value)) {
        if (key === "uri" && typeof childValue === "string") {
          cloned[key] = resolveAssetUrl(childValue, assetMap);
        } else {
          cloned[key] = replaceUriValues(childValue, assetMap);
        }
      }
      return cloned;
    }

    return value;
  }

  function resolveTextureReference(value, assetMap) {
    let resolved = resolveAssetUrl(value, assetMap);

    if (resolved !== value) {
      return resolved;
    }

    const baseName = value.replace(/\.[^.]+$/, "").toLowerCase();
    const extensions = [".png", ".jpg", ".jpeg", ".tga"];

    for (const ext of extensions) {
      const withExt = baseName + ext;
      const fallback = resolveAssetUrl(withExt, assetMap);
      if (fallback !== withExt) {
        return fallback;
      }
    }

    return value;
  }

  function rewriteMtlTextureLine(line, assetMap) {
    const match = line.match(/^(\s*(?:map_Kd|map_Ka|map_bump|bump|map_Ns|map_d|disp)\s+)(.+)$/i);
    if (!match) return line;

    const [, prefix, value] = match;
    const parts = value.trim().split(/\s+/);
    const texturePath = parts.pop();

    if (!texturePath) {
      return line;
    }

    const options = parts.length ? `${parts.join(" ")} ` : "";
    return `${prefix}${options}${resolveTextureReference(texturePath, assetMap)}`;
  }

  async function loadGLTF(files) {
    const gltfFile = files.find((file) => file.name.toLowerCase().endsWith(".gltf"));
    const glbFile = files.find((file) => file.name.toLowerCase().endsWith(".glb"));
    const selectedFile = gltfFile ?? glbFile;

    if (!selectedFile) {
      statusEl.textContent = "Please upload a .gltf or .glb model.";
      return;
    }

    if (selectedFile.name.toLowerCase().endsWith(".glb")) {
      const url = URL.createObjectURL(selectedFile);
      objectUrlsToRevoke.push(url);
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          onModelLoaded(gltf.scene, selectedFile.name);
        },
        undefined,
        (error) => {
          failLoad(
            `Failed to load ${selectedFile.name}: ${error.message}. Try uploading the model with its .bin and texture files, or choose a folder.`,
            error,
          );
        },
      );
      return;
    }

    // For .gltf files, load and rewrite the JSON with resolved asset URIs
    const assetMap = createAssetUrlMap(files);
    const text = await selectedFile.text();
    const parsed = JSON.parse(text);

    const missingAssets = [];
    const gatherUris = (value) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => gatherUris(entry));
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, childValue] of Object.entries(value)) {
          if (key === "uri" && typeof childValue === "string") {
            if (childValue.startsWith("data:") || childValue.startsWith("blob:")) {
              continue;
            }
            const resolved = resolveAssetUrl(childValue, assetMap);
            if (resolved === childValue) {
              missingAssets.push(childValue);
            }
            continue;
          }
          gatherUris(childValue);
        }
      }
    };
    gatherUris(parsed);

    if (missingAssets.length) {
      const uniqueAssets = Array.from(new Set(missingAssets));
      statusEl.textContent = `Missing referenced assets: ${uniqueAssets.join(", ")}. Upload the .bin and texture files alongside your .gltf file or choose the containing folder.`;
      console.warn("Missing GLTF asset references:", uniqueAssets);
      cleanupObject(Array.from(assetMap.values()));
      return;
    }

    const rewritten = replaceUriValues(parsed, assetMap);
    const rewrittenText = JSON.stringify(rewritten);
    const rewrittenUrl = URL.createObjectURL(
      new Blob([rewrittenText], { type: "application/json" }),
    );

    const allAssetUrls = Array.from(new Set(assetMap.values()));
    objectUrlsToRevoke.push(rewrittenUrl, ...allAssetUrls);

    const loader = new GLTFLoader(createLoadingManager(assetMap));
    loader.setPath("");

    loader.load(
      rewrittenUrl,
      (gltf) => {
        onModelLoaded(gltf.scene, selectedFile.name);
      },
      undefined,
      (error) => {
        failLoad(
          `Failed to load ${selectedFile.name}: ${error.message}. Try uploading the model with its .bin and texture files, or choose a folder.`,
          error,
        );
      },
    );
  }

  async function loadOBJ(files) {
    const objFile = files.find((file) => file.name.toLowerCase().endsWith(".obj"));
    if (!objFile) {
      statusEl.textContent = "Please upload an .obj file.";
      return;
    }

    const assetMap = createAssetUrlMap(files);
    const objText = await objFile.text();
    const mtlFile = files.find((file) => file.name.toLowerCase().endsWith(".mtl"));

    const objUrl = URL.createObjectURL(new Blob([objText], { type: "text/plain" }));
    objectUrlsToRevoke.push(objUrl);

    if (mtlFile) {
      const mtlText = await mtlFile.text();

      const rewrittenMtlText = mtlText
        .replace(/\\/g, "/")
        .split("\n")
        .map((line) => rewriteMtlTextureLine(line, assetMap))
        .join("\n");

      const mtlUrl = URL.createObjectURL(new Blob([rewrittenMtlText], { type: "text/plain" }));
      objectUrlsToRevoke.push(mtlUrl);

      const rewrittenObjText = objText.replace(/mtllib\s+([^\s]+)/i, `mtllib ${mtlUrl}`);
      const rewrittenObjUrl = URL.createObjectURL(new Blob([rewrittenObjText], { type: "text/plain" }));
      objectUrlsToRevoke.push(rewrittenObjUrl);

      const loadingManager = createLoadingManager(assetMap);
      const mtlLoader = new MTLLoader(loadingManager);
      mtlLoader.load(
        mtlUrl,
        (materials) => {
          materials.preload();
          const objLoader = new OBJLoader(loadingManager);
          objLoader.setMaterials(materials);
          objLoader.load(
            rewrittenObjUrl,
            (object) => {
              onModelLoaded(object, objFile.name);
            },
            undefined,
            (error) => {
              failLoad(`Failed to load ${objFile.name}: ${error.message}`, error);
            },
          );
        },
        undefined,
        (error) => {
          failLoad(`Failed to load materials for ${objFile.name}: ${error.message}`, error);
        },
      );
      return;
    }

    const objLoader = new OBJLoader();
    objLoader.load(
      objUrl,
      (object) => {
        onModelLoaded(object, objFile.name);
      },
      undefined,
      (error) => {
        failLoad(`Failed to load ${objFile.name}: ${error.message}`, error);
      },
    );
  }

  async function loadFBX(file) {
    const url = URL.createObjectURL(file);
    objectUrlsToRevoke.push(url);
    const loader = new FBXLoader();
    loader.load(
      url,
      (object) => {
        onModelLoaded(object, file.name);
      },
      undefined,
      (error) => {
        failLoad(`Failed to load ${file.name}: ${error.message}`, error);
      },
    );
  }

  function readDirectoryEntry(entry) {
    return new Promise((resolve, reject) => {
      const reader = entry.createReader();
      const collected = [];

      const readEntries = () => {
        reader.readEntries((entries) => {
          if (!entries.length) {
            resolve(collected);
            return;
          }

          Promise.all(
            entries.map((childEntry) => {
              if (childEntry.isDirectory) {
                return readDirectoryEntry(childEntry);
              }

              if (childEntry.isFile) {
                return new Promise((resolveFile, rejectFile) => {
                  childEntry.file((file) => resolveFile(file), rejectFile);
                }).then((file) => {
                  if (file) collected.push(file);
                });
              }

              return Promise.resolve();
            }),
          )
            .then(() => readEntries())
            .catch(reject);
        }, reject);
      };

      readEntries();
    });
  }

  async function collectFilesFromDataTransfer(dataTransfer) {
    const files = [];
    const items = Array.from(dataTransfer?.items || []);

    for (const item of items) {
      if (item.kind !== "file") continue;

      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        const nestedFiles = await readDirectoryEntry(entry);
        files.push(...nestedFiles);
        continue;
      }

      const file = item.getAsFile();
      if (file) files.push(file);
    }

    return files;
  }

  function handleFiles(files) {
    const fileArray = Array.from(files || []);
    if (!fileArray.length) return;

    const hasGLTF = fileArray.some((file) => /\.(gltf|glb)$/i.test(file.name));
    const hasOBJ = fileArray.some((file) => /\.obj$/i.test(file.name));
    const hasFBX = fileArray.some((file) => /\.fbx$/i.test(file.name));

    statusEl.textContent = "Loading model…";
    clearScene();

    if (hasGLTF) {
      loadGLTF(fileArray);
    } else if (hasOBJ) {
      loadOBJ(fileArray);
    } else if (hasFBX) {
      const fbx = fileArray.find((file) => file.name.toLowerCase().endsWith(".fbx"));
      loadFBX(fbx);
    } else {
      statusEl.textContent = "Unsupported format. Try GLTF/GLB, OBJ/MTL, or FBX.";
    }
  }

  async function onDrop(event) {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    const files = await collectFilesFromDataTransfer(event.dataTransfer);
    handleFiles(files);
  }

  dropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", onDrop);

  fileInput.addEventListener("change", (event) => {
    handleFiles(event.target.files);
    event.target.value = "";
  });

  resetButton.addEventListener("click", () => {
    if (currentModel) {
      fitCameraToObject(currentModel);
    }
  });

  exportButton.addEventListener("click", () => {
    if (!renderer.domElement) return;

    const link = document.createElement("a");
    link.download = `${currentModel?.name || "model"}.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
    statusEl.textContent = "Exported current view to PNG.";
  });

  [toggleTexturesInput, toggleWireframeInput].forEach((input) => {
    input?.addEventListener("change", () => {
      if (currentModel) {
        applyDisplaySettings(currentModel);
        updateMaterialInspector(currentModel);
      }
    });
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();
  statusEl.textContent = "Ready — drop a model or choose a file.";
  window.__viewer = { scene, camera, controls };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initViewer, { once: true });
} else {
  initViewer();
}
