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
    defaultScale: 0.25,
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
  pterosaur: {
    id: "pterosaur",
    label: "Pterosaur",
    description: "Flying reptile model for AR placement tests.",
    modelFile: "Pterosaur.glb",
    iosFile: "Pterosaur.usdz",
    defaultScale: 0.1,
    animation: "All Animations",
    view3d: {
      position: [0, 0, 0],
      scale: [4, 4, 4],
      rotation: [0, -Math.PI / 2, 0],
      description:
        "This model represents a pterosaur, a group of flying reptiles that lived alongside dinosaurs. It is inspired by well-known pterosaurs such as Pteranodon but does not depict a specific species.",
      camera: {
        target: [0, 5, 0],
        initialPosition: [-15, 1.5, 0],
        minDistance: 7,
        maxDistance: 18,
        minPitch: 0.2,
        maxPitch: 1.9
      }
    }
  },
  anky: {
    id: "anky",
    label: "Ankylosaurus",
    description: "Armored herbivore model for AR and 3D view placement tests.",
    modelFile: "Ankylosaurus.glb",
    iosFile: "Ankylosaurus.usdz",
    defaultScale: 0.5,
    view3d: {
      position: [0, 0, 0],
      scale: [1.5, 1.5, 1.5],
      rotation: [0, -Math.PI / 4, 0],
      camera: {
        target: [0, 2, 0],
        initialPosition: [-15, 0, 0],
        minDistance: 7,
        maxDistance: 18,
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
    defaultScale: 0.25,
    animation: "Idle_01",
    view3d: {
      position: [0, 0, 0],
      scale: [9, 9, 9],
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
  brachiosaur: {
    id: "brachiosaur",
    label: "Brachiosaurus",
    description: "Long-necked sauropod model for AR and 3D view placement tests.",
    modelFile: "Brachiosaur.glb",
    iosFile: "Brachiosaur.usdz",
    defaultScale: 0.25,
    view3d: {
      position: [0, 0, 0],
      scale: [3, 3, 3],
      rotation: [0, -Math.PI / 2, 0],
      camera: {
        target: [0, 4, 0],
        initialPosition: [-18, 8, 0],
        minDistance: 10,
        maxDistance: 24,
        minPitch: 0.2,
        maxPitch: Math.PI / 2 - 0.1
      }
    }
  },
  spinosaurus: {
    id: "spinosaurus",
    label: "Spinosaurus",
    description: "Large sail-backed predator model for AR and 3D view placement tests.",
    modelFile: "Spinosaurus.glb",
    iosFile: "Spinosaurus.usdz",
    defaultScale: 0.25,
    view3d: {
      position: [0, 0, 0],
      scale: [6, 6, 6],
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
  triceratop: {
    id: "triceratop",
    label: "Triceratops",
    description: "Three-horned herbivore model for AR and 3D view placement tests.",
    modelFile: "Triceratop.glb",
    iosFile: "Triceratop.usdz",
    defaultScale: 0.25,
    view3d: {
      position: [0, 0, 0],
      scale: [4, 4, 4],
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
  allosaurus: {
    id: "allosaurus",
    label: "Allosaurus",
    description: "Large theropod predator model for AR and 3D view placement tests.",
    modelFile: "Allosaurus.glb",
    iosFile: "Allosaurus.usdz",
    defaultScale: 0.25,
    view3d: {
      position: [0, 0, 0],
      scale: [5, 5, 5],
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
  }
};

export function getModelFromQuery(search) {
  const params = new URLSearchParams(search);
  const id = (params.get("id") || "").trim().toLowerCase();
  const entry = MODEL_REGISTRY[id];

  return {
    id,
    entry,
    hasValidId: Boolean(entry)
  };
}

export function getAvailableModels() {
  return Object.values(MODEL_REGISTRY);
}
