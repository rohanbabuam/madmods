import * as Blockly from 'blockly/core';
import {javascriptGenerator} from "blockly/javascript";

export let carpet = {
    init: function() {
        let input = this.appendDummyInput()
            .appendField('carpet: ');
        let options = [
            [{'src': './assets/materials/carpet/Carpet006_PREVIEW.jpg', 'width': 25, 'height': 25, 'alt': 'Carpet006'}, 'carpet/Carpet006'],
            [{'src': './assets/materials/carpet/Carpet008_PREVIEW.jpg', 'width': 25, 'height': 25, 'alt': 'Carpet008'}, 'carpet/Carpet008'],
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