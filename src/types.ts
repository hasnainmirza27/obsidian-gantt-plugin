export interface GanttTask {
	id: string;
	parentId: string | null;
	text: string;
	completed: boolean;
	startDate: string | null;
	dueDate: string | null;
	doneDate: string | null;
	tags: string[];
	filePath: string;
	fileName: string;
	line: number;
	heading: string | null;
	progress: number; // 0 to 100
}

export type GroupByOption = 'none' | 'file' | 'folder' | 'heading' | 'tag';
export type ZoomOption = 'day' | 'week' | 'month';
export type StatusFilterOption = 'all' | 'open' | 'completed';

export interface GanttSettings {
	defaultDuration: number; // in days
	excludeFolders: string[];
	showUndatedTasks: boolean;
	todoTag: string;
	groupBy: GroupByOption;
	zoom: ZoomOption;
	statusFilter: StatusFilterOption;
	searchQuery: string;
	tagFilter: string;
	pathFilter: string;
	from: string;
	to: string;
	height: string;
}

export const DEFAULT_SETTINGS: GanttSettings = {
	defaultDuration: 1,
	excludeFolders: [],
	showUndatedTasks: false,
	todoTag: '#todo',
	groupBy: 'file',
	zoom: 'week',
	statusFilter: 'all',
	searchQuery: '',
	tagFilter: '',
	pathFilter: '',
	from: '',
	to: '',
	height: '380px'
};
