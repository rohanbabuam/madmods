import {javascriptGenerator} from "blockly/javascript";
import * as FieldColourModule from '@blockly/field-colour';

export let matte = {
    init: function() {
        let input = this.appendDummyInput()
            .appendField('matte color: ')
            .appendField(new FieldColourModule.FieldColour('#ff4040',null), 'MATERIAL');
        this.setOutput(true, "MATERIAL");
        this.setColour(100);
        this.setTooltip("");
        this.setHelpUrl("");    },

    transpile: function (block) {
        let material = block.getFieldValue('MATERIAL');

        return [`[ { texture: "matte", color: "${material}" } ]`, javascriptGenerator.ORDER_NONE];
    }
};