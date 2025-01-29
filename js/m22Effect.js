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

    const geometry = new THREE.ExtrudeGeometry(triangleShape, extrudeSettings);

    // No need to rotate, it's already in the XY plane

    return geometry;
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

    const geometry = new THREE.ExtrudeGeometry(roundedRectShape, extrudeSettings);

    // No need to rotate, it's already in the XY plane

    return geometry;
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

    const geometry = new THREE.ExtrudeGeometry(roundedRectShape, extrudeSettings);

    // No need to rotate, it's already in the XY plane

    return geometry;
}


function createLEDRingOfPointLights(boxWidth, boxDepth) {
    const lights = []; // Array to hold the point lights
    const lightIntensity = 2; // Set the intensity of the point lights
    const lightDistance = 100; // Set the maximum range of the point lights

    // Spacing for lights on the sides and front/back (along Z-axis and X-axis)
    const sideSpacing = boxDepth / 5; // 6 lights means 5 spaces between them on each side
    const frontBackSpacing = boxWidth / 3; // 4 lights means 3 spaces between them on front and back

    // Function to create a point light
    function createPointLight(x, z, hue) {
        const lightColor = new THREE.Color(`hsl(${hue}, 100%, 50%)`);
        const pointLight = new THREE.PointLight(lightColor, lightIntensity, lightDistance);
        pointLight.position.set(x, 0.5, z); // Y is set to 0 as the lights are in the XZ plane
        return pointLight;
    }

    // Add front and back lights (4 each)
    for (let i = 0; i < 4; i++) {
        const x = -boxWidth / 2 + i * frontBackSpacing;
        const frontHue = (i / 16) * 360;
        const backHue = ((i + 8) / 16) * 360;
        lights.push(createPointLight(x, -boxDepth / 2, frontHue)); // Front lights
        lights.push(createPointLight(x, boxDepth / 2, backHue)); // Back lights
    }

    // Add side lights (6 each)
    for (let i = 0; i < 6; i++) {
        const z = -boxDepth / 2 + i * sideSpacing;
        const leftHue = ((i + 12) / 16) * 360;
        const rightHue = ((i + 4) / 16) * 360;
        lights.push(createPointLight(-boxWidth / 2, z, leftHue)); // Left side lights
        lights.push(createPointLight(boxWidth / 2, z, rightHue)); // Right side lights
    }

    // Create a group and add all lights
    const lightsGroup = new THREE.Group();
    lights.forEach(light => lightsGroup.add(light));

    // Return the group of point lights
    return lightsGroup;
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


function initM22Effect(scene, camera) {
    var geometry = new THREE.BoxGeometry(10, 40, 20);
    
    var material = new THREE.MeshPhongMaterial({
        color: 0x000000,      // Base color of the material
        specular: 0xffffff,   // Specular highlights color, white in this case
        shininess: 30,        // Shininess factor, adjust for desired effect
        transparent: false,   // Transparency settings
        opacity: 0.5          // Opacity settings
    });

    m22Mesh = new THREE.Mesh(geometry, material);

    var imageURL = 'https://cdn.stamped.io/uploads/videos/593f83842d9dc5b6711cc583b4134598.jpg'
    
   
    var displayGeometry = new THREE.PlaneGeometry(7, 14);
    var displayMaterial = new THREE.MeshBasicMaterial({ color: 0x00000F });

    displayPlane = new THREE.Mesh(displayGeometry, displayMaterial);
    displayPlane.position.set(0.1, 3, 10.1);
    
    m22Mesh.add(displayPlane);

    var smmGeometry = createHexagonalButtonGeometry();
    var smuGeometry = createUpwardsTriangleGeometry();
    var smkGeometry = createRoundedRectangleGeometry();
    var smdGeometry = createDownwardsTriangleGeometry();

    var smmMaterial = new THREE.MeshPhongMaterial({ shininess: 0, color: 0x000000 }); // Original color
    var smuMaterial = new THREE.MeshPhongMaterial({ shininess: 0, color: 0x000000 });
    var smkMaterial = new THREE.MeshPhongMaterial({ shininess: 0, color: 0x000000 });
    var smdMaterial = new THREE.MeshPhongMaterial({ shininess: 0, color: 0x000000 });

    smmButton = new THREE.Mesh(smmGeometry, smmMaterial);
    smuButton = new THREE.Mesh(smuGeometry, smuMaterial);
    smkButton = new THREE.Mesh(smkGeometry, smkMaterial);
    smdButton = new THREE.Mesh(smdGeometry, smdMaterial);


    smmButton.position.set(0,  13, 11);
    smuButton.position.set(0,  -8, 11);
    smkButton.position.set(0, -10, 11);
    smdButton.position.set(0, -12, 11);
    
    m22Mesh.add(smmButton);
    m22Mesh.add(smuButton);
    m22Mesh.add(smkButton);
    m22Mesh.add(smdButton);

    // Create a translucent box with the same dimensions
    var translucentBoxGeometry = new THREE.BoxGeometry(10, 1, 20);
    var translucentBoxMaterial = new THREE.MeshPhongMaterial({
        color: 0xFFFFFF,      // Base color of the material
        specular: 0xffffff,   // Specular highlights color, white in this case
        shininess: 0,         // Shininess factor
        transparent: true,    // Enable transparency
        opacity: 0.9          // Set the opacity
    });
    var translucentBox = new THREE.Mesh(translucentBoxGeometry, translucentBoxMaterial);

    // Position the translucent box on top of m22Mesh
    translucentBox.position.y = m22Mesh.position.y + 20.5; // Position it 40 units above m22Mesh in the Y-axis

    // Add the translucent box to the scene
    m22Mesh.add(translucentBox);

    // Create and add the LED ring of point lights
    const ledRingOfPointLights = createLEDRingOfPointLights(10, 20);

    // Calculate the Y position to be 0.5 units above the top of the m22Mesh
    const boxHeight = m22Mesh.geometry.parameters.height; // Height of the box
    ledRingOfPointLights.position.y = m22Mesh.position.y + boxHeight / 2 + 0.5; // Position the lights 0.5 units above the box

    //m22Mesh.add(ledRingOfPointLights);


    // Create an opaque box with the same dimensions and material properties
    var opaqueBoxGeometry = new THREE.BoxGeometry(10, 1, 20);
    var opaqueBoxMaterial = new THREE.MeshPhongMaterial({
        color: 0x000000,      // Base color of the material
        specular: 0xffffff,   // Specular highlights color, white in this case
        shininess: 30,        // Shininess factor
        transparent: false,   // Disable transparency for the opaque box
        opacity: 1.0          // Full opacity
    });
    var opaqueBox = new THREE.Mesh(opaqueBoxGeometry, opaqueBoxMaterial);

    // Position the opaque box on top of the translucent box
    opaqueBox.position.y = translucentBox.position.y + 1; // Position it 40 units above the translucent box in the Y-axis

    // Add the opaque box as a child of m22Mesh so it moves with the rest of the structure
    m22Mesh.add(opaqueBox);


    // Example usage
    var esccMesh = createESCCWithHollowCylinder(imageURL);
    //var esccMesh = createESCCWithHollowCylinder();

   // Assuming esccMesh is the mesh of your ESCC and m22Mesh is your existing box mesh

    const boxDepth = m22Mesh.geometry.parameters.depth;
    const esccHeight = 4;

    // Set the ESCC position relative to the box
    esccMesh.position.x = m22Mesh.position.x; // Align with the center of the box along X-axis

    // Position the ESCC on top of the m22Mesh
    esccMesh.position.y = m22Mesh.position.y + boxHeight / 2 + esccHeight;

    // Position the ESCC such that its outer edge is 1 unit from the back of the m22Mesh
    esccMesh.position.z = m22Mesh.position.z - boxDepth / 2 + 8 - 1;

    // Add the ESCC to the m22Mesh or scene
    m22Mesh.add(esccMesh); // or scene.add(esccMesh), depending on your scene setup

    const lightColor = 0xffffff; // White light
    const intensity = 1; // Adjust intensity as needed
    const distance = 100; // Adjust the light's range

    // Create a new point light
    const pointLight = new THREE.PointLight(lightColor, intensity, distance);

    // Position the light above the m22Mesh
    pointLight.position.x = m22Mesh.position.x;
    pointLight.position.y = m22Mesh.position.y + m22Mesh.geometry.parameters.height / 2; // Centered above m22Mesh
    pointLight.position.z = m22Mesh.position.z;

    // Add the light to the scene
    m22Mesh.add(pointLight);
    

    m22Mesh.position.z = 600;
    
    m22Mesh.rotation.x = 0.25;
    m22Mesh.rotation.y = -0.25;

    // Calculate the scale factor based on the camera position and box z position
    const cameraPosition = camera.position.z;
    const boxPosition = m22Mesh.position.z;
    const scaleValue = (window.innerHeight * 0.5) / (cameraPosition - boxPosition);

    // Apply the scale to m22Mesh
    m22Mesh.scale.set(scaleValue, scaleValue, scaleValue);
   
    scene.add(m22Mesh);

    var light1 = new THREE.PointLight(0xffffff, 0.25, 1000);
    light1.position.set(0, -200, 1000);
    scene.add(light1);

    var ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
}

function onDocumentMouseMove(event) {
    event.preventDefault();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function checkHover(camera) {
    raycaster.setFromCamera(mouse, camera);

    // Create an array of buttons
    const buttons = [smmButton, smuButton, smkButton, smdButton];

    // Initialize the intersected button to null
    let intersectedButton = null;

    // Iterate through each button and check for intersections
    for (const button of buttons) {
        const intersects = raycaster.intersectObject(button);

        if (intersects.length > 0) {
            // Button is hovered over
            //console.log(`Button hovered: ${button.name}`); // Write to console
            intersectedButton = button;
            button.material.color.setHex(0x00ff00); // Hover color
        } else {
            // Button is not hovered over
            button.material.color.setHex(button.currentHex);
        }
    }

    // Update the intersected button
    INTERSECTED = intersectedButton;
}

// Callback functions for each button
function onSmmButtonClick() {
    console.log("SMM Button Clicked");
}

function onSmuButtonClick() {
    console.log("SMU Button Clicked");
}

function onSmkButtonClick() {
    console.log("SMK Button Clicked");
}

function onSmdButtonClick() {
    console.log("SMD Button Clicked");
}

// Event listeners for mouse move and click
document.addEventListener('mousemove', onDocumentMouseMove, false);
document.addEventListener('click', onMouseClick, false);

function onMouseClick() {
    if (INTERSECTED) {
        // Determine which button was clicked and call the corresponding callback function
        if (INTERSECTED === smmButton) {
            onSmmButtonClick();
        } else if (INTERSECTED === smuButton) {
            onSmuButtonClick();
        } else if (INTERSECTED === smkButton) {
            onSmkButtonClick();
        } else if (INTERSECTED === smdButton) {
            onSmdButtonClick();
        }
    }
}
// Add event listeners for both click and touch
document.addEventListener('click', onMouseClick, false);
document.addEventListener('touchstart', onTouchStart, false);
document.addEventListener('touchmove', onTouchMove, false);
document.addEventListener('touchend', onTouchEnd, false);

// Variables to track initial touch positions
let initialTouchX = 0;
let initialTouchY = 0;

// Function to handle touch start event
function onTouchStart(event) {
    if (event.touches.length === 1) {
        // Get the initial touch position
        const touch = event.touches[0];
        initialTouchX = touch.clientX;
        initialTouchY = touch.clientY;

        // Calculate normalized device coordinates from touch position
        const touchX = (touch.clientX / window.innerWidth) * 2 - 1;
        const touchY = -(touch.clientY / window.innerHeight) * 2 + 1;

        // Update the mouse vector for raycasting
        mouse.x = touchX;
        mouse.y = touchY;

        // Check for intersections with buttons
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects([smmButton, smuButton, smkButton, smdButton]);

        if (intersects.length > 0) {
            // Set INTERSECTED to the intersected button
            INTERSECTED = intersects[0].object;

            // Perform actions based on the intersected button
            switch (INTERSECTED) {
                case smmButton:
                    onTouchStartSmm();
                    break;
                case smuButton:
                    onTouchStartSmu();
                    break;
                case smkButton:
                    onTouchStartSmk();
                    break;
                case smdButton:
                    onTouchStartSmd();
                    break;
            }
        }
    }
}

// Function to handle touch end event
function onTouchEnd() {
    // Reset the initial touch positions
    initialTouchX = 0;
    initialTouchY = 0;

    // Reset the color of all buttons
    smmButton.material.color.set(0x000000);
    smuButton.material.color.set(0x000000);
    smkButton.material.color.set(0x000000);
    smdButton.material.color.set(0x000000);
}

// Function to handle touch move event
function onTouchMove(event) {
    if (event.touches.length === 1) {
        // Get the current touch position
        const touch = event.touches[0];

        // Calculate the change in touch position
        const deltaX = touch.clientX - initialTouchX;
        const deltaY = touch.clientY - initialTouchY;

        // Update the m22Mesh's rotation based on touch movement
        m22Mesh.rotation.x += deltaY * 0.01; // Adjust the rotation speed
        m22Mesh.rotation.y += deltaX * 0.01; // Adjust the rotation speed

        // Update the initial touch position
        initialTouchX = touch.clientX;
        initialTouchY = touch.clientY;
    }
}



export { initM22Effect, onDocumentMouseMove, checkHover };
