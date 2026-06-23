import * as THREE from 'three';

const MAX_DRAG_SPEED = 80;

export function createDragController(renderer, camera) {
  let hitMesh = null;
  let moveTarget = null;
  let isDragging = false;
  let onReleaseCb = null;
  let onStartCb = null;

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const planeNormal = new THREE.Vector3();
  const dragOffset = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  const dragTarget = new THREE.Vector3();
  const dragTargetLocal = new THREE.Vector3();
  const hitMeshWorldPos = new THREE.Vector3();
  const moveTargetWorldPos = new THREE.Vector3();
  const hitToMoveOffset = new THREE.Vector3();

  function updatePointerNDC(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerDown(event) {
    if (!hitMesh) return;
    updatePointerNDC(event);
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObject(hitMesh, true);
    if (hits.length === 0) return;
    isDragging = true;
    if (onStartCb) onStartCb();
    renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
    camera.getWorldDirection(planeNormal);
    dragPlane.setFromNormalAndCoplanarPoint(planeNormal, hits[0].point);

    const target = moveTarget || hitMesh;
    hitMesh.getWorldPosition(hitMeshWorldPos);
    target.getWorldPosition(moveTargetWorldPos);
    hitToMoveOffset.copy(moveTargetWorldPos).sub(hitMeshWorldPos);
    dragOffset.copy(hitMeshWorldPos).sub(hits[0].point);
    dragTargetLocal.copy(target.position);
  }

  function onPointerMove(event) {
    if (!hitMesh) return;
    if (!isDragging) {
      updatePointerNDC(event);
      raycaster.setFromCamera(pointerNDC, camera);
      const hovering = raycaster.intersectObject(hitMesh, true).length > 0;
      renderer.domElement.style.cursor = hovering ? 'grab' : 'auto';
      return;
    }
    updatePointerNDC(event);
    raycaster.setFromCamera(pointerNDC, camera);
    if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
    dragTarget.copy(hitPoint).add(dragOffset).add(hitToMoveOffset);
    const target = moveTarget || hitMesh;
    const parent = target.parent;
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(dragTarget);
    dragTargetLocal.copy(dragTarget);
  }

  function onPointerUp(event) {
    const wasD = isDragging;
    isDragging = false;
    renderer.domElement.style.cursor = 'auto';
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    if (wasD && onReleaseCb) onReleaseCb();
  }

  // move: optional separate object to translate (defaults to hitMesh)
  // onRelease: called when drag ends
  // onStart: called when drag begins
  function activate(mesh, move = null, onRelease = null, onStart = null) {
    hitMesh = mesh;
    moveTarget = move;
    onReleaseCb = onRelease;
    onStartCb = onStart;
    renderer.domElement.style.pointerEvents = 'auto';
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
  }

  function update(dt) {
    const target = moveTarget || hitMesh;
    if (!isDragging || !target) return;
    const step = dragTargetLocal.clone().sub(target.position);
    const maxStep = MAX_DRAG_SPEED * dt;
    if (step.length() > maxStep) step.setLength(maxStep);
    target.position.add(step);
  }

  function deactivate() {
    hitMesh = null;
    moveTarget = null;
    onReleaseCb = null;
    onStartCb = null;
    isDragging = false;
    renderer.domElement.style.pointerEvents = 'none';
    renderer.domElement.style.cursor = 'auto';
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('pointercancel', onPointerUp);
  }

  return { activate, deactivate, update };
}
