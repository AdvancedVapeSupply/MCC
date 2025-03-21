import * as THREE from 'three';

let m22Mesh;
let displayPlane;
let smmButton, smuButton, smkButton, smdButton;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let INTERSECTED;

function createHexagonalButtonGeometry() {
    const sideLength = 2.0; // The length of each side of the hexagon
    const depth = 0.5; // The extrusion depth

    const hexagonShape = new THREE.Shape();

    // Start at the first vertex of the hexagon at (0, 0)
    hexagonShape.moveTo(0, 0); 

    // The first point is at (0, 0)
    let points = [new THREE.Vector2(0, 0)];

    // Calculate the vertices of the hexagon starting from (0, 0)
    for (let i = 0; i < 7; i++) {
        const angle_deg = 60 * i -30;
        const angle_rad = Math.PI / 180 * angle_deg;
        const x = 0 + sideLength * Math.cos(angle_rad);
        const y = 0 + sideLength * Math.sin(angle_rad);
        hexagonShape.lineTo(x, y);
        points.push(new THREE.Vector2(x, y));
    }

    // Close the hexagon path by drawing a line to the first vertex
    hexagonShape.lineTo(points[0].x, points[0].y);

    const extrudeSettings = {
        depth: depth,
        bevelEnabled: false,
    };

    return new THREE.ExtrudeGeometry(hexagonShape, extrudeSettings);
}

function createUpwardsTriangleGeometry() {
    const width = 3; // Width of the triangle
    const height = width / 2; // Height is half the width

    const triangleShape = new THREE.Shape();
    triangleShape.moveTo(-width / 2, 0);
    triangleShape.lineTo(width / 2, 0);
    triangleShape.lineTo(0, height); // Set the top point of the triangle

    const extrudeSettings = {
        depth: 0.5, // The extrusion depth, can be adjusted as needed
        bevelEnabled: false,
    };

    return new THREE.ExtrudeGeometry(triangleShape, extrudeSettings);
}

function createRoundedRectangleGeometry() {
    const width = 4;
    const height = 2;
    const depth = -0.5;
    const borderRadius = 1; // Adjust this value to control the roundness of corners

    const roundedRectShape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;

    roundedRectShape.moveTo(x + borderRadius, y);
    roundedRectShape.lineTo(x + width - borderRadius, y);
    roundedRectShape.quadraticCurveTo(x + width, y, x + width, y + borderRadius);
    roundedRectShape.lineTo(x + width, y + height - borderRadius);
    roundedRectShape.quadraticCurveTo(x + width, y + height, x + width - borderRadius, y + height);
    roundedRectShape.lineTo(x + borderRadius, y + height);
    roundedRectShape.quadraticCurveTo(x, y + height, x, y + height - borderRadius);
    roundedRectShape.lineTo(x, y + borderRadius);
    roundedRectShape.quadraticCurveTo(x, y, x + borderRadius, y);

    const extrudeSettings = {
        depth: depth,
        bevelEnabled: false,
    };

    return new THREE.ExtrudeGeometry(roundedRectShape, extrudeSettings);
}

function createDownwardsTriangleGeometry() {
    const geometry = createUpwardsTriangleGeometry(); // Use the existing function for upward triangle
    geometry.rotateZ(Math.PI); // Rotate the geometry 180 degrees around the Z-axis
    return geometry;
}

function createUSBCGeometry() {
    const width = 4;
    const height = 1;
    const depth = -0.5;
    const borderRadius = 1;

    const roundedRectShape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;

    roundedRectShape.moveTo(x + borderRadius, y);
    roundedRectShape.lineTo(x + width - borderRadius, y);
    roundedRectShape.quadraticCurveTo(x + width, y, x + width, y + borderRadius);
    roundedRectShape.lineTo(x + width, y + height - borderRadius);
    roundedRectShape.quadraticCurveTo(x + width, y + height, x + width - borderRadius, y + height);
    roundedRectShape.lineTo(x + borderRadius, y + height);
    roundedRectShape.quadraticCurveTo(x, y + height, x, y + height - borderRadius);
    roundedRectShape.lineTo(x, y + borderRadius);
    roundedRectShape.quadraticCurveTo(x, y, x + borderRadius, y);

    const extrudeSettings = {
        depth: depth,
        bevelEnabled: false,
    };

    return new THREE.ExtrudeGeometry(roundedRectShape, extrudeSettings);
}

function createESCCWithHollowCylinder(imageUrl) {
    // ESCC dimensions
    const outerRadius = 4;
    const innerRadius = 3; // Inner radius for the hollow part
    const height = 4;
    const radialSegments = 32;

    // Hollow Cylinder geometry
    const cylinderGeometry = new THREE.CylinderGeometry(outerRadius, outerRadius, height, radialSegments, 1, true);

    // Solid Bottom Disc geometry
    const bottomGeometry = new THREE.CircleGeometry(outerRadius, radialSegments);

    // Load image texture for the Bottom Disc
    const textureLoader = new THREE.TextureLoader();
    const imageTexture = textureLoader.load(imageUrl);

    // Material for the Bottom Disc (with image texture)
    const bottomMaterial = new THREE.MeshBasicMaterial({ map: imageTexture });

    // Material for the Hollow Cylinder
    const cylinderMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        metalness: 0.8,
        roughness: 0.4,
        side: THREE.DoubleSide
    });

    // Create Bottom Disc mesh
    const bottomMesh = new THREE.Mesh(bottomGeometry, bottomMaterial);
    bottomMesh.rotation.x = -Math.PI / 2;
    bottomMesh.position.y = -height / 2;

    // Create Hollow Cylinder mesh
    const cylinderMesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial);

    // Combine the Bottom Disc and Hollow Cylinder into a group
    const esccGroup = new THREE.Group();
    esccGroup.add(bottomMesh);
    esccGroup.add(cylinderMesh);

    return esccGroup;
}

export function initM22Effect(scene, camera) {
    const geometry = new THREE.BoxGeometry(10, 40, 20);
    
    const material = new THREE.MeshPhongMaterial({
        color: 0x000000,      // Base color of the material
        specular: 0xffffff,   // Specular highlights color
        shininess: 30,        // Shininess factor
        transparent: false,    // Transparency settings
        opacity: 0.5          // Opacity settings
    });

    m22Mesh = new THREE.Mesh(geometry, material);

    const imageURL = 'https://cdn.stamped.io/uploads/videos/593f83842d9dc5b6711cc583b4134598.jpg';
    
    const displayGeometry = new THREE.PlaneGeometry(7, 14);
    const displayMaterial = new THREE.MeshBasicMaterial({ color: 0x00000F });

    displayPlane = new THREE.Mesh(displayGeometry, displayMaterial);
    displayPlane.position.set(0.1, 3, 10.1);
    
    m22Mesh.add(displayPlane);

    const smmGeometry = createHexagonalButtonGeometry();
    const smuGeometry = createUpwardsTriangleGeometry();
    const smkGeometry = createRoundedRectangleGeometry();
    const smdGeometry = createDownwardsTriangleGeometry();

    const smmMaterial = new THREE.MeshPhongMaterial({ shininess: 0, color: 0x000000 });
    const smuMaterial = new THREE.MeshPhongMaterial({ shininess: 0, color: 0x000000 });
    const smkMaterial = new THREE.MeshPhongMaterial({ shininess: 0, color: 0x000000 });
    const smdMaterial = new THREE.MeshPhongMaterial({ shininess: 0, color: 0x000000 });

    smmButton = new THREE.Mesh(smmGeometry, smmMaterial);
    smuButton = new THREE.Mesh(smuGeometry, smuMaterial);
    smkButton = new THREE.Mesh(smkGeometry, smkMaterial);
    smdButton = new THREE.Mesh(smdGeometry, smdMaterial);

    smmButton.position.set(0, 13, 11);
    smuButton.position.set(0, -8, 11);
    smkButton.position.set(0, -10, 11);
    smdButton.position.set(0, -12, 11);
    
    m22Mesh.add(smmButton);
    m22Mesh.add(smuButton);
    m22Mesh.add(smkButton);
    m22Mesh.add(smdButton);

    // Create a translucent box with the same dimensions
    const translucentBoxGeometry = new THREE.BoxGeometry(10, 1, 20);
    const translucentBoxMaterial = new THREE.MeshPhongMaterial({
        color: 0xFFFFFF,
        specular: 0xffffff,
        shininess: 0,
        transparent: true,
        opacity: 0.9
    });
    const translucentBox = new THREE.Mesh(translucentBoxGeometry, translucentBoxMaterial);
    translucentBox.position.y = m22Mesh.position.y + 20.5;
    m22Mesh.add(translucentBox);

    // Create an opaque box with the same dimensions
    const opaqueBoxGeometry = new THREE.BoxGeometry(10, 1, 20);
    const opaqueBoxMaterial = new THREE.MeshPhongMaterial({
        color: 0x000000,
        specular: 0xffffff,
        shininess: 30,
        transparent: false,
        opacity: 1.0
    });
    const opaqueBox = new THREE.Mesh(opaqueBoxGeometry, opaqueBoxMaterial);
    opaqueBox.position.y = translucentBox.position.y + 1;
    m22Mesh.add(opaqueBox);

    // Create ESCC
    const esccMesh = createESCCWithHollowCylinder(imageURL);
    const boxHeight = m22Mesh.geometry.parameters.height;
    const boxDepth = m22Mesh.geometry.parameters.depth;
    const esccHeight = 4;

    esccMesh.position.x = m22Mesh.position.x;
    esccMesh.position.y = m22Mesh.position.y + boxHeight / 2 + esccHeight;
    esccMesh.position.z = m22Mesh.position.z - boxDepth / 2 + 8 - 1;
    m22Mesh.add(esccMesh);

    // Add lighting
    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(
        m22Mesh.position.x,
        m22Mesh.position.y + m22Mesh.geometry.parameters.height / 2,
        m22Mesh.position.z
    );
    m22Mesh.add(pointLight);

    // Position the entire mesh
    m22Mesh.position.z = 600;
    m22Mesh.rotation.x = 0.25;
    m22Mesh.rotation.y = -0.25;

    // Calculate the scale factor based on the camera position and box z position
    const cameraPosition = camera.position.z;
    const boxPosition = m22Mesh.position.z;
    const scaleValue = (window.innerHeight * 0.5) / (cameraPosition - boxPosition);
    m22Mesh.scale.set(scaleValue, scaleValue, scaleValue);
   
    scene.add(m22Mesh);

    const light1 = new THREE.PointLight(0xffffff, 0.25, 1000);
    light1.position.set(0, -200, 1000);
    scene.add(light1);

    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
}

export function onDocumentMouseMove(event) {
    event.preventDefault();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

export function checkHover(camera) {
    raycaster.setFromCamera(mouse, camera);

    // Create an array of buttons
    const buttons = [smmButton, smuButton, smkButton, smdButton];

    // Initialize the intersected button to null
    let intersectedButton = null;

    // Iterate through each button and check for intersections
    for (const button of buttons) {
        const intersects = raycaster.intersectObject(button);

        if (intersects.length > 0) {
            intersectedButton = button;
            button.material.color.setHex(0x00ff00); // Hover color
        } else {
            button.material.color.setHex(0x000000); // Default color
        }
    }

    // Update the intersected button
    INTERSECTED = intersectedButton;
}
