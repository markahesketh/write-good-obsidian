import { Plugin, PluginSettingTab, App, Setting } from 'obsidian';
import writeGood from 'write-good';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { Facet } from '@codemirror/state';

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
        plugin: WriteGoodPlugin;
		checks: Record<string, boolean>;

        constructor(view: any) {
            this.view = view;
            this.plugin = view.state.facet(WriteGoodPluginFacet)[0];
			this.checks = this.plugin?.settings?.checks || DEFAULT_SETTINGS.checks;
            this.decorations = this.buildDecorations();
        }

        update(update: any) {
            if (update.docChanged || update.focusChanged) {
                this.decorations = this.buildDecorations();
            }
        }

        buildDecorations() {
            const builder = [];
            const doc = this.view.state.doc;
            const text = doc.toString();
            const suggestions = writeGood(text, this.checks);
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

// Facet to pass plugin instance to ViewPlugin
const WriteGoodPluginFacet = Facet.define<WriteGoodPlugin, WriteGoodPlugin>();

// List of write-good checks and their descriptions
const WRITE_GOOD_CHECKS = [
    { key: 'passive', label: 'Passive voice', description: 'Highlights use of passive voice.' },
    { key: 'illusion', label: 'Lexical illusions', description: 'Detects lexical illusions (repeated words).' },
    { key: 'so', label: 'Sentence starts with "So"', description: 'Flags sentences that start with "So".' },
    { key: 'thereIs', label: 'Sentence starts with "There is/are"', description: 'Flags sentences that start with "There is" or "There are".' },
    { key: 'weasel', label: 'Weasel words', description: 'Detects weasel words (e.g., "many", "various", "very").' },
    { key: 'adverb', label: 'Adverbs', description: 'Highlights adverbs (words ending in -ly).' },
    { key: 'tooWordy', label: 'Wordy phrases', description: 'Flags wordy phrases that can be simplified.' },
    { key: 'cliches', label: 'Clichés', description: 'Detects cliches.' },
    { key: 'eprime', label: 'E-Prime', description: 'Flags use of "to be" verbs (E-Prime style).' },
];

interface WriteGoodSettings {
    checks: Record<string, boolean>;
}

const DEFAULT_SETTINGS: WriteGoodSettings = {
    checks: {
        passive: true,
        illusion: true,
        so: true,
        thereIs: true,
        weasel: true,
        adverb: true,
        tooWordy: true,
        cliches: true,
        eprime: false,
    },
};

class WriteGoodSettingTab extends PluginSettingTab {
    plugin: WriteGoodPlugin;
    constructor(app: App, plugin: WriteGoodPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Checks' });
        WRITE_GOOD_CHECKS.forEach((check) => {
            new Setting(containerEl)
                .setName(check.label)
                .setDesc(check.description)
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.checks[check.key]);
                    toggle.onChange(async (value) => {
                        this.plugin.settings.checks[check.key] = value;
                        await this.plugin.saveSettings();
                    });
                });
        });
    }
}

export default class WriteGoodPlugin extends Plugin {
    settings: WriteGoodSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new WriteGoodSettingTab(this.app, this));
        // Register the facet with the plugin instance
        this.registerEditorExtension([
            writeGoodPlugin,
            WriteGoodPluginFacet.of(this)
        ]);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
}
