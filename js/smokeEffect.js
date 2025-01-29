import * as THREE from 'three';

let smokeParticles = [];

function initSmokeEffect(scene) {
    console.log('Initializing smoke effect');

    const smokeTexture = new THREE.TextureLoader().load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/95637/Smoke-Element.png');
    const smokeMaterial = new THREE.MeshLambertMaterial({ color: 0x8BFF32, map: smokeTexture, transparent: true });
    const smokeGeo = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);

    for (let p = 0; p < 1000; p++) {
        const particle = new THREE.Mesh(smokeGeo, smokeMaterial);
        particle.position.set(
            Math.random() * 1000 - 500,
            Math.random() * 1000 - 500,
            Math.random() * 1000 - 500
        );
        particle.rotation.z = Math.random() * 2 * Math.PI;
        scene.add(particle);
        smokeParticles.push(particle);
    }
}

function updateSmokeEffect() {
    let sp = smokeParticles.length;
    while (sp--) {
        smokeParticles[sp].rotation.z += 0.001;
    }
}

export { initSmokeEffect, updateSmokeEffect };
