import * as Blockly from 'blockly/core';
import { javascriptGenerator } from "blockly/javascript";

export let setMass = {
  getFirstVar: function () {
    let varModels = Blockly.Variables.allUsedVarModels(Blockly.getMainWorkspace()).filter((m) => m.type === "SHAPE");
    if (varModels.length > 0) {
      return varModels[0]["name"];
    } else {
      return "item";
    }
  },

  init: function () {
    this.appendValueInput("MASS")
      .setCheck("Number")
      .appendField("set mass of ")
      .appendField(new Blockly.FieldVariable(this.getFirstVar(), null, ["SHAPE"], "SHAPE"), "VAR")
      .appendField("to");
    this.setInputsInline(false);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(250);
  },

  transpile: function (block) {
    let variable = javascriptGenerator.nameDB_.getName(block.getFieldValue("VAR"), "VARIABLE");
    let mass = javascriptGenerator.valueToCode(block, 'MASS', javascriptGenerator.ORDER_NONE);

    return `threeD.setMass(${variable}, ${mass});`;
  },
};
