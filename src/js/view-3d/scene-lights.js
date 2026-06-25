import * as THREE from "three";

const DEFAULT_LIGHTING = {
  ambientIntensity: 0.6,
  hemisphereIntensity: 1.4
};

export function setupSceneLighting(scene, options = {}) {
  const lighting = { ...DEFAULT_LIGHTING, ...options };

  scene.add(new THREE.AmbientLight(0xffffff, lighting.ambientIntensity));

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x556677, lighting.hemisphereIntensity);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.2);
  keyLight.position.set(8, 14, 8);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xd0e0ff, 0.55);
  fillLight.position.set(-10, 10, -6);
  scene.add(fillLight);

  const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
  backLight.position.set(0, 8, -12);
  scene.add(backLight);
}
