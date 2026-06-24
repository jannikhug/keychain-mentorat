import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { scene, camera, renderer } from './scene.js';
import { loadKeychain } from './keychain.js';
import { createDragController } from './drag.js';
import { loadRapier, KeychainPhysics } from './physics.js';
import { createNailInteraction } from './nail.js';

const floatSpeed = 1.5;
const swingAmplitude = 0.02;
const swingDelay = 1.2;
const NEUTRAL_ROT_X = -0.1;
const NEUTRAL_ROT_Y = -0.05;
const MAX_ROT_X = 0.3;
const MAX_ROT_Y = 0.5;

let mouseNormX = 0;
let mouseNormY = 0;
let mouseActive = false;
let physicsActive = false;
let keychainPhysics = null;
let lastPhysicsScale = 1.5;
let nailActive = false;
let nailInteracted = false;
let nailInteraction = null;
let keySwingTarget = null;
let wasHanging = false;
let keyDetached = false;
const clock = new THREE.Clock();

const hoverRaycaster = new THREE.Raycaster();
const hoverPointerNDC = new THREE.Vector2();
let pendantTargets = [];
let hoveredPendant = null;

const pendantLabelEl = document.querySelector('.hero-pendant-label');
const PENDANT_LABELS = {
  PendantAbout: 'About',
  PendantWork: 'Work',
  PendantContact: 'Contact',
  Key: 'Key',
};

// Listener for click label and key
window.addEventListener('click', () => {
  if (physicsActive || !hoveredPendant) return;
  gsap.killTweensOf(pendantLabelEl);
  if (hoveredPendant.obj.name === 'Key') {
    gsap.to(pendantLabelEl, { opacity: 0, y: -12, duration: 0.4, ease: 'power3.in' });
    return;
  }
  const label = PENDANT_LABELS[hoveredPendant.obj.name] ?? hoveredPendant.obj.name;
  pendantLabelEl.textContent = label;
  gsap.fromTo(pendantLabelEl, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
});

// Listener for hover label and Key
window.addEventListener('mousemove', (e) => {
  mouseNormX = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseNormY = (e.clientY / window.innerHeight - 0.5) * 2;

  if (!physicsActive && pendantTargets.length) {
    const rect = renderer.domElement.getBoundingClientRect();
    hoverPointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    hoverPointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    hoverRaycaster.setFromCamera(hoverPointerNDC, camera);

    let newHovered = null;
    for (const swing of pendantTargets) {
      if (hoverRaycaster.intersectObject(swing.pivot, true).length > 0) {
        newHovered = swing;
        break;
      }
    }

    if (newHovered !== hoveredPendant) {
      if (hoveredPendant) {
        gsap.to(hoveredPendant.pivot.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'power2.inOut' });
      }
      if (newHovered) {
        gsap.to(newHovered.pivot.scale, { x: 1.07, y: 1.07, z: 1.07, duration: 0.5, ease: 'power2.inOut' });
      }
      hoveredPendant = newHovered;
      document.body.style.cursor = newHovered ? 'pointer' : '';
    }
  }
});

// Model Loading and Animations
let basicRafId;
function basicAnimate() {
  renderer.render(scene, camera);
  basicRafId = requestAnimationFrame(basicAnimate);
}
basicAnimate();

let keychain, keychainInner, mainRingMesh, swingTargets, floatAmplitude;
const drag = createDragController(renderer, camera);

loadKeychain(scene, camera).then((data) => {
  ({ keychain, keychainInner, mainRingMesh, swingTargets, floatAmplitude } = data);
  pendantTargets = swingTargets.filter(s => s.obj.name.startsWith('Pendant') || s.obj.name === 'Key');
  nailInteraction = createNailInteraction(camera, keychain, mainRingMesh);

  const kt = swingTargets.find(s => s.obj.name === 'Key');
  if (kt) {
    keySwingTarget = kt;
    keySwingTarget.originalPivotParent = kt.pivot.parent;
    keySwingTarget.originalPivotPos = kt.pivot.position.clone();
    keySwingTarget.originalPivotQuat = kt.pivot.quaternion.clone();
  }

  gsap.to(mainRingMesh.rotation, {
    y: mainRingMesh.rotation.y + Math.PI * 2,
    ease: 'none',
    scrollTrigger: {
      trigger: '.rotate1',
      start: 'top center',
      end: 'bottom center',
      scrub: 1,
    },
  });

  gsap.to(mainRingMesh.rotation, {
    z: mainRingMesh.rotation.z + Math.PI * 2,
    ease: 'none',
    scrollTrigger: {
      trigger: '.rotate2',
      start: 'top center',
      end: 'bottom center',
      scrub: 1,
    },
  });

  playInitialAnimation();
  cancelAnimationFrame(basicRafId);
  animate();
});

function playInitialAnimation() {
  gsap.to(keychain.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 2, ease: 'power2.out' });
  gsap.to(keychain.rotation, { y: keychain.rotation.y + Math.PI * 2, duration: 2, ease: 'power2.out' });
  gsap.to(keychain.rotation, {
    x: keychain.rotation.x + Math.PI * 2,
    duration: 2,
    ease: 'power2.out',
    onComplete: () => {
      keychain.rotation.x = NEUTRAL_ROT_X;
      keychain.rotation.y = NEUTRAL_ROT_Y;
      mouseActive = true;
    },
  });
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (keychain) {
    if (physicsActive) {
      drag.update(dt);
      if (keychainPhysics) {
        const currentScale = keychain.scale.x;
        if (Math.abs(currentScale - lastPhysicsScale) > 0.0001) {
          keychainPhysics.rescale(currentScale / lastPhysicsScale);
          lastPhysicsScale = currentScale;
        }
        keychainPhysics.update();
      }
    } else {
      if (!nailActive || !nailInteracted) {
        keychain.position.y = Math.sin(Date.now() * 0.001 * floatSpeed) * floatAmplitude;
      } else {
        nailInteraction.update(dt);
        drag.update(dt);
      }

      if (mouseActive) {
        const targetX = NEUTRAL_ROT_X + mouseNormY * MAX_ROT_X;
        const targetY = NEUTRAL_ROT_Y + mouseNormX * MAX_ROT_Y;
        keychain.rotation.x += (targetX - keychain.rotation.x) * 0.05;
        keychain.rotation.y += (targetY - keychain.rotation.y) * 0.05;
      }

      const hanging = nailActive && nailInteraction?.isHanging();
      if (hanging) {
        for (const swing of swingTargets) {
          swing.pivot.rotation.z += (swing.baseRotationZ - swing.pivot.rotation.z) * 0.12;
        }
      } else {
        const t = Date.now() * 0.001;
        const floatVelocity = Math.cos((t - swingDelay) * floatSpeed);
        for (const swing of swingTargets) {
          swing.pivot.rotation.z = swing.baseRotationZ + swing.sign * floatVelocity * swingAmplitude;
        }
      }
    }

    // When keychain gets hung: switch drag target to the Key so it can be dragged away
    if (nailActive && keySwingTarget) {
      const hanging = nailInteraction?.isHanging() ?? false;
      if (hanging && !wasHanging) {
        drag.activate(keySwingTarget.obj, keySwingTarget.pivot, null, onKeyDragStart);
      }
      wasHanging = hanging;
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function onKeyDragStart() {
  if (keyDetached || !keySwingTarget) return;
  if (keychainPhysics) keychainPhysics.releaseKey();
  scene.attach(keySwingTarget.pivot);
  keyDetached = true;
  gsap.to(keySwingTarget.pivot.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.25, ease: 'power2.out' });
}

function restoreDetachedKey() {
  if (!keyDetached || !keySwingTarget) return;
  gsap.killTweensOf(keySwingTarget.pivot.scale);
  keySwingTarget.pivot.scale.set(1, 1, 1);
  keySwingTarget.originalPivotParent.add(keySwingTarget.pivot);
  keySwingTarget.pivot.position.copy(keySwingTarget.originalPivotPos);
  keySwingTarget.pivot.quaternion.copy(keySwingTarget.originalPivotQuat);
  keySwingTarget.obj.position.copy(keySwingTarget.initialLocalPos);
  keySwingTarget.obj.quaternion.copy(keySwingTarget.initialLocalQuat);
  keyDetached = false;
}

// Scroll Triggers
ScrollTrigger.create({
  trigger: '.physics',
  start: 'top center',
  onEnter: activatePhysics,
  onLeaveBack: deactivatePhysics,
});

ScrollTrigger.create({
  trigger: '.nail',
  start: 'top center',
  onEnter: activateNail,
  onLeaveBack: deactivateNail,
});

// Activations for ScrollTriggers
async function activatePhysics() {
  if (physicsActive || !keychainInner) return;
  physicsActive = true;
  mouseActive = false;
  if (hoveredPendant) {
    gsap.to(hoveredPendant.pivot.scale, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'power2.inOut' });
    hoveredPendant = null;
    document.body.style.cursor = '';
  }
  gsap.killTweensOf(keychain);
  const RAPIER = await loadRapier();
  if (!physicsActive) return; // user scrolled back up while Rapier was loading
  lastPhysicsScale = keychain.scale.x;
  keychainPhysics = new KeychainPhysics(RAPIER, keychainInner);
}

function deactivatePhysics() {
  if (!physicsActive) return;
  physicsActive = false;
  if (keychainPhysics) {
    keychainPhysics.restore();
    keychainPhysics.dispose();
    keychainPhysics = null;
  }
  drag.deactivate();
  for (const swing of swingTargets) {
    swing.obj.position.copy(swing.initialLocalPos);
    swing.obj.quaternion.copy(swing.initialLocalQuat);
    swing.pivot.rotation.z = swing.baseRotationZ;
  }
  gsap.to(keychain.rotation, { x: NEUTRAL_ROT_X, y: NEUTRAL_ROT_Y, duration: 0.6, ease: 'power2.out' });
  mouseActive = true;
}

function activateNail() {
  if (!nailInteraction) return;
  nailActive = true;
  nailInteracted = false;
  mouseActive = false;
  nailInteraction.activate();
  drag.activate(
    mainRingMesh,
    keychain,
    nailInteraction.onRelease,
    () => {
      nailInteracted = true;
      nailInteraction.onDragStart();
    },
  );
}

function deactivateNail() {
  if (!nailInteraction) return;
  nailActive = false;
  nailInteracted = false;
  wasHanging = false;
  restoreDetachedKey();
  nailInteraction.deactivate();
  drag.deactivate();
  // Restore X/Z; float animation takes over Y immediately
  gsap.to(keychain.position, { x: 0, z: 0, duration: 0.4, ease: 'power2.out' });
  gsap.to(keychain.rotation, { x: NEUTRAL_ROT_X, y: NEUTRAL_ROT_Y, duration: 0.6, ease: 'power2.out' });
  mouseActive = true;
}
