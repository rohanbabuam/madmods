import * as Blockly from 'blockly/core';
import { javascriptGenerator } from "blockly/javascript";

export let setLightIntensity = {
  getFirstVar: function () {
    let varModels = Blockly.Variables.allUsedVarModels(Blockly.getMainWorkspace()).filter((m) => m.type === "LIGHT");;
    if (varModels.length > 0) {
      return varModels[0]["name"];
    } else {
      return "light_1";
    }
  },

  init: function () {
    this.appendValueInput("INTENSITY")
      .setCheck("Number")
      .appendField("set brightness of ")
      .appendField(new Blockly.FieldVariable(this.getFirstVar(), null, ["LIGHT"], "LIGHT"), "VAR")
      .appendField("to");
    this.setInputsInline(false);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(60);
  },

  transpile: function (block) {
    let variable = javascriptGenerator.nameDB_.getName(block.getFieldValue("VAR"), "VARIABLE");
    let intensity = javascriptGenerator.valueToCode(block, 'INTENSITY', javascriptGenerator.ORDER_NONE);

    return `threeD.setLightIntensity(${variable}, ${intensity});`;
  },
};
