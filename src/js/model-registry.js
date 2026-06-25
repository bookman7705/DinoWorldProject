/**
 * Single source of truth for live app models (index, ar.html, ar-ios.html, view-3d.html).
 * Remote .glb / .usdz files are loaded via Cloudflare signed URLs (see asset-urls.js).
 * dinoworld_example.html and image_tracking_example.html are reference-only.
 */

/** Cloudflare R2 filename (ar-models/ prefix applied at load time). */
export const ISLAND_WORLD_FILE = "IslandWorld_v2.glb";

export const MODEL_REGISTRY = {
  rex: {
    id: "rex",
    label: "Tyrannosaurus Rex",
    description: "Large ground predator model for AR placement tests.",
    modelFile: "rex.glb",
    iosFile: "rex.usdz",
    defaultScale: 1.0,
    //animation: "Idle_01",
    view3d: {
      position: [0, -0, -0],
      scale: [5, 5, 5],
      rotation: [0, -Math.PI / 2, 0],
      camera: {
        target: [0, 2.5, 0],
        initialPosition: [-15, 5, 0],
        minDistance: 7,
        maxDistance: 18,
        minPitch: 0.2,
        maxPitch: Math.PI / 2 - 0.1
      },
      lighting: {
        //ambientIntensity: 0.85,
        //hemisphereIntensity: 1.7
      }
    }
  },
  mosa: {
    id: "MOSA",
    label: "Mosasaurus",
    description: "Large marine reptile model for AR and 3D view placement tests.",
    modelFile: "mosasaurus.glb",
    iosFile: "mosasaurus.usdz",
    defaultScale: 1.0,
    view3d: {
      position: [0, 2, 0],
      scale: [10, 10, 10],
      rotation: [0, -Math.PI / 2, 0],
      camera: {
        target: [0, 3, 0],
        initialPosition: [-15, 5, 0],
        minDistance: 7,
        maxDistance: 20,
        minPitch: 0.2,
        maxPitch: Math.PI / 2 - 0.1
      }
    }
  },
  raptor: {
    id: "raptor",
    label: "Velociraptor",
    description: "Fast predator model for AR and 3D view placement tests.",
    modelFile: "raptor.glb",
    iosFile: "raptor.usdz",
    defaultScale: 1.0,
    animation: "Idle_01",
    view3d: {
      position: [0, 0, 0],
      scale: [3, 3, 3],
      rotation: [0, -Math.PI / 2, 0],
      camera: {
        target: [0, 2.5, 0],
        initialPosition: [-15, 5, 0],
        minDistance: 7,
        maxDistance: 18,
        minPitch: 0.2,
        maxPitch: Math.PI / 2 - 0.1
      }
    }
  },
  bron: {
    id: "BRON",
    label: "Brontosaurus",
    description: "Long-necked sauropod model for AR and 3D view placement tests.",
    modelFile: "brontosaurus.glb",
    iosFile: "brontosaurus.usdz",
    defaultScale: 1.0,
    view3d: {
      position: [0, 0.25, 0],
      scale: [15, 15, 15],
      rotation: [0, -Math.PI / 2, 0],
      camera: {
        target: [0, 2.5, 0],
        initialPosition: [-15, 5, 0],
        minDistance: 7,
        maxDistance: 18,
        minPitch: 0.2,
        maxPitch: 1.75 // about 110°
      }
    }
  },
  tric: {
    id: "TRIC",
    label: "Triceratops",
    description: "Three-horned herbivore model for AR and 3D view placement tests.",
    modelFile: "Triceratop.glb",
    iosFile: "Triceratop.usdz",
    defaultScale: 1.0,
    view3d: {
      position: [0, 0, 0],
      scale: [15, 15, 15],
      rotation: [0, -Math.PI / 2, 0],
      camera: {
        target: [0, 2, 0],
        initialPosition: [-15, 3, 0],
        minDistance: 7,
        maxDistance: 18,
        minPitch: 0.2,
        maxPitch: Math.PI / 2 - 0.1
      }
    }
  },
  pach: {
    id: "PACH",
    label: "Pachycephalosaurus",
    description: "Dome-headed herbivore model for AR and 3D view placement tests.",
    modelFile: "pachycephalasaurus.glb",
    iosFile: "pachycephalasaurus.usdz",
    defaultScale: 1.0,
    view3d: {
      position: [0, 0, 0],
      scale: [6, 6, 6],
      rotation: [0, -Math.PI / 2, 0],
      camera: {
        target: [0, 2, 0],
        initialPosition: [-15, 3, 0],
        minDistance: 7,
        maxDistance: 18,
        minPitch: 0.2,
        maxPitch: Math.PI / 2 - 0.1
      }
    }
  },
  stega: {
    id: "STEGA",
    label: "Stegosaurus",
    description: "Plated herbivore model for AR and 3D view placement tests.",
    modelFile: "stegasaurus.glb",
    iosFile: "stegasaurus.usdz",
    defaultScale: 1.0,
    view3d: {
      position: [0, 0, 0],
      scale: [18, 18, 18],
      rotation: [0, -Math.PI / 2, 0],
      camera: {
        target: [0, 2.5, 0],
        initialPosition: [-15, 5, 0],
        minDistance: 7,
        maxDistance: 18,
        minPitch: 0.2,
        maxPitch: Math.PI / 2 - 0.1
      }
    }
  },
  styg: {
    id: "STYG",
    label: "Stygimoloch",
    description: "Small dome-headed herbivore model for AR and 3D view placement tests.",
    modelFile: "stygimoloch.glb",
    iosFile: "stygimoloch.usdz",
    defaultScale: 1.0,
    view3d: {
      position: [0, 0, 0],
      scale: [8, 8, 8],
      rotation: [0, -Math.PI / 2, 0],
      camera: {
        target: [0, 1.5, 0],
        initialPosition: [-12, 2, 0],
        minDistance: 5,
        maxDistance: 14,
        minPitch: 0.2,
        maxPitch: Math.PI / 2 - 0.1
      }
    }
  }
};

export function getRegistryEntry(id) {
  if (id == null) {
    return null;
  }

  const normalizedId = String(id).trim().toLowerCase();
  if (!normalizedId) {
    return null;
  }

  return MODEL_REGISTRY[normalizedId] ?? null;
}

export function getModelFromQuery(search) {
  const params = new URLSearchParams(search);
  const id = (params.get("id") || "").trim().toLowerCase();
  const entry = getRegistryEntry(id);

  return {
    id,
    entry,
    hasValidId: Boolean(entry)
  };
}

export function getModelFileForId(id) {
  const entry = getRegistryEntry(id);
  if (!entry?.modelFile) {
    return null;
  }
  return entry.modelFile;
}

export function getAvailableModels() {
  return Object.values(MODEL_REGISTRY);
}
