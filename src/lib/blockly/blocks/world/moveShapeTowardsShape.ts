import * as Blockly from 'blockly/core';
import { javascriptGenerator } from "blockly/javascript";

// Helper function to get the first available SHAPE variable or a default
const getFirstShapeVar = () => {
    const varModels = Blockly.Variables.allUsedVarModels(Blockly.getMainWorkspace())
        .filter((m) => m.type === "SHAPE");
    return varModels.length > 0 ? varModels[0].name : "shape_1";
};

// Helper function to get the second available SHAPE variable or a default
const getSecondShapeVar = () => {
    const varModels = Blockly.Variables.allUsedVarModels(Blockly.getMainWorkspace())
        .filter((m) => m.type === "SHAPE");
    // Try to get a different variable than the first one if possible
    if (varModels.length > 1) {
        return varModels[1].name;
    } else if (varModels.length > 0) {
        return varModels[0].name; // Fallback to the first one if only one exists
    } else {
        return "shape_2"; // Default if no variables exist
    }
};


export let moveShapeTowardsShape = {
    init: function () {
        this.appendDummyInput()
            .appendField("move shape")
            .appendField(new Blockly.FieldVariable(getFirstShapeVar(), null, ["SHAPE"], "SHAPE"), "VAR_A");
        this.appendDummyInput()
            .appendField("towards shape")
            .appendField(new Blockly.FieldVariable(getSecondShapeVar(), null, ["SHAPE"], "SHAPE"), "VAR_B");
        this.appendValueInput("STEPS")
            .setCheck("Number")
            .appendField("by");
        this.appendDummyInput()
            .appendField("units")
            .appendField("ignore y-axis")
            .appendField(new Blockly.FieldCheckbox("TRUE"), "IGNORE_Y"); // Default to TRUE
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(250); // Same color as other world blocks
        this.setTooltip("Moves the first shape towards the second shape by a specified number of units.");
        this.setHelpUrl(""); // Optional: add a help URL
    },

    transpile: function (block: Blockly.Block) {
        const variableA = javascriptGenerator.nameDB_.getName(block.getFieldValue("VAR_A"), Blockly.VARIABLE_CATEGORY_NAME);
        const variableB = javascriptGenerator.nameDB_.getName(block.getFieldValue("VAR_B"), Blockly.VARIABLE_CATEGORY_NAME);
        const steps = javascriptGenerator.valueToCode(block, 'STEPS', javascriptGenerator.ORDER_NONE) || '1'; // Default to 1 if not connected
        const ignoreY = block.getFieldValue("IGNORE_Y") === 'TRUE'; // Convert checkbox value to boolean

        if (!variableA || !variableB || steps === "") return ""; // Basic validation

        return `threeD.moveShapeTowardsShape(${variableA}, ${variableB}, ${steps}, ${ignoreY});\n`;
    }
};