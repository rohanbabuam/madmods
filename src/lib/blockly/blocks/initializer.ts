// src/lib/blockly/blocks/initializer.ts
import * as Blockly from 'blockly/core';

// Import your custom block definitions FIRST (they need Blockly core)
import * as shapes from "./shapes";
import * as world from "./world";
import * as materials from "./materials";
import * as animation from "./animation";
import * as events from "./events";
import * as math from "./math";
import * as physics from "./physics";
import * as lighting from "./lighting";
import * as camera from "./camera";

// --- Variables to hold initialized instances ---
let workspace: Blockly.WorkspaceSvg | null = null;
let javascriptGenerator: any = null; // Use 'any' or find a more specific type

// --- Helper to create custom blocks ---
// Needs access to the generator, so call it *after* generator is loaded
const createCustomBlock = (name: string, blockType: any) => {
  if (!javascriptGenerator) {
    console.error("Attempted to create custom block before JS Generator was loaded:", name);
    return;
  }
  Blockly.Blocks[name] = blockType;
  if (blockType.transpile) {
      javascriptGenerator.forBlock[name] = blockType.transpile;
  } else {
      console.warn(`Block type "${name}" is missing a 'transpile' function for code generation.`);
  }
};

const createCustomBlocks = () => {
    console.log("Creating custom blocks...");
    // World
    createCustomBlock("skybox", world.skybox);
    createCustomBlock("setSkyColor", world.setSkyColor);
    createCustomBlock("ground", world.ground);
    createCustomBlock("createShape", world.createShape);
    createCustomBlock("createShapeAs", world.createShapeAs);
    createCustomBlock("createShapeAndAddTo", world.createShapeAndAddTo);
    createCustomBlock("moveShape", world.moveShape);
    createCustomBlock("moveShapeAlong", world.moveShapeAlong);
    createCustomBlock("rotate", world.rotate);
    createCustomBlock("clone", world.clone);
    createCustomBlock("remove", world.remove);
    createCustomBlock("addTo", world.addTo);
    createCustomBlock("coordinates", world.coordinates);
    createCustomBlock("getPosition", world.getPosition);

    // Shapes
    createCustomBlock("sphere", shapes.sphere);
    createCustomBlock("box", shapes.box);
    createCustomBlock("wall", shapes.wall);
    createCustomBlock("cylinder", shapes.cylinder);
    createCustomBlock("cone", shapes.cone);
    createCustomBlock("torus", shapes.torus);
    createCustomBlock("capsule", shapes.capsule);
    createCustomBlock("ramp", shapes.ramp);

    // Materials
    createCustomBlock("none", materials.none);
    createCustomBlock("matte", materials.matte);
    createCustomBlock("glass", materials.glass);
    createCustomBlock("gloss", materials.gloss);
    createCustomBlock("metal", materials.metal);
    createCustomBlock("bricks", materials.bricks);
    createCustomBlock("carpet", materials.carpet);
    createCustomBlock("chip", materials.chip);
    createCustomBlock("codeorg", materials.codeorg);
    createCustomBlock("fabric", materials.fabric);
    createCustomBlock("grass", materials.grass);
    createCustomBlock("gravel", materials.gravel);
    createCustomBlock("marble", materials.marble);
    createCustomBlock("planets", materials.planets);
    createCustomBlock("road", materials.road);
    createCustomBlock("roofingtiles", materials.roofingtiles);
    createCustomBlock("snow", materials.snow);
    createCustomBlock("sports", materials.sports);
    createCustomBlock("tiles", materials.tiles);
    createCustomBlock("wood", materials.wood);
    createCustomBlock("woodfloor", materials.woodfloor);

    // Animation
    createCustomBlock("animationLoop", animation.loop);
    createCustomBlock("animationStart", animation.start);
    createCustomBlock("animationStop", animation.stop);

    // Events
    createCustomBlock("onClick", events.onClick);
    createCustomBlock("onKeyPress", events.onKeyPress);

    // Physics
    createCustomBlock("setGravity", physics.setGravity);
    createCustomBlock("applyForce", physics.applyForce);
    createCustomBlock("setMass", physics.setMass);

    // Lighting
    createCustomBlock("createLightAs", lighting.createLightAs);
    createCustomBlock("lightBulb", lighting.lightBulb);
    // createCustomBlock("spotlight", lighting.spotlight); // Assuming this exists if needed
    createCustomBlock("showLight", lighting.showLight);
    createCustomBlock("moveLight", lighting.moveLight);
    createCustomBlock("moveLightAlong", lighting.moveLightAlong);
    createCustomBlock("setLightColor", lighting.setLightColor);
    createCustomBlock("setLightIntensity", lighting.setLightIntensity);
    createCustomBlock("setAmbientLightIntensity", lighting.setAmbientLightIntensity);

    // Camera
    createCustomBlock("moveCamera", camera.moveCamera);
    createCustomBlock("moveCameraAlong", camera.moveCameraAlong);
    // createCustomBlock("setCameraType", camera.setCameraType); // Assuming this exists if needed
    createCustomBlock("pointCameraTowards", camera.pointCameraTowards);
    createCustomBlock("keepDistanceOf", camera.keepDistanceOf);

    // Math/Debug
    createCustomBlock("debug", math.debug);
    console.log("Custom blocks created.");
};


// --- The main async initialization function ---
export async function initializeBlocklyInstance(divId: string): Promise<{ workspace: Blockly.WorkspaceSvg, generator: any }> {
  console.log("Starting Blockly instance initialization...");

  // Dispose previous workspace if it exists
  if (workspace) { // Check if the workspace variable holds an instance
    try {
        console.log("Disposing previous workspace...");
        // CORRECT WAY: Call dispose() on the instance
        workspace.dispose();
        workspace = null; // Clear the reference
    } catch (e) {
        console.error("Error disposing previous workspace:", e)
    }
  }


   // 1. Load Standard Blocks
   try {
    await import('blockly/blocks');
    console.log("Standard blocks loaded.");
  } catch (e) {
    console.error("Error loading Blockly standard blocks:", e);
    throw e;
  }


  // 2. Load Messages
  try {
    await import('blockly/msg/en');
    console.log("Messages loaded.");
    console.log(Blockly.Msg)
    // if (!Blockly.Msg.CONTROLS_REPEAT_TITLE) {
    //   console.warn("CONTROLS_REPEAT_TITLE still missing after import! Check import path/order.");
    //   // Applying manual fallback just in case, but investigate the root cause
    //   Blockly.Msg.CONTROLS_REPEAT_TITLE = "repeat %1 times";
    //   Blockly.Msg.CONTROLS_REPEAT_INPUT_DO = "do";
    // }
  } catch (e) {
    console.error("Error loading Blockly messages:", e);
    throw e;
  }

 

  // 3. Load Generator and Toolbox Definition
  let toolboxJson: any;
  try {
    const [generatorModule, toolboxModule] = await Promise.all([
      import('blockly/javascript'),
      import('./toolbox') // Ensure './toolbox.ts' exports 'toolbox' correctly
    ]);
    javascriptGenerator = generatorModule.javascriptGenerator; // Assign to module scope variable
    toolboxJson = toolboxModule.toolbox;
    console.log("Generator and Toolbox definition loaded.");
  } catch (e) {
    console.error("Error loading generator or toolbox definition:", e);
    throw e;
  }

  // 4. Define Custom Blocks (requires generator to be loaded)
  try {
    createCustomBlocks(); // Call this after generator is loaded
  } catch (e) {
    console.error("Error creating custom blocks:", e);
    throw e;
  }


  // 5. Define Theme
  let theme: Blockly.Theme | null = null;
  try {
    theme = Blockly.Theme.defineTheme("customTheme", { // Give it a unique name
      base: Blockly.Themes.Zelos, // Example base theme
      name: "customTheme",
      componentStyles: {
        workspaceBackgroundColour: "#ccc",
        toolboxBackgroundColour: "#5d5d73",
        toolboxForegroundColour: "#fff",
        flyoutBackgroundColour: "#3d3d53",
        flyoutForegroundColour: "#ddd",
        flyoutOpacity: 0.8,
        scrollbarColour: "#797979",
        insertionMarkerColour: "#fff",
        insertionMarkerOpacity: 0.3,
        scrollbarOpacity: 0.4,
        cursorColour: "#d0d0d0",
      },
      fontStyle: { family: "Roboto Mono", size: 10 },
    });
    console.log('Theme defined successfully.');
  } catch (e) {
    console.error('Error defining theme:', e);
    // Continue without custom theme? Or throw? For now, just log.
  }

  // 6. Inject Workspace
  try {
    console.log("Injecting workspace...");
    workspace = Blockly.inject(divId, {
      toolbox: toolboxJson, // Use the loaded toolbox definition
      theme: theme || Blockly.Themes.Zelos, // Use custom theme or fallback
      horizontalLayout: false,
      toolboxPosition: "start",
      move: {
        scrollbars: { horizontal: false, vertical: true },
        drag: true,
        wheel: true,
      },
      zoom: { controls: true, wheel: false, startScale: 0.9, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2, pinch: false },
      trashcan: false, // As per your config
    });

    if (!workspace) {
        throw new Error("Blockly.inject returned null or undefined.");
    }

    console.log("Workspace injected successfully.");
  } catch (e) {
    console.error("Error injecting Blockly workspace:", e);
    workspace = null; // Ensure workspace is null on failure
    throw e;
  }

  // Return the initialized instances
  if (!workspace || !javascriptGenerator) {
      throw new Error("Initialization failed: Workspace or Generator is null.")
  }
  return { workspace, generator: javascriptGenerator };
}

// Export the initializer function
// No need to export workspace/generator directly from here anymore