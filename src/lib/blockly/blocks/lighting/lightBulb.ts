import { javascriptGenerator } from "blockly/javascript";
import * as FieldColourModule from '@blockly/field-colour';

export let lightBulb = {
  init: function () {
    this.appendDummyInput()
      .appendField("light bulb of color ")
      .appendField(new FieldColourModule.FieldColour("#ffffff", null), "COLOR");
    this.appendValueInput("B").setCheck("Number").appendField("brightness");
    this.setInputsInline(false);
    this.setOutput(true, "LIGHT");
    this.setColour(60);
    this.setTooltip("A light bulb with brightness and color");
  },

  transpile: function (block) {
    let b = javascriptGenerator.valueToCode(block, "B", javascriptGenerator.ORDER_NONE);
    let color = block.getFieldValue("COLOR");

    return [
      `[{ id: "${block.id}", type: "lightbulb", props: { b: ${b}, c: "${color}" }}]`,
      javascriptGenerator.ORDER_NONE,
    ];
  },
};
