import {javascriptGenerator} from "blockly/javascript";

export let moveCamera = {
    init: function () {
        this.appendDummyInput()
            .appendField("move camera to")
        this.appendValueInput("COORDS")
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(160);
    },

    transpile: function (block) {
        let coords = javascriptGenerator.valueToCode(block, 'COORDS', javascriptGenerator.ORDER_NONE);
        if (coords === "") return "";

        return `threeD.moveCamera(${coords});`;
    }
};