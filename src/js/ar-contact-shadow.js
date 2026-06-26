import * as THREE from "three";

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
  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);

  const texture = bakeFootprintTexture(model, bounds, renderer);
  const material = createSoftShadowMaterial(texture);

  const group = new THREE.Group();
  group.name = "contact-shadow";

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 1.06, size.z * 1.06, 1, 1),
    material
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(center.x, bounds.min.y + 0.004, center.z);
  mesh.renderOrder = -1;
  group.add(mesh);

  return group;
}

function bakeFootprintTexture(model, bounds, renderer) {
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);

  const pad = 1.12;
  const halfX = (size.x * pad) / 2;
  const halfZ = (size.z * pad) / 2;

  const camera = new THREE.OrthographicCamera(-halfX, halfX, halfZ, -halfZ, 0.01, size.y + 4);
  camera.position.set(center.x, bounds.max.y + 2, center.z);
  camera.up.set(0, 0, -1);
  camera.lookAt(center.x, bounds.min.y, center.z);
  camera.updateMatrixWorld();

  const scene = new THREE.Scene();
  const tempMeshes = [];

  model.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    if (child.isSkinnedMesh) {
      child.skeleton?.update?.();
    }

    const mesh = new THREE.Mesh(child.geometry, BLACK_MATERIAL);
    mesh.matrix.copy(child.matrixWorld);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    scene.add(mesh);
    tempMeshes.push(mesh);
  });

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

  renderer.setRenderTarget(renderTarget);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear();
  renderer.render(scene, camera);

  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(previousClearColor, previousClearAlpha);

  for (const mesh of tempMeshes) {
    scene.remove(mesh);
  }

  const texture = renderTarget.texture;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  texture.userData.renderTarget = renderTarget;

  return texture;
}

function createSoftShadowMaterial(texture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: {
      shadowMap: { value: texture },
      opacity: { value: 0.38 },
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
        return 1.0 - texture2D(shadowMap, uv).r;
      }

      float blurredFootprint(vec2 uv) {
        float sum = 0.0;

        for (int x = -2; x <= 2; x++) {
          for (int y = -2; y <= 2; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize * 1.75;
            sum += footprintSample(uv + offset);
          }
        }

        return sum / 25.0;
      }

      void main() {
        float shape = blurredFootprint(vUv);
        vec2 centered = vUv - 0.5;
        float radial = 1.0 - smoothstep(0.18, 0.58, length(centered) * 2.0);
        float alpha = shape * radial * opacity;

        if (alpha < 0.01) {
          discard;
        }

        gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
      }
    `
  });
}
