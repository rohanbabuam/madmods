import * as Blockly from 'blockly/core';
import {javascriptGenerator} from "blockly/javascript";

export let woodfloor = {
    init: function() {
        let input = this.appendDummyInput()
            .appendField('wood floor: ');
        let options = [
            [{'src': './assets/materials/woodfloor/WoodFloor042_PREVIEW.jpg', 'width': 25, 'height': 25, 'alt': 'WoodFloor042'}, 'woodfloor/WoodFloor042'],
        ];
        input.appendField(new Blockly.FieldDropdown(options), 'MATERIAL');
        this.setOutput(true, "MATERIAL");
        this.setColour(100);
        this.setTooltip("");
        this.setHelpUrl("");    },

    transpile: function (block) {
        let material = block.getFieldValue('MATERIAL');

        return [`[ { pbr: "${material}", matallic: 1.0, roughness: 0.9 } ]`, javascriptGenerator.ORDER_NONE];
    }
};