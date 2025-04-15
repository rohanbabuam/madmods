import {javascriptGenerator} from "blockly/javascript";
import * as FieldColourModule from '@blockly/field-colour';

export let metal = {
    init: function() {
        let input = this.appendDummyInput()
            .appendField('metal color: ')
            .appendField(new FieldColourModule.FieldColour('#ffffff',null), 'MATERIAL');
        this.setOutput(true, "MATERIAL");
        this.setColour(100);
        this.setTooltip("");
        this.setHelpUrl("");    },

    transpile: function (block) {
        let material = block.getFieldValue('MATERIAL');

        return [`[ { texture: "metal", color: "${material}" } ]`, javascriptGenerator.ORDER_NONE];
    }
};