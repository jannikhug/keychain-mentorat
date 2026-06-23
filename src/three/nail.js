import * as THREE from 'three';
import { gsap } from 'gsap';

export function createNailInteraction(camera, keychain, mainRingMesh) {
  let active = false;
  let hanging = false;

  const SNAP_THRESHOLD_PX = 110;

  const _raycaster = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const _intersect = new THREE.Vector3();
  const _meshWorld = new THREE.Vector3();

  function screenToWorld(sx, sy, z) {
    _ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    _raycaster.setFromCamera(_ndc, camera);
    _plane.constant = -z;
    return _raycaster.ray.intersectPlane(_plane, _intersect) ? _intersect.clone() : null;
  }

  function getNailSnapScreenPos() {
    const el = document.querySelector('.nail .nail-image');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.4 };
  }

  function getMainRingScreenPos() {
    mainRingMesh.getWorldPosition(_meshWorld);
    const p = _meshWorld.clone().project(camera);
    return {
      x: (p.x + 1) / 2 * window.innerWidth,
      y: -(p.y - 1) / 2 * window.innerHeight,
    };
  }

  function onRelease() {
    if (!active) return;
    const nailPos = getNailSnapScreenPos();
    if (!nailPos) return;

    const ringPos = getMainRingScreenPos();
    const dist = Math.hypot(ringPos.x - nailPos.x, ringPos.y - nailPos.y);

    if (dist < SNAP_THRESHOLD_PX) snap(nailPos);
  }

  function getNailHead() {
    return document.querySelector('.nail .nail-image');
  }

  function setNailHeadZIndex(z) {
    const el = getNailHead();
    if (el) el.style.zIndex = z;
  }

  function snap(nailScreenPos) {
    const nailWorld = screenToWorld(nailScreenPos.x, nailScreenPos.y, keychain.position.z);
    if (!nailWorld) return;

    mainRingMesh.getWorldPosition(_meshWorld);
    const dx = nailWorld.x - _meshWorld.x;
    const dy = nailWorld.y - _meshWorld.y;

    hanging = true;
    setNailHeadZIndex(10);

    gsap.killTweensOf(keychain.position);
    gsap.killTweensOf(keychain.rotation);
    gsap.to(keychain.position, {
      x: keychain.position.x + dx,
      y: keychain.position.y + dy,
      duration: 0.3,
      ease: 'back.out(2)',
    });
    gsap.to(keychain.rotation, { x: 0, y: 0, duration: 0.3, ease: 'power2.out' });
    gsap.to(keychain.scale, { x: 1.0, y: 1.0, z: 1.0, duration: 0.3, ease: 'back.out(2)' });
  }

  function onDragStart() {
    hanging = false;
    setNailHeadZIndex('');
    gsap.killTweensOf(keychain.position);
    gsap.killTweensOf(keychain.rotation);
    gsap.killTweensOf(keychain.scale);
    gsap.to(keychain.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.25, ease: 'power2.out' });
  }

  function activate() {
    active = true;
    hanging = false;
  }

  function deactivate() {
    active = false;
    hanging = false;
    setNailHeadZIndex('');
    gsap.killTweensOf(keychain.position);
    gsap.killTweensOf(keychain.rotation);
    gsap.killTweensOf(keychain.scale);
    gsap.to(keychain.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.3, ease: 'power2.out' });
  }

  function update(_dt) {}

  return { activate, deactivate, update, onRelease, onDragStart, isHanging: () => hanging };
}
