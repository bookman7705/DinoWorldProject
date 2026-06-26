import * as THREE from "three";
import { clone as cloneSkinnedScene } from "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/utils/SkeletonUtils.js";

const SILHOUETTE_RESOLUTION = 256;
const BLACK_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x000000,
  side: THREE.DoubleSide
});

/**
 * Soft contact shadow that follows the model, sized to its footprint and
 * shaped from a top-down silhouette bake (similar to model-viewer grounding).
 *
 * @param {THREE.Object3D} model
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.Group}
 */
export function createContactShadow(model, renderer) {
  const bounds = computeModelBounds(model);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);

  const texture = bakeFootprintTexture(model, bounds, renderer);
  const material = createSoftShadowMaterial(texture);

  const group = new THREE.Group();
  group.name = "contact-shadow";
  group.renderOrder = 1;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(size.x * 1.08, 0.05), Math.max(size.z * 1.08, 0.05), 1, 1),
    material
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(center.x, bounds.min.y + Math.max(size.y * 0.01, 0.015), center.z);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  group.add(mesh);

  return group;
}

function computeModelBounds(model) {
  const bounds = new THREE.Box3();
  const tmp = new THREE.Box3();
  const modelInverse = new THREE.Matrix4();

  model.updateMatrixWorld(true);
  modelInverse.copy(model.matrixWorld).invert();

  model.traverse((child) => {
    if (!child.isMesh || !child.geometry) {
      return;
    }

    if (!child.geometry.boundingBox) {
      child.geometry.computeBoundingBox();
    }

    if (!child.geometry.boundingBox) {
      return;
    }

    child.updateWorldMatrix(true, false);
    const localMatrix = new THREE.Matrix4().multiplyMatrices(modelInverse, child.matrixWorld);
    tmp.copy(child.geometry.boundingBox).applyMatrix4(localMatrix);
    bounds.union(tmp);
  });

  if (bounds.isEmpty()) {
    bounds.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0.05, 0.5));
  }

  return bounds;
}

function bakeFootprintTexture(model, bounds, renderer) {
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);

  const pad = 1.14;
  const halfX = Math.max((size.x * pad) / 2, 0.025);
  const halfZ = Math.max((size.z * pad) / 2, 0.025);

  const camera = new THREE.OrthographicCamera(-halfX, halfX, halfZ, -halfZ, 0.01, size.y + 4);
  camera.position.set(center.x, bounds.max.y + 2, center.z);
  camera.up.set(0, 0, -1);
  camera.lookAt(center.x, bounds.min.y, center.z);
  camera.updateMatrixWorld();

  const scene = new THREE.Scene();
  const bakeRoot = cloneSkinnedScene(model);
  let meshCount = 0;

  bakeRoot.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    meshCount += 1;
    child.material = BLACK_MATERIAL;

    if (child.isSkinnedMesh) {
      child.skeleton?.update?.();
    }
  });

  scene.add(bakeRoot);

  if (meshCount === 0) {
    return createFallbackShadowTexture(size);
  }

  const renderTarget = new THREE.WebGLRenderTarget(SILHOUETTE_RESOLUTION, SILHOUETTE_RESOLUTION, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false
  });

  const previousTarget = renderer.getRenderTarget();
  const previousClearColor = new THREE.Color();
  renderer.getClearColor(previousClearColor);
  const previousClearAlpha = renderer.getClearAlpha();
  const previousToneMapping = renderer.toneMapping;
  const previousOutputColorSpace = renderer.outputColorSpace;

  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.NoColorSpace;
  renderer.setRenderTarget(renderTarget);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear();
  renderer.render(scene, camera);

  renderer.toneMapping = previousToneMapping;
  renderer.outputColorSpace = previousOutputColorSpace;
  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(previousClearColor, previousClearAlpha);

  const texture = renderTarget.texture;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  texture.userData.renderTarget = renderTarget;

  return texture;
}

function createFallbackShadowTexture(size) {
  const canvas = document.createElement("canvas");
  canvas.width = SILHOUETTE_RESOLUTION;
  canvas.height = SILHOUETTE_RESOLUTION;
  const ctx = canvas.getContext("2d");

  const aspect = Math.max(size.x / Math.max(size.z, 0.001), 0.25);
  const radiusX = canvas.width * 0.34 * Math.min(aspect, 2);
  const radiusY = canvas.height * 0.34 / Math.max(aspect, 0.5);
  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    0,
    canvas.width / 2,
    canvas.height / 2,
    Math.max(radiusX, radiusY)
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(0.55, "rgba(0, 0, 0, 0.45)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createSoftShadowMaterial(texture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      shadowMap: { value: texture },
      opacity: { value: 0.52 },
      texelSize: {
        value: new THREE.Vector2(1 / SILHOUETTE_RESOLUTION, 1 / SILHOUETTE_RESOLUTION)
      }
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D shadowMap;
      uniform float opacity;
      uniform vec2 texelSize;

      varying vec2 vUv;

      float footprintSample(vec2 uv) {
        vec4 texel = texture2D(shadowMap, uv);
        return clamp(1.0 - texel.r, 0.0, 1.0);
      }

      float blurredFootprint(vec2 uv) {
        float sum = 0.0;

        for (int x = -2; x <= 2; x++) {
          for (int y = -2; y <= 2; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize * 1.5;
            sum += footprintSample(uv + offset);
          }
        }

        return sum / 25.0;
      }

      void main() {
        float shape = blurredFootprint(vUv);
        vec2 centered = vUv - 0.5;
        float radial = 1.0 - smoothstep(0.25, 0.72, length(centered) * 2.0);
        float alpha = shape * radial * opacity;

        if (alpha < 0.02) {
          discard;
        }

        gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
      }
    `
  });
}
