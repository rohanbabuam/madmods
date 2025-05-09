import * as Blockly from 'blockly/core';
import {javascriptGenerator} from "blockly/javascript";

export let snow = {
    init: function() {
        let input = this.appendDummyInput()
            .appendField('snow: ');
        let options = [
            [{'src': './assets/materials/snow/Snow004_PREVIEW.jpg', 'width': 25, 'height': 25, 'alt': 'Snow004'}, 'snow/Snow004'],
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