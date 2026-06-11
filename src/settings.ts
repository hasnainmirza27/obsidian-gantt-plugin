import { App, PluginSettingTab, Setting } from 'obsidian';
import GanttPlugin from './main';

export class GanttSettingTab extends PluginSettingTab {
	plugin: GanttPlugin;

	constructor(app: App, plugin: GanttPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Gantt Chart Settings' });

		// Default Task Duration
		new Setting(containerEl)
			.setName('Default Task Duration')
			.setDesc('Number of days a task should span when only a start or due date is provided.')
			.addText(text => text
				.setPlaceholder('1')
				.setValue(String(this.plugin.settings.defaultDuration))
				.onChange(async (value) => {
					const val = parseInt(value, 10);
					if (!isNaN(val) && val > 0) {
						this.plugin.settings.defaultDuration = val;
						await this.plugin.saveSettings();
					}
				}));

		// Exclude Folders
		new Setting(containerEl)
			.setName('Exclude Folders')
			.setDesc('Comma-separated list of folder paths to ignore (e.g. templates, archive).')
			.addTextArea(text => text
				.setPlaceholder('templates, archive')
				.setValue(this.plugin.settings.excludeFolders.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.excludeFolders = value
						.split(',')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.plugin.saveSettings();
				}));

		// Show tasks without dates
		new Setting(containerEl)
			.setName('Show Undated Tasks')
			.setDesc('If enabled, tasks without any dates will be plotted on today\'s date with the default duration. If disabled, they are hidden from the Gantt timeline.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showUndatedTasks)
				.onChange(async (value) => {
					this.plugin.settings.showUndatedTasks = value;
					await this.plugin.saveSettings();
				}));

		// Todo Tag
		new Setting(containerEl)
			.setName('Filter Tag')
			.setDesc('Default tag to filter tasks by (leave blank to search all tasks). E.g. #todo')
			.addText(text => text
				.setPlaceholder('#todo')
				.setValue(this.plugin.settings.todoTag)
				.onChange(async (value) => {
					this.plugin.settings.todoTag = value.trim();
					await this.plugin.saveSettings();
				}));
	}
}
