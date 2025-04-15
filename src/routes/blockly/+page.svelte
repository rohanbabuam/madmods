<script lang="ts">
    import { onMount, onDestroy } from "svelte";
  
    // Import the main init function from blockly.ts
  import { init as initializeApp, blocklyWorkspace, threeD } from '$lib/blockly/blockly'; // Adjust path if needed

  let isLoading = true;
  let errorMsg: string | null = null;

  onMount(async () => {
    isLoading = true;
    errorMsg = null;
    console.log("Svelte component mounted, starting app initialization...");
    try {
      // Call the main init function from blockly.ts
      await initializeApp('blocklyDiv', 'runAreaCanvas'); // Pass IDs
      console.log("App initialization promise resolved in onMount.");
    } catch (error: any) {
      console.error("Failed to initialize application in onMount:", error);
      errorMsg = `Failed to initialize: ${error.message || error}`;
    } finally {
      isLoading = false;
    }
  });

  onDestroy(() => {
    console.log("Svelte component destroying...");
    // Dispose Blockly workspace if it exists
    if (blocklyWorkspace) { // Check if the instance exists
      try {
        // CORRECT WAY: Call dispose() on the instance
        blocklyWorkspace.dispose();
        console.log("Blockly workspace disposed.");
        // It's good practice, though perhaps not strictly necessary here as
        // the component is being destroyed, potentially nullifying references
        // from blockly.ts might require more careful state management.
      } catch (e) {
        console.error("Error disposing Blockly workspace:", e);
      }
    }

    // Dispose ThreeD engine if needed
    threeD?.engine?.dispose();
    console.log("ThreeD engine disposed (attempted).");
  });


</script>

<svelte:head>
	<title>Madmods World</title>
	<meta name="description" content="Madmods World" />
</svelte:head>

<div id="blockly-container" class ="height-screen border-0 border-red-500">
    <div id="blockly-header">
      <div id="buttonrow">
        <img id="logo" src="/icons/logo.svg" alt="Code.org logo"/>
        <p></p>
        <button id="reset" class="button">Reset</button>
        <button id="physics" class="button physics-off">Physics</button>
        <button id="fullscreen" class="button">Full</button>
        <button id="vr" class="button">VR</button>
        <div id="vr-dropdown">
          <button class="vr-dropdown-item" id="oculusQuestButton">Oculus Quest</button>
          <button class="vr-dropdown-item" id="googleCardboardButton">Google Cardboard</button>
          <button class="vr-dropdown-item" id="exitVRButton">Exit VR</button>
        </div>
        <button id="debug" class="button">Debugger</button>
        <p></p>
        <p></p>
        <button id="examples" class="button">Examples</button>
        <div id="examples-dropdown">
          <button class="examples-dropdown-item" data-file="tv-room.json" data-physics="off">TV Room</button>
          <button class="examples-dropdown-item" data-file="spinning-codeorg.json" data-physics="off">
            Spinning Code.org
          </button>
          <button class="examples-dropdown-item" data-file="solar-system.json" data-physics="off">
            Solar System
          </button>
          <button class="examples-dropdown-item" data-file="pegboard.json" data-physics="on">Pegboard Game</button>
          <button class="examples-dropdown-item" data-file="redpill-bluepill.json" data-physics="on">
            Red Pill, Blue Pill
          </button>
        </div>
        <div id="image-upload">
          <label for="import" id="image-upload-label">
            <img src="/icons/upload.svg" class="button" />Upload
          </label>
          <input id="import" type="file" />
        </div>
        <button id="export" class="button">Export</button>
        <button id="clear" class="button">Clear</button>
        <button id="help" class="button">Help</button>
      </div>
    </div>
    <div id="split">
      <div id="blocklyArea">Loading Workspace...</div>
      <span id="columnResizer" class="border-1 border-red-500 width-20 height-20 "><img id="drag" src="/icons/drag.svg" /></span>
      <div id="runArea">
        <canvas id="runAreaCanvas"></canvas>
      </div>
    </div>
    <div id="footer">
      <div id="fpsCounter"></div>
    </div>
    <div id="blocklyDiv" class="border-0 border-blue-500" style="position: absolute"></div>
</div>


<style>
/* @font-face {
  font-family: "Roboto Mono";
  src: url(/fonts/RobotoMono-VariableFont_wght.ttf);
}

html,
body {
  height: 100%;
  margin: 0;
}

body {
  background-color: #fff;
  font-family: sans-serif;
  overflow: hidden;
} */

#blockly-container {
  display: grid;
  grid-template-rows: 60px calc(100% - 80px) 20px;
  height: 100%;
  margin-top:80px;
}

#blockly-header {
  grid-row: 1;
  background-color: #5d5d73;
}

#split {
  grid-row: 2;
  display: flex;
  flex-direction: row;
  height:calc(100vh - 160px);
}

#runArea {
  width: 60%;
  background: #333333;
}

#runAreaCanvas {
  width: 100%;
  height: 100%;
}

#blocklyArea {
  width: 40%;
  background: #ffffff;
  text-align: center;
}

#columnResizer {
  display: block;
  top: 0;
  right: 0;
  margin: 0;
  width: 6px;
  height: 100%;
  padding: 0;
  cursor: col-resize;
  border: 1px solid transparent;
}

#footer {
  grid-row: 3;
  background-color: #5d5d73;
  color: #fff;
  font-family: "Roboto Mono";
  font-size: small;
}

#fpsCounter {
  text-align: right;
  padding-right: 10px;
}

.blocklyTreeLabel {
  font-family: "Roboto Mono";
  font-size: 12px !important;
}

.blocklyText {
  font-family: "Roboto Mono";
  font-size: 10px;
}

#logo {
  height: 50px;
  padding-top: 5px;
  padding-left: 20px;
}

#buttonrow {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding: 0 0px;
  width: 725px;
}

.button {
  background-color: transparent;
  border: none;
  background-size: 100%;
  height: 30px;
  width: 30px;
  margin-top: 7;
  margin-bottom: 7;
  cursor: pointer;
  flex-direction: column;
  align-items: center;
  color: white;
  font-size: 12px;
  font-family: "Roboto Mono";
}

.button:hover {
  background-color: #777;
}

#reset {
  background-image: url(/icons/restart.svg);
  background-repeat: no-repeat;
  padding-top: 30px;
}

.physics-on {
  background-image: url(/icons/toggle_on.svg);
  background-repeat: no-repeat;
  padding-top: 30px;
}

.physics-off {
  background-image: url(/icons/toggle_off.svg);
  background-repeat: no-repeat;
  padding-top: 30px;
}

#fullscreen {
  background-image: url(/icons/fullscreen.svg);
  background-repeat: no-repeat;
  padding-top: 30px;
}

#vr {
  background-image: url(/icons/vr.svg);
  background-repeat: no-repeat;
  padding-top: 30px;
}

#debug {
  background-image: url(/icons/debug.svg);
  background-repeat: no-repeat;
  padding-top: 30px;
}

#examples {
  background-image: url(/icons/media.svg);
  background-repeat: no-repeat;
  padding-top: 30px;
}

#clear {
  background-image: url(/icons/delete.svg);
  background-repeat: no-repeat;
  padding-top: 30px;
}

#export {
  background-image: url(/icons/download.svg);
  background-repeat: no-repeat;
  padding-top: 30px;
}

#help {
  background-image: url(/icons/help.svg);
  background-repeat: no-repeat;
  padding-top: 30px;
}

#drag {
  z-index: 999;
  position: relative;
  background-color: white;
  width: 22px;
  top: 45%;
  left: -9px;
  pointer-events: none;
  cursor: col-resize;
  clip-path: inset(0% 19%);
  user-select: none;
}

#image-upload>input {
  display: none;
} 

#image-upload-label {
  display: flex;
  flex-direction: column; /* Stack children vertically */
  align-items: center;    /* Center children horizontally */
  cursor: pointer;        /* Indicate it's clickable */
  color: white;
  font-size: 12px;
  font-family: "Roboto Mono";
}

#image-upload-label img.button {
  margin-bottom: 0px;
}

#title3d {
  background-color: transparent;
  border: none;
  background-size: 100%;
  height: 40px;
  width: 40px;
  margin-top: 2;
  margin-bottom: 2;
}

#vr-dropdown {
  position: absolute;
  display: none;
  flex-direction: column;
  top: 60px;
  left: 210px;
  width: 200px;
  background-color: #5d5d73;
  min-width: 160px;
  box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
  z-index: 999;
}

#vr-dropdown button {
  font-weight: bold;
  font-family: "Roboto Mono";
  text-align: left;
}

#examples-dropdown {
  position: absolute;
  display: none;
  flex-direction: column;
  top: 60px;
  left: 375px;
  width: 200px;
  background-color: #5d5d73;
  min-width: 160px;
  box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
  z-index: 999;
}

#examples-dropdown button {
  font-weight: bold;
  font-family: "Roboto Mono";
  text-align: left;
}

</style>