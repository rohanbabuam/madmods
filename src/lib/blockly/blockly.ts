
import introJs from "intro.js";
import 'intro.js/introjs.css';
import * as Blockly from 'blockly/core';

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

// Import the function to *set* the resolver in the world module
import { setModelUrlResolver } from './3d/world/index';

// Import the async initializer function
// import { initializeBlocklyInstance } from "./blocks/initializer"; // Adjusted path if needed

// Import 3D engine
import { ThreeD } from "./3d/index.js"; // Assuming path is correct

// src/lib/blockly/3d/blockly.ts
import { browser } from '$app/environment'; // SvelteKit's environment check

let AmmoInstance: any = null; // Cache the initialized instance (use proper Ammo type if available)
let ammoPromise: Promise<any> | null = null; // Track the initialization promise

// Function to safely get the initialized Ammo instance, only loads/runs in browser
// Function to safely get the initialized Ammo instance, only loads/runs in browser
async function getAmmo(): Promise<any | null> { // Explicit return type
  // 1. Server check
  if (!browser) {
      console.warn("Attempted to get Ammo.js instance on the server. Skipping.");
      return null;
  }

  // 2. Return cached instance if already initialized AND VALID
  if (AmmoInstance) {
      console.log("Returning cached Ammo instance.");
      return AmmoInstance;
  }

  // 3. If initialization isn't already in progress, start it
  if (!ammoPromise) {
      console.log("Starting Ammo.js dynamic import and initialization...");
      ammoPromise = (async (): Promise<any | null> => { // Explicit promise type
          try {
              console.log("Dynamically importing Ammo.js...");
              const AmmoModule = await import('./ammo/ammo.js');
              const AmmoInit = AmmoModule.default || AmmoModule;
              if (!AmmoInit || typeof AmmoInit.Ammo !== 'function') {
                   console.error("Ammo.js module loaded but invalid format. Missing 'Ammo' function.");
                   throw new Error("Invalid Ammo.js module structure.");
              }
              console.log("Initializing Ammo.js via Ammo()...");
              const initializedAmmo = await AmmoInit.Ammo();

              // *** CRITICAL CHECK ***
              // Verify that the initialized object looks like a valid Ammo instance.
              // Add checks for properties you KNOW should exist.
              if (!initializedAmmo || typeof initializedAmmo.btVector3 !== 'function') {
                   console.error("Ammo.js Ammo() call succeeded but returned invalid instance.", initializedAmmo);
                   throw new Error("Ammo() returned invalid instance.");
              }

              console.log("Ammo.js Initialized Successfully!");
              AmmoInstance = initializedAmmo; // Cache the VALID instance
              console.log('>>> getAmmo: Successfully initialized. Type:', typeof AmmoInstance, 'Instance:', !!AmmoInstance);
              return AmmoInstance;

          } catch (err) {
              console.error(">>> getAmmo: Ammo.js dynamic import or initialization FAILED:", err);
              ammoPromise = null; // Reset promise on failure
              AmmoInstance = null; // Ensure instance is null
              return null; // Explicitly return null on failure
          }
      })();
  } else {
      console.log("Ammo.js initialization already in progress, returning existing promise.");
  }

  // 4. Return the promise. It will resolve to the instance OR null.
  // We need to await this again here in case we're hitting the "already in progress" path
  try {
      const result = await ammoPromise;
       console.log(">>> getAmmo: Promise resolved. Result:", !!result);
       return result; // Will be the instance or null
  } catch(err) {
      // This catch might be redundant if the inner catch handles it, but safe to have.
      console.error(">>> getAmmo: Error awaiting the ammoPromise:", err);
      return null;
  }
}

// Define the type for the resolver function for clarity
export type ModelUrlResolver = (name: string) => string | null;

// --- Module-level variables ---
let physicsEnabled = false;
let inspectorEnabled = false;
// Variable to hold the *initialized* Ammo instance
let ammoInstance: any = null; // Use a more specific type if you have Ammo types installed
let activeCamera = "ArcRotate";
let threeD: ThreeD | null = null;
let blocklyWorkspace: Blockly.WorkspaceSvg | null = null;
let blocklyGenerator: any = null;
let isAppInitialized = false; // Flag to prevent multiple initializations

let workspace: Blockly.WorkspaceSvg | null = null;
let javascriptGenerator: any = null; // Use 'any' or find a more specific type

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


function setupEventInitializer(workspaceInstance: Blockly.WorkspaceSvg, runCallback: () => Promise<void>) {
    if (!workspaceInstance) return;
    workspaceInstance.addChangeListener(async (ev: Blockly.Events.Abstract) => {
        // Filter events for relevant changes
        console.log('blockly event = ' + ev.type)
        if(ev.type === Blockly.Events.TOOLBOX_ITEM_SELECT){
            if(!ev.newItem){
                console.log('closed toolbox');
                console.log(ev)
            }
        }
        if (
              ev.type === Blockly.Events.BLOCK_MOVE ||
              ev.type === Blockly.Events.BLOCK_CHANGE ||
              ev.type === Blockly.Events.BLOCK_DELETE ||
              ev.type === Blockly.Events.BLOCK_CREATE
            ) {
              //Check to see if need to adjust any of the animation blocks
              let eventBlockIds = ev.ids;
              if (!eventBlockIds) {
                eventBlockIds = [ev.blockId];
              }
              var allBlocks = workspace.getAllBlocks(true);
              eventBlockIds.forEach((eventBlockId) => {
                switch (ev.type) {
                  case Blockly.Events.BLOCK_CREATE:
                    let newBlock = workspace.getBlockById(eventBlockId);
                    if (newBlock.type === "animationLoop") {
                      // Set the name of new animationLoop to animation_x to be unique
                      if (newBlock.getFieldValue("NAME") === "animation") {
                        let newUniqueName = getUniqueNameForField("animation", newBlock);
                        newBlock.setFieldValue(newUniqueName, "NAME");
                      }
                      // Iterate through all of the start animation blocks to add to drop down
                      allBlocks.forEach((block) => {
                        if (block.type === "animationStart" || block.type === "animationStop") {
                          block["dropdownOptions"][newBlock.id] = newBlock.getFieldValue("NAME");
                        }
                      });
                    }
          
                    if (newBlock.type === "animationStart" || newBlock.type === "animationStop") {
                      let loops = [];
                      // Add the animation loops to the dropdown
                      allBlocks.forEach(function (block) {
                        if (block.type === "animationLoop") {
                          var name = block.getField("NAME").getValue();
                          newBlock["dropdownOptions"][block.id] = name;
                          loops.push(block.id);
                        }
                      });
                    }
                    break;
                  case Blockly.Events.BLOCK_CHANGE:
                    let changedBlock = workspace.getBlockById(eventBlockId);
                    if (changedBlock.type === "animationLoop") {
                      // Iterate through all of the start animation blocks to update the drop downs
                      allBlocks.forEach((block) => {
                        // Update the dropdown list
                        if (block.type === "animationStart" || block.type === "animationStop") {
                          block["dropdownOptions"][changedBlock.id] = changedBlock.getFieldValue("NAME");
                          // Quickly switch dropdown selection to force refresh of selected text
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
                    // Iterate through all of the start animation blocks to update the drop downs
                    allBlocks.forEach((block) => {
                      // Update the dropdown list
                      if (block.type === "animationStart" || block.type === "animationStop") {
                        delete block["dropdownOptions"][eventBlockId];
                        let currentValue = block.getField("ANIMATIONS").getValue();
                        if (currentValue === eventBlockId) {
                          block.getField("ANIMATIONS").setValue("none");
                        }
                      }
                    });
                    break;
                }
              });
          
              // Write to session storage
              console.log("Writing workspace to session storage");
              let json = Blockly.serialization.workspaces.save(workspace);
              sessionStorage.setItem("workspace", JSON.stringify(json));
          
              // Refresh the scene
              runCallback();
            }
        else if (ev.type === Blockly.Events.UI && ev.element === 'flyout' && !ev.newValue) {
            // Flyout likely closed - newValue is often the state (e.g., true for open, false for closed)
            console.log('Flyout closed event detected');
            //triggerResize();
       }
    });
}


// --- Code Execution ---
async function run(reset: boolean = false, physics: boolean = true) {
    if (!threeD || !blocklyWorkspace || !blocklyGenerator) {
        console.error("Cannot run: 3D engine or Blockly not fully initialized.");
        return;
    }

    let localAmmoInstance: any = null;
    let effectivePhysicsEnabled = false; // Start assuming physics is off or unavailable

    // --- Ammo Initialization Logic ---
    if (physics) { // Only attempt if physics is requested
        console.log("Physics requested. Attempting to get/initialize Ammo...");
        try {
            // Explicitly await the result here
            localAmmoInstance = await getAmmo();

            // *** STRICT CHECK ***
            // Only proceed if getAmmo() returned a TRUTHY value (the valid instance)
            if (localAmmoInstance) {
                console.log("Ammo instance obtained successfully from getAmmo.");
                threeD.ammo = localAmmoInstance; // Assign the valid instance
                console.log('>>> run: Assigned ammo to threeD. Instance is now:', !!threeD.ammo);
                effectivePhysicsEnabled = true; // Enable physics for the scene
            } else {
                // getAmmo() resolved but returned null/undefined (failure)
                console.warn("getAmmo() completed but returned no valid instance. Physics will be disabled.");
                threeD.ammo = null; // Ensure it's null
            }
        } catch (error) {
            // This catches errors *during* the await getAmmo() call itself
            console.error("Error occurred WHILE calling getAmmo():", error);
            threeD.ammo = null; // Ensure null on error
        }
    } else {
        // Physics is explicitly disabled for this run
        console.log("Physics explicitly disabled for this run.");
        threeD.ammo = null; // Ensure null if physics is off
    }
    // --- End Ammo Logic ---

    console.log(`Proceeding to scene creation. Effective Physics: ${effectivePhysicsEnabled}`);

    console.log("Generating code from Blockly workspace...");
    let code = '';
    try {
        code = blocklyGenerator.workspaceToCode(blocklyWorkspace);
        console.log(`Generated CODE: ${code}`);
    } catch (genError) {
        console.error("Error generating code from workspace:", genError);
        alert("Error generating code from blocks. Check block connections.");
        return; // Stop if code generation fails
    }

    // Execute the generated code within the ThreeD context
    console.log(`Executing generated code. Effective Physics: ${effectivePhysicsEnabled}`);
    console.log("Executing generated code...");
    try {
        // Construct the execution string carefully
        const executionCode = `
            (async () => {
                try {
                    threeD.setCameraType("${activeCamera}");
                    await threeD.createScene(${reset}, ${physics});
                    ${code} // Inject the generated code
                    await threeD.createCamera(); // Ensure camera is created/updated after scene setup
                    console.log("Scene execution completed.");
                } catch (sceneError) {
                    console.error("Error executing scene code:", sceneError);
                    // Potentially display error to user in UI instead of alert
                     alert("An error occurred while running the scene script. Check console for details.");
                }
            })(); // Immediately invoke the async function
        `;
        // Using Function constructor is generally safer than eval
        const sceneFunction = new Function('threeD', executionCode);
        await sceneFunction(threeD); // Pass threeD context

    } catch (evalError) {
        console.error("Error preparing or executing the generated code:", evalError);
         alert("A critical error occurred preparing the scene script. Check console for details.");
    }
}

// --- UI Setup Function ---
function setupUI() {
     console.log("Setting up UI elements and listeners...");
     // Grab UI elements (ensure these exist in your HTML)
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
     const columnResizer = document.getElementById("columnResizer");

     // Helper to update physics button appearance
     const setPhysicsButton = () => {
        if (!physicsButton) return;
        if (physicsEnabled) {
            physicsButton.classList.remove("physics-off");
            physicsButton.classList.add("physics-on");
        } else {
            physicsButton.classList.remove("physics-on");
            physicsButton.classList.add("physics-off");
        }
     };

     // Attach listeners (add null checks for robustness)
     resetButton?.addEventListener('mouseup', async (e) => {
         e.preventDefault();
         console.log("reset button pressed");
         await run(true, physicsEnabled);
     });

     physicsButton?.addEventListener('mouseup', async (e) => {
         e.preventDefault();
         console.log("physics button pressed");
         physicsEnabled = !physicsEnabled;
         setPhysicsButton();
         await run(false, physicsEnabled); // Rerun with new physics state
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

     clearButton?.addEventListener('click', () => {
         console.log("clear session button pressed");
         if (confirm("Clearing the workspace will lose all unsaved work. Continue?")) {
             sessionStorage.removeItem("workspace");
             blocklyWorkspace?.clear(); // Clear the blocks visually
             // Optionally reload or just reset the scene
             run(true, physicsEnabled); // Reset scene after clearing
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

            if (confirm("Loading this example workspace will lose all unsaved work. Continue?")) {
                try {
                    const response = await fetch(`./examples/${filename}`); // Adjust path if needed
                    if (!response.ok) throw new Error(`Failed to fetch example: ${response.statusText}`);
                    const json:any = await response.json();
                    Blockly.serialization.workspaces.load(json, blocklyWorkspace);
                    hideAllDropDowns();
                    physicsEnabled = physicsAttr === "on";
                    setPhysicsButton();
                    await run(true, physicsEnabled); // Reset scene with loaded example
                } catch (loadError) {
                    console.error("Error loading example:", loadError);
                    alert("Failed to load the example project.");
                    hideAllDropDowns();
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
         reader.onload = (event) => {
             try {
                 const jsonString = event.target?.result as string;
                 if (!jsonString) throw new Error("File content is empty.");
                 const json = JSON.parse(jsonString);
                 Blockly.serialization.workspaces.load(json, blocklyWorkspace);
                 sessionStorage.setItem("workspace", jsonString); // Also save imported to session
                 run(true, physicsEnabled); // Reset scene with imported workspace
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
     const broadcastColumnResize = (e: PointerEvent) => {
        const windowWidth = window.innerWidth;
        // Add some hard limits to the column resizing
        if (e.clientX < 200 || e.clientX > windowWidth - 200) return;

        const runArea = document.getElementById("runArea");
        const blocklyArea = document.getElementById("blocklyArea");

        if (runArea && blocklyArea) {
            runArea.style.width = `${((windowWidth - e.clientX) / windowWidth) * 100}%`;
            blocklyArea.style.width = `${(e.clientX / windowWidth) * 100}%`;

            // Dispatch resize event for Blockly and potentially ThreeD canvas
            window.dispatchEvent(new Event("resize"));
        }
     };

     columnResizer?.addEventListener('pointerdown', () => {
        document.addEventListener("pointermove", broadcastColumnResize);
        // Use pointerup on document to catch release anywhere
        const resizeEnd = () => {
            console.log("resize complete");
            document.removeEventListener("pointermove", broadcastColumnResize);
            document.removeEventListener("pointerup", resizeEnd);
        };
        document.addEventListener("pointerup", resizeEnd);
     });

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
      theme: Blockly.Themes.Zelos, // Use custom theme or fallback
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

    try {
        // 1. Initialize 3D Engine
        console.log("Initializing 3D engine...");
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) throw new Error(`Canvas element with ID "${canvasId}" not found.`);
        threeD = new ThreeD(canvas);
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
        handleBlocklyResize(blocklyWorkspace);
        setupEventInitializer(blocklyWorkspace, async () => { await run(false, physicsEnabled); }); // Pass run as the callback

        // 4. Load initial workspace state (from session or default/sample)
        console.log("Loading workspace state...");
        const jsonStr = sessionStorage.getItem("workspace");
        if (0) {
            try {
                Blockly.serialization.workspaces.load(JSON.parse(jsonStr), blocklyWorkspace);
                console.log("Workspace loaded from session storage.");
            } catch (e) {
                console.error("Failed to load workspace from session storage:", e);
                // Load default/starter if session loading fails
                 const response = await fetch(`./examples/starter.json`); // Adjust path
                 const json = await response.json();
                 Blockly.serialization.workspaces.load(json, blocklyWorkspace);
                 console.log("Loaded starter workspace instead.");
            }
        } else {
            // Load the sample workspace if no session state
            console.log("Loading starter workspace...");
            const response = await fetch(`./examples/starter.json`); // Adjust path
            const json = await response.json();
            Blockly.serialization.workspaces.load(json, blocklyWorkspace);
        }

        // 5. Setup UI Buttons and Interactions
        setupUI();

        // 6. Handle URL parameters for samples
        const urlParams = new URLSearchParams(window.location.search);
        const sample = urlParams.get("sample");
        const phys = urlParams.get("phys");
        let initialRunNeeded = true; // Flag to avoid running twice if sample loaded

        if (sample && blocklyWorkspace) {
             console.log(`Loading sample "${sample}" from URL parameters...`);
             try {
                const response = await fetch(`./examples/${sample}.json`); // Assuming .json extension
                if (!response.ok) throw new Error (`Sample fetch failed: ${response.statusText}`);
                const json = await response.json();
                Blockly.serialization.workspaces.load(json, blocklyWorkspace);
                physicsEnabled = phys === "1"; // Set physics based on param
                document.getElementById("physics")?.classList.toggle("physics-on", physicsEnabled);
                document.getElementById("physics")?.classList.toggle("physics-off", !physicsEnabled);
                console.log(`Sample "${sample}" loaded.`);
                await run(true, physicsEnabled); // Run scene with loaded sample
                initialRunNeeded = false; // Don't run again below
             } catch (sampleError) {
                 console.error(`Failed to load sample "${sample}" from URL:`, sampleError);
                 alert(`Failed to load sample "${sample}" specified in URL.`);
             }
        }

        // 7. Initial scene run (if not already run by sample loading)
        if (initialRunNeeded) {
            console.log("Performing initial scene run...");
            await run(true, physicsEnabled);
        }
        

        console.log("Application initialization complete.");

    } catch (error) {
        console.error("FATAL: Application initialization failed:", error);
        // Display a user-friendly error message on the page
        const errorDiv = document.createElement('div');
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
export { blocklyWorkspace, blocklyGenerator, threeD };