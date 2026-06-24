import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

let rapierInitPromise = null;

export function loadRapier() {
  if (!rapierInitPromise) {
    rapierInitPromise = RAPIER.init().then(() => RAPIER);
  }
  return rapierInitPromise;
}

const RING_NAMES = ['RingContact', 'RingAbout', 'RingWork', 'RingKey'];
const PENDANT_BY_RING = {
  RingContact: 'PendantContact',
  RingAbout: 'PendantAbout',
  RingWork: 'PendantWork',
};

// Rebuilds the keychain's rings/pendants/key as a Rapier rigid-body chain so they
// swing naturally off MainRing instead of staying rigidly fixed to it.
export class KeychainPhysics {
  constructor(RAPIER, root) {
    this.RAPIER = RAPIER;
    this.root = root;
    this.world = new RAPIER.World({ x: 0, y: -60.81, z: 0 });
    this.entries = new Map();

    this._worldPos = new THREE.Vector3();
    this._worldQuat = new THREE.Quaternion();
    this._bodyPos = new THREE.Vector3();
    this._bodyQuat = new THREE.Quaternion();
    this._parentQuat = new THREE.Quaternion();
    this._ringRestoreData = [];
    this._dynamicRestoreData = [];
    this._joints = [];

    this._addKinematic('MainRing');
    const mainRingObj = this.entries.get('MainRing').obj;
    this._dynamicRestoreData.push({ obj: mainRingObj, localPos: mainRingObj.position.clone(), localQuat: mainRingObj.quaternion.clone() });

    // The four small rings stay rigidly fixed to MainRing instead of getting
    // their own swinging physics body. Reparenting them (attach() preserves
    // their current world transform) makes them follow MainRing - including
    // drag - through the normal scene graph, no simulation needed for them.
    const ringAnchors = {};
    for (const ringName of RING_NAMES) {
      const ringObj = this.root.getObjectByName(ringName);
      if (!ringObj) {
        throw new Error(`KeychainPhysics: node "${ringName}" not found in model`);
      }
      this._ringRestoreData.push({
        obj: ringObj,
        parent: ringObj.parent,
        localPos: ringObj.position.clone(),
        localQuat: ringObj.quaternion.clone(),
        localScale: ringObj.scale.clone(),
      });
      const ringPos = new THREE.Vector3();
      ringObj.getWorldPosition(ringPos);
      ringAnchors[ringName] = ringPos;
      mainRingObj.attach(ringObj);
    }

    for (const [ringName, pendantName] of Object.entries(PENDANT_BY_RING)) {
      this._addDynamic(pendantName, (g) => this.RAPIER.ColliderDesc.ball(2.2));
      // Anchored at the ring's original position, but jointed straight to
      // MainRing's body
      this._addJoint('MainRing', pendantName, false, ringAnchors[ringName]);
    }

    this._addDynamic('RingSmallerKey', (g) => this.RAPIER.ColliderDesc.ball(1.0));
    this._addJoint('MainRing', 'RingSmallerKey', false, ringAnchors.RingKey);

    this._addDynamic('Key', (g) => this.RAPIER.ColliderDesc.ball(2.6));
    this._addJoint('RingSmallerKey', 'Key');
  }

  _getWorldTransform(name) {
    const obj = this.root.getObjectByName(name);
    if (!obj) {
      throw new Error(`KeychainPhysics: node "${name}" not found in model`);
    }
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    obj.getWorldPosition(pos);
    obj.getWorldQuaternion(quat);
    return { obj, pos, quat };
  }

  _addKinematic(name) {
    const { obj, pos, quat } = this._getWorldTransform(name);
    const desc = this.RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    const body = this.world.createRigidBody(desc);

    // Use the actual ring mesh as a trimesh collider so the hole stays a hole
    // (a convex hull would fill it in and block the small rings entirely).
    if (obj.isMesh && obj.geometry) {
      const colliderDesc = this._trimeshColliderFromGeometry(obj.geometry);
      if (colliderDesc) {
        this.world.createCollider(colliderDesc, body);
      }
    }

    this.entries.set(name, { body, obj, pos, quat, kinematic: true });
  }

  _trimeshColliderFromGeometry(geometry) {
    const position = geometry.attributes.position;
    if (!position) return null;

    const vertices = position.array instanceof Float32Array
      ? position.array
      : new Float32Array(position.array);

    let indices;
    if (geometry.index) {
      indices = geometry.index.array instanceof Uint32Array
        ? geometry.index.array
        : new Uint32Array(geometry.index.array);
    } else {
      indices = new Uint32Array(vertices.length / 3);
      for (let i = 0; i < indices.length; i++) indices[i] = i;
    }

    return this.RAPIER.ColliderDesc.trimesh(vertices, indices);
  }

  _addDynamic(name, makeCollider) {
    const { obj, pos, quat } = this._getWorldTransform(name);
    this._dynamicRestoreData.push({ obj, localPos: obj.position.clone(), localQuat: obj.quaternion.clone() });
    const desc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinearDamping(0.3)
      .setAngularDamping(0.4);
    const body = this.world.createRigidBody(desc);
    const colliderDesc = makeCollider(obj.geometry).setDensity(0.1);
    this.world.createCollider(colliderDesc, body);
    this.entries.set(name, { body, obj, pos, quat, kinematic: false });
  }

  // Anchors the joint at the midpoint between both bodies' starting positions
  // (or at an explicit anchorWorldPos, e.g. a reparented ring's original spot
  // that no longer has a body of its own), expressed in each body's own
  // local frame, so the chain starts at rest. Contacts between jointed pairs
  // are disabled by default: their colliders start out coinciding at the
  // anchor point, and a ball-vs-ball overlap there would otherwise make the
  // contact solver shove them apart, showing up as a visible gap on top of
  // the joint constraint.
  _addJoint(nameA, nameB, contactsEnabled = false, anchorWorldPos = null) {
    const a = this.entries.get(nameA);
    const b = this.entries.get(nameB);
    const midpoint = anchorWorldPos
      ? anchorWorldPos.clone()
      : a.pos.clone().add(b.pos).multiplyScalar(0.5);

    const localA = midpoint.clone().sub(a.pos).applyQuaternion(a.quat.clone().invert());
    const localB = midpoint.clone().sub(b.pos).applyQuaternion(b.quat.clone().invert());

    const jointData = this.RAPIER.JointData.spherical(
      { x: localA.x, y: localA.y, z: localA.z },
      { x: localB.x, y: localB.y, z: localB.z }
    );
    const joint = this.world.createImpulseJoint(jointData, a.body, b.body, true);
    joint.setContactsEnabled(contactsEnabled);
    this._joints.push({ joint, a, b, localA, localB, contactsEnabled });
  }

  rescale(ratio) {
    for (const entry of this.entries.values()) {
      if (entry.kinematic) continue;
      const t = entry.body.translation();
      entry.body.setTranslation({ x: t.x * ratio, y: t.y * ratio, z: t.z * ratio }, true);
      const v = entry.body.linvel();
      entry.body.setLinvel({ x: v.x * ratio, y: v.y * ratio, z: v.z * ratio }, true);
    }

    const updated = [];
    for (const jd of this._joints) {
      this.world.removeImpulseJoint(jd.joint, true);
      const lA = new THREE.Vector3(jd.localA.x * ratio, jd.localA.y * ratio, jd.localA.z * ratio);
      const lB = new THREE.Vector3(jd.localB.x * ratio, jd.localB.y * ratio, jd.localB.z * ratio);
      const newJoint = this.world.createImpulseJoint(
        this.RAPIER.JointData.spherical({ x: lA.x, y: lA.y, z: lA.z }, { x: lB.x, y: lB.y, z: lB.z }),
        jd.a.body, jd.b.body, true
      );
      newJoint.setContactsEnabled(jd.contactsEnabled);
      updated.push({ joint: newJoint, a: jd.a, b: jd.b, localA: lA, localB: lB, contactsEnabled: jd.contactsEnabled });
    }
    this._joints = updated;
  }

  update() {
    const mainRing = this.entries.get('MainRing');
    mainRing.obj.getWorldPosition(this._worldPos);
    mainRing.obj.getWorldQuaternion(this._worldQuat);
    mainRing.body.setNextKinematicTranslation(this._worldPos);
    mainRing.body.setNextKinematicRotation({
      x: this._worldQuat.x,
      y: this._worldQuat.y,
      z: this._worldQuat.z,
      w: this._worldQuat.w,
    });

    this.world.step();

    for (const entry of this.entries.values()) {
      if (entry.kinematic) continue;

      const t = entry.body.translation();
      const r = entry.body.rotation();
      this._bodyPos.set(t.x, t.y, t.z);
      this._bodyQuat.set(r.x, r.y, r.z, r.w);

      // Convert position/rotation into the object's parent-local space
      // individually, leaving its scale untouched. Rapier has no notion of
      // scale, so folding this through a full matrix decompose would divide
      // the parent's scale (the keychain's 1.5x intro scale) back out of the
      // object instead of just the position/rotation.
      const parent = entry.obj.parent;
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(this._bodyPos);
      entry.obj.position.copy(this._bodyPos);

      parent.getWorldQuaternion(this._parentQuat);
      entry.obj.quaternion.copy(this._parentQuat.invert().multiply(this._bodyQuat));
    }
  }

  restore() {
    for (const { obj, parent, localPos, localQuat, localScale } of this._ringRestoreData) {
      parent.add(obj);
      obj.position.copy(localPos);
      obj.quaternion.copy(localQuat);
      obj.scale.copy(localScale);
    }
    for (const { obj, localPos, localQuat } of this._dynamicRestoreData) {
      obj.position.copy(localPos);
      obj.quaternion.copy(localQuat);
    }
  }

  dispose() {
    this.world.free();
  }
}
