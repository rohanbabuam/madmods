import * as BABYLON from '@babylonjs/core/Legacy/legacy';

import { convertCoordsBlockToCoords } from "../world";

const BRIGHTNESS_MULTIPLIER = 1;
const BRIGHTNESS_MAX = 10000;

const convertLightBlockToLight = (lightBlock: LightBlock) => {
  if (!lightBlock) return null;
  if (!lightBlock[0]) return null;
  let light = lightBlock[0];
  if (light === null) return null;
  return light;
};

const convertLightBlockToLightInScene = (lightBlock: LightBlock, scene: BABYLON.Scene) => {
  if (!lightBlock) return null;
  if (!lightBlock[0]) return null;
  let light = lightBlock[0];
  if (light === null) return null;
  let lightInScene = scene.getLightById(light.id);
  return lightInScene;
};

// Creates a light bulb, light comes from all directions
// --- MODIFIED createLightBulb (PointLight) ---
const createLightBulb = (light: Light, coords: Coords, scene: BABYLON.Scene) => {
  let lightBulb = scene.getLightById(light.id);
  let nodeExists = !!lightBulb;
  let recreateNeeded = false;

  if (nodeExists && lightBulb) {
      if (!(lightBulb instanceof BABYLON.PointLight)) {
          console.warn(`ID ${light.id} exists but is not a PointLight (LightBulb). Disposing and recreating.`);
          lightBulb.dispose();
          lightBulb = null;
          nodeExists = false;
          recreateNeeded = true;
      } else {
          console.log(`Updating existing LightBulb: ${light.id}`);
          // Update position
          lightBulb.position.set(coords.x, coords.y, coords.z);
          // Update intensity
          let intensity = light.props.b;
          if (intensity < 0) intensity = 0;
          if (intensity > BRIGHTNESS_MAX) intensity = BRIGHTNESS_MAX;
          lightBulb.intensity = intensity * BRIGHTNESS_MULTIPLIER;
          // Update color
          lightBulb.diffuse = BABYLON.Color3.FromHexString(light.props.c);
          // PointLight specific properties (if any changeable via blocks)
          // lightBulb.shadowEnabled = ...;
      }
  }

  if (!nodeExists || recreateNeeded) {
      console.log(`Creating new LightBulb: ${light.id}`);
      // Use Vector3.Zero() initially, then set position
      lightBulb = new BABYLON.PointLight(light.id, BABYLON.Vector3.Zero(), scene);
      lightBulb.position.set(coords.x, coords.y, coords.z);
      let intensity = light.props.b;
      if (intensity < 0) intensity = 0;
      if (intensity > BRIGHTNESS_MAX) intensity = BRIGHTNESS_MAX;
      lightBulb.intensity = intensity * BRIGHTNESS_MULTIPLIER;
      lightBulb.diffuse = BABYLON.Color3.FromHexString(light.props.c);
  }
};

// --- MODIFIED createSpotlight ---
const createSpotlight = (light: Light, coords: Coords, scene: BABYLON.Scene) => {
  let spotlight = scene.getLightById(light.id);
  let nodeExists = !!spotlight;
  let recreateNeeded = false;

  if (nodeExists && spotlight) {
       if (!(spotlight instanceof BABYLON.SpotLight)) {
          console.warn(`ID ${light.id} exists but is not a SpotLight. Disposing and recreating.`);
          spotlight.dispose();
          spotlight = null;
          nodeExists = false;
          recreateNeeded = true;
      } else {
          console.log(`Updating existing SpotLight: ${light.id}`);
          // Update position
          spotlight.position.set(coords.x, coords.y, coords.z);
          // Update direction
          spotlight.direction = new BABYLON.Vector3(light.props.x, light.props.y, light.props.z);
          // Update angle (beam size)
          spotlight.angle = light.props.s; // Assuming props.s is angle in radians
          // Update exponent (range related, though SpotLight uses 'range' property)
          spotlight.exponent = light.props.r; // Assuming props.r maps to exponent somewhat
           // Update range if available directly (check BabylonJS SpotLight docs)
          // spotlight.range = light.props.r;
          // Update intensity
          let intensity = light.props.b;
          if (intensity < 0) intensity = 0;
          if (intensity > 100) intensity = 100; // Spotlight intensity range might differ
          spotlight.intensity = intensity / 50; // Original scaling
          // Update color
          spotlight.diffuse = BABYLON.Color3.FromHexString(light.props.c);
      }
  }

  if (!nodeExists || recreateNeeded) {
      console.log(`Creating new SpotLight: ${light.id}`);
       // Use Vector3.Zero() initially, then set position
      spotlight = new BABYLON.SpotLight(
          light.id,
          BABYLON.Vector3.Zero(), // Initial position
          new BABYLON.Vector3(light.props.x, light.props.y, light.props.z), // direction
          light.props.s, // angle (beam size)
          light.props.r, // exponent (related to range)
          scene
      );
      spotlight.position.set(coords.x, coords.y, coords.z);
      let intensity = light.props.b;
      if (intensity < 0) intensity = 0;
      if (intensity > 100) intensity = 100;
      spotlight.intensity = intensity / 50;
      spotlight.diffuse = BABYLON.Color3.FromHexString(light.props.c);
  }
};


// Creates a light
const createLight = (lightBlock: LightBlock, coordsBlock: CoordsBlock, scene: BABYLON.Scene) => {
  let light = convertLightBlockToLight(lightBlock);
  let coords = convertCoordsBlockToCoords(coordsBlock);

  if (light && coords) {
    switch (light.type) {
      case "lightbulb":
        createLightBulb(light, coords, scene);
        break;
      case "spotlight":
        createSpotlight(light, coords, scene);
        break;
    }
  }
};

 // Show a light on the scene to help with debugging
 const showLight = (lightBlock: LightBlock, scene: BABYLON.Scene) => {
  let light = convertLightBlockToLightInScene(lightBlock, scene);
  if (light) {
    let lightSphere = BABYLON.CreateSphere("ls", { diameter: 1 });
    let material = new BABYLON.StandardMaterial("lsm", scene);
    material.emissiveColor = new BABYLON.Color3(1, 1, 0);
    lightSphere.material = material;
    lightSphere.position = light.getAbsolutePosition();
  }
};

// Move a light to a new position
const moveLight = (lightBlock: LightBlock, coordsBlock: CoordsBlock, scene: BABYLON.Scene) => {
  let light = convertLightBlockToLightInScene(lightBlock, scene);
  let coords = convertCoordsBlockToCoords(coordsBlock);
  if (light && coords) {
    //@ts-ignore (N/A as we don't allow use to create ambient light types)
    light.position.x = coords.x;
    //@ts-ignore
    light.position.y = coords.y;
    //@ts-ignore
    light.position.z = coords.z;
  }
};

// Move a light along an axis
const moveLightAlong = (lightBlock: LightBlock, axis: string, steps: number, scene: BABYLON.Scene) => {
  let light = convertLightBlockToLightInScene(lightBlock, scene);
  if (light) {
    //@ts-ignore
    light.position[axis] += steps;
  }
};

// Sets the color of a light
const setLightColor = (lightBlock: LightBlock, color: string, scene: BABYLON.Scene) => {
  let light = convertLightBlockToLightInScene(lightBlock, scene);
  if (light) {
    light.diffuse = BABYLON.Color3.FromHexString(color);
  }
};

// Sets the intensity of a light
const setLightIntensity = (lightBlock: LightBlock, intensity: number, scene: BABYLON.Scene) => {
  let light = convertLightBlockToLightInScene(lightBlock, scene);
  if (light) {
    if (intensity < 0) intensity = 0;
    if (intensity > BRIGHTNESS_MAX) intensity = BRIGHTNESS_MAX;
    light.intensity = intensity * BRIGHTNESS_MULTIPLIER;
  }
};

export { BRIGHTNESS_MAX, BRIGHTNESS_MULTIPLIER, createLight, showLight, moveLight, moveLightAlong, setLightColor, setLightIntensity };
