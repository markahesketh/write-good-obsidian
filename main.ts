import { Plugin } from 'obsidian';
import writeGood from 'write-good';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';

class WriteGoodSuggestion extends WidgetType {
    constructor(readonly message: string) {
        super();
    }

    toDOM() {
        const span = document.createElement('span');
        span.className = 'write-good-suggestion';
        span.textContent = this.message;
        return span;
    }
}

const writeGoodPlugin = ViewPlugin.fromClass(
    class {
        timeout: ReturnType<typeof setTimeout>;
        decorations: any;
        view: any;

        constructor(view: any) {
            this.view = view;
            this.decorations = this.buildDecorations();
        }

        update(update: any) {
            if (update.docChanged) {
                this.decorations = this.buildDecorations();
            }
        }

        buildDecorations() {
            const builder = [];
            const doc = this.view.state.doc;
            const text = doc.toString();
            const suggestions = writeGood(text);
            const linesWithSuggestions = new Set();

            for (const suggestion of suggestions) {
                const from = suggestion.index;
                const to = suggestion.index + suggestion.offset;
                const line = doc.lineAt(from);

                const mark = Decoration.mark({
                    class: 'write-good-mark',
                });
                builder.push(mark.range(from, to));

                if (linesWithSuggestions.has(line.number)) continue;

                linesWithSuggestions.add(line.number);
                const lineMark = Decoration.line({
                    class: 'write-good-line',
                });
                builder.push(lineMark.range(line.from));

                const widget = Decoration.widget({
                    widget: new WriteGoodSuggestion(suggestion.reason),
                    side: 1,
                });
                builder.push(widget.range(line.to));
            }

            builder.sort((a, b) => {
                if (a.from === b.from) return a.value.startSide - b.value.startSide;
                return a.from - b.from;
            });
            return Decoration.set(builder);
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

export default class WriteGoodPlugin extends Plugin {
    async onload() {
        this.registerEditorExtension(writeGoodPlugin);
        console.log('WriteGoodPlugin loaded');
    }

    onunload() { }
}