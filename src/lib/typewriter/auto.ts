interface AutoTypingOptions {
    typeSpeed?: number;
    deleteSpeed?: number;
    waitBeforeDelete?: number;
    waitBetweenWords?: number;
    writeWhole?: boolean;
    keepText?: boolean;
    onComplete?: () => void;
}

export default class AutoTyping {
    private selector: string;
    private text: string[];
    private typeSpeed: number;
    private deleteSpeed: number;
    private waitBeforeDelete: number;
    private waitBetweenWords: number;
    private writeWhole: boolean;
    private keepText: boolean;
    private onComplete?: () => void;
    private el: HTMLElement | null;
    private isTextarea: boolean;
    private activeIntervals: number[];

    constructor(
        selector: string,
        text: string[],
        {
            typeSpeed = 150,
            deleteSpeed = 150,
            waitBeforeDelete = 1000,
            waitBetweenWords = 1000,
            writeWhole = false,
            keepText = false,
            onComplete
        }: AutoTypingOptions = {}
    ) {
        this.selector = selector;
        this.text = text;
        this.typeSpeed = typeSpeed;
        this.deleteSpeed = deleteSpeed;
        this.waitBeforeDelete = waitBeforeDelete;
        this.waitBetweenWords = waitBetweenWords;
        this.writeWhole = writeWhole;
        this.keepText = keepText;
        this.onComplete = onComplete;
        this.el = document.querySelector(selector);
        this.isTextarea = this.el?.tagName === 'TEXTAREA';
        this.activeIntervals = [];

        if (!this.el) {
            throw new Error(`Element with selector "${selector}" not found`);
        }
    }

    /**
     * Starts the typing animation
     */
    public async start(): Promise<void> {
        if (!this.el) return;

        for (let index = 0; index < this.text.length; index++) {
            const word = this.text[index];
            let chars = word.split('');
            
            if (this.writeWhole) {
                chars = [word];
            }

            await this.writeText(chars);

            if (this.onComplete) {
                this.onComplete();
            }

            if (index === this.text.length - 1) {
                if (this.keepText) {
                    break;
                }
                index = -1;
            }
        }
    }

    /**
     * Immediately stops all typing animations
     * @param clearText Whether to clear the current text (default: false)
     */
    public stop(clearText: boolean = false): void {
        this.activeIntervals.forEach(interval => clearInterval(interval));
        this.activeIntervals = [];
        
        if (clearText && this.el) {
            this.setText('');
        }
    }

    /**
     * Clears the text from the element
     * @param animate Whether to animate the clearing (default: false)
     * @param speed Speed of animation if enabled (default: deleteSpeed)
     */
    public clear(animate: boolean = false, speed: number = this.deleteSpeed): Promise<void> {
        return new Promise(resolve => {
            if (!this.el) return resolve();

            if (animate) {
                const removeInterval = setInterval(() => {
                    if (!this.el) {
                        clearInterval(removeInterval);
                        return resolve();
                    }

                    const currentText = this.getText();
                    this.setText(currentText.substring(0, currentText.length - 1));

                    if (this.getText().length === 0) {
                        clearInterval(removeInterval);
                        this.activeIntervals = this.activeIntervals.filter(i => i !== removeInterval);
                        resolve();
                    }
                }, speed);
                this.activeIntervals.push(removeInterval);
            } else {
                this.setText('');
                resolve();
            }
        });
    }

    /**
     * Instantly completes the current typing animation
     * @param moveToNext Whether to immediately start the next word (default: false)
     */
    public finish(moveToNext: boolean = false): void {
        // Clear any active typing intervals
        this.stop();
        
        if (!this.el) return;

        // Get the current word being typed
        const currentIndex = this.text.findIndex(word => 
            this.getText().includes(word)
        );
        const nextIndex = currentIndex === -1 ? 0 : currentIndex;
        const currentWord = this.text[nextIndex];

        // Instantly display the full current word
        this.setText(currentWord);

        if (moveToNext && this.onComplete) {
            this.onComplete();
        }
    }

    private getText(): string {
        if (!this.el) return '';
        return this.isTextarea 
            ? (this.el as HTMLTextAreaElement).value
            : this.el.textContent || '';
    }

    private setText(value: string): void {
        if (!this.el) return;
        if (this.isTextarea) {
            (this.el as HTMLTextAreaElement).value = value;
        } else {
            this.el.textContent = value;
        }
    }

    private writeText(chars: string[]): Promise<void> {
        return new Promise(resolve => {
            if (!this.el) return resolve();

            let nextAddSpace = false;
            const writeInterval = setInterval(() => {
                if (!this.el) {
                    clearInterval(writeInterval);
                    return resolve();
                }

                let c = chars.shift();
                if (c === undefined) {
                    clearInterval(writeInterval);
                    this.activeIntervals = this.activeIntervals.filter(i => i !== writeInterval);
                    return;
                }

                if (nextAddSpace) {
                    nextAddSpace = false;
                    c = ' ' + c;
                }

                nextAddSpace = c === ' ';
                
                const currentText = this.getText();
                this.setText(currentText + c);

                if (chars.length === 0) {
                    clearInterval(writeInterval);
                    this.activeIntervals = this.activeIntervals.filter(i => i !== writeInterval);
                    
                    if (this.keepText) {
                        return resolve();
                    }

                    setTimeout(() => {
                        const removeInterval = setInterval(() => {
                            if (!this.el) {
                                clearInterval(removeInterval);
                                return resolve();
                            }

                            const currentText = this.getText();
                            if (this.writeWhole) {
                                this.setText('');
                            } else {
                                this.setText(currentText.substring(0, currentText.length - 1));
                            }

                            if (this.getText().length === 0) {
                                clearInterval(removeInterval);
                                this.activeIntervals = this.activeIntervals.filter(i => i !== removeInterval);
                                setTimeout(() => resolve(), this.waitBetweenWords);
                            }
                        }, this.deleteSpeed);
                        this.activeIntervals.push(removeInterval);
                    }, this.waitBeforeDelete);
                }
            }, this.typeSpeed);
            this.activeIntervals.push(writeInterval);
        });
    }
}