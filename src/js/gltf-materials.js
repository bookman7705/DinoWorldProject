import * as THREE from "three";

const SRGB_TEXTURE_KEYS = [
  "map",
  "emissiveMap",
  "specularColorMap",
  "sheenColorMap",
  "attenuationColorMap"
];

const LINEAR_TEXTURE_KEYS = [
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "bumpMap",
  "displacementMap",
  "alphaMap",
  "lightMap",
  "specularIntensityMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
  "iridescenceMap",
  "iridescenceThicknessMap",
  "transmissionMap",
  "thicknessMap"
];

const PBR_MATERIAL_KEYS = [
  "name",
  "color",
  "emissive",
  "emissiveIntensity",
  "map",
  "emissiveMap",
  "normalMap",
  "normalScale",
  "roughnessMap",
  "metalnessMap",
  "metalness",
  "roughness",
  "aoMap",
  "aoMapIntensity",
  "alphaMap",
  "bumpMap",
  "bumpScale",
  "displacementMap",
  "displacementScale",
  "displacementBias",
  "lightMap",
  "lightMapIntensity",
  "transparent",
  "opacity",
  "alphaTest",
  "side",
  "depthWrite",
  "depthTest",
  "wireframe",
  "vertexColors"
];

function applyTextureColorSpaces(material) {
  for (const key of SRGB_TEXTURE_KEYS) {
    const texture = material[key];
    if (!texture) continue;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }

  for (const key of LINEAR_TEXTURE_KEYS) {
    const texture = material[key];
    if (!texture) continue;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
  }
}

function copyPbrMaps(source, target) {
  for (const key of PBR_MATERIAL_KEYS) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
}

function convertToStandardMaterial(material) {
  const standard = new THREE.MeshStandardMaterial();

  if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
    standard.copy(material);
  } else {
    copyPbrMaps(material, standard);

    if (standard.metalness === undefined || Number.isNaN(standard.metalness)) {
      standard.metalness = 0;
    }
    if (standard.roughness === undefined || Number.isNaN(standard.roughness)) {
      standard.roughness = 0.8;
    }
  }

  return standard;
}

function finalizeStandardMaterial(material) {
  material.metalness = THREE.MathUtils.clamp(material.metalness ?? 0, 0, 1);
  material.roughness = THREE.MathUtils.clamp(material.roughness ?? 0.8, 0.04, 1);

  // Without an environment map, fully metallic + smooth surfaces read as black in AR.
  if (!material.envMap && material.metalness > 0.85 && material.roughness < 0.15) {
    material.metalness = 0.5;
    material.roughness = Math.max(material.roughness, 0.45);
  }

  material.envMapIntensity = material.envMap ? material.envMapIntensity : 0;
  applyTextureColorSpaces(material);
  material.needsUpdate = true;
  return material;
}

function normalizeMeshMaterials(mesh, logs) {
  if (!mesh.material) {
    logs.meshesWithoutMaterial += 1;
    logs.missingMaterialMeshes.push(mesh.name || "(unnamed mesh)");
    mesh.material = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8, metalness: 0 });
    return;
  }

  const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const normalizedMaterials = sourceMaterials.map((material, index) => {
    if (!material) {
      logs.emptyMaterialSlots += 1;
      return new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8, metalness: 0 });
    }

    const typeName = material.type || "UnknownMaterial";
    logs.materialTypes[typeName] = (logs.materialTypes[typeName] || 0) + 1;

    const needsConversion =
      !material.isMeshStandardMaterial ||
      material.isMeshPhysicalMaterial ||
      material.isMeshBasicMaterial ||
      material.isMeshLambertMaterial ||
      material.isMeshPhongMaterial;

    let standardMaterial = material;
    if (needsConversion) {
      standardMaterial = convertToStandardMaterial(material);
      logs.convertedMaterials += 1;
      if (material !== standardMaterial) {
        material.dispose?.();
      }
    }

    finalizeStandardMaterial(standardMaterial);

    if (standardMaterial.map) {
      logs.meshesWithBaseColorMap += 1;
    } else {
      logs.meshesMissingBaseColorMap.push(mesh.name || `(unnamed mesh #${index})`);
    }

    return standardMaterial;
  });

  mesh.material = Array.isArray(mesh.material) ? normalizedMaterials : normalizedMaterials[0];
}

/**
 * Renderer settings for correct PBR GLB display in WebXR / WebGL.
 */
export function configureGltfRenderer(renderer, { exposure = 1.2 } = {}) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
}

/**
 * AR scene lighting: ambient fill + hemisphere + key + fill directional.
 * Key light casts shadows; returns handles so AR view can track the placed model.
 */
export function setupArSceneLighting(scene) {
  // Slightly higher ambient lifts shadowed areas without flattening the key/fill contrast.
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x556677, 1.0);
  scene.add(hemisphere);

  // Overhead key — updated each frame to sit directly above the placed model.
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
  keyLight.position.set(0, 10, 0);
  keyLight.castShadow = true;
  // 1024 softens shadow edges via PCF sampling; sufficient for the tight ±1.5 frustum.
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -1.5;
  keyLight.shadow.camera.right = 1.5;
  keyLight.shadow.camera.top = 1.5;
  keyLight.shadow.camera.bottom = -1.5;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 20;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;

  const keyLightTarget = new THREE.Object3D();
  keyLightTarget.position.set(0, 0, 0);
  scene.add(keyLightTarget);
  keyLight.target = keyLightTarget;
  scene.add(keyLight);

  // Fill stays non-shadow-casting; unchanged intensity preserves shape without deepening shadows.
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
  fillLight.position.set(-6, 6, -4);
  scene.add(fillLight);

  return { keyLight, keyLightTarget };
}

/**
 * Normalize GLTF mesh materials to MeshStandardMaterial with correct texture color spaces.
 */
export function configureGltfMaterials(root, { debug = false } = {}) {
  const logs = {
    meshCount: 0,
    meshesWithoutMaterial: 0,
    emptyMaterialSlots: 0,
    convertedMaterials: 0,
    meshesWithBaseColorMap: 0,
    meshesMissingBaseColorMap: [],
    missingMaterialMeshes: [],
    materialTypes: {}
  };

  root.traverse((child) => {
    if (!child.isMesh) return;
    logs.meshCount += 1;
    normalizeMeshMaterials(child, logs);
  });

  if (debug || logs.meshesWithoutMaterial > 0 || logs.meshesMissingBaseColorMap.length > 0) {
    console.group("[GLTF materials]");
    console.log("Meshes:", logs.meshCount);
    console.log("Material types:", logs.materialTypes);
    console.log("Converted to MeshStandardMaterial:", logs.convertedMaterials);
    console.log("Meshes with baseColor map:", logs.meshesWithBaseColorMap);

    if (logs.meshesWithoutMaterial > 0) {
      console.warn("Meshes without materials:", logs.missingMaterialMeshes);
    }
    if (logs.meshesMissingBaseColorMap.length > 0) {
      console.warn("Meshes missing baseColor map:", logs.meshesMissingBaseColorMap);
    }
    if (logs.emptyMaterialSlots > 0) {
      console.warn("Empty material slots replaced:", logs.emptyMaterialSlots);
    }
    console.groupEnd();
  }

  return logs;
}
