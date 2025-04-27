import * as Blockly from 'blockly/core';
import { javascriptGenerator } from "blockly/javascript";

export let createShapeAs = {
  getUniqueNameForVar: function (prefix) {
    let counter = 1;
    let vars = Blockly.Variables.allUsedVarModels(Blockly.getMainWorkspace());
    while (true) {
      var newName = prefix + "_" + counter;
      //@ts-ignore
      if (!vars.map(v => v.name).includes(newName)) {
        return newName;
      }
      counter++;
    }
  },

  init: function () {
    this.appendDummyInput()
      .appendField("create shape")
    this.appendValueInput("SHAPE")
      .setCheck("SHAPE")
      .appendField("as")
      .appendField(new Blockly.FieldVariable(this.getUniqueNameForVar("shape"), null, ["SHAPE"], "SHAPE"), "VAR");
    this.appendValueInput("COORDS").setCheck("COORDS").appendField("at coords");
    this.setInputsInline(false);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(250);
  },

  transpile: function (block) {
    let shape = javascriptGenerator.valueToCode(block, "SHAPE", javascriptGenerator.ORDER_NONE);
    let coords = javascriptGenerator.valueToCode(block, "COORDS", javascriptGenerator.ORDER_NONE);
    let variable = javascriptGenerator.nameDB_.getName(block.getFieldValue("VAR"), "VARIABLE");
    if (shape === "") return "";
    if (coords === "") return "";

    // --- BEFORE ---
        // return `${variable} = ${shape}; threeD.createShape(${variable}, ${coords});`;

        // --- AFTER ---
        // Add 'await' before the threeD.createShape call in the generated code
        return `${variable} = ${shape};\nawait threeD.createShape(${variable}, ${coords});\n`;
  },
};
