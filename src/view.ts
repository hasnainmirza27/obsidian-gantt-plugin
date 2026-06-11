import { ItemView, WorkspaceLeaf, TFile, MarkdownView, App } from 'obsidian';
import { GanttTask, GanttSettings, GroupByOption, ZoomOption, StatusFilterOption } from './types';
import { parseVaultTasks } from './parser';
import { renderGanttChart } from './renderer';

export const GANTT_VIEW_TYPE = 'gantt-chart-view';

export class GanttChartView extends ItemView {
	settings: GanttSettings;
	saveSettingsCallback: () => Promise<void>;
	private debouncedRefresh: () => void;

	constructor(leaf: WorkspaceLeaf, settings: GanttSettings, saveSettingsCallback: () => Promise<void>) {
		super(leaf);
		this.settings = settings;
		this.saveSettingsCallback = saveSettingsCallback;

		// Create a debounced refresh function to avoid layout thrashing on fast file updates
		this.debouncedRefresh = this.debounce(() => this.refresh(), 400);
	}

	getViewType(): string {
		return GANTT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Gantt Chart';
	}

	getIcon(): string {
		return 'calendar-range';
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('gantt-view-container');

		// Render the filter/control bar
		this.renderFilterBar(container);

		// Render main scrollable chart container
		container.createDiv({ cls: 'gantt-chart-wrapper', attr: { style: 'flex: 1; overflow: hidden; display: flex; flex-direction: column;' } });

		// Register vault events to trigger auto-refresh
		this.registerEvent(this.app.vault.on('modify', () => this.debouncedRefresh()));
		this.registerEvent(this.app.vault.on('create', () => this.debouncedRefresh()));
		this.registerEvent(this.app.vault.on('delete', () => this.debouncedRefresh()));

		// First load
		await this.refresh();
	}

	async onClose() {
		// Nothing to clean up specifically
	}

	// Debounce helper
	private debounce(fn: Function, delay: number) {
		let timeoutId: number | null = null;
		return (...args: any[]) => {
			if (timeoutId) window.clearTimeout(timeoutId);
			timeoutId = window.setTimeout(() => fn.apply(this, args), delay);
		};
	}

	// Render the controls at the top
	private renderFilterBar(container: HTMLElement) {
		const filterBar = container.createDiv({ cls: 'gantt-filter-bar' });

		// Search input
		const searchGroup = filterBar.createDiv({ cls: 'gantt-filter-group' });
		searchGroup.createEl('label', { text: 'Search:' });
		const searchInput = searchGroup.createEl('input', {
			type: 'text',
			value: this.settings.searchQuery,
			placeholder: 'Filter tasks...'
		});
		searchInput.addEventListener('input', async () => {
			this.settings.searchQuery = searchInput.value;
			await this.saveSettingsCallback();
			this.debouncedRefresh();
		});

		// Status filter dropdown
		const statusGroup = filterBar.createDiv({ cls: 'gantt-filter-group' });
		statusGroup.createEl('label', { text: 'Status:' });
		const statusSelect = statusGroup.createEl('select');
		
		const statuses: { val: StatusFilterOption; label: string }[] = [
			{ val: 'all', label: 'All Tasks' },
			{ val: 'open', label: 'Open Only' },
			{ val: 'completed', label: 'Completed Only' }
		];
		statuses.forEach(s => {
			const opt = statusSelect.createEl('option', { value: s.val, text: s.label });
			if (this.settings.statusFilter === s.val) opt.selected = true;
		});
		statusSelect.addEventListener('change', async () => {
			this.settings.statusFilter = statusSelect.value as StatusFilterOption;
			await this.saveSettingsCallback();
			await this.refresh();
		});

		// Grouping filter dropdown
		const groupGroup = filterBar.createDiv({ cls: 'gantt-filter-group' });
		groupGroup.createEl('label', { text: 'Group By:' });
		const groupSelect = groupGroup.createEl('select');
		
		const groupings: { val: GroupByOption; label: string }[] = [
			{ val: 'file', label: 'File Name' },
			{ val: 'folder', label: 'Folder' },
			{ val: 'heading', label: 'Section' },
			{ val: 'tag', label: 'Tag' },
			{ val: 'none', label: 'No Grouping' }
		];
		groupings.forEach(g => {
			const opt = groupSelect.createEl('option', { value: g.val, text: g.label });
			if (this.settings.groupBy === g.val) opt.selected = true;
		});
		groupSelect.addEventListener('change', async () => {
			this.settings.groupBy = groupSelect.value as GroupByOption;
			await this.saveSettingsCallback();
			await this.refresh();
		});

		// Zoom filter dropdown
		const zoomGroup = filterBar.createDiv({ cls: 'gantt-filter-group' });
		zoomGroup.createEl('label', { text: 'Zoom:' });
		const zoomSelect = zoomGroup.createEl('select');
		
		const zooms: { val: ZoomOption; label: string }[] = [
			{ val: 'day', label: 'Day View' },
			{ val: 'week', label: 'Week View' },
			{ val: 'month', label: 'Month View' }
		];
		zooms.forEach(z => {
			const opt = zoomSelect.createEl('option', { value: z.val, text: z.label });
			if (this.settings.zoom === z.val) opt.selected = true;
		});
		zoomSelect.addEventListener('change', async () => {
			this.settings.zoom = zoomSelect.value as ZoomOption;
			await this.saveSettingsCallback();
			await this.refresh();
		});

		// Date filters
		const fromGroup = filterBar.createDiv({ cls: 'gantt-filter-group' });
		fromGroup.createEl('label', { text: 'From:' });
		const fromInput = fromGroup.createEl('input', {
			type: 'date',
			value: this.settings.from
		});
		fromInput.addEventListener('change', async () => {
			this.settings.from = fromInput.value;
			await this.saveSettingsCallback();
			await this.refresh();
		});

		const toGroup = filterBar.createDiv({ cls: 'gantt-filter-group' });
		toGroup.createEl('label', { text: 'To:' });
		const toInput = toGroup.createEl('input', {
			type: 'date',
			value: this.settings.to
		});
		toInput.addEventListener('change', async () => {
			this.settings.to = toInput.value;
			await this.saveSettingsCallback();
			await this.refresh();
		});

		// Manual refresh button
		const refreshBtn = filterBar.createEl('button', { cls: 'gantt-refresh-btn', text: 'Refresh' });
		refreshBtn.addEventListener('click', () => this.refresh());
	}

	// Parse tasks and draw chart
	async refresh() {
		const chartWrapper = this.containerEl.querySelector('.gantt-chart-wrapper') as HTMLElement;
		if (!chartWrapper) return;

		try {
			// Scan all tasks in vault
			const tasks = await parseVaultTasks(this.app, this.settings);
			
			// Render
			renderGanttChart(
				chartWrapper,
				tasks,
				this.settings,
				(task) => this.handleTaskClick(task),
				(task, val) => this.handleCheckboxToggle(task, val)
			);
		} catch (error) {
			chartWrapper.empty();
			const errorEl = chartWrapper.createDiv({ cls: 'gantt-empty-state' });
			errorEl.createDiv({ cls: 'gantt-empty-state-title', text: 'Error loading Gantt Chart' });
			errorEl.createEl('p', { text: String(error) });
		}
	}

	// Handle task clicking (opens note and jumps to line)
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

	// Update task checkbox state inside the note itself
	async handleCheckboxToggle(task: GanttTask, completed: boolean) {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (file && file instanceof TFile) {
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const lineText = lines[task.line];
			
			if (lineText !== undefined) {
				let newLineText = lineText;
				if (completed) {
					// Replace incomplete task with complete task: replace space/slash with x
					newLineText = lineText.replace(/^(\s*[-*]\s+\[)(?:[ /])(\].*)$/, '$1x$2');
					
					// Add completed date ✅ YYYY-MM-DD if not already present
					if (!newLineText.includes('✅')) {
						const todayStr = new Date().toISOString().split('T')[0];
						newLineText += ` ✅ ${todayStr}`;
					}
				} else {
					// Replace completed task with incomplete task: replace x/X/slash with space
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
