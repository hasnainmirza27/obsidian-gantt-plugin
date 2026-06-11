# Obsidian Gantt Chart Plugin

A premium, interactive Gantt Chart plugin for Obsidian. It automatically scans your vault for markdown tasks and plots them on a scrollable timeline. It supports grouping, zoom levels (Day, Week, Month), and task dependencies.

---

## ✨ Features

- **Interactive Sidebar View**: Reveal a dedicated Gantt Chart tab in your right sidebar with text search, task status filters (All, Open, Completed), and groupings (by File, Folder, Section Heading, or Tag).
- **Active Bidirectional Sync**: Toggling task checkboxes directly in the Gantt sidebar updates the checkbox and done dates in the original markdown files.
- **Visual Task Dependencies**: Automatically links task lines using SVG curves with arrows based on `🆔 <id>` and `⛔ <parent_id>` relationships (ideal for follow-up workflows).
- **Code Block Embeds**: Render dynamically-scoped Gantt dashboards inside any note using simple `gantt-chart` code blocks.
- **Glassmorphic Theme Matcher**: Styled using pure CSS grid/flex layers utilizing Obsidian's design variables so that it automatically integrates with any custom light or dark theme.

---

## 📅 Markdown Task Syntax

The plugin parses tasks written in standard Markdown:

- **Bullet formats**: `- [ ]` (open), `- [x]` (completed), `- [/]` (in progress)
- **Start date**: `🛫 YYYY-MM-DD` or inline fields `[start:: YYYY-MM-DD]` / `(start:: YYYY-MM-DD)`
- **Due date**: `📅 YYYY-MM-DD` or inline fields `[due:: YYYY-MM-DD]` / `(due:: YYYY-MM-DD)`
- **Finished date**: `✅ YYYY-MM-DD`
- **Dependencies**: `🆔 <id>` (self ID) and `⛔ <parent_id>` (blockers/dependencies)
- **Completion Progress**: Custom `[progress:: 50]` or `50%` overrides the checkboxes.
- **Tags**: Hashtags `#work` or `#personal` are parsed and can be used for grouping/filtering.

### Example Task Structure:
```markdown
- [ ] #project-alpha Draft documentation 🛫 2026-06-11 📅 2026-06-15 🆔 abcde
- [ ] #project-alpha Review documentation 🛫 2026-06-16 📅 2026-06-18 ⛔ abcde
- [x] Send release notes ✅ 2026-06-10
```

*Note: If a task has a due date but no start date, the start date defaults to matching the due date (1-day duration).*

---

## 📊 Code Block Embeds

Include a Gantt Chart inside any note by writing:

```yaml
```gantt-chart
groupBy: heading
zoom: day
status: open
tags: #project-alpha
path: Projects/Marketing
from: 2026-06-01
to: 2026-06-30
height: 450
showUndated: false
```
```

### Options:
- `groupBy`: `none`, `file`, `folder`, `heading`, or `tag` (Note: if set to `tag` and `tags` filter is provided, tasks are grouped by those tags in order, with remaining tasks placed in a final `Other` group)
- `zoom`: `day`, `week`, or `month`
- `status`: `all`, `open`, or `completed`
- `tags`: Tags to filter by (supports multiple comma-separated values, e.g. `#todo, #work`)
- `path`: Folder path filters (supports multiple comma-separated values, e.g. `Projects/Marketing, Projects/Engineering`)
- `from`: Start date boundary for tasks and timeline (YYYY-MM-DD, e.g. `2026-06-01`)
- `to`: End date boundary for tasks and timeline (YYYY-MM-DD, e.g. `2026-06-30`)
- `height`: Height of the chart in pixels (e.g. `450`, defaults to `380px`)
- `showUndated`: `true` or `false` (shows tasks without dates on today's calendar)

---

## 🚀 Installation & Local Development

### 1. Build from Source
Ensure you have Node.js installed, then:
```bash
npm install
npm run build
```

### 2. Manual Installation
Copy the compiled files from the output `build/` folder into your vault's plugins folder:
```
YourVault/.obsidian/plugins/obsidian-gantt-plugin/
  ├── main.js
  ├── manifest.json
  └── styles.css
```
Go to Obsidian -> Settings -> Community Plugins, reload list, and enable **Gantt Chart Plugin**.
