// The player: first-person movement with acceleration, friction, crouch and
// jump, sliding collision against the world's AABB colliders, and recoil that
// kicks the view up and recovers. One agent object, shared with the bots —
// combat and the HUD treat the player and bots the same way.
//
// Aim-down-sights: holding right mouse with a rifle or the marksman rifle
// tightens spread and slows movement, so stopping to aim pays (criterion 2).
import * as THREE from 'three';
import { TEAMS } from './state.js';
import { createLoadout, WEAPONS } from './weapons.js';
import { V1 } from './tmp.js';

const RADIUS = 0.36;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.08;
const WALK_SPEED = 4.4;
const SPRINT_SPEED = 6.3;
const CROUCH_SPEED = 2.2;
const ACCEL = 42;
const FRICTION = 11;
const GRAVITY = 16;
const JUMP_SPEED = 5.4;

export function createPlayerAgent(id, name) {
  return {
    id,
    name,
    team: TEAMS.VANGUARD,
    isPlayer: true,
    alive: true,
    pos: new THREE.Vector3(-28, 0, 18),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: EYE_STAND,
    hp: 100,
    armor: 0,
    money: 800,
    kills: 0,
    deaths: 0,
    loadout: createLoadout(),
    grenades: { frag: 0, smoke: 0, flash: 0 },
    crouched: false,
    onGround: true,
    speed2d: 0,
    hasCharge: true,
    lastDamageAt: -10,
    lastDamageFrom: null,
    flashUntil: 0,
    aiming: false,
    mesh: null,
    bot: null,
  };
}

// A simple viewmodel: a gun built from boxes, attached to the camera.
export function createViewModel(camera, scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.13, 0.52),
    new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.45, metalness: 0.6 }),
  );
  body.position.set(0, -0.02, -0.1);
  group.add(body);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8),
    new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.35, metalness: 0.7 }),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -0.5);
  group.add(barrel);
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.16, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.7, metalness: 0.2 }),
  );
  grip.position.set(0, -0.12, 0.08);
  grip.rotation.x = 0.3;
  group.add(grip);
  const sight = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.05, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.4, metalness: 0.3, emissive: 0x664400, emissiveIntensity: 0.6 }),
  );
  sight.position.set(0, 0.06, -0.28);
  group.add(sight);
  group.position.set(0.26, -0.24, -0.5);
  camera.add(group);
  scene.add(camera);
  return group;
}

export function createPlayer(world, agent) {
  let recoilPitch = 0;
  let recoilYaw = 0;
  let stepAccum = 0;
  let onStep = null;

  function look(dx, dy) {
    agent.yaw -= dx * 0.0021;
    agent.pitch -= dy * 0.0021;
    agent.pitch = Math.max(-1.52, Math.min(1.52, agent.pitch));
  }

  function applyRecoil(pitch, yaw) {
    recoilPitch += pitch;
    recoilYaw += yaw;
  }

  // inputState is input.state: { keys, firing, firingSecondary, lookX, lookY }.
  function step(dt, inputState, audio) {
    if (!agent.alive) return;
    // Recoil recovery: the view settles back toward the aim point.
    recoilPitch = Math.max(0, recoilPitch - dt * 0.09);
    recoilYaw *= Math.max(0, 1 - dt * 8);

    const keys = inputState.keys;
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    agent.crouched = keys.has('ControlLeft') || keys.has('KeyC');
    const def = WEAPONS[agent.loadout.current];
    agent.aiming = !!def.ads && !!inputState.firingSecondary && !agent.crouched;
    const sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && forward > 0 && !agent.crouched && !agent.aiming;
    let maxSpeed = agent.crouched ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;
    if (agent.aiming) maxSpeed *= def.adsMove;

    V1.set(Math.sin(agent.yaw), 0, Math.cos(agent.yaw));
    // forward is -Z in camera space; yaw 0 faces -Z.
    const fx = -Math.sin(agent.yaw);
    const fz = -Math.cos(agent.yaw);
    const rx = Math.cos(agent.yaw);
    const rz = -Math.sin(agent.yaw);
    let mx = fx * forward + rx * strafe;
    let mz = fz * forward + rz * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }

    agent.vel.x += mx * ACCEL * dt;
    agent.vel.z += mz * ACCEL * dt;
    // Friction when no input, and a cap at the current max speed.
    const speed = Math.hypot(agent.vel.x, agent.vel.z);
    if (len === 0) {
      const drop = Math.max(0, speed - FRICTION * dt);
      if (speed > 0) { agent.vel.x *= drop / speed; agent.vel.z *= drop / speed; }
    } else if (speed > maxSpeed) {
      agent.vel.x *= maxSpeed / speed;
      agent.vel.z *= maxSpeed / speed;
    }
    agent.speed2d = Math.hypot(agent.vel.x, agent.vel.z);

    agent.pos.x += agent.vel.x * dt;
    world.collide(agent.pos, RADIUS);
    agent.pos.z += agent.vel.z * dt;
    world.collide(agent.pos, RADIUS);

    // Jump + gravity (flat ground at y = 0).
    if (keys.has('Space') && agent.onGround) {
      agent.vel.y = JUMP_SPEED;
      agent.onGround = false;
    }
    agent.vel.y -= GRAVITY * dt;
    agent.pos.y += agent.vel.y * dt;
    if (agent.pos.y <= 0) {
      agent.pos.y = 0;
      agent.vel.y = 0;
      agent.onGround = true;
    }

    // Eye height eases between stand and crouch.
    const targetEye = agent.crouched ? EYE_CROUCH : EYE_STAND;
    agent.eye += (targetEye - agent.eye) * Math.min(1, dt * 10);

    // Footsteps: a soft tick every stride while moving on the ground.
    if (agent.onGround && agent.speed2d > 1.5) {
      stepAccum += agent.speed2d * dt;
      if (stepAccum > 2.4) {
        stepAccum = 0;
        if (audio && onStep) onStep();
      }
    }
  }

  function cameraPose(camera) {
    camera.position.set(agent.pos.x, agent.pos.y + agent.eye, agent.pos.z);
    camera.rotation.set(agent.pitch + recoilPitch, agent.yaw + recoilYaw, 0, 'YXZ');
  }

  return {
    agent,
    step,
    look,
    applyRecoil,
    cameraPose,
    onStep(callback) { onStep = callback; },
  };
}
