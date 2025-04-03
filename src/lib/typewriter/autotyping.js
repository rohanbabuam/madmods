export default class AutoTyping {
    constructor(selector, text, {
      typeSpeed = 150,
      deleteSpeed = 150,
      waitBeforeDelete = 1000,
      waitBetweenWords = 1000,
      writeWhole = false
    } = {}) {
      this.selector = selector;
      this.text = text;
      this.typeSpeed = typeSpeed;
      this.deleteSpeed = deleteSpeed;
      this.waitBeforeDelete = waitBeforeDelete;
      this.waitBetweenWords = waitBetweenWords;
      this.writeWhole = writeWhole;
      this.el = document.querySelector(selector);
    }
  
    async start() {
      for (let i = 0; i < this.text.length; i++) {
        const text = this.text[i];
        let chars = text.split("");
        if (this.writeWhole) {
          chars = [text];
        }
        await this.writeText(chars);
        if (i === this.text.length - 1) {
          i = -1; // Reset to loop
        }
      }
    }
  
    writeText(chars) {
      return new Promise(resolve => {
        const element = this.el;
        let isSpace = false;
        
        const interval = setInterval(() => {
          let char = chars.shift();
          if (isSpace) {
            isSpace = false;
            char = " " + char;
          }
          isSpace = char === " ";
          element.innerText += char;
          
          if (chars.length === 0) {
            clearInterval(interval);
            setTimeout(() => {
              const deleteInterval = setInterval(() => {
                if (this.writeWhole) {
                  element.innerText = "";
                } else {
                  element.innerText = element.innerText.substr(0, element.innerText.length - 1);
                }
                
                if (element.innerText.length === 0) {
                  clearInterval(deleteInterval);
                  setTimeout(() => resolve(), this.waitBetweenWords);
                }
              }, this.deleteSpeed);
            }, this.waitBeforeDelete);
          }
        }, this.typeSpeed);
      });
    }
  }