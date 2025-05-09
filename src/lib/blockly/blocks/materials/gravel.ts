import * as Blockly from 'blockly/core';
import {javascriptGenerator} from "blockly/javascript";

export let gravel = {
    init: function() {
        let input = this.appendDummyInput()
            .appendField('gravel: ');
        let options = [
            [{'src': './assets/materials/gravel/Gravel026_PREVIEW.jpg', 'width': 25, 'height': 25, 'alt': 'Gravel026'}, 'gravel/Gravel026'],
            [{'src': './assets/materials/gravel/Gravel035_PREVIEW.jpg', 'width': 25, 'height': 25, 'alt': 'Gravel035'}, 'gravel/Gravel035'],
        ];
        input.appendField(new Blockly.FieldDropdown(options), 'MATERIAL');
        this.setOutput(true, "MATERIAL");
        this.setColour(100);
        this.setTooltip("");
        this.setHelpUrl("");    },

    transpile: function (block) {
        let material = block.getFieldValue('MATERIAL');

        return [`[ { pbr: "${material}", roughness: 1 } ]`, javascriptGenerator.ORDER_NONE];
    }
};