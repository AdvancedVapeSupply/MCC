var smokeParticles = [];

function initSmokeEffect(scene) {
    console.log('Initializing smoke effect');

    var smokeTexture = new THREE.TextureLoader().load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/95637/Smoke-Element.png');
    var smokeMaterial = new THREE.MeshLambertMaterial({ color: 0x8BFF32, map: smokeTexture, transparent: true });
    var smokeGeo = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight); // Use window dimensions


    for (var p = 0; p < 1000; p++) {
        var particle = new THREE.Mesh(smokeGeo, smokeMaterial);
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
    var sp = smokeParticles.length;
    while (sp--) {
        smokeParticles[sp].rotation.z += 0.001; // Slower rotation
    }
}

export { initSmokeEffect, updateSmokeEffect };
