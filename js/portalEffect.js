import * as THREE from 'three';

export function initPortalEffect(scene) {
    // Create a group to hold our cube
    const group = new THREE.Group();

    // Create materials
    const frameMaterial = new THREE.MeshPhongMaterial({
        color: 0x1a2b1a,
        specular: 0x00ff00,
        shininess: 30,
        side: THREE.DoubleSide
    });

    // Create cube geometry
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const materials = [
        frameMaterial,        // right
        frameMaterial,        // left
        frameMaterial,        // top
        frameMaterial,        // bottom
        frameMaterial,        // back
        frameMaterial         // front - will be replaced with portal
    ];

    // Create the cube mesh
    const cube = new THREE.Mesh(geometry, materials);
    group.add(cube);

    // Create a div to hold the iframe
    const iframeContainer = document.createElement('div');
    iframeContainer.style.position = 'absolute';
    iframeContainer.style.left = '-1000px'; // Hide it off-screen
    iframeContainer.style.top = '-1000px';
    iframeContainer.style.width = '512px';  // Power of 2 for texture
    iframeContainer.style.height = '512px';
    document.body.appendChild(iframeContainer);

    // Create the iframe
    const iframe = document.createElement('iframe');
    iframe.src = './mct.html';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframeContainer.appendChild(iframe);

    // Create a canvas to capture the iframe content
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Create dynamic texture
    const texture = new THREE.Texture(canvas);
    const portalMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide
    });

    // Update the texture when iframe loads
    iframe.onload = () => {
        // Wait a bit for iframe content to render
        setTimeout(() => {
            html2canvas(iframe).then(renderedCanvas => {
                ctx.drawImage(renderedCanvas, 0, 0, 512, 512);
                texture.needsUpdate = true;
                materials[5] = portalMaterial;
                cube.material = materials;
            });
        }, 1000);
    };

    // Scale and position the group
    group.scale.multiplyScalar(0.5);
    group.position.z = 0;

    // Add subtle rotation animation
    const animate = () => {
        group.rotation.y += 0.001;
        group.rotation.x = Math.sin(Date.now() * 0.0005) * 0.1;
        requestAnimationFrame(animate);
    };
    animate();

    scene.add(group);
    return group;
} 