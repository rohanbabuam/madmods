import * as Blockly from 'blockly/core';
import { javascriptGenerator } from "blockly/javascript";

export let customObject = {
    init: function () {
        this.appendDummyInput()
            .appendField("custom object");
        this.appendDummyInput() // Use Dummy input + FieldTextInput for a simple string field
            .appendField("name")
            .appendField(new Blockly.FieldTextInput("default_id"), "NAME"); // Default ID
        this.appendValueInput("SCALE")
            .setCheck("Number")
            .appendField("scale");
        this.appendValueInput("MATERIAL")
            .setCheck("MATERIAL") // Assuming MATERIAL is a valid check type
            .appendField("material");
        this.setInputsInline(false);
        this.setOutput(true, "SHAPE"); // Outputs a SHAPE data structure
        this.setColour(180); // A slightly different color for custom shapes?
        this.setTooltip("Loads a custom 3D object from a predefined library using its name.");
        this.setHelpUrl(""); // Optional: Add help URL
    },

    transpile: function (block: Blockly.Block) {
        // Get the user-provided name (which acts as the ID for lookup)
        const name = block.getFieldValue("NAME");
        // Get the scale value, defaulting to 1 if not connected
        const scale = javascriptGenerator.valueToCode(block, "SCALE", javascriptGenerator.ORDER_NONE) || '1';
        // Get the material value
        const material = javascriptGenerator.valueToCode(block, "MATERIAL", javascriptGenerator.ORDER_NONE) || 'null'; // Default to null or a default material object if needed

        // Return the data structure representing this custom object
        // 'id' is the unique ID of this specific block instance
        // 'type' identifies the kind of shape for the creation logic
        // 'name' is the user-provided identifier for the mesh lookup
        // 'scale' and 'material' are the parameters
        const code = `[{ id: "${block.id}", type: "customObject", name: "${name}", scale: ${scale}, material: ${material} }]`;

        return [code, javascriptGenerator.ORDER_NONE];
    },
};