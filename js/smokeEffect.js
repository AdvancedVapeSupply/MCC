import * as THREE from 'three';

let smokeParticles = [];

export function initSmokeEffect(scene) {
    console.log('Initializing smoke effect');

    const smokeTexture = new THREE.TextureLoader().load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/95637/Smoke-Element.png');
    const smokeMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x00ff00, 
        map: smokeTexture, 
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending
    });
    
    // Smaller smoke particles, positioned closer to the device
    const smokeGeo = new THREE.PlaneGeometry(12, 12);

    for (let p = 0; p < 15; p++) {
        const particle = new THREE.Mesh(smokeGeo, smokeMaterial);
        particle.position.set(
            Math.random() * 20 - 10,   // x between -10 and 10
            Math.random() * 20 - 10,   // y between -10 and 10
            Math.random() * 3 - 5      // z between -5 and -2 (much closer to camera)
        );
        particle.rotation.z = Math.random() * 2 * Math.PI;
        particle.renderOrder = -1; // Ensure smoke renders behind device
        scene.add(particle);
        smokeParticles.push({
            mesh: particle,
            rotationSpeed: (Math.random() - 0.5) * 0.001, // Slower rotation
            driftX: (Math.random() - 0.5) * 0.015,        // Slower drift
            driftY: (Math.random() - 0.5) * 0.015,
            driftZ: (Math.random() - 0.5) * 0.005         // Very slow Z drift
        });
    }
}

export function updateSmokeEffect() {
    smokeParticles.forEach(particle => {
        // Rotate the particle
        particle.mesh.rotation.z += particle.rotationSpeed;
        
        // Move the particle
        particle.mesh.position.x += particle.driftX;
        particle.mesh.position.y += particle.driftY;
        particle.mesh.position.z += particle.driftZ;
        
        // If particle moves too far, reset its position
        if (Math.abs(particle.mesh.position.x) > 10) {
            particle.mesh.position.x = -particle.mesh.position.x * 0.8;
        }
        if (Math.abs(particle.mesh.position.y) > 10) {
            particle.mesh.position.y = -particle.mesh.position.y * 0.8;
        }
        if (particle.mesh.position.z > -2 || particle.mesh.position.z < -5) {
            particle.mesh.position.z = -3.5; // Reset to middle of z-range
        }
    });
}
