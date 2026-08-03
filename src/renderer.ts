import { GanttTask, GanttSettings, GroupByOption, ZoomOption } from './types';

// Helper: parse YYYY-MM-DD into a local Date object
export function parseLocalDate(dateStr: string): Date {
	const [year, month, day] = dateStr.split('-').map(Number);
	return new Date(year || 2026, (month || 1) - 1, day || 1);
}

// Helper: Format Date as YYYY-MM-DD
function formatLocalDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

// Group tasks according to settings
function groupTasks(tasks: GanttTask[], groupBy: GroupByOption, tagFilter: string): Map<string, GanttTask[]> {
	const groups = new Map<string, GanttTask[]>();

	// Parse filter tags if grouping by tag and filter is active
	let filterTags: string[] = [];
	if (groupBy === 'tag' && tagFilter) {
		filterTags = tagFilter
			.split(',')
			.map(t => t.trim())
			.filter(t => t.length > 0)
			.map(t => t.startsWith('#') ? t : '#' + t);
	}

	// Initialize groups in the specific order of filterTags to preserve order
	if (groupBy === 'tag' && filterTags.length > 0) {
		for (const tag of filterTags) {
			groups.set(tag, []);
		}
		groups.set('Other', []);
	}

	for (const task of tasks) {
		let groupKey = 'Other';

		if (groupBy === 'file') {
			groupKey = task.fileName;
		} else if (groupBy === 'folder') {
			const parts = task.filePath.split('/');
			groupKey = parts.length > 1 ? (parts.slice(0, -1).join('/') || 'Root') : 'Root';
		} else if (groupBy === 'heading') {
			groupKey = task.heading || 'No Section';
		} else if (groupBy === 'tag') {
			if (filterTags.length > 0) {
				// Match task against the specified filter tags
				const matchedTag = filterTags.find(tag => 
					task.tags.some(t => t.toLowerCase() === tag.toLowerCase())
				);
				groupKey = matchedTag || 'Other';
			} else {
				// Fallback to task's first tag or 'No Tag'
				groupKey = task.tags.length > 0 ? (task.tags[0] || 'No Tag') : 'No Tag';
			}
		} else {
			groupKey = 'All Tasks';
		}

		if (!groups.has(groupKey)) {
			groups.set(groupKey, []);
		}
		groups.get(groupKey)?.push(task);
	}

	// Clean up empty groups, but keep order
	for (const [key, val] of groups.entries()) {
		if (val.length === 0) {
			groups.delete(key);
		}
	}

	return groups;
}

export function renderGanttChart(
	container: HTMLElement,
	allTasks: GanttTask[],
	settings: GanttSettings,
	onTaskClick: (task: GanttTask) => void,
	onCheckboxToggle: (task: GanttTask, completed: boolean) => void
) {
	// 1. Filter Tasks
	let filteredTasks = allTasks.filter(task => {
		// Status filter
		if (settings.statusFilter === 'open' && task.completed) return false;
		if (settings.statusFilter === 'completed' && !task.completed) return false;

		// Text query filter
		if (settings.searchQuery) {
			const q = settings.searchQuery.toLowerCase();
			const matchesText = task.text.toLowerCase().includes(q);
			const matchesFile = task.fileName.toLowerCase().includes(q);
			const matchesHeading = task.heading ? task.heading.toLowerCase().includes(q) : false;
			const matchesTag = task.tags.some(t => t.toLowerCase().includes(q));
			if (!matchesText && !matchesFile && !matchesHeading && !matchesTag) {
				return false;
			}
		}

		// Tag filter (supports multiple comma-separated tags, matches if task has ANY of them)
		// If we are grouping by tag, we do NOT filter tasks out here, so we can group them into 'Other' / remaining.
		if (settings.tagFilter && settings.groupBy !== 'tag') {
			const filterTags = settings.tagFilter
				.split(',')
				.map(t => t.trim())
				.filter(t => t.length > 0)
				.map(t => t.startsWith('#') ? t.toLowerCase() : '#' + t.toLowerCase());

			if (filterTags.length > 0) {
				const hasMatchingTag = task.tags.some(taskTag => 
					filterTags.includes(taskTag.toLowerCase())
				);
				if (!hasMatchingTag) return false;
			}
		}

		// Path filter (supports multiple comma-separated paths, matches if task path contains ANY of them)
		if (settings.pathFilter) {
			const filterPaths = settings.pathFilter
				.split(',')
				.map(p => p.trim().toLowerCase())
				.filter(p => p.length > 0);

			if (filterPaths.length > 0) {
				const hasMatchingPath = filterPaths.some(fPath => 
					task.filePath.toLowerCase().includes(fPath)
				);
				if (!hasMatchingPath) return false;
			}
		}

		// Date range filters (from / to)
		const todayStr = new Date().toISOString().split('T')[0];
		const taskStart = task.startDate || task.dueDate || (settings.showUndatedTasks ? todayStr : null);
		const taskDue = task.dueDate || task.startDate || (settings.showUndatedTasks ? todayStr : null);

		if (settings.from && taskDue && taskDue < settings.from) {
			return false;
		}
		if (settings.to && taskStart && taskStart > settings.to) {
			return false;
		}

		return true;
	});

	// If no tasks, show empty state
	if (filteredTasks.length === 0) {
		container.empty();
		const emptyEl = container.createDiv({ cls: 'gantt-empty-state' });
		emptyEl.createDiv({ cls: 'gantt-empty-state-title', text: 'No tasks found' });
		emptyEl.createEl('p', { text: 'Create tasks with start/due dates or adjust your filters.' });
		return;
	}

	// 2. Determine Timeline Range
	let minDate = new Date();
	let maxDate = new Date();
	let hasValidDates = false;

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	for (const task of filteredTasks) {
		const startStr = task.startDate;
		const dueStr = task.dueDate;

		if (startStr && dueStr) {
			const start = parseLocalDate(startStr);
			const due = parseLocalDate(dueStr);
			if (!hasValidDates) {
				minDate = new Date(start);
				maxDate = new Date(due);
				hasValidDates = true;
			} else {
				if (start < minDate) minDate = new Date(start);
				if (due > maxDate) maxDate = new Date(due);
			}
		} else if (settings.showUndatedTasks) {
			// Place at today's date if no dates available
			if (!hasValidDates) {
				minDate = new Date(today);
				maxDate = new Date(today);
				hasValidDates = true;
			}
		}
	}

	// Override ranges with user inputs if specified
	if (settings.from) {
		minDate = parseLocalDate(settings.from);
	}
	if (settings.to) {
		maxDate = parseLocalDate(settings.to);
	}

	// Ensure max date is at least min date
	if (maxDate < minDate) {
		maxDate = new Date(minDate);
	}

	// Align min and max date according to zoom to prevent rendering cutoff
	minDate = new Date(minDate);
	maxDate = new Date(maxDate);
	minDate.setHours(0, 0, 0, 0);
	maxDate.setHours(0, 0, 0, 0);

	if (settings.zoom === 'day') {
		minDate.setDate(minDate.getDate() - 3);
		maxDate.setDate(maxDate.getDate() + 5);
	} else if (settings.zoom === 'week') {
		// Align to preceding Monday
		const day = minDate.getDay();
		const diff = minDate.getDate() - day + (day === 0 ? -6 : 1);
		minDate.setDate(diff);
		minDate.setDate(minDate.getDate() - 7); // pad 1 week

		maxDate.setDate(maxDate.getDate() + 14); // pad 2 weeks
	} else {
		// Month zoom: Align to 1st of month
		minDate.setDate(1);
		minDate.setMonth(minDate.getMonth() - 1); // pad 1 month
		
		maxDate.setDate(28);
		maxDate.setMonth(maxDate.getMonth() + 2); // pad 2 months
	}

	// Calculate scale details
	let pixelsPerDay = 40;
	if (settings.zoom === 'week') {
		pixelsPerDay = 100 / 7; // 100px per week
	} else if (settings.zoom === 'month') {
		pixelsPerDay = 180 / 30.4; // 180px per month
	}

	const totalDays = Math.round((maxDate.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
	const timelineWidth = totalDays * pixelsPerDay;

	// Clear container and recreate structure
	container.empty();
	
	const mainWrapper = container.createDiv({ cls: 'gantt-container' });
	
	// Create workspace container
	const workspaceEl = mainWrapper.createDiv({ cls: 'gantt-workspace' });

	// 1. Fixed Header Row at Top
	const headerRowEl = workspaceEl.createDiv({ cls: 'gantt-header-row' });
	headerRowEl.createDiv({ cls: 'gantt-sidebar-header', text: 'Task / Item' });
	
	const timelineHeaderViewportEl = headerRowEl.createDiv({ cls: 'gantt-timeline-header-viewport' });
	const timelineHeaderEl = timelineHeaderViewportEl.createDiv({ cls: 'gantt-timeline-header', attr: { style: `width: ${timelineWidth}px;` } });
	const headerTopRow = timelineHeaderEl.createDiv({ cls: 'gantt-header-top-row' });
	const headerBottomRow = timelineHeaderEl.createDiv({ cls: 'gantt-header-bottom-row' });

	// 2. Unified Vertically Scrollable Body Container
	const bodyScrollContainerEl = workspaceEl.createDiv({ cls: 'gantt-body-scroll-container' });
	bodyScrollContainerEl.addEventListener('scroll', () => hideTooltip());

	const bodyContentEl = bodyScrollContainerEl.createDiv({ cls: 'gantt-body-content' });
	const sidebarEl = bodyContentEl.createDiv({ cls: 'gantt-sidebar-body' });
	const timelineBodyViewportEl = bodyContentEl.createDiv({ cls: 'gantt-timeline-body-viewport' });
	const timelineContentEl = timelineBodyViewportEl.createDiv({ cls: 'gantt-timeline-content', attr: { style: `width: ${timelineWidth}px;` } });

	// Synchronize horizontal scrolling between timeline viewport and header viewport
	timelineBodyViewportEl.addEventListener('scroll', () => {
		hideTooltip();
		timelineHeaderViewportEl.scrollLeft = timelineBodyViewportEl.scrollLeft;
	});

	// Group tasks
	const grouped = groupTasks(filteredTasks, settings.groupBy, settings.tagFilter);

	// Create Grid overlay elements
	const gridOverlayEl = timelineContentEl.createDiv({ cls: 'gantt-grid-overlay' });

	// Build timeline header intervals and vertical grid lines
	let currentHeaderDate = new Date(minDate);
	let cellCount = 0;
	
	const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const monthFullNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	const dayShortNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

	if (settings.zoom === 'day') {
		while (currentHeaderDate <= maxDate) {
			const leftPos = cellCount * pixelsPerDay;
			const isWeekend = currentHeaderDate.getDay() === 0 || currentHeaderDate.getDay() === 6;
			
			// Header bottom cell: Day of Month + short week day name
			const cell = headerBottomRow.createDiv({ 
				cls: 'gantt-header-cell',
				text: `${currentHeaderDate.getDate()}`,
				attr: { style: `left: ${leftPos}px; width: ${pixelsPerDay}px;` } 
			});
			if (isWeekend) cell.addClass('weekend');

			// Grid line
			const gridLine = gridOverlayEl.createDiv({
				cls: 'gantt-grid-line' + (isWeekend ? ' weekend' : ''),
				attr: { style: `left: ${leftPos}px; width: ${pixelsPerDay}px;` }
			});

			// Today check
			if (formatLocalDate(currentHeaderDate) === formatLocalDate(today)) {
				gridLine.addClass('today-line');
			}

			// Header top cell: Month name when it changes or at start
			if (cellCount === 0 || currentHeaderDate.getDate() === 1) {
				const topCell = headerTopRow.createDiv({
					cls: 'gantt-header-cell',
					text: `${monthNames[currentHeaderDate.getMonth()]} ${currentHeaderDate.getFullYear()}`,
					attr: { style: `left: ${leftPos}px;` }
				});
			}

			currentHeaderDate.setDate(currentHeaderDate.getDate() + 1);
			cellCount++;
		}
	} else if (settings.zoom === 'week') {
		while (currentHeaderDate <= maxDate) {
			const leftPos = cellCount * 7 * pixelsPerDay;
			
			// Header bottom cell: Date of Monday
			const formattedMonday = `${monthNames[currentHeaderDate.getMonth()]} ${currentHeaderDate.getDate()}`;
			headerBottomRow.createDiv({
				cls: 'gantt-header-cell',
				text: formattedMonday,
				attr: { style: `left: ${leftPos}px; width: ${pixelsPerDay * 7}px;` }
			});

			// Grid line (weekly)
			const gridLine = gridOverlayEl.createDiv({
				cls: 'gantt-grid-line',
				attr: { style: `left: ${leftPos}px; width: ${pixelsPerDay * 7}px;` }
			});

			// Today checking inside this week
			const nextWeek = new Date(currentHeaderDate);
			nextWeek.setDate(nextWeek.getDate() + 7);
			if (today >= currentHeaderDate && today < nextWeek) {
				const todayOffset = Math.round((today.getTime() - currentHeaderDate.getTime()) / (24 * 60 * 60 * 1000)) * pixelsPerDay;
				gridOverlayEl.createDiv({
					cls: 'gantt-grid-line today-line',
					attr: { style: `left: ${leftPos + todayOffset}px;` }
				});
			}

			// Header top cell: Month name when it changes or at start
			if (cellCount === 0 || currentHeaderDate.getDate() <= 7) {
				headerTopRow.createDiv({
					cls: 'gantt-header-cell',
					text: `${monthNames[currentHeaderDate.getMonth()]} ${currentHeaderDate.getFullYear()}`,
					attr: { style: `left: ${leftPos}px;` }
				});
			}

			currentHeaderDate.setDate(currentHeaderDate.getDate() + 7);
			cellCount++;
		}
	} else {
		// Month zoom
		while (currentHeaderDate <= maxDate) {
			const monthStart = new Date(currentHeaderDate.getFullYear(), currentHeaderDate.getMonth(), 1);
			const nextMonthStart = new Date(currentHeaderDate.getFullYear(), currentHeaderDate.getMonth() + 1, 1);
			const daysInMonth = Math.round((nextMonthStart.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000));
			const leftPos = Math.round((monthStart.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000)) * pixelsPerDay;
			const cellWidth = daysInMonth * pixelsPerDay;

			// Header bottom cell: Month abbreviation
			headerBottomRow.createDiv({
				cls: 'gantt-header-cell',
				text: monthNames[monthStart.getMonth()],
				attr: { style: `left: ${leftPos}px; width: ${cellWidth}px;` }
			});

			// Grid line (monthly)
			const gridLine = gridOverlayEl.createDiv({
				cls: 'gantt-grid-line',
				attr: { style: `left: ${leftPos}px; width: ${cellWidth}px;` }
			});

			// Today check inside this month
			if (today.getFullYear() === monthStart.getFullYear() && today.getMonth() === monthStart.getMonth()) {
				const todayOffset = (today.getDate() - 1) * pixelsPerDay;
				gridOverlayEl.createDiv({
					cls: 'gantt-grid-line today-line',
					attr: { style: `left: ${leftPos + todayOffset}px;` }
				});
			}

			// Header top cell: Year when it changes or at start
			if (cellCount === 0 || monthStart.getMonth() === 0) {
				headerTopRow.createDiv({
					cls: 'gantt-header-cell',
					text: `${monthStart.getFullYear()}`,
					attr: { style: `left: ${leftPos}px;` }
				});
			}

			currentHeaderDate.setMonth(currentHeaderDate.getMonth() + 1);
			cellCount++;
		}
	}

	// Create rows container
	const timelineRowsContainer = timelineContentEl.createDiv({ cls: 'gantt-timeline-rows' });
	
	// Track groups collapse state locally using dataset
	let groupIndex = 0;
	const tasksMapById = new Map<string, GanttTask>();
	for (const t of allTasks) {
		tasksMapById.set(t.id, t);
	}

	// Render Tasks Group by Group
	for (const [groupName, groupTasks] of grouped.entries()) {
		// Group Header in Sidebar
		const sidebarGroupEl = sidebarEl.createDiv({
			cls: 'gantt-group-header',
			attr: { 'data-group': `g-${groupIndex}` }
		});
		
		const toggleIcon = sidebarGroupEl.createSpan({ cls: 'gantt-group-toggle-icon', text: '▼' });
		sidebarGroupEl.createSpan({ text: `${groupName} (${groupTasks.length})` });

		// Group Spacer in Timeline
		const timelineGroupEl = timelineRowsContainer.createDiv({
			cls: 'gantt-timeline-row-group-space',
			attr: { 'data-group': `g-${groupIndex}` }
		});

		const rowElements: HTMLElement[] = [];

		// Tasks inside this group
		for (const task of groupTasks) {
			const taskColorClass = `gantt-color-${groupIndex % 7}`;

			// Sidebar Task Row
			const sidebarRow = sidebarEl.createDiv({
				cls: 'gantt-sidebar-row',
				attr: { 'data-group': `g-${groupIndex}` }
			});
			rowElements.push(sidebarRow);

			// Checkbox
			const cb = sidebarRow.createEl('input', {
				type: 'checkbox',
				cls: 'gantt-task-checkbox'
			});
			cb.checked = task.completed;
			cb.addEventListener('change', (e) => {
				onCheckboxToggle(task, cb.checked);
			});

			// Task text with click navigation
			const label = sidebarRow.createSpan({
				cls: 'gantt-sidebar-task-text',
				text: task.text,
				title: 'Click to navigate to task line'
			});
			label.addEventListener('click', () => {
				onTaskClick(task);
			});

			// Timeline Task Row
			const timelineRow = timelineRowsContainer.createDiv({
				cls: 'gantt-timeline-row',
				attr: { 'data-group': `g-${groupIndex}` }
			});
			rowElements.push(timelineRow);

			// Position task bar
			let startVal = minDate;
			let endVal = maxDate;

			if (task.startDate && task.dueDate) {
				startVal = parseLocalDate(task.startDate);
				endVal = parseLocalDate(task.dueDate);
			} else {
				// Fallback today
				startVal = new Date(today);
				endVal = new Date(today);
			}

			// End date should be at least start date
			if (endVal < startVal) endVal = new Date(startVal);

			// Compute horizontal coordinates
			const offsetDays = (startVal.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000);
			const durationDays = (endVal.getTime() - startVal.getTime()) / (24 * 60 * 60 * 1000) + 1;

			const barLeft = offsetDays * pixelsPerDay;
			const barWidth = Math.max(26, durationDays * pixelsPerDay); // minimum size

			// Create task bar
			const taskBar = timelineRow.createDiv({
				cls: `gantt-task-bar ${taskColorClass} ${task.completed ? 'completed' : 'custom-color'}`,
				attr: { 
					style: `left: ${barLeft}px; width: ${barWidth}px;`,
					id: `gantt-bar-${task.id}`,
					'data-task-id': task.id
				}
			});

			// Create progress bar fill
			taskBar.createDiv({
				cls: 'gantt-task-progress-fill',
				attr: { style: `width: ${task.progress}%;` }
			});

			// Text inside the bar
			taskBar.createDiv({
				cls: 'gantt-task-bar-text',
				text: task.text
			});

			// Navigate on bar click
			taskBar.addEventListener('click', () => {
				onTaskClick(task);
			});

			// Tooltip triggers
			taskBar.addEventListener('mouseenter', (e) => {
				showTooltip(mainWrapper, e, task, tasksMapById);
				highlightDependencies(timelineContentEl, task.id, true);
			});
			taskBar.addEventListener('mouseleave', () => {
				hideTooltip();
				highlightDependencies(timelineContentEl, task.id, false);
			});
		}

		// Collapsible logic
		sidebarGroupEl.addEventListener('click', () => {
			const isCollapsed = sidebarGroupEl.hasClass('collapsed');
			if (isCollapsed) {
				sidebarGroupEl.removeClass('collapsed');
				timelineGroupEl.removeClass('collapsed');
				rowElements.forEach(el => el.style.display = '');
			} else {
				sidebarGroupEl.addClass('collapsed');
				timelineGroupEl.addClass('collapsed');
				rowElements.forEach(el => el.style.display = 'none');
			}
			// Redraw dependency SVG paths to match new layout offsets
			drawDependenciesSVG(timelineContentEl, filteredTasks, minDate, pixelsPerDay);
		});

		groupIndex++;
	}

	// 3. Render Dependency SVG lines
	drawDependenciesSVG(timelineContentEl, filteredTasks, minDate, pixelsPerDay);

	// Handle window resize or scrolling (to ensure SVGs recalculate positions if needed)
	// SVG positions are offset based and static, but if we do collapsible groups they redraw.
}

// Draw connection curves in the SVG canvas overlay
function drawDependenciesSVG(
	timelineContentEl: HTMLElement,
	tasks: GanttTask[],
	minDate: Date,
	pixelsPerDay: number
) {
	// Remove existing SVG overlay
	const existingSvg = timelineContentEl.querySelector('.gantt-svg-overlay');
	if (existingSvg) {
		existingSvg.remove();
	}

	// Create new SVG overlay
	// SVG should match the timeline height and width
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('class', 'gantt-svg-overlay');
	
	// Create marker defs for arrowhead
	const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
	const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
	marker.setAttribute('id', 'gantt-arrow-marker');
	marker.setAttribute('viewBox', '0 0 10 10');
	marker.setAttribute('refX', '6');
	marker.setAttribute('refY', '5');
	marker.setAttribute('markerWidth', '6');
	marker.setAttribute('markerHeight', '6');
	marker.setAttribute('orient', 'auto-start-reverse');

	const markerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	markerPath.setAttribute('d', 'M 0 1.5 L 8 5 L 0 8.5 z');
	markerPath.setAttribute('class', 'gantt-dependency-arrow');
	
	marker.appendChild(markerPath);
	defs.appendChild(marker);
	svg.appendChild(defs);

	timelineContentEl.appendChild(svg);

	// Generate lines
	let pathCount = 0;

	for (const task of tasks) {
		if (!task.parentId) continue;

		// Locate child and parent elements
		const childBar = timelineContentEl.querySelector(`#gantt-bar-${task.id}`) as HTMLElement;
		const parentBar = timelineContentEl.querySelector(`#gantt-bar-${task.parentId}`) as HTMLElement;

		if (!childBar || !parentBar) continue;

		// Ensure they are currently visible (not inside collapsed group)
		const childRow = childBar.closest('.gantt-timeline-row') as HTMLElement;
		const parentRow = parentBar.closest('.gantt-timeline-row') as HTMLElement;

		if (!childRow || !parentRow || childRow.style.display === 'none' || parentRow.style.display === 'none') {
			continue;
		}

		// Calculate coordinates relative to .gantt-timeline-content
		// parent row top + parent bar top + half height
		const parentY = parentRow.offsetTop + parentBar.offsetTop + parentBar.offsetHeight / 2;
		const childY = childRow.offsetTop + childBar.offsetTop + childBar.offsetHeight / 2;

		const parentXEnd = parentBar.offsetLeft + parentBar.offsetWidth;
		const childXStart = childBar.offsetLeft;

		// Check if coordinates are valid
		if (parentY < 0 || childY < 0) continue;

		// Draw path
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('class', 'gantt-dependency-line');
		path.setAttribute('data-parent', task.parentId);
		path.setAttribute('data-child', task.id);
		
		// Determine curve orientation
		let d = '';
		if (parentXEnd < childXStart - 10) {
			// standard forward link: curved S-shape
			const cp1X = parentXEnd + Math.min(30, (childXStart - parentXEnd) / 2);
			const cp2X = childXStart - Math.min(30, (childXStart - parentXEnd) / 2);
			d = `M ${parentXEnd} ${parentY} C ${cp1X} ${parentY}, ${cp2X} ${childY}, ${childXStart} ${childY}`;
		} else {
			// backwards link / overlap link: loop back
			const loopOffset = 20;
			const cp1X = parentXEnd + loopOffset;
			const cp2X = childXStart - loopOffset;
			d = `M ${parentXEnd} ${parentY} C ${cp1X} ${parentY}, ${cp2X} ${childY}, ${childXStart} ${childY}`;
		}

		path.setAttribute('d', d);
		path.setAttribute('marker-end', 'url(#gantt-arrow-marker)');
		svg.appendChild(path);
		pathCount++;
	}

	// Adjust SVG canvas height to match scrollable area
	svg.setAttribute('style', `height: ${timelineContentEl.scrollHeight - 60}px;`);
}

// Highlight dependency connectors for hovered task
function highlightDependencies(timelineContentEl: HTMLElement, taskId: string, highlight: boolean) {
	const lines = timelineContentEl.querySelectorAll(`.gantt-dependency-line`);
	const arrow = timelineContentEl.querySelector(`.gantt-dependency-arrow`);
	
	lines.forEach((path: SVGPathElement) => {
		const parentId = path.getAttribute('data-parent');
		const childId = path.getAttribute('data-child');
		
		if (parentId === taskId || childId === taskId) {
			if (highlight) {
				path.classList.add('active');
				// Highlight related task bars too
				timelineContentEl.querySelector(`#gantt-bar-${parentId}`)?.classList.add('dependency-highlight');
				timelineContentEl.querySelector(`#gantt-bar-${childId}`)?.classList.add('dependency-highlight');
			} else {
				path.classList.remove('active');
				timelineContentEl.querySelector(`#gantt-bar-${parentId}`)?.classList.remove('dependency-highlight');
				timelineContentEl.querySelector(`#gantt-bar-${childId}`)?.classList.remove('dependency-highlight');
			}
		}
	});
}

// Custom Tooltip Manager
let activeTooltipEl: HTMLElement | null = null;

function showTooltip(
	container: HTMLElement,
	event: MouseEvent,
	task: GanttTask,
	tasksMapById: Map<string, GanttTask>
) {
	hideTooltip();

	const tooltip = document.createElement('div');
	tooltip.className = 'gantt-tooltip';

	// Tooltip Title
	const title = tooltip.createDiv({ cls: 'gantt-tooltip-title', text: task.text });
	
	// Metadata Grid
	const meta = tooltip.createDiv({ cls: 'gantt-tooltip-meta' });
	
	// Status
	meta.createDiv({ cls: 'gantt-tooltip-meta-label', text: 'Status:' });
	meta.createDiv({ text: task.completed ? '✅ Completed' : task.progress > 0 ? `⏳ In Progress (${task.progress}%)` : '⭕ Open' });

	// Dates
	if (task.startDate || task.dueDate) {
		meta.createDiv({ cls: 'gantt-tooltip-meta-label', text: 'Timeline:' });
		meta.createDiv({ text: `${task.startDate || '?'} to ${task.dueDate || '?'}` });
	}

	if (task.completed && task.doneDate) {
		meta.createDiv({ cls: 'gantt-tooltip-meta-label', text: 'Finished:' });
		meta.createDiv({ text: task.doneDate });
	}

	// File path
	meta.createDiv({ cls: 'gantt-tooltip-meta-label', text: 'Location:' });
	meta.createDiv({ text: `${task.fileName}.md (line ${task.line + 1})` });

	// Section
	if (task.heading) {
		meta.createDiv({ cls: 'gantt-tooltip-meta-label', text: 'Section:' });
		meta.createDiv({ text: `# ${task.heading}` });
	}

	// Blocked by (Dependencies)
	if (task.parentId) {
		const parentTask = tasksMapById.get(task.parentId);
		meta.createDiv({ cls: 'gantt-tooltip-meta-label', text: 'Blocked By:' });
		meta.createDiv({ text: parentTask ? parentTask.text : `Task [${task.parentId}]` });
	}

	// Tags
	if (task.tags.length > 0) {
		meta.createDiv({ cls: 'gantt-tooltip-meta-label', text: 'Tags:' });
		const tagsContainer = meta.createDiv();
		task.tags.forEach(t => {
			tagsContainer.createSpan({ cls: 'gantt-tooltip-tag', text: t });
		});
	}

	container.appendChild(tooltip);
	activeTooltipEl = tooltip;

	// Position tooltip above the task bar
	const target = event.currentTarget as HTMLElement;
	const rect = target.getBoundingClientRect();
	const containerRect = container.getBoundingClientRect();

	// Calculate absolute top/left relative to the main container
	const tooltipWidth = tooltip.offsetWidth || 220;
	const tooltipHeight = tooltip.offsetHeight || 120;
	
	const top = rect.top - containerRect.top - tooltipHeight - 8;
	const left = rect.left - containerRect.left + (rect.width - tooltipWidth) / 2;

	tooltip.setAttribute('style', `top: ${Math.max(10, top)}px; left: ${Math.max(10, left)}px;`);
	tooltip.classList.add('visible');
}

function hideTooltip() {
	if (activeTooltipEl) {
		activeTooltipEl.remove();
		activeTooltipEl = null;
	}
}
