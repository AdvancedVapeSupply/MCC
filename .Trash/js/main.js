import { initM22Effect, onDocumentMouseMove, checkHover } from './m22Effect.js';
import { initSmokeEffect, updateSmokeEffect } from './smokeEffect.js';

// Scene
var scene = new THREE.Scene();

// Camera
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 800;

// Renderer
var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// OrbitControls
const controls = new THREE.OrbitControls(camera, renderer.domElement);

// Set the target (lookAt) to your origin point
const origin = new THREE.Vector3(0, 0, 700);
controls.target = origin;

// Resize Listener
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

// Mouse Move Listener
document.addEventListener('mousemove', onDocumentMouseMove, false);

initSmokeEffect(scene); // Initialize smoke effect

// Initialize M22 Effect
initM22Effect(scene, camera);

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    
    updateSmokeEffect(); // Update smoke effect
    checkHover(camera); // Update for hover effect
    controls.update();
    renderer.render(scene, camera);
}

animate();