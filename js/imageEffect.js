var imageMesh;

function initImageEffect(scene) {
    console.log('Initializing image effect');

    // Load the image as a texture
    var loader = new THREE.TextureLoader();
    loader.load('https://www.advancedvapesupply.com/cdn/shop/files/Asset_50_400x.png', function(texture) {
        // Create a plane geometry and apply the texture
        var geometry = new THREE.PlaneGeometry(1, 1); // You can adjust size
        var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        imageMesh = new THREE.Mesh(geometry, material);

        // Set the initial scale (adjust as needed)
        imageMesh.scale.set(400, 400, 1);

        // Position the image mesh in the scene
        imageMesh.position.set(0, 0, -500); // Adjust position as needed

        scene.add(imageMesh);
    });

    console.log('Image effect initialized');
}

function updateImageEffect() {
    // Zoom effect
    if (imageMesh) {
        // Adjust these values for different zoom speeds
        imageMesh.scale.x += 1; 
        imageMesh.scale.y += 1;
    }
}

export { initImageEffect, updateImageEffect };
