import introJs from "intro.js";
import 'intro.js/introjs.css';
import * as Blockly from 'blockly/core';
import DarkTheme from '@blockly/theme-dark';

import * as shapes from "./blocks/shapes";
import * as world from "./blocks/world";
import * as materials from "./blocks/materials";
import * as animation from "./blocks/animation";
import * as events from "./blocks/events";
import * as math from "./blocks/math";
import * as physics from "./blocks/physics";
import * as lighting from "./blocks/lighting";
import * as camera from "./blocks/camera";

import HavokPhysics from "@babylonjs/havok";

import { setModelUrlResolver } from './3d/world/index';

import { ThreeD } from "./3d/index.ts";

import * as SaveLoad from '../state/saveload.ts';

export type ModelUrlResolver = (name: string) => string | null;

let physicsEnabled = false;
let inspectorEnabled = false;
let activeCamera = "ArcRotate";
let threeD: ThreeD | null = null;
let blocklyWorkspace: Blockly.WorkspaceSvg | null = null;
let blocklyGenerator: any = null;
let isAppInitialized = false;


let runCounter = 0;


function getUniqueNameForField(prefix: string, block: Blockly.Block) {
    let counter = 1;
    let existingNames: string[] = [];
    if (!block.workspace) return `${prefix}_${counter}`;

    var blocks = block.workspace.getBlocksByType(block.type, false);

    for (var i = 0; i < blocks.length; i++) {
        var nameField = blocks[i].getFieldValue("NAME");
        if (nameField) {
            existingNames.push(nameField);
        }
    }

    while (true) {
        var newName = prefix + "_" + counter;
        if (!existingNames.includes(newName)) {
            return newName;
        }
        counter++;
    }
}


function setupEventInitializer(workspaceInstance: Blockly.WorkspaceSvg) {
    if (!workspaceInstance) return;

    workspaceInstance.addChangeListener(async (ev: Blockly.Events.Abstract) => {
        const eventType = ev.type;
        const eventId = ev.id || ev.blockId || 'unknown';

        if (
              ev.type === Blockly.Events.BLOCK_MOVE ||
              ev.type === Blockly.Events.BLOCK_CHANGE ||
              ev.type === Blockly.Events.BLOCK_DELETE ||
              ev.type === Blockly.Events.BLOCK_CREATE
            ) {



              let eventBlockIds = ev.ids;
              if (!eventBlockIds) {
                eventBlockIds = [ev.blockId];
              }
              var allBlocks = workspaceInstance.getAllBlocks(true);

              eventBlockIds.forEach((eventBlockId) => {
                   switch (ev.type) {
                      case Blockly.Events.BLOCK_CREATE:
                          let newBlock = workspaceInstance.getBlockById(eventBlockId);
                          if (newBlock?.type === "animationLoop") {
                            if (newBlock.getFieldValue("NAME") === "animation") {

                              let newUniqueName = getUniqueNameForField("animation", newBlock);
                              newBlock.setFieldValue(newUniqueName, "NAME");
                            }

                            allBlocks.forEach((block) => {
                              if (block.type === "animationStart" || block.type === "animationStop") {

                                  if (!block.dropdownOptions) block.dropdownOptions = {};

                                  block.dropdownOptions[newBlock.id] = newBlock.getFieldValue("NAME");
                                  let currentValue = block.getField("ANIMATIONS").getValue();

                                  block.getField("ANIMATIONS").getOptions(false);
                                  block.getField("ANIMATIONS").setValue("none");
                                  block.getField("ANIMATIONS").setValue(currentValue);
                              }
                            });
                          }
                          if (newBlock?.type === "animationStart" || newBlock?.type === "animationStop") {
                              let loops = [];

                              if (!newBlock.dropdownOptions) newBlock.dropdownOptions = {};

                              allBlocks.forEach(function (block) {
                                  if (block.type === "animationLoop") {
                                      var name = block.getField("NAME").getValue();

                                      newBlock.dropdownOptions[block.id] = name;
                                      loops.push(block.id);
                                  }
                              });
                              let currentValue = newBlock.getField("ANIMATIONS").getValue();

                              newBlock.getField("ANIMATIONS").getOptions(false);
                              newBlock.getField("ANIMATIONS").setValue("none");
                              newBlock.getField("ANIMATIONS").setValue(currentValue);
                          }
                          break;
                      case Blockly.Events.BLOCK_CHANGE:
                          let changedBlock = workspaceInstance.getBlockById(eventBlockId);
                          if (changedBlock?.type === "animationLoop") {

                              allBlocks.forEach((block) => {
                                  if (block.type === "animationStart" || block.type === "animationStop") {

                                      if (!block.dropdownOptions) block.dropdownOptions = {};

                                      block.dropdownOptions[changedBlock.id] = changedBlock.getFieldValue("NAME");
                                      let currentValue = block.getField("ANIMATIONS").getValue();

                                      block.getField("ANIMATIONS").getOptions(false);
                                      block.getField("ANIMATIONS").setValue("none");
                                      block.getField("ANIMATIONS").setValue(currentValue);
                                  }
                              });
                          }
                          break;
                      case Blockly.Events.BLOCK_DELETE:

                          allBlocks.forEach((block) => {
                              if (block.type === "animationStart" || block.type === "animationStop") {

                                  if (block.dropdownOptions) {

                                      delete block.dropdownOptions[eventBlockId];
                                      let currentValue = block.getField("ANIMATIONS").getValue();
                                      if (currentValue === eventBlockId) {
                                          block.getField("ANIMATIONS").setValue("none");
                                      }

                                       block.getField("ANIMATIONS").getOptions(false);

                                       if (currentValue !== eventBlockId) {
                                          block.getField("ANIMATIONS").setValue(currentValue);
                                       }
                                  }
                              }
                          });
                          break;
                  }
              });




           if (blocklyWorkspace) {
            SaveLoad.saveProjectToSession(blocklyWorkspace);
        } else {
            console.warn("Could not save to session: Blockly workspace not available.");
        }
    }
  else if (ev.type === Blockly.Events.UI && ev.element === 'flyout' && !ev.newValue) {
      console.log('flyout closed')
 }
});
}



async function run(resetScene: boolean = false, physics: boolean = true) {
    runCounter++;
    const currentRunId = runCounter;
    console.log(`>>> RUN #${currentRunId} Start - Reset Scene: ${resetScene}, Physics: ${physics}`);
    console.time(`RunDuration_${currentRunId}`);


    console.log(`>>> DEBUG: Inside run #${currentRunId} - Checking variables:`);
    console.log(`>>> DEBUG: threeD instance:`, threeD);
    console.log(`>>> DEBUG: blocklyWorkspace instance:`, blocklyWorkspace);
    console.log(`>>> DEBUG: blocklyGenerator instance:`, blocklyGenerator);



    if (!threeD || !blocklyWorkspace || !blocklyGenerator) {
        console.error(`>>> RUN #${currentRunId} ABORTED: 3D engine or Blockly not fully initialized. Generator is:`, blocklyGenerator);
        console.timeEnd(`RunDuration_${currentRunId}`);
        return;
    }

    const effectivePhysicsEnabled = physics;

    try {

        if (resetScene) {
            console.log(`>>> RUN #${currentRunId}: Resetting scene requested...`);
            await threeD.createScene(true, effectivePhysicsEnabled);
            await threeD.createCamera();
            console.log(`>>> RUN #${currentRunId}: Scene reset complete.`);
        } else {
             console.log(`>>> RUN #${currentRunId}: Executing on existing scene.`);
        }


        let code = '';
        try {

            code = blocklyGenerator.workspaceToCode(blocklyWorkspace);
        } catch (genError) {
            console.error(`>>> RUN #${currentRunId}: Error generating code:`, genError);
            alert("Error generating code from blocks. Check block connections.");
            console.timeEnd(`RunDuration_${currentRunId}`);
            return;
        }


        const executionCode = `
            (async () => {
                try {
                    ${code}
                } catch (sceneError) {
                    console.error('>>> Error executing scene code. Name: ' + sceneError.name + '. Message: ' + sceneError.message);
                    console.error('>>> Full Scene Error Object:', sceneError);
                    console.error('>>> Scene Error Stack:', sceneError.stack);
                    alert("An error occurred while running the scene script. Check console.");
                }
            })();
        `;



        const sceneFunction = new Function('threeD', executionCode);
        await sceneFunction(threeD);

    } catch (evalError) {
        console.error(`>>> RUN #${currentRunId}: Error preparing/executing code. Name: ${evalError.name}. Message: ${evalError.message}`);
        console.error(`>>> RUN #${currentRunId}: Full Eval Error Object:`, evalError);
        console.error(`>>> RUN #${currentRunId}: Eval Error Stack Trace:`, evalError.stack);
        alert("A critical error occurred preparing the scene script. Check console.");
    } finally {
        console.timeEnd(`RunDuration_${currentRunId}`);
        console.log(`>>> RUN #${currentRunId} End`);
    }
  }

function setPhysicsButton() {
  const physicsButton = document.getElementById("physics");
  if (!physicsButton) {
      console.warn("setPhysicsButton: Could not find physics button element in the DOM.");
      return;
  }
  if (physicsEnabled) {
      physicsButton.classList.remove("physics-off");
      physicsButton.classList.add("physics-on");
  } else {
      physicsButton.classList.remove("physics-on");
      physicsButton.classList.add("physics-off");
  }
}


function setupUI() {
     console.log("Setting up UI elements and listeners...");

     const playButton = document.getElementById("play");
     const resetButton = document.getElementById("reset");
     const physicsButton = document.getElementById("physics");
     const fullscreenButton = document.getElementById("fullscreen");
     const debugButton = document.getElementById("debug");
     const examplesButton = document.getElementById("examples");
     const examplesDropDown = document.getElementById("examples-dropdown");
     const vrButton = document.getElementById("vr");
     const vrDropDown = document.getElementById("vr-dropdown");
     const oculusQuestButton = document.getElementById("oculusQuestButton");
     const googleCardboardButton = document.getElementById("googleCardboardButton");
     const exitVRButton = document.getElementById("exitVRButton");
     const helpButton = document.getElementById("help");
     const clearButton = document.getElementById("clear");
     const exportButton = document.getElementById("export");
     const importInput = document.getElementById("import") as HTMLInputElement;





    resetButton?.addEventListener('mouseup', async (e) => {
        e.preventDefault();
        console.log("reset button pressed - resetting scene and running code");
        await run(true, physicsEnabled);
    });


    physicsButton?.addEventListener('mouseup', async (e) => {
        e.preventDefault();
        console.log("physics button pressed");
        physicsEnabled = !physicsEnabled;
        setPhysicsButton();
        console.log("Physics state toggled. Resetting scene to apply.");
        await run(true, physicsEnabled);
    });


     fullscreenButton?.addEventListener('mouseup', async (e) => {
         e.preventDefault();
         console.log("full screen button pressed");
         threeD?.engine?.enterFullscreen(false);
     });


     debugButton?.addEventListener('mouseup', (e) => {
         e.preventDefault();
         console.log("debug button pressed");
         inspectorEnabled = !inspectorEnabled;
         if (inspectorEnabled) {
             threeD?.enableInspector();
         } else {
             threeD?.disableInspector();
         }
     });


     clearButton?.addEventListener('click', async () => {
        console.log("clear session button pressed");
        if (confirm("Clearing will remove all blocks, reset the 3D scene, and clear saved static objects. Continue?")) {
            sessionStorage.removeItem("madmodsProjectData");
            blocklyWorkspace?.clear();


            await run(true, physicsEnabled);


            if (blocklyWorkspace) SaveLoad.saveProjectToSession(blocklyWorkspace);
            console.log("Workspace and scene cleared and reset.");
        }
     });


    const hideAllDropDowns = () => {
      if (examplesDropDown) examplesDropDown.style.display = "none";
      if (vrDropDown) vrDropDown.style.display = "none";
   }

    examplesButton?.addEventListener('click', (e) => {
        const wasVisible = examplesDropDown && getComputedStyle(examplesDropDown).display !== "none";
        hideAllDropDowns();
        if (!wasVisible && examplesDropDown) examplesDropDown.style.display = "flex";
    });
    vrButton?.addEventListener('click', (e) => {
        const wasVisible = vrDropDown && getComputedStyle(vrDropDown).display !== "none";
        hideAllDropDowns();
        if (!wasVisible && vrDropDown) vrDropDown.style.display = "flex";
    });
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const isClickOnExamplesButton = examplesButton && examplesButton.contains(target);
        const isClickOnVrButton = vrButton && vrButton.contains(target);
        const isClickInsideExamplesDropdown = examplesDropDown && examplesDropDown.contains(target);
        const isClickInsideVrDropdown = vrDropDown && vrDropDown.contains(target);
        if (!isClickOnExamplesButton && !isClickOnVrButton && !isClickInsideExamplesDropdown && !isClickInsideVrDropdown) {
            hideAllDropDowns();
        }
    });
    examplesDropDown?.addEventListener('click', (e) => e.stopPropagation());
    vrDropDown?.addEventListener('click', (e) => e.stopPropagation());




     const projects = document.getElementsByClassName("examples-dropdown-item");
     Array.from(projects).forEach((element) => {
        element.addEventListener("click", async (e) => {
            e.preventDefault();
            const target = e.target as Element;
            const filename = target.getAttribute("data-file");
            const physicsAttr = target.getAttribute("data-physics");
            const filePath = `./examples/${filename}.json`;

            if (!filename || !filePath || !blocklyWorkspace || !threeD) return;

            if (confirm("Loading this example will replace your current workspace and 3D scene. Continue?")) {
              try {

                  await run(true, physicsEnabled);



                  const projectData = await SaveLoad.loadProjectFromUrl(blocklyWorkspace, filePath);


                  if (projectData.scene && projectData.scene.length > 0) {
                      await threeD.loadStaticMeshes(projectData.scene);
                  }


                  SaveLoad.saveProjectToSession(blocklyWorkspace);

                  hideAllDropDowns();
                  physicsEnabled = physicsAttr === "on";
                  setPhysicsButton();


                  console.log("Example loaded. Running example's Blockly code.");
                  await run(false, physicsEnabled);

              } catch (loadError) {
                   console.error(`Error loading example "${filename}":`, loadError);
                   alert(`Failed to load the example: ${filename}. It might be an old format or missing.`);
                   hideAllDropDowns();
              }
          } else {
              hideAllDropDowns();
          }
        });
     });


     oculusQuestButton?.addEventListener('mouseup', async (e) => {
        e.preventDefault();
        hideAllDropDowns();
        console.log("oculus quest button pressed");
        await threeD?.enableXR();
     });

     googleCardboardButton?.addEventListener('mouseup', async (e) => {
        e.preventDefault();
        hideAllDropDowns();
        console.log("google cardboard button pressed");
        activeCamera = "VRDeviceOrientationFreeCamera";
        await run(false, physicsEnabled);
     });

     exitVRButton?.addEventListener('mouseup', async (e) => {
        e.preventDefault();
        hideAllDropDowns();
        console.log("exit vr button pressed");
        activeCamera = "ArcRotate";
        await run(false, physicsEnabled);
     });


     exportButton?.addEventListener('click', () => {
        if (!blocklyWorkspace) {
           alert("Cannot export: Workspace not available.");
           return;
        }
        console.log("export project button pressed");
        SaveLoad.saveProjectToFile(blocklyWorkspace);
    });


    importInput?.addEventListener('change', (e) => {
        if (!blocklyWorkspace || !threeD) {
            alert("Cannot import: Workspace or 3D engine not available.");
            return;
        }
        console.log("importing project from file");
        const files = (e.target as HTMLInputElement).files;
        const importInputElement = e.target as HTMLInputElement;

        if (!files || files.length === 0) {
           if (importInputElement) importInputElement.value = '';
           return;
        };
        const file = files[0];

        SaveLoad.loadProjectFromFile(blocklyWorkspace, file, async (projectData) => {
           if (projectData) {


               await run(true, physicsEnabled);




               if (projectData.scene && projectData.scene.length > 0) {
                   await threeD?.loadStaticMeshes(projectData.scene);
               }


               SaveLoad.saveProjectToSession(blocklyWorkspace);

               console.log("Project imported. Running imported Blockly code.");

               await run(false, physicsEnabled);
           } else {
               console.log("Import process failed or was cancelled by user.");
           }
            if (importInputElement) importInputElement.value = '';
        });
    });


     console.log("UI setup complete.");
}

const createCustomBlock = (name: string, blockType: any) => {
  if (!blocklyGenerator) {
    console.error("Attempted to create custom block before JS Generator was loaded:", name);
    return;
  }
  Blockly.Blocks[name] = blockType;
  if (blockType.transpile) {
      blocklyGenerator.forBlock[name] = blockType.transpile;
  } else {
      console.warn(`Block type "${name}" is missing a 'transpile' function for code generation.`);
  }
};
const createCustomBlocks = () => {
    console.log("Creating custom blocks...");

    createCustomBlock("skybox", world.skybox);
    createCustomBlock("setSkyColor", world.setSkyColor);
    createCustomBlock("ground", world.ground);
    createCustomBlock("createShape", world.createShape);
    createCustomBlock("createShapeAs", world.createShapeAs);
    createCustomBlock("createShapeAndAddTo", world.createShapeAndAddTo);
    createCustomBlock("moveShape", world.moveShape);
    createCustomBlock("moveShapeAlong", world.moveShapeAlong);
    createCustomBlock("moveShapeTowardsShape", world.moveShapeTowardsShape);
    createCustomBlock("rotate", world.rotate);
    createCustomBlock("clone", world.clone);
    createCustomBlock("remove", world.remove);
    createCustomBlock("addTo", world.addTo);
    createCustomBlock("coordinates", world.coordinates);
    createCustomBlock("getPosition", world.getPosition);
    createCustomBlock("customObject", shapes.customObject);
    createCustomBlock("sphere", shapes.sphere);
    createCustomBlock("box", shapes.box);
    createCustomBlock("wall", shapes.wall);
    createCustomBlock("cylinder", shapes.cylinder);
    createCustomBlock("cone", shapes.cone);
    createCustomBlock("torus", shapes.torus);
    createCustomBlock("capsule", shapes.capsule);
    createCustomBlock("ramp", shapes.ramp);
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
    createCustomBlock("animationLoop", animation.loop);
    createCustomBlock("animationStart", animation.start);
    createCustomBlock("animationStop", animation.stop);
    createCustomBlock("onClick", events.onClick);
    createCustomBlock("onKeyPress", events.onKeyPress);
    createCustomBlock("setGravity", physics.setGravity);
    createCustomBlock("applyForce", physics.applyForce);
    createCustomBlock("setMass", physics.setMass);
    createCustomBlock("createLightAs", lighting.createLightAs);
    createCustomBlock("lightBulb", lighting.lightBulb);
    createCustomBlock("showLight", lighting.showLight);
    createCustomBlock("moveLight", lighting.moveLight);
    createCustomBlock("moveLightAlong", lighting.moveLightAlong);
    createCustomBlock("setLightColor", lighting.setLightColor);
    createCustomBlock("setLightIntensity", lighting.setLightIntensity);
    createCustomBlock("setAmbientLightIntensity", lighting.setAmbientLightIntensity);
    createCustomBlock("moveCamera", camera.moveCamera);
    createCustomBlock("moveCameraAlong", camera.moveCameraAlong);
    createCustomBlock("pointCameraTowards", camera.pointCameraTowards);
    createCustomBlock("keepDistanceOf", camera.keepDistanceOf);
    createCustomBlock("debug", math.debug);
    console.log("Custom blocks created.");
};


async function initializeBlocklyInstance(divId: string): Promise<{ workspace: Blockly.WorkspaceSvg, generator: any }> {
    console.log("Starting Blockly instance initialization...");


    if (blocklyWorkspace) {
      try {
          console.log("Disposing previous workspace...");
          blocklyWorkspace.dispose();
          blocklyWorkspace = null;
      } catch (e) {
          console.error("Error disposing previous workspace:", e)
      }
    }


  try {
    await import('blockly/core');
    const x:any = await import('blockly/msg/en');
    Blockly.setLocale(x);
    console.log("Messages loaded.");
  } catch (e) { console.error("Error loading Blockly messages:", e); throw e; }


  try {
    await import('blockly/blocks');
    console.log("Standard blocks loaded.");
  } catch (e) { console.error("Error loading Blockly standard blocks:", e); throw e; }


  let toolboxJson: any;
  let localGenerator: any = null;
  try {
    const [generatorModule, toolboxModule] = await Promise.all([
      import('blockly/javascript'),
      import('./blocks/toolbox')
    ]);
    localGenerator = generatorModule.javascriptGenerator;
    toolboxJson = toolboxModule.toolbox;
    console.log("Generator and Toolbox definition loaded.");
  } catch (e) { console.error("Error loading generator or toolbox definition:", e); throw e; }


   blocklyGenerator = localGenerator;



  try {
    createCustomBlocks();
} catch (e) { console.error("Error creating custom blocks:", e); throw e; }


  let theme: Blockly.Theme | null = null;
  try {
    theme = Blockly.Theme.defineTheme("customTheme", {
      base: Blockly.Themes.Zelos, name: "customTheme",
      componentStyles: {
        workspaceBackgroundColour: "#fff",
        toolboxBackgroundColour: "#705ccc",
        toolboxForegroundColour: "#705ccc",
        flyoutBackgroundColour: "#3d3d53",
        flyoutForegroundColour: "#ddd",
        flyoutOpacity: 0.8,
        scrollbarColour: "#705ccc",
        insertionMarkerColour: "#fff",
        insertionMarkerOpacity: 0.3,
        scrollbarOpacity: 0.4,
        cursorColour: "#d0d0d0",
      },
      fontStyle: { family: "Roboto Mono", size: 10 },
    });
    console.log('Theme defined successfully.');
  } catch (e) { console.error('Error defining theme:', e); }


  let injectedWorkspace: Blockly.WorkspaceSvg | null = null;
  try {
    console.log("Injecting workspace...");
    injectedWorkspace = Blockly.inject(divId, {

        toolbox: toolboxJson,
        theme: DarkTheme,

        renderer: 'geras',
        grid: {
            spacing: 20,
            length: 3,
            colour: '#4A4A4A',
            snap: true
        },
        zoom: {
            controls: true,
            wheel: true,
            startScale: 0.9,
            maxScale: 3,
            minScale: 0.3,
            scaleSpeed: 1.2
        },
        move: {
            scrollbars: true,
            drag: true,
            wheel: false
        },
        trashcan: false

    });
    if (!injectedWorkspace) throw new Error("Blockly.inject returned null or undefined.");
    console.log("Workspace injected successfully with Dark Theme and Toolbox.");
  } catch (e) {
    console.error("Error injecting Blockly workspace:", e);

    blocklyGenerator = null;
    throw e;
  }



  if (!injectedWorkspace || !localGenerator) {

      blocklyGenerator = null;
      throw new Error("Initialization failed: Workspace or Generator is null.")
  }

  return { workspace: injectedWorkspace, generator: localGenerator };
}


export async function init(blocklyDivId: string = 'blocklyDiv', canvasId: string = 'runAreaCanvas', modelUrlResolver: ModelUrlResolver) {
    if (isAppInitialized) {
        console.warn("Application already initialized.");
        return;
    }
    isAppInitialized = true;
    console.log("Starting application initialization...");
    let globalHavokInstance: any = null;

    try {

        try {
            console.log("Initializing Havok physics engine (WASM)...");
            globalHavokInstance = await HavokPhysics();
            if (!globalHavokInstance) throw new Error("HavokPhysics() function returned null or undefined.");
            console.log("Havok WASM engine initialized successfully.");
        } catch (havokError) {  return; }


        console.log("Initializing 3D engine...");
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) throw new Error(`Canvas element with ID "${canvasId}" not found.`);
        threeD = new ThreeD(canvas, globalHavokInstance);
        threeD.runRenderLoop();
        window.addEventListener("resize", () => threeD?.engine?.resize());
        console.log("3D engine initialized.");

        setModelUrlResolver(modelUrlResolver);


        console.log("Initializing Blockly instance...");
        const { workspace: ws, generator: gen } = await initializeBlocklyInstance(blocklyDivId);
        blocklyWorkspace = ws;
        blocklyGenerator = gen;
        if (!blocklyWorkspace || !blocklyGenerator) {
            throw new Error("Blockly initialization failed to return valid workspace or generator.");
        }
        console.log("Blockly instance initialized.");

        if (blocklyWorkspace) {
            setupEventInitializer(blocklyWorkspace);
        }



        console.log("Creating initial 3D scene and camera...");
        physicsEnabled = false;
        if (!threeD) throw new Error("3D Engine not initialized before creating scene.");
        await threeD.createScene(true, physicsEnabled);
        await threeD.createCamera();
        console.log("Initial 3D scene and camera created. threeD.scene should be valid now.");
        if (!threeD.scene) {
            console.error("CRITICAL: threeD.scene is NULL immediately after createScene/createCamera in init!");
            throw new Error("Scene creation failed to set threeD.scene in init.");
        }


        let loadedProjectData: SaveLoad.SavedProjectData | null = null;
        let loadedFromSessionOrUrl = false;

        const urlParams = new URLSearchParams(window.location.search);
        const sampleUrl = urlParams.get("sample");
        const physUrl = urlParams.get("phys");

        if (sampleUrl && blocklyWorkspace) {
            console.log(`Loading project from URL sample: "${sampleUrl}"...`);
            const sampleFilePath = `./examples/${sampleUrl}.json`;
            try {

                loadedProjectData = await SaveLoad.loadProjectFromUrl(blocklyWorkspace, sampleFilePath);
                loadedFromSessionOrUrl = true;
                physicsEnabled = physUrl === "1";
                console.log("Project loaded from URL sample.");
            } catch (sampleError) {
                console.error(`Failed to load sample "${sampleUrl}" from URL:`, sampleError);
                alert(`Failed to load sample "${sampleUrl}" specified in URL.`);

                loadedProjectData = null;
            }
        }

        if (!loadedFromSessionOrUrl && blocklyWorkspace) {
            console.log("Attempting to load project from session storage...");
            loadedProjectData = SaveLoad.loadProjectFromSession(blocklyWorkspace);
            if (loadedProjectData) {
                loadedFromSessionOrUrl = true;
                console.log("Project loaded from session storage.");


            }
        }

        if (!loadedFromSessionOrUrl && blocklyWorkspace) {
            console.log("Loading default starter project...");
            try {
                loadedProjectData = await SaveLoad.loadProjectFromUrl(blocklyWorkspace, './examples/starter.json');

                console.log("Default starter project loaded.");
            } catch (starterError) {
                console.error("Failed to load starter project:", starterError);
                alert("Failed to load starter project. Proceeding with an empty workspace.");
                loadedProjectData = { code: { blocks: { languageVersion: 0, blocks: [] }, variables: [] }, scene: [] };
            }
        }


        setupUI();
        setPhysicsButton();


        if (loadedProjectData && loadedProjectData.scene && loadedProjectData.scene.length > 0 && threeD && threeD.scene) {
            console.log("Loading static meshes from project data into the scene...");
            await threeD.loadStaticMeshes(loadedProjectData.scene);
            console.log("Static meshes loaded.");
        } else {
            console.log("No static meshes to load from project data, or scene/threeD not ready for it.");
        }


        if (blocklyWorkspace) {
            SaveLoad.saveProjectToSession(blocklyWorkspace);
            console.log("Initial project state saved to session.");
        }




        console.log("Performing initial run of Blockly code on the existing scene...");
        console.log(">>> DEBUG: Before final initial run in init(). threeD.scene is:", threeD?.scene?.uniqueId);
        if (threeD && !threeD.scene) {
            console.error(">>> CRITICAL DEBUG: threeD.scene is NULL right before the FINAL initial run call in init!");
        }
        await run(false, physicsEnabled);

        console.log("Application initialization complete.");

    } catch (error) {
        console.error("FATAL: Application initialization failed:", error);
        isAppInitialized = false; threeD = null; blocklyWorkspace = null; blocklyGenerator = null;
        const errorDiv:any = document.createElement('div');  document.body.prepend(errorDiv);
    }
}

export { blocklyWorkspace, blocklyGenerator, threeD, run };