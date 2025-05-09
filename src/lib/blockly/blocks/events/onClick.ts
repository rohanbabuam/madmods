import * as Blockly from 'blockly/core';
import {javascriptGenerator} from "blockly/javascript";

export let onClick = {
    getFirstVar: function() {
        let varModels = Blockly.Variables.allUsedVarModels(Blockly.getMainWorkspace()).filter((m) => m.type === "SHAPE");
        if (varModels.length > 0){
            return varModels[0]["name"];
        } else {
            return "item";
        }
    },
    init: function () {
        this.appendStatementInput("EVENT")
            .appendField("when")
            .appendField(new Blockly.FieldVariable(this.getFirstVar(), null, ["SHAPE"], "SHAPE"), "VAR")
            .appendField("is clicked");
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(295);
    },

    transpile: function (block) {
        let variable = javascriptGenerator.nameDB_.getName(block.getFieldValue("VAR"), "VARIABLE");
        let statements = javascriptGenerator.statementToCode(block, 'EVENT');

        return `threeD.onClick(${variable}, async () => {${statements}});`;
    }
};