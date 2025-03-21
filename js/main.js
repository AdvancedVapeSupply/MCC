import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { initM22Effect, onDocumentMouseMove, checkHover, startChase, updateChase } from './m22Effect.js';
import { initSmokeEffect, updateSmokeEffect } from './smokeEffect.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// Get the container dimensions
const container = document.getElementById('canvas-container');
const containerWidth = container.clientWidth;
const containerHeight = container.clientHeight;

// Set up camera with wider FOV for mobile
const camera = new THREE.PerspectiveCamera(65, containerWidth / containerHeight, 0.1, 1000);
camera.position.z = 40;
camera.position.y = 5;

// Set up renderer
const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true
});
renderer.setSize(containerWidth, containerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// Set up controls with mobile-friendly settings
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 30;
controls.maxDistance = 60;
controls.minPolarAngle = Math.PI / 4;
controls.maxPolarAngle = Math.PI * 3/4;
controls.enablePan = false; // Disable panning for mobile

// Add ambient light
const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
scene.add(ambientLight);

// Add main spotlight
const spotLight = new THREE.SpotLight(0xffffff, 1.2);
spotLight.position.set(0, 30, 40);
spotLight.angle = Math.PI / 4;
spotLight.penumbra = 0.2;
scene.add(spotLight);

// Add fill light
const fillLight = new THREE.DirectionalLight(0x404040, 0.8);
fillLight.position.set(-20, 0, 20);
scene.add(fillLight);

// Initialize effects
const m22Group = initM22Effect(scene, camera);
initSmokeEffect(scene);

// Start LED chase animation
startChase();

// Add event listener for mouse/touch movement
document.addEventListener('mousemove', onDocumentMouseMove, false);
document.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const touch = event.touches[0];
    const rect = container.getBoundingClientRect();
    onDocumentMouseMove({
        clientX: touch.clientX - rect.left,
        clientY: touch.clientY - rect.top
    });
}, false);

// Animation loop
function animate(time) {
    requestAnimationFrame(animate);
    controls.update();
    updateSmokeEffect();
    updateChase(time);
    checkHover(scene, camera);
    renderer.render(scene, camera);
}

// Handle window resize
function onWindowResize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

window.addEventListener('resize', onWindowResize, false);

// Start animation
animate();