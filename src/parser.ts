import { App, TFile } from 'obsidian';
import { GanttTask, GanttSettings } from './types';

// Extract task info from a line of markdown text
export function parseTaskLine(
	lineText: string,
	filePath: string,
	fileName: string,
	lineIndex: number,
	heading: string | null,
	defaultDuration: number
): GanttTask | null {
	// Match standard Markdown tasks: - [ ] or * [ ] or - [x] or - [/]
	const taskMatch = lineText.match(/^(\s*)[-*]\s+\[(?<status>[ xX/])\]\s+(?<content>.*)$/);
	if (!taskMatch || !taskMatch.groups) {
		return null;
	}

	const status = taskMatch.groups?.status;
	const contentRaw = taskMatch.groups?.content;
	if (!status || contentRaw === undefined) {
		return null;
	}

	const completed = status === 'x' || status === 'X';
	let content = contentRaw.trim();

	// 1. Extract Self ID (🆔 <id>)
	let id: string | null = null;
	const idMatch = content.match(/(?:\uD83C\uDD94|🆔)\s*([a-zA-Z0-9]{5})/);
	if (idMatch && idMatch[1]) {
		id = idMatch[1];
	}

	// 2. Extract Parent ID (⛔ <id>)
	let parentId: string | null = null;
	const parentMatch = content.match(/(?:\u26D4|⛔)\s*([a-zA-Z0-9]{5})/);
	if (parentMatch && parentMatch[1]) {
		parentId = parentMatch[1];
	}

	// 3. Extract Due Date (📅 YYYY-MM-DD) or inline [due:: YYYY-MM-DD] / (due:: YYYY-MM-DD)
	let dueDate: string | null = null;
	const dueRegexes = [
		/(?:\uD83D\uDCC5|📅)\s*(\d{4}-\d{2}-\d{2})/,
		/\[due::\s*(\d{4}-\d{2}-\d{2})\]/,
		/\(due::\s*(\d{4}-\d{2}-\d{2})\)/,
		/\[end::\s*(\d{4}-\d{2}-\d{2})\]/,
		/\(end::\s*(\d{4}-\d{2}-\d{2})\)/
	];
	for (const regex of dueRegexes) {
		const m = content.match(regex);
		if (m && m[1]) {
			dueDate = m[1];
			break;
		}
	}

	// 4. Extract Start Date (🛫 YYYY-MM-DD) or inline [start:: YYYY-MM-DD] / (start:: YYYY-MM-DD)
	let startDate: string | null = null;
	const startRegexes = [
		/(?:\uD83D\uDEEB|🛫)\s*(\d{4}-\d{2}-\d{2})/,
		/\[start::\s*(\d{4}-\d{2}-\d{2})\]/,
		/\(start::\s*(\d{4}-\d{2}-\d{2})\)/
	];
	for (const regex of startRegexes) {
		const m = content.match(regex);
		if (m && m[1]) {
			startDate = m[1];
			break;
		}
	}

	// 5. Extract Done Date (✅ YYYY-MM-DD)
	let doneDate: string | null = null;
	const doneMatch = content.match(/(?:\u2705|✅)\s*(\d{4}-\d{2}-\d{2})/);
	if (doneMatch && doneMatch[1]) {
		doneDate = doneMatch[1];
	}

	// 6. Extract Tags
	const tags: string[] = [];
	const tagRegex = /#([a-zA-Z0-9_\-/]+)/g;
	let tagMatch;
	while ((tagMatch = tagRegex.exec(content)) !== null) {
		if (tagMatch[1]) {
			tags.push('#' + tagMatch[1]);
		}
	}

	// 7. Extract Progress (e.g., [progress:: 50] or 50%)
	let progress = completed ? 100 : 0;
	const progressMatch = content.match(/\[progress::\s*(\d+)\]/) || content.match(/\b(\d+)%\b/);
	if (progressMatch && progressMatch[1]) {
		progress = parseInt(progressMatch[1], 10);
		if (isNaN(progress)) progress = completed ? 100 : 0;
		progress = Math.max(0, Math.min(100, progress));
	} else if (status === '/') {
		progress = 50; // In-progress standard Obsidian checkbox state
	}

	// Clean description text by stripping away all metadata tokens
	let cleanedText = content;
	
	// Remove IDs
	cleanedText = cleanedText.replace(/(?:\uD83C\uDD94|🆔)\s*[a-zA-Z0-9]{5}/g, '');
	cleanedText = cleanedText.replace(/(?:\u26D4|⛔)\s*[a-zA-Z0-9]{5}/g, '');
	
	// Remove standard emojis and dates
	cleanedText = cleanedText.replace(/(?:\uD83D\uDCC5|📅|\uD83D\uDEEB|🛫|\u2705|✅)\s*\d{4}-\d{2}-\d{2}/g, '');
	
	// Remove Dataview fields
	cleanedText = cleanedText.replace(/\[(?:start|due|end|progress)::\s*[^\]]+\]/g, '');
	cleanedText = cleanedText.replace(/\((?:start|due|end|progress)::\s*[^\)]+\)/g, '');
	
	// Remove tags
	cleanedText = cleanedText.replace(/#([a-zA-Z0-9_\-/]+)/g, '');
	
	// Clean up progress percentage text
	cleanedText = cleanedText.replace(/\b\d+%\b/g, '');

	// Strip trailing/leading spaces and double spaces
	cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

	// Generate a stable ID if we don't have one written explicitly
	if (!id) {
		let hash = 0;
		const str = `${filePath}:${lineIndex}:${cleanedText}`;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash |= 0;
		}
		id = Math.abs(hash).toString(36).substring(0, 5);
	}

	// Calculate default duration dates if one is missing but the other exists
	if (startDate && !dueDate) {
		const start = new Date(startDate);
		const end = new Date(start.getTime() + defaultDuration * 24 * 60 * 60 * 1000);
		dueDate = end.toISOString().split('T')[0] || null;
	} else if (!startDate && dueDate) {
		startDate = dueDate;
	}

	return {
		id,
		parentId,
		text: cleanedText || 'Untitled Task',
		completed,
		startDate,
		dueDate,
		doneDate,
		tags,
		filePath,
		fileName,
		line: lineIndex,
		heading,
		progress
	};
}

// Scans all Markdown files in the vault to collect tasks matching settings/exclusions
export async function parseVaultTasks(
	app: App,
	settings: GanttSettings
): Promise<GanttTask[]> {
	const tasks: GanttTask[] = [];
	const files = app.vault.getMarkdownFiles();

	for (const file of files) {
		// Check exclusions
		const inExcludedFolder = settings.excludeFolders.some(folder => {
			const cleanFolder = folder.replace(/\\/g, '/').replace(/\/$/, '');
			return file.path.replace(/\\/g, '/').startsWith(cleanFolder + '/');
		});
		if (inExcludedFolder) {
			continue;
		}

		const fileCache = app.metadataCache.getFileCache(file);
		if (!fileCache || !fileCache.listItems) {
			continue;
		}

		// Filter list items that are tasks
		const taskCacheItems = fileCache.listItems.filter(item => item.task !== undefined);
		if (taskCacheItems.length === 0) {
			continue;
		}

		// Read file content
		const content = await app.vault.cachedRead(file);
		const lines = content.split('\n');

		// Parse cache headings to easily match sections
		const headings = fileCache.headings || [];

		for (const cacheItem of taskCacheItems) {
			const lineIndex = cacheItem.position.start.line;
			const lineText = lines[lineIndex];
			if (lineText === undefined) {
				continue;
			}

			// Find closest preceding heading
			let precedingHeading: string | null = null;
			let maxHeadingLine = -1;
			for (const heading of headings) {
				const headingLine = heading.position.start.line;
				if (headingLine < lineIndex && headingLine > maxHeadingLine) {
					precedingHeading = heading.heading;
					maxHeadingLine = headingLine;
				}
			}

			const task = parseTaskLine(
				lineText,
				file.path,
				file.basename,
				lineIndex,
				precedingHeading,
				settings.defaultDuration
			);

			if (task) {
				// Filter check for date requirements
				if (!settings.showUndatedTasks && (!task.startDate || !task.dueDate)) {
					continue;
				}
				tasks.push(task);
			}
		}
	}

	return tasks;
}
