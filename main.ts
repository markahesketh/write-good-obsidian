import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import writeGood from 'write-good';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';

class WriteGoodWidget extends WidgetType {
  constructor(readonly message: string) {
    super();
  }

  toDOM() {
    const div = document.createElement('div');
    div.className = 'write-good-suggestion';
    div.textContent = this.message;
    return div;
  }
}

const writeGoodPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      this.decorations = this.buildDecorations();
      console.log('WriteGoodPlugin initialized');
    }

    update(update) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = this.buildDecorations();
        console.log('Document updated');
      }
    }

    buildDecorations() {
      const builder = [];
      const doc = this.view.state.doc;
      const text = doc.toString();
      const suggestions = writeGood(text);

      console.log('Evaluating text:', text);
      console.log('Suggestions:', suggestions);

      for (const suggestion of suggestions) {
        const from = suggestion.index;
        const to = suggestion.index + suggestion.offset;
        const mark = Decoration.mark({
          class: 'write-good-highlight',
        });
        builder.push(mark.range(from, to));

        const widget = Decoration.widget({
          widget: new WriteGoodWidget(suggestion.reason),
          side: 1,
        });
        builder.push(widget.range(doc.lineAt(from).to));
      }

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

  onunload() {}
}