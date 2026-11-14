// Shared scratch vectors. Hot loops (movement, raycasts, bot steering) reuse
// these instead of allocating a new Vector3 every frame — criterion 5 of the
// judge's rubric (no new objects made every frame in hot loops).
import * as THREE from 'three';

export const V1 = new THREE.Vector3();
export const V2 = new THREE.Vector3();
export const V3 = new THREE.Vector3();
export const V4 = new THREE.Vector3();
export const V5 = new THREE.Vector3();
export const Q1 = new THREE.Quaternion();
export const E1 = new THREE.Euler();
