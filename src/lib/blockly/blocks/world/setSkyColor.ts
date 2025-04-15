import * as FieldColourModule from '@blockly/field-colour';

export let setSkyColor = {
  init: function () {
    this.appendDummyInput()
      .appendField("set color of sky to")
      .appendField(new FieldColourModule.FieldColour("#000", null), "COLOR");
    this.setInputsInline(false);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(250);
  },

  transpile: function (block) {
    let color = block.getFieldValue("COLOR");

    return `threeD.setSkyColor("${color}");`;
  },
};
