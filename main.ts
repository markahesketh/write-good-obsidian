import {Plugin, PluginSettingTab, App, Setting, TFile, MarkdownView, Editor, MarkdownFileInfo} from 'obsidian';
import writeGood from 'write-good';
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import {Facet, StateEffect, Transaction} from '@codemirror/state';

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
        decorations: any;
        view: any;
        plugin: WriteGoodPlugin;
        checks: Record<string, boolean>;
		checksEnabled: boolean;

        constructor(view: any) {
            this.view = view;
            this.plugin = view.state.facet(WriteGoodPluginFacet)[0];
			this.checksEnabled = this.#fileChecksEnabled();
            this.checks = this.plugin?.settings?.checks || DEFAULT_SETTINGS.checks;
            this.decorations = this.#buildDecorations();
        }

        update(update: any) {
            this.#redecorate(update)
        }

        #redecorate(update: any): void {
			if (update.docChanged || update.focusChanged) {
				this.decorations = this.#buildDecorations();
				return;
			}

			const hasTriggerEffect = update.transactions.some((tr: Transaction) =>
				tr.effects.some((e: StateEffect<null>) => e.is(TriggerWriteGoodChecksStateEffect))
			);

			if (hasTriggerEffect) {
				this.checksEnabled = this.#fileChecksEnabled();
				this.decorations = this.#buildDecorations();
			}
        }

        #fileChecksEnabled(): boolean {
            const file = this.plugin.app.workspace.getActiveFile?.();
            if (!file) return false;
            const fileId = this.plugin.getFileIdentifier(file);
            return this.plugin.getChecksStateForFile(fileId)
        }

		#buildDecorations() {
			if (!this.checksEnabled) {
				return Decoration.none;
			}

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

// Effect to trigger checks decorations when toggled
const TriggerWriteGoodChecksStateEffect = StateEffect.define<null>();

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
    fileChecksState: Record<string, boolean>;
    enableChecksByDefault: boolean;
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
    fileChecksState: {},
    enableChecksByDefault: true,
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

        containerEl.createEl('h2', { text: 'General settings' });
        new Setting(containerEl)
            .setName('Enabled by default')
            .setDesc('Check newly created or opened notes. Can be toggled on/off per note via the command palette or hotkey.')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableChecksByDefault);
                toggle.onChange(async (value) => {
                    this.plugin.settings.enableChecksByDefault = value;
                    await this.plugin.saveSettings();
                });
            });

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

        this.registerEditorExtension([
            writeGoodPlugin,
            WriteGoodPluginFacet.of(this)
        ]);

        this.addCommand({
            id: 'toggle-checks-for-current-file',
            name: 'Toggle checks for current file',
            editorCheckCallback: (checking: boolean, editor: Editor, ctx: MarkdownView | MarkdownFileInfo): boolean | void => {
                if (checking) return true; // Show command only when an editor is active
                const file = this.app.workspace.getActiveFile();
                if (!file) return;
                const fileId = this.getFileIdentifier(file);
                const current = this.getChecksStateForFile(fileId);
                this.setChecksStateForFile(fileId, !current);
                this.saveSettings();

				// Trigger an update to the CodeMirror editor, via hotkey
				const cmEditor = (editor as any)?.cm;
				if (cmEditor && cmEditor.dispatch) {
					cmEditor.dispatch({
						effects: TriggerWriteGoodChecksStateEffect.of(null),
					});
				}
            },
        });

        this.registerEvent(
            this.app.vault.on('rename', (file: TFile, oldPath: string) => {
                const oldId = oldPath.replace(/\\/g, '/').toLowerCase();
                const newId = this.getFileIdentifier(file);
				this.setChecksStateForFile(newId, this.getChecksStateForFile(oldId));
				this.removeChecksStateForFile(oldId);
				this.saveSettings();
            })
        );

        this.registerEvent(
            this.app.vault.on('delete', (file: TFile) => {
                const fileId = this.getFileIdentifier(file);
				this.removeChecksStateForFile(fileId);
				this.saveSettings();
            })
        );
    }

    async loadSettings() {
        try {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        } catch (e) {
            console.error('WriteGoodPlugin: Failed to load settings, defaulting to checks enabled for all files.', e);
            this.settings = Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    async saveSettings() {
        try {
            await this.saveData(this.settings);
        } catch (e) {
            console.error('WriteGoodPlugin: Failed to save settings.', e);
        }
    }

    getFileIdentifier(file: TFile): string {
        return file.path.replace(/\\/g, '/').toLowerCase();
    }

    getChecksStateForFile(fileId: string): boolean {
        if (fileId in this.settings.fileChecksState) {
            return this.settings.fileChecksState[fileId];
        }
        return this.settings.enableChecksByDefault;
    }

    setChecksStateForFile(fileId: string, enabled: boolean) {
        this.settings.fileChecksState[fileId] = enabled;
    }

    removeChecksStateForFile(fileId: string) {
        if (fileId in this.settings.fileChecksState) {
            delete this.settings.fileChecksState[fileId];
        }
    }
}
