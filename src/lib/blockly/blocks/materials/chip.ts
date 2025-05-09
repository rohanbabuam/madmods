import * as Blockly from 'blockly/core';
import {javascriptGenerator} from "blockly/javascript";

export let chip = {
    init: function() {
        let input = this.appendDummyInput()
            .appendField('circuit board: ');
        let options = [
            [{'src': './assets/materials/chip/Chip001_PREVIEW.jpg', 'width': 25, 'height': 25, 'alt': 'Chip001'}, 'chip/Chip001'],
            [{'src': './assets/materials/chip/Chip002_PREVIEW.jpg', 'width': 25, 'height': 25, 'alt': 'Chip002'}, 'chip/Chip002'],
            [{'src': './assets/materials/chip/Chip004_PREVIEW.jpg', 'width': 25, 'height': 25, 'alt': 'Chip004'}, 'chip/Chip004'],
            [{'src': './assets/materials/chip/Chip005_PREVIEW.jpg', 'width': 25, 'height': 25, 'alt': 'Chip005'}, 'chip/Chip005'],
        ];
        input.appendField(new Blockly.FieldDropdown(options), 'MATERIAL');
        this.setOutput(true, "MATERIAL");
        this.setColour(100);
        this.setTooltip("");
        this.setHelpUrl("");    },

    transpile: function (block) {
        let material = block.getFieldValue('MATERIAL');

        return [`[ { pbr: "${material}", metallic: 1.0 } ]`, javascriptGenerator.ORDER_NONE];
    }
};