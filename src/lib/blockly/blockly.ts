
import introJs from "intro.js";
import 'intro.js/introjs.css';
import * as Blockly from 'blockly/core';
import DarkTheme from '@blockly/theme-dark';

// Import your custom block definitions FIRST (they need Blockly core)
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

// Import the function to *set* the resolver in the world module
import { setModelUrlResolver } from './3d/world/index';

// Import the async initializer function
// import { initializeBlocklyInstance } from "./blocks/initializer"; // Adjusted path if needed

// Import 3D engine
import { ThreeD } from "./3d/index.ts"; // Assuming path is correcty

// Define the type for the resolver function for clarity
export type ModelUrlResolver = (name: string) => string | null;

// --- Module-level variables ---
let physicsEnabled = false;
let inspectorEnabled = false;
let activeCamera = "ArcRotate";
let threeD: ThreeD | null = null;
let blocklyWorkspace: Blockly.WorkspaceSvg | null = null;
let blocklyGenerator: any = null;
let isAppInitialized = false; // Flag to prevent multiple initializations

let workspace: Blockly.WorkspaceSvg | null = null;
let javascriptGenerator: any = null; // Use 'any' or find a more specific type

let runCounter = 0;

// --- Helper Functions (Moved or defined here) ---

function handleBlocklyResize(workspaceInstance: Blockly.WorkspaceSvg) {
    if (!workspaceInstance) return;
    let blocklyArea = document.getElementById("blocklyArea");
    let blocklyDiv = document.getElementById("blocklyDiv");
    if (!blocklyArea || !blocklyDiv) return;

    let onresize = function () {
        // Compute the absolute coordinates and dimensions of blocklyArea.
        let element: HTMLElement | null = blocklyArea;
        let x = 0;
        let y = 0;
        if (!element) return;
        do {
            x += element.offsetLeft;
            y += element.offsetTop;
            element = element.offsetParent as HTMLElement;
        } while (element);
        // Position blocklyDiv over blocklyArea.
        blocklyDiv.style.left = x + "px";
        blocklyDiv.style.top = y + "px";
        blocklyDiv.style.width = blocklyArea.offsetWidth + "px";
        blocklyDiv.style.height = blocklyArea.offsetHeight + "px";
        Blockly.svgResize(workspaceInstance); // Use passed workspace
    };
    window.addEventListener("resize", onresize, false);
    onresize(); // Call immediately
    Blockly.svgResize(workspaceInstance); // Use passed workspace
}

function getUniqueNameForField(prefix: string, block: Blockly.Block) {
    let counter = 1;
    let existingNames: string[] = [];
    if (!block.workspace) return `${prefix}_${counter}`;

    var blocks = block.workspace.getBlocksByType(block.type, false); // Use false for efficiency if exact type needed

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


function setupEventInitializer(workspaceInstance: Blockly.WorkspaceSvg /*, runCallback: () => Promise<void> - No longer needed here */ ) {
  if (!workspaceInstance) return;

  // --- Keep DEBOUNCE function definition if potentially useful elsewhere, otherwise remove ---
  // function debounce(func, wait) { ... }
  // const debouncedRunCallback = debounce(runCallback, 250); // Remove if debounce not used

  workspaceInstance.addChangeListener(async (ev: Blockly.Events.Abstract) => {
      // Filter events for relevant changes
      // console.log('blockly event = ' + ev.type) // Keep for debugging if needed
      const eventType = ev.type;
      const eventId = ev.id || ev.blockId || 'unknown';
      // console.log(`--- Blockly Event [${eventType}] --- ID: ${eventId}`); // Keep for debugging

      if(ev.type === Blockly.Events.TOOLBOX_ITEM_SELECT){
           // ... (keep existing toolbox logging if desired)
      }

      // Handle block changes for animation dropdowns and saving workspace, but NOT running code
      if (
            ev.type === Blockly.Events.BLOCK_MOVE ||
            ev.type === Blockly.Events.BLOCK_CHANGE ||
            ev.type === Blockly.Events.BLOCK_DELETE ||
            ev.type === Blockly.Events.BLOCK_CREATE
          ) {
            // console.log(`>>> Relevant Event Detected [${eventType}] for ID: ${eventId}. Checking for UI updates.`); // Log adjusted

            // --- Keep Animation Block Update Logic ---
            let eventBlockIds = ev.ids;
            if (!eventBlockIds) {
              eventBlockIds = [ev.blockId];
            }
            var allBlocks = workspace.getAllBlocks(true);
            eventBlockIds.forEach((eventBlockId) => {
                // ... (Keep the entire switch statement for animation block updates) ...
                switch (ev.type) {
                    case Blockly.Events.BLOCK_CREATE:
                        // ... (animationLoop name, animationStart/Stop dropdowns)
                        let newBlock = workspace.getBlockById(eventBlockId);
                        if (newBlock?.type === "animationLoop") { // Add null check
                          if (newBlock.getFieldValue("NAME") === "animation") {
                            let newUniqueName = getUniqueNameForField("animation", newBlock);
                            newBlock.setFieldValue(newUniqueName, "NAME");
                          }
                          allBlocks.forEach((block) => {
                            if (block.type === "animationStart" || block.type === "animationStop") {
                                //@ts-ignore
                                if (!block.dropdownOptions) block.dropdownOptions = {}; // Initialize if missing
                                //@ts-ignore
                                block.dropdownOptions[newBlock.id] = newBlock.getFieldValue("NAME");
                                // Force refresh dropdown
                                let currentValue = block.getField("ANIMATIONS").getValue();
                                //@ts-ignore
                                block.getField("ANIMATIONS").getOptions(false);
                                block.getField("ANIMATIONS").setValue("none");
                                block.getField("ANIMATIONS").setValue(currentValue);
                            }
                          });
                        }
                        if (newBlock?.type === "animationStart" || newBlock?.type === "animationStop") { // Add null check
                            let loops = [];
                            //@ts-ignore
                            if (!newBlock.dropdownOptions) newBlock.dropdownOptions = {}; // Initialize if missing
                            allBlocks.forEach(function (block) {
                                if (block.type === "animationLoop") {
                                    var name = block.getField("NAME").getValue();
                                    //@ts-ignore
                                    newBlock.dropdownOptions[block.id] = name;
                                    loops.push(block.id);
                                }
                            });
                            // Force refresh dropdown
                            let currentValue = newBlock.getField("ANIMATIONS").getValue();
                            //@ts-ignore
                            newBlock.getField("ANIMATIONS").getOptions(false);
                            newBlock.getField("ANIMATIONS").setValue("none");
                            newBlock.getField("ANIMATIONS").setValue(currentValue);
                        }
                        break;
                    case Blockly.Events.BLOCK_CHANGE:
                        let changedBlock = workspace.getBlockById(eventBlockId);
                        if (changedBlock?.type === "animationLoop") { // Add null check
                            allBlocks.forEach((block) => {
                                if (block.type === "animationStart" || block.type === "animationStop") {
                                    //@ts-ignore
                                    if (!block.dropdownOptions) block.dropdownOptions = {}; // Initialize if missing
                                    //@ts-ignore
                                    block.dropdownOptions[changedBlock.id] = changedBlock.getFieldValue("NAME");
                                    let currentValue = block.getField("ANIMATIONS").getValue();
                                    //@ts-ignore
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
                                //@ts-ignore
                                if (block.dropdownOptions) { // Check if exists
                                    //@ts-ignore
                                    delete block.dropdownOptions[eventBlockId];
                                    let currentValue = block.getField("ANIMATIONS").getValue();
                                    if (currentValue === eventBlockId) {
                                        block.getField("ANIMATIONS").setValue("none");
                                        //@ts-ignore
                                        block.getField("ANIMATIONS").getOptions(false); // Refresh options
                                    } else {
                                         //@ts-ignore
                                         block.getField("ANIMATIONS").getOptions(false); // Refresh options even if value didn't change
                                    }
                                }

                            }
                        });
                        break;
                }
            });
            // --- End Animation Block Update Logic ---


            // Write to session storage (Keep this)
            console.log("Writing workspace to session storage due to block change.");
            let json = Blockly.serialization.workspaces.save(workspace);
            sessionStorage.setItem("workspace", JSON.stringify(json));

            // --- REMOVED: Automatic scene refresh ---
            // console.log(`>>> Scene refresh SKIPPED on [${eventType}]. Manual run required.`);
            // // debouncedRunCallback(); // <-- REMOVED
        }
      else if (ev.type === Blockly.Events.UI && ev.element === 'flyout' && !ev.newValue) {
          console.log('flyout closed')
     }
  });
}


// --- Code Execution ---
// Now accepts `resetScene` flag. Only resets the scene if true.
// Executes generated code against the *current* scene state.
async function run(resetScene: boolean = false, physics: boolean = true) {
  runCounter++;
  const currentRunId = runCounter;
  console.log(`>>> RUN #${currentRunId} Start - Reset Scene: ${resetScene}, Physics: ${physics}`);
  console.time(`RunDuration_${currentRunId}`);

  if (!threeD || !blocklyWorkspace || !blocklyGenerator) {
      console.error(`>>> RUN #${currentRunId} ABORTED: 3D engine or Blockly not fully initialized.`);
      console.timeEnd(`RunDuration_${currentRunId}`);
      return;
  }

  const effectivePhysicsEnabled = physics;

  try {
      // --- Scene Reset (Conditional) ---
      if (resetScene) {
          console.log(`>>> RUN #${currentRunId}: Resetting scene requested...`);
          // Create a completely new scene environment
          await threeD.createScene(true, effectivePhysicsEnabled); // true = initialize environment
          // Re-create camera after scene reset
          await threeD.createCamera();
           console.log(`>>> RUN #${currentRunId}: Scene reset complete.`);
      } else {
           console.log(`>>> RUN #${currentRunId}: Executing on existing scene.`);
           // Optional: You might want to explicitly clear objects added by the *previous*
           // Blockly run here if you don't want additive behavior.
           // threeD.clearBlocklyObjects(); // Example (if implemented)
      }

      // --- Code Generation ---
      // console.log(`>>> RUN #${currentRunId}: Generating code...`);
      let code = '';
      try {
          code = blocklyGenerator.workspaceToCode(blocklyWorkspace);
          // console.log(`>>> RUN #${currentRunId}: Generated Code (snippet): ${code.substring(0, 150)}...`);
      } catch (genError) {
          console.error(`>>> RUN #${currentRunId}: Error generating code:`, genError);
          alert("Error generating code from blocks. Check block connections.");
          console.timeEnd(`RunDuration_${currentRunId}`);
          return;
      }

      // --- Code Execution ---
      // console.log(`>>> RUN #${currentRunId}: Preparing execution...`);
      // Build executionCode. Note the removal of createScene and createCamera calls from here.
      const executionCode = `
          (async () => {
              // console.log(\`>>> EXEC Inner Async Function START\`);
              try {
                  // Set camera type - maybe only needed if resetScene was true or handled differently?
                  // For now, assume camera exists and type is managed elsewhere or by createCamera on reset.
                  // threeD.setCameraType("${activeCamera}"); // Keep if needed, but camera setup is now mainly in createScene/createCamera

                  // --- Execute the generated Blockly code ---
                  ${code}
                  // --- End of generated code ---

                  // Ensure camera exists IF it wasn't created by a reset
                  // If resetScene was false, the camera should still be there. If true, createCamera was called.
                  // A safety check might be needed if blocks could potentially delete the camera.
                  // await threeD.createCamera(); // Generally NOT needed here anymore

                  // console.log(\`>>> Scene execution completed successfully.\`);
              } catch (sceneError) {
                  console.error('>>> Error executing scene code. Name: ' + sceneError.name + '. Message: ' + sceneError.message);
                  console.error('>>> Full Scene Error Object:', sceneError);
                  console.error('>>> Scene Error Stack:', sceneError.stack);
                  alert("An error occurred while running the scene script. Check console.");
              } finally {
                  // console.log(\`>>> EXEC Inner Async Function END\`);
              }
          })(); // Immediately invoke
      `;

      // console.log(`--- START Execution Code String (Run #${currentRunId}) ---`);
      console.log(executionCode);
      // console.log(`--- END Execution Code String (Run #${currentRunId}) ---`);

      // console.log(`>>> RUN #${currentRunId}: Creating scene execution function...`);
      const sceneFunction = new Function('threeD', executionCode);

      // console.log(`>>> RUN #${currentRunId}: Executing scene function...`);
      await sceneFunction(threeD);
      // console.log(`>>> RUN #${currentRunId}: Scene function execution finished.`);

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

// MOVED setPhysicsButton to module scope
function setPhysicsButton() {
  // Find the button element each time the function is called
  const physicsButton = document.getElementById("physics");
  if (!physicsButton) {
      // Add a warning if the button isn't found when expected
      console.warn("setPhysicsButton: Could not find physics button element in the DOM.");
      return;
  }
  // Access the module-level physicsEnabled variable
  if (physicsEnabled) {
      physicsButton.classList.remove("physics-off");
      physicsButton.classList.add("physics-on");
  } else {
      physicsButton.classList.remove("physics-on");
      physicsButton.classList.add("physics-off");
  }
}


// --- UI Setup Function ---
function setupUI() {
     console.log("Setting up UI elements and listeners...");
     // Grab UI elements (ensure these exist in your HTML)
     const playButton = document.getElementById("play"); // <--- Add Play Button
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
     const importInput = document.getElementById("import") as HTMLInputElement; // Type assertion
     //const columnResizer = document.getElementById("columnResizer");

     // NEW: Play Button Listener
  //    playButton?.addEventListener('click', async (e) => {
  //     e.preventDefault();
  //     console.log("play button pressed - executing Blockly code");
  //     // Run the current blocks without resetting the entire scene
  //     await run(false, physicsEnabled); // resetScene = false
  // });

  // MODIFIED: Reset Button Listener
  resetButton?.addEventListener('mouseup', async (e) => {
      e.preventDefault();
      console.log("reset button pressed - resetting scene and running code");
      // Reset the scene AND run the (current) blockly code
      await run(true, physicsEnabled); // resetScene = true
  });

  // MODIFIED: Physics Button Listener
  physicsButton?.addEventListener('mouseup', async (e) => {
      e.preventDefault();
      console.log("physics button pressed");
      physicsEnabled = !physicsEnabled;
      setPhysicsButton();
      // Option 1: Just change state, requires Play/Reset to apply
      // console.log("Physics state toggled. Press Play or Reset to apply.");
      // Option 2: Reset the scene immediately with the new physics state
      console.log("Physics state toggled. Resetting scene to apply.");
      await run(true, physicsEnabled); // Reset scene with new physics state
      // Choose Option 1 or 2 based on desired UX. Option 2 is simpler for the user.
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

     clearButton?.addEventListener('click', async () => { // Make async
      console.log("clear session button pressed");
      if (confirm("Clearing the workspace will lose all unsaved work AND reset the 3D scene. Continue?")) {
          sessionStorage.removeItem("workspace");
          blocklyWorkspace?.clear(); // Clear the blocks visually
          console.log("Workspace cleared. Resetting scene.");
          // Reset scene completely and run the (now empty) workspace
          await run(true, physicsEnabled); // resetScene = true
      }
  });

    // --- Dropdown Logic ---
    const hideAllDropDowns = () => {
      if (examplesDropDown) examplesDropDown.style.display = "none";
      if (vrDropDown) vrDropDown.style.display = "none";
   }

   

   // Use 'click' instead of 'mouseup' for better accessibility (handles keyboard)
   examplesButton?.addEventListener('click', (e) => {
      // 1. Check if the examples dropdown is currently visible *before* hiding all
      const wasVisible = examplesDropDown && getComputedStyle(examplesDropDown).display !== "none";

      // 2. Hide all dropdowns (ensures the other one closes)
      hideAllDropDowns();

      // 3. If it *wasn't* visible, show it now.
      //    If it *was* visible, hideAllDropDowns already closed it.
      if (!wasVisible && examplesDropDown) {
          examplesDropDown.style.display = "flex";
      }
   });

   vrButton?.addEventListener('click', (e) => {
      // 1. Check if the VR dropdown is currently visible *before* hiding all
      const wasVisible = vrDropDown && getComputedStyle(vrDropDown).display !== "none";

      // 2. Hide all dropdowns (ensures the other one closes)
      hideAllDropDowns();

      // 3. If it *wasn't* visible, show it now.
      //    If it *was* visible, hideAllDropDowns already closed it.
      if (!wasVisible && vrDropDown) {
          vrDropDown.style.display = "flex";
      }
   });

   // --- Optional: Add click outside to close ---
   // This makes the UX better, closing dropdowns if you click elsewhere.
   document.addEventListener('click', (e) => {
      // Check if the click target is NOT one of the dropdown buttons
      // AND not INSIDE one of the dropdowns themselves.
      const target = e.target as HTMLElement;
      const isClickOnExamplesButton = examplesButton && examplesButton.contains(target);
      const isClickOnVrButton = vrButton && vrButton.contains(target);
      const isClickInsideExamplesDropdown = examplesDropDown && examplesDropDown.contains(target);
      const isClickInsideVrDropdown = vrDropDown && vrDropDown.contains(target);

      if (!isClickOnExamplesButton && !isClickOnVrButton && !isClickInsideExamplesDropdown && !isClickInsideVrDropdown) {
          hideAllDropDowns();
      }
   });

   // Prevent clicks inside the dropdown from triggering the document listener above
   examplesDropDown?.addEventListener('click', (e) => e.stopPropagation());
   vrDropDown?.addEventListener('click', (e) => e.stopPropagation());
   // --- End Optional Click Outside Logic ---

     // Example loading
     const projects = document.getElementsByClassName("examples-dropdown-item");
     Array.from(projects).forEach((element) => {
        element.addEventListener("click", async (e) => {
            e.preventDefault();
            const target = e.target as Element;
            const filename = target.getAttribute("data-file");
            const physicsAttr = target.getAttribute("data-physics");
            if (!filename || !blocklyWorkspace) return;

            if (confirm("Loading this example workspace will lose all unsaved work AND reset the 3D scene. Continue?")) {
              try {
                  // ... (fetch and load workspace)
                  Blockly.serialization.workspaces.load(json, blocklyWorkspace);
                  hideAllDropDowns();
                  physicsEnabled = physicsAttr === "on";
                  setPhysicsButton();
                  console.log("Example loaded. Resetting scene and running example code.");
                  // Reset scene and run the newly loaded example code
                  await run(true, physicsEnabled); // resetScene = true
              } catch (loadError) {
                  // ... (error handling)
              }
          } else {
              hideAllDropDowns();
          }
        });
     });

     // VR Buttons
     oculusQuestButton?.addEventListener('mouseup', async (e) => {
        e.preventDefault();
        hideAllDropDowns();
        console.log("oculus quest button pressed");
        await threeD?.enableXR(); // Assuming ThreeD has this method
     });

     googleCardboardButton?.addEventListener('mouseup', async (e) => {
        e.preventDefault();
        hideAllDropDowns();
        console.log("google cardboard button pressed");
        activeCamera = "VRDeviceOrientationFreeCamera";
        await run(false, physicsEnabled); // Rerun to change camera
     });

     exitVRButton?.addEventListener('mouseup', async (e) => {
        e.preventDefault();
        hideAllDropDowns();
        console.log("exit vr button pressed");
        activeCamera = "ArcRotate"; // Back to default
        await run(false, physicsEnabled); // Rerun to change camera
     });

     // Export/Import
     exportButton?.addEventListener('click', () => {
         if (!blocklyWorkspace) return;
         console.log("export workspace button pressed");
         try {
             const json = Blockly.serialization.workspaces.save(blocklyWorkspace);
             const jsonString = JSON.stringify(json, null, 2); // Pretty print
             const file = new Blob([jsonString], { type: "application/json" });
             const a = document.createElement("a");
             const url = URL.createObjectURL(file);
             a.href = url;
             a.download = "3d-workspace.json";
             document.body.appendChild(a);
             a.click();
             setTimeout(() => {
                 document.body.removeChild(a);
                 window.URL.revokeObjectURL(url);
             }, 0);
         } catch (exportError) {
             console.error("Error exporting workspace:", exportError);
             alert("Failed to export workspace.");
         }
     });

     importInput?.addEventListener('change', (e) => {
         if (!blocklyWorkspace) return;
         console.log("importing workspace from file");
         const files = (e.target as HTMLInputElement).files;
         if (!files || files.length === 0) return;
         const file = files[0];

         const reader = new FileReader();
         reader.onload = async (event) => {
             try {
                 const jsonString = event.target?.result as string;
                 if (!jsonString) throw new Error("File content is empty.");
                 const json = JSON.parse(jsonString);
                 Blockly.serialization.workspaces.load(json, blocklyWorkspace);
                 sessionStorage.setItem("workspace", jsonString);
                 console.log("Workspace imported. Resetting scene and running imported code.");
                 // Reset scene and run the imported workspace
                 await run(true, physicsEnabled); // resetScene = true
             } catch (importError) {
                 console.error("Error importing workspace:", importError);
                 alert("Failed to import workspace. Ensure it's a valid JSON file.");
             } finally {
                 // Reset file input to allow importing the same file again
                 if (importInput) importInput.value = '';
             }
         };
         reader.onerror = () => {
             console.error("Error reading file for import.");
             alert("Failed to read the selected file.");
              if (importInput) importInput.value = '';
         }
         reader.readAsText(file);
     });

     // Help / IntroJs
     helpButton?.addEventListener('click', () => {
         console.log("help button pressed");
         introJs().setOptions({ /* Your intro steps */ }).start();
     });

     // Column Resizer
    //  const broadcastColumnResize = (e: PointerEvent) => {
    //     const windowWidth = window.innerWidth;
    //     // Add some hard limits to the column resizing
    //     if (e.clientX < 200 || e.clientX > windowWidth - 200) return;

    //     const runArea = document.getElementById("runArea");
    //     const blocklyArea = document.getElementById("blocklyArea");

    //     if (runArea && blocklyArea) {
    //         runArea.style.width = `${((windowWidth - e.clientX) / windowWidth) * 100}%`;
    //         blocklyArea.style.width = `${(e.clientX / windowWidth) * 100}%`;

    //         // Dispatch resize event for Blockly and potentially ThreeD canvas
    //         window.dispatchEvent(new Event("resize"));
    //     }
    //  };

    //  columnResizer?.addEventListener('pointerdown', () => {
    //     document.addEventListener("pointermove", broadcastColumnResize);
    //     // Use pointerup on document to catch release anywhere
    //     const resizeEnd = () => {
    //         console.log("resize complete");
    //         document.removeEventListener("pointermove", broadcastColumnResize);
    //         document.removeEventListener("pointerup", resizeEnd);
    //     };
    //     document.addEventListener("pointerup", resizeEnd);
    //  });

     console.log("UI setup complete.");
}

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
    createCustomBlock("moveShapeTowardsShape", world.moveShapeTowardsShape);
    createCustomBlock("rotate", world.rotate);
    createCustomBlock("clone", world.clone);
    createCustomBlock("remove", world.remove);
    createCustomBlock("addTo", world.addTo);
    createCustomBlock("coordinates", world.coordinates);
    createCustomBlock("getPosition", world.getPosition);

    // Shapes
    createCustomBlock("customObject", shapes.customObject);
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
async function initializeBlocklyInstance(divId: string): Promise<{ workspace: Blockly.WorkspaceSvg, generator: any }> {
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

  // 1. Load Messages
  try {
    // Import Blockly core *before* messages, just to be safe
    await import('blockly/core'); // Ensure core is definitely loaded once
    
    const x:any = await import('blockly/msg/en');
    Blockly.setLocale(x);
    console.log("Messages loaded.");
    
    
  } catch (e) {
    console.error("Error loading Blockly messages:", e);
    throw e;
  }

  // 2. Load Standard Blocks
  try {
    await import('blockly/blocks');
    console.log("Standard blocks loaded.");
  } catch (e) {
    console.error("Error loading Blockly standard blocks:", e);
    throw e;
  }

 

  // 3. Load Generator and Toolbox Definition
  let toolboxJson: any;
  try {
    const [generatorModule, toolboxModule] = await Promise.all([
      import('blockly/javascript'),
      import('./blocks/toolbox') // Ensure './toolbox.ts' exports 'toolbox' correctly
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
  } catch (e) {
    console.error('Error defining theme:', e);
    // Continue without custom theme? Or throw? For now, just log.
  }

  // 6. Inject Workspace
  try {
    console.log("Injecting workspace...");
    workspace = Blockly.inject(divId, {
      toolbox: toolboxJson, // Use the loaded toolbox definition
      //theme: Blockly.Themes.Zelos, // Use custom theme or fallback
      theme: DarkTheme, // Use custom theme or fallback
      horizontalLayout: false,
      toolboxPosition: "start",
      renderer: 'thrasos',
      move: {
        scrollbars: { horizontal: true, vertical: true },
        drag: true,
        wheel: true,
      },
      grid:{
        spacing: 20,
          length: 3,
          colour: '#ccc',
          snap: true,
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


// --- Main Application Initialization Function ---
export async function init(blocklyDivId: string = 'blocklyDiv', canvasId: string = 'runAreaCanvas', modelUrlResolver: ModelUrlResolver) {
    if (isAppInitialized) {
        console.warn("Application already initialized.");
        return;
    }
    isAppInitialized = true; // Set flag immediately
    console.log("Starting application initialization...");
    let globalHavokInstance: any = null; // Variable to hold the initialized Havok engine
    try {

       // --- ADD HAVOK INITIALIZATION ---
       try {
            console.log("Initializing Havok physics engine (WASM)...");
            // HavokPhysics() returns a promise that resolves with the Havok engine instance
            globalHavokInstance = await HavokPhysics();
            if (!globalHavokInstance) {
                throw new Error("HavokPhysics() function returned null or undefined.");
            }
            console.log("Havok WASM engine initialized successfully.");
        } catch (havokError) {
            console.error("FATAL: Failed to initialize Havok physics engine:", havokError);
            // Display error and stop initialization
            const errorDiv:any = document.createElement('div');
            errorDiv.style.color = 'red';
            errorDiv.style.padding = '20px';
            errorDiv.textContent = `Failed to initialize Havok Physics. Please check browser compatibility and console. Error: ${havokError instanceof Error ? havokError.message : String(havokError)}`;
            document.body.prepend(errorDiv);
            isAppInitialized = false; // Reset flag
            return; // Stop execution
        }
        // --- END HAVOK INITIALIZATION ---


        // 1. Initialize 3D Engine
        console.log("Initializing 3D engine...");
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) throw new Error(`Canvas element with ID "${canvasId}" not found.`);
        //threeD = new ThreeD(canvas);
        threeD = new ThreeD(canvas, globalHavokInstance);
        threeD.runRenderLoop();
        window.addEventListener("resize", () => threeD?.engine?.resize());
        console.log("3D engine initialized.");

        // --- PASS THE RESOLVER TO THE 3D WORLD ---
        // Call the setter function we will define in step 3
        console.log('Setting model URL resolver for the 3D world...');
        setModelUrlResolver(modelUrlResolver);
        // --- END MODIFICATION ---


        // 2. Initialize Blockly Instance (awaits sequential loading inside)
        console.log("Initializing Blockly instance...");
        const { workspace: ws, generator: gen } = await initializeBlocklyInstance(blocklyDivId);
        blocklyWorkspace = ws;
        blocklyGenerator = gen;
        console.log("Blockly instance initialized.");
        

        // 3. Setup Blockly resizing and event listeners AFTER workspace is ready
          // --- Setup Blockly resizing and event listeners ---
          //handleBlocklyResize(blocklyWorkspace);
          // Pass NO run callback here, events only save/update UI now
          setupEventInitializer(blocklyWorkspace /* NO CALLBACK */);

        // 4. Load initial workspace state (from session or default/sample)
        // --- Create Initial 3D Scene ---
        console.log("Creating initial 3D scene...");
        // Determine initial physics state (e.g., based on a default or saved preference)
        // For now, let's default to physics OFF unless overridden by sample/URL param
        physicsEnabled = false; // Default initial state
        await threeD.createScene(true, physicsEnabled); // true = initialize environment
        await threeD.createCamera(); // Create the initial camera
        console.log("Initial 3D scene created.");

        // --- Load initial workspace state ---
        console.log("Loading workspace state...");
        const jsonStr = sessionStorage.getItem("workspace");
        let loadedWorkspaceRequiresRun = false; // Flag if loaded code should be run initially
        if (jsonStr) { // Check if jsonStr is not null or empty before parsing
             try {
                 const parsedJson = JSON.parse(jsonStr); // Parse first
                 Blockly.serialization.workspaces.load(parsedJson, blocklyWorkspace);
                 console.log("Workspace loaded from session storage.");
                 loadedWorkspaceRequiresRun = true; // Assume session state should run
             } catch (e) {
                 console.error("Failed to load workspace from session storage (invalid JSON or load error):", e);
                 sessionStorage.removeItem("workspace"); // Clear invalid storage
                 // Load starter workspace if session load failed
                 try {
                     const response = await fetch(`./examples/starter.json`);
                     const json = await response.json();
                     Blockly.serialization.workspaces.load(json, blocklyWorkspace);
                     console.log("Loaded starter workspace instead.");
                     // Optionally set loadedWorkspaceRequiresRun = true for starter too
                 } catch (starterError) {
                      console.error("Failed to load starter workspace:", starterError);
                 }
             }
        } else {
            console.log("No workspace found in session storage. Loading starter workspace...");
             try {
                const response = await fetch(`./examples/starter.json`); // Adjust path
                const json = await response.json();
                Blockly.serialization.workspaces.load(json, blocklyWorkspace);
                // Optionally set loadedWorkspaceRequiresRun = true for starter too
             } catch (starterError) {
                 console.error("Failed to load starter workspace:", starterError);
             }
        }

        

        // 5. Setup UI Buttons and Interactions
        setupUI();
        setPhysicsButton(); // Update physics button visual state

        // --- Handle URL parameters for samples ---
        const urlParams = new URLSearchParams(window.location.search);
        const sample = urlParams.get("sample");
        const phys = urlParams.get("phys");

        if (sample && blocklyWorkspace) {
             console.log(`Loading sample "${sample}" from URL parameters...`);
             try {
                const response = await fetch(`./examples/${sample}.json`);
                if (!response.ok) throw new Error (`Sample fetch failed: ${response.statusText}`);
                const json = await response.json();
                // Clear existing blocks before loading sample
                blocklyWorkspace.clear();
                Blockly.serialization.workspaces.load(json, blocklyWorkspace);
                // Set physics based on param *before* the run call
                physicsEnabled = phys === "1";
                setPhysicsButton(); // Update UI button
                console.log(`Sample "${sample}" loaded. Resetting scene and running sample code.`);
                // Reset scene and run this sample's code
                await run(true, physicsEnabled); // resetScene = true
                loadedWorkspaceRequiresRun = false; // Already ran the sample code
             } catch (sampleError) {
                 console.error(`Failed to load sample "${sample}" from URL:`, sampleError);
                 alert(`Failed to load sample "${sample}" specified in URL.`);
                 // If sample load fails, should we run the default/session state?
                 // Maybe set loadedWorkspaceRequiresRun = true here? For now, no.
             }
        }

        // --- Initial Code Run (if needed) ---
        // Run code from session or starter *if* a sample wasn't loaded and run from URL params
        if (loadedWorkspaceRequiresRun) {
          console.log("Performing initial run for loaded workspace (session/starter)...");
          // Run without resetting the scene, as it was just created.
          await run(false, physicsEnabled); // resetScene = false
      } else {
          console.log("Skipping initial run (handled by sample load or no state to run).");
      }

      console.log("Application initialization complete.");

    } catch (error) {
        console.error("FATAL: Application initialization failed:", error);
        // Display a user-friendly error message on the page
        const errorDiv:any = document.createElement('div');
        errorDiv.style.color = 'red';
        errorDiv.style.padding = '20px';
        errorDiv.textContent = `Application failed to initialize. Please check the console (F12) for details. Error: ${error instanceof Error ? error.message : String(error)}`;
        document.body.prepend(errorDiv); // Add error message to the top
        // Prevent further execution or hide main UI elements if needed
        isAppInitialized = false; // Reset flag on failure
    }

}

// Note: Do not call init() here directly.
// It should be called from page.svelte's onMount.

// Export the main init function and potentially other necessary items if needed elsewhere
export { blocklyWorkspace, blocklyGenerator, threeD, run };