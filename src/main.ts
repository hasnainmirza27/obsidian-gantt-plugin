import { Plugin, WorkspaceLeaf, TFile, MarkdownView } from 'obsidian';
import { GanttSettings, DEFAULT_SETTINGS, GanttTask, GroupByOption, ZoomOption, StatusFilterOption } from './types';
import { GanttSettingTab } from './settings';
import { GANTT_VIEW_TYPE, GanttChartView } from './view';
import { parseVaultTasks } from './parser';
import { renderGanttChart } from './renderer';

export default class GanttPlugin extends Plugin {
	settings: GanttSettings;

	async onload() {
		console.log('Loading Gantt Chart Plugin...');

		// Load settings
		await this.loadSettings();

		// Register settings tab
		this.addSettingTab(new GanttSettingTab(this.app, this));

		// Register custom view
		this.registerView(
			GANTT_VIEW_TYPE,
			(leaf) => new GanttChartView(leaf, this.settings, () => this.saveSettings())
		);

		// Ribbon icon to open/reveal Gantt View
		this.addRibbonIcon('calendar-range', 'Open Gantt Chart', () => {
			this.activateView();
		});

		// Command palette commands
		this.addCommand({
			id: 'open-gantt-chart-view',
			name: 'Open Gantt Chart View',
			callback: () => this.activateView(),
		});

		// Register markdown code block processor
		this.registerMarkdownCodeBlockProcessor('gantt-chart', async (source, el, ctx) => {
			// Parse YAML-like configs inside the block
			const blockSettings = this.parseBlockConfig(source);

			el.empty();
			const embedContainer = el.createDiv({ cls: 'gantt-embed-container' });
			embedContainer.style.height = blockSettings.height || '380px';

			try {
				const tasks = await parseVaultTasks(this.app, blockSettings);
				
				renderGanttChart(
					embedContainer,
					tasks,
					blockSettings,
					(task) => this.handleTaskClick(task),
					(task, val) => this.handleCheckboxToggle(task, val)
				);
			} catch (error) {
				embedContainer.empty();
				const errorEl = embedContainer.createDiv({ cls: 'gantt-empty-state' });
				errorEl.createDiv({ cls: 'gantt-empty-state-title', text: 'Gantt Chart Error' });
				errorEl.createEl('p', { text: String(error) });
			}
		});
	}

	async onunload() {
		console.log('Unloading Gantt Chart Plugin...');
		// Views will automatically close
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Refresh open views if any
		this.app.workspace.getLeavesOfType(GANTT_VIEW_TYPE).forEach(leaf => {
			if (leaf.view instanceof GanttChartView) {
				leaf.view.refresh();
			}
		});
	}

	// Open or show the Gantt View sidebar tab
	async activateView() {
		let leaf: WorkspaceLeaf | null = null;
		const leaves = this.app.workspace.getLeavesOfType(GANTT_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0]!;
		} else {
			// Open on the right sidebar panel
			leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: GANTT_VIEW_TYPE,
					active: true,
				});
			}
		}

		if (leaf) {
			this.app.workspace.revealLeaf(leaf);
		}
	}

	// Custom parser for embedded code block settings
	private parseBlockConfig(source: string): GanttSettings {
		// Deep clone default settings
		const config: GanttSettings = JSON.parse(JSON.stringify(this.settings));
		
		const lines = source.split('\n');
		for (const line of lines) {
			const separatorIndex = line.indexOf(':');
			if (separatorIndex === -1) continue;

			const key = line.substring(0, separatorIndex).trim();
			const val = line.substring(separatorIndex + 1).trim();

			if (key === 'groupBy') {
				config.groupBy = val as GroupByOption;
			} else if (key === 'zoom') {
				config.zoom = val as ZoomOption;
			} else if (key === 'status') {
				config.statusFilter = val as StatusFilterOption;
			} else if (key === 'tags') {
				// Strip quotes if any, split by comma if multiple
				config.tagFilter = val.replace(/['"\[\]]/g, '').trim();
			} else if (key === 'path') {
				config.pathFilter = val.replace(/['"]/g, '').trim();
			} else if (key === 'showUndated') {
				config.showUndatedTasks = val === 'true' || val === 'yes';
			} else if (key === 'from') {
				config.from = val.replace(/['"]/g, '').trim();
			} else if (key === 'to') {
				config.to = val.replace(/['"]/g, '').trim();
			} else if (key === 'height') {
				let heightVal = val.replace(/['"]/g, '').trim();
				if (/^\d+$/.test(heightVal)) {
					heightVal += 'px';
				}
				config.height = heightVal;
			}
		}

		return config;
	}

	// Task click handler for code block / views
	async handleTaskClick(task: GanttTask) {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (file && file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);

			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view && view.editor) {
				const editor = view.editor;
				editor.setCursor({ line: task.line, ch: 0 });
				editor.scrollIntoView({ from: { line: task.line, ch: 0 }, to: { line: task.line, ch: 0 } }, true);
			}
		}
	}

	// Checkbox toggle handler for code block / views
	async handleCheckboxToggle(task: GanttTask, completed: boolean) {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (file && file instanceof TFile) {
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const lineText = lines[task.line];
			
			if (lineText !== undefined) {
				let newLineText = lineText;
				if (completed) {
					// Replace space or slash check box with x
					newLineText = lineText.replace(/^(\s*[-*]\s+\[)(?:[ /])(\].*)$/, '$1x$2');
					
					// Add completed date ✅ YYYY-MM-DD
					if (!newLineText.includes('✅')) {
						const todayStr = new Date().toISOString().split('T')[0];
						newLineText += ` ✅ ${todayStr}`;
					}
				} else {
					// Replace check box with space
					newLineText = lineText.replace(/^(\s*[-*]\s+\[)(?:[xX/])(\].*)$/, '$1 $2');
					
					// Remove completion date ✅ YYYY-MM-DD
					newLineText = newLineText.replace(/(?:\u2705|✅)\s*\d{4}-\d{2}-\d{2}/g, '');
				}

				lines[task.line] = newLineText;
				await this.app.vault.modify(file, lines.join('\n'));
			}
		}
	}
}
