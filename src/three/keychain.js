import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const SWING_SIGNS = {
  PendantAbout: -1,
  PendantWork: -1,
  PendantContact: 1,
  Key: 1,
};

const RING_FOR_SWING = {
  PendantContact: 'RingContact',
  PendantAbout: 'RingAbout',
  PendantWork: 'RingWork',
  Key: 'RingSmallerKey',
};

// Wraps obj in a Group positioned at its own "top" (the side facing ringObj)
// and reparents obj under it with the matching inverse offset, so obj's
// world position/rotation stay exactly as they were. Rotating the returned
// group instead of obj directly then pivots around that top point instead
// of obj's own (centered) origin.
function createSwingPivot(obj, ringObj) {
  const ringWorldPos = new THREE.Vector3();
  ringObj.getWorldPosition(ringWorldPos);
  const localDirToRing = obj.worldToLocal(ringWorldPos.clone());

  obj.geometry.computeBoundingBox();
  const bbox = obj.geometry.boundingBox;
  const topLocal = bbox.getCenter(new THREE.Vector3());

  let dominantAxis = 'y';
  let largestAbsComponent = -Infinity;
  for (const axis of ['x', 'y', 'z']) {
    const value = Math.abs(localDirToRing[axis]);
    if (value > largestAbsComponent) {
      largestAbsComponent = value;
      dominantAxis = axis;
    }
  }
  topLocal[dominantAxis] = localDirToRing[dominantAxis] >= 0
    ? bbox.max[dominantAxis]
    : bbox.min[dominantAxis];

  const originalParent = obj.parent;
  const pivot = new THREE.Group();
  pivot.position.copy(obj.position).add(topLocal.clone().applyQuaternion(obj.quaternion));
  pivot.quaternion.copy(obj.quaternion);
  originalParent.add(pivot);

  obj.position.copy(topLocal).negate();
  obj.quaternion.identity();
  pivot.add(obj);

  return pivot;
}

export function loadKeychain(scene, camera) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    loader.setDRACOLoader(dracoLoader);

    // model shaded flat: KeyChain_model_4.glb
    // model shaded smooth: KeyChain_model_4_1.glb
    loader.load(
      'models/KeyChain_model_4_1.glb',
      (gltf) => {
        const keychainInner = gltf.scene;
        let keychain = gltf.scene;

        keychain.traverse((node) => {
          if (node.isMesh) {
            if (node.material) node.material.envMapIntensity = 1;
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });

        const swingTargets = [];
        Object.entries(SWING_SIGNS).forEach(([name, sign]) => {
          const obj = keychain.getObjectByName(name);
          const ringObj = keychain.getObjectByName(RING_FOR_SWING[name]);
          if (obj && ringObj) {
            const pivot = createSwingPivot(obj, ringObj);
            swingTargets.push({
              pivot,
              obj,
              baseRotationZ: pivot.rotation.z,
              initialLocalPos: obj.position.clone(),
              initialLocalQuat: obj.quaternion.clone(),
              sign,
            });
          }
        });

        const box = new THREE.Box3().setFromObject(keychain);
        const center = box.getCenter(new THREE.Vector3());
        keychain.position.sub(center);
        const keychainPivot = new THREE.Group();
        keychainPivot.add(keychain);
        keychain = keychainPivot;
        scene.add(keychain);

        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.z = maxDim * 1.5;
        const floatAmplitude = maxDim * 0.015;

        keychain.scale.set(0, 0, 0);
        keychain.rotation.x = -0.1;
        keychain.rotation.y = -0.05;

        const mainRingMesh = keychainInner.getObjectByName('MainRing');

        resolve({ keychain, keychainInner, mainRingMesh, swingTargets, floatAmplitude });
      },
      (xhr) => console.log((xhr.loaded / xhr.total) * 100 + '% loaded'),
      (error) => reject(error)
    );
  });
}
