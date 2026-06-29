import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinnedScene } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/utils/SkeletonUtils.js";
import { resolveModelUrl } from "../resolve-model-url.js";
import { configureGltfMaterials } from "../gltf-materials.js";
import { playModelAnimation } from "../gltf-animations.js";

const ROCK_MODEL = "rock.glb";
const SEAWEED_MODEL = "sea_weed.glb";
const SEAWEED_BASE_SCALE = 2.2;

function textureUrl(name) {
  return resolveModelUrl(name);
}

export async function createUnderwaterEnvironment(scene) {
  const textureLoader = new THREE.TextureLoader();
  const optionalTextures = await loadOptionalTextures(textureLoader);

  addLighting(scene);
  const floor = createSeaFloor(optionalTextures.sandDiffuse, optionalTextures.sandNormal);
  scene.add(floor.mesh);

  const foliage = await createSeaweedForest();
  scene.add(foliage.group);

  const rocks = await createRocks();
  scene.add(rocks);

  const bubbles = createBubbles(optionalTextures.bubble);
  scene.add(bubbles.points);

  const caustics = createCausticsOverlay(optionalTextures.caustics);
  scene.add(caustics);

  const lightRays = createVolumetricLightRays();
  scene.add(lightRays);

  return {
    mixers: foliage.mixers,
    update(elapsed, delta) {
      floor.update(elapsed);
      for (const mixer of foliage.mixers) {
        mixer.update(delta);
      }
      updateBubbles(bubbles, delta);
      caustics.material.uniforms.uTime.value = elapsed;
      lightRays.rotation.y = elapsed * 0.02;
    },
  };
}

async function loadOptionalTextures(loader) {
  const load = (name) =>
    new Promise((resolve) => {
      loader.load(
        textureUrl(name),
        (tex) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.colorSpace = name.includes("normal") ? THREE.NoColorSpace : THREE.SRGBColorSpace;
          resolve(tex);
        },
        undefined,
        () => resolve(null)
      );
    });

  const [caustics, sandDiffuse, sandNormal, bubble] = await Promise.all([
    load("caustics.jpg"),
    load("sand_diffuse.jpg"),
    load("sand_normal.jpg"),
    load("bubble.png"),
  ]);

  return { caustics, sandDiffuse, sandNormal, bubble };
}

function addLighting(scene) {
  scene.add(new THREE.AmbientLight(0x5a9ec8, 0.85));

  const sun = new THREE.DirectionalLight(0xc8f4ff, 4.5);
  sun.position.set(8, 18, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 50;
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const surfaceBeam = new THREE.DirectionalLight(0xe8f8ff, 3.2);
  surfaceBeam.position.set(-4, 22, -2);
  scene.add(surfaceBeam);

  const fill = new THREE.PointLight(0x60a8e0, 1.1, 40);
  fill.position.set(-6, 4, -4);
  scene.add(fill);

  const rim = new THREE.PointLight(0x80d0ff, 0.75, 35);
  rim.position.set(5, 2, -8);
  scene.add(rim);

  scene.add(new THREE.HemisphereLight(0x88ccee, 0x1a3048, 0.75));
}

function createSeaFloor(sandDiffuse, sandNormal) {
  const geometry = new THREE.CircleGeometry(28, 64);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: sandDiffuse ? 0xffffff : 0x5a6848,
    map: sandDiffuse ?? null,
    normalMap: sandNormal ?? null,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.92,
    metalness: 0.02,
  });

  if (sandDiffuse) sandDiffuse.repeat.set(8, 8);
  if (sandNormal) sandNormal.repeat.set(8, 8);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.position.y = -0.05;

  return {
    mesh,
    update(elapsed) {
      if (sandDiffuse) {
        sandDiffuse.offset.x = elapsed * 0.002;
        sandDiffuse.offset.y = elapsed * 0.001;
      }
    },
  };
}

async function createSeaweedForest() {
  const gltf = await new GLTFLoader().loadAsync(resolveModelUrl(SEAWEED_MODEL));
  const template = gltf.scene;
  configureGltfMaterials(template);

  template.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(template);
  const size = bounds.getSize(new THREE.Vector3());
  const unitScale = 1 / Math.max(size.x, size.y, size.z);

  const group = new THREE.Group();
  const mixers = [];
  const positions = [
    [-6, 0, -4],
    [5, 0, -5],
    [-7, 0, 3],
    [6, 0, 4],
    [-4, 0, 6],
    [4, 0, -3],
    [-5, 0, -7],
    [7, 0, 2],
  ];

  for (const [x, , z] of positions) {
    const weed = cloneSkinnedScene(template);
    const randomScale = SEAWEED_BASE_SCALE * (0.75 + Math.random() * 0.5);
    weed.scale.setScalar(unitScale * randomScale);
    weed.rotation.y = Math.random() * Math.PI * 2;
    weed.rotation.z = (Math.random() - 0.5) * 0.15;

    weed.updateMatrixWorld(true);
    const weedBounds = new THREE.Box3().setFromObject(weed);
    weed.position.set(x, -weedBounds.min.y, z);

    weed.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
      }
    });

    group.add(weed);

    if (gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(weed);
      playModelAnimation(mixer, gltf.animations, "Sway");
      mixers.push(mixer);
    }
  }

  return { group, mixers };
}

async function createRocks() {
  const gltf = await new GLTFLoader().loadAsync(resolveModelUrl(ROCK_MODEL));
  const template = gltf.scene;
  configureGltfMaterials(template);

  template.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(template);
  const size = bounds.getSize(new THREE.Vector3());
  const baseScale = 2 / Math.max(size.x, size.y, size.z);

  const group = new THREE.Group();
  const spots = [
    [-4, 0, 1, 0.8], [3, 0, 2, 1.1], [-2, 0, -4, 0.6],
    [5, 0, -1, 0.9], [-6, 0, -2, 1.3], [1, 0, 5, 0.7],
  ];

  for (const [x, y, z, s] of spots) {
    const rock = template.clone(true);
    rock.scale.setScalar(baseScale * s);
    rock.position.set(x, y + s * 0.2, z);
    rock.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    rock.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    group.add(rock);
  }

  return group;
}

function createBubbles(bubbleTexture) {
  const count = 180;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 1] = Math.random() * 12;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
    speeds[i] = 0.3 + Math.random() * 0.8;
    offsets[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xaaddff,
    size: bubbleTexture ? 0.35 : 0.12,
    map: bubbleTexture,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  return {
    points: new THREE.Points(geometry, material),
    speeds,
    offsets,
    count,
  };
}

function updateBubbles(bubbles, delta) {
  const positions = bubbles.points.geometry.attributes.position.array;

  for (let i = 0; i < bubbles.count; i++) {
    const i3 = i * 3;
    positions[i3 + 1] += bubbles.speeds[i] * delta;
    positions[i3] += Math.sin(bubbles.offsets[i] + positions[i3 + 1]) * delta * 0.15;

    if (positions[i3 + 1] > 14) {
      positions[i3 + 1] = 0;
      positions[i3] = (Math.random() - 0.5) * 18;
      positions[i3 + 2] = (Math.random() - 0.5) * 18;
    }
  }

  bubbles.points.geometry.attributes.position.needsUpdate = true;
}

function createCausticsOverlay(causticsTexture) {
  const geometry = new THREE.PlaneGeometry(40, 40);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uCaustics: { value: causticsTexture },
      uHasTexture: { value: causticsTexture ? 1 : 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D uCaustics;
      uniform float uHasTexture;
      varying vec2 vUv;

      float proceduralCaustics(vec2 uv) {
        vec2 p = uv * 6.0 + uTime * 0.08;
        float c = sin(p.x * 3.1 + sin(p.y * 2.7)) * sin(p.y * 2.9 + sin(p.x * 3.3));
        c += sin(p.x * 5.0 - uTime * 0.12) * sin(p.y * 4.5 + uTime * 0.1) * 0.5;
        return smoothstep(0.1, 0.85, c * 0.5 + 0.5);
      }

      void main() {
        float caustic;
        if (uHasTexture > 0.5) {
          vec2 uv1 = vUv * 4.0 + vec2(uTime * 0.03, uTime * 0.02);
          vec2 uv2 = vUv * 4.0 - vec2(uTime * 0.025, uTime * 0.035);
          caustic = texture2D(uCaustics, uv1).r * texture2D(uCaustics, uv2).r;
        } else {
          caustic = proceduralCaustics(vUv);
        }
        gl_FragColor = vec4(0.55, 0.92, 1.0, caustic * 0.28);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.02;
  mesh.renderOrder = 1;

  return mesh;
}

function createVolumetricLightRays() {
  const group = new THREE.Group();
  const rayMaterial = new THREE.MeshBasicMaterial({
    color: 0x6ecfff,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  for (let i = 0; i < 6; i++) {
    const ray = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 22),
      rayMaterial.clone()
    );
    const angle = (i / 6) * Math.PI * 2;
    ray.position.set(Math.cos(angle) * 2, 11, Math.sin(angle) * 2);
    ray.rotation.y = angle;
    ray.rotation.x = -0.15;
    group.add(ray);
  }

  return group;
}
