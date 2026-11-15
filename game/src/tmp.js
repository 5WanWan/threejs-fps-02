// tmp.js — scratch objects reused by the hot loops so the simulation never
// allocates a Vector3, Ray or Box3 per frame. Every module imports these and
// treats them as borrowed: never store a reference to one across frames.
import * as THREE from 'three';

export const V1 = new THREE.Vector3();
export const V2 = new THREE.Vector3();
export const V3 = new THREE.Vector3();
export const V4 = new THREE.Vector3();
export const V5 = new THREE.Vector3();
export const V6 = new THREE.Vector3();
export const Q1 = new THREE.Quaternion();
export const M1 = new THREE.Matrix4();
export const RAY = new THREE.Raycaster();
RAY.far = 120;
// Reused axis-aligned box for segment tests (min/max written in place).
export const BOX = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
// Two scratch 2D points for the minimap and waypoint math.
export const P1 = { x: 0, z: 0 };
export const P2 = { x: 0, z: 0 };
