const STORAGE_KEY = "tl-calendar-planner-v1";
const CALENDAR_MODE_KEY = "tl-calendar-planner-calendar-mode";
const LOCAL_RECOVERY_KEY = "tl-calendar-planner-recovery-v2";
const THEME_KEY = "tl-calendar-planner-theme";
const SUPABASE_CONFIG_ENDPOINT = "/api/config";
const SUPABASE_LEGACY_TABLE = "timeline_data";
const SUPABASE_PROJECTS_TABLE = "timeline_projects";
const SUPABASE_SNAPSHOTS_TABLE = "timeline_snapshots";
const SUPABASE_CLIENT_MODULE = "./vendor/supabase-client.js?v=2";
const TODAY_ISO = dateToIso(new Date());

const STAGES = [
  { name: "大纲", icon: "file-text" },
  { name: "脚本", icon: "scroll-text" },
  { name: "拍摄", icon: "camera" },
  { name: "初稿", icon: "pencil" },
  { name: "发布", icon: "send" }
];

const PROJECT_COLORS = ["#d45d45", "#2f8f83", "#7566c9", "#d6902f", "#3478b8", "#9b5a86"];
const PRIORITY_OPTIONS = {
  high: { label: "高优先级", weight: 3, tone: "danger" },
  medium: { label: "普通优先级", weight: 2, tone: "accent" },
  low: { label: "低优先级", weight: 1, tone: "muted" }
};

const DEFAULT_PROJECTS = [
  {
    id: "hp-printer",
    name: "拜托了闻学长 & 惠普墨盒打印机",
    color: PROJECT_COLORS[0],
    milestones: {
      "大纲": "2026-05-25",
      "脚本": "2026-05-27",
      "拍摄": "2026-06-01",
      "初稿": "2026-06-04",
      "发布": "2026-06-08"
    }
  },
  {
    id: "xiaomi",
    name: "拜托了闻学长 & 小米",
    color: PROJECT_COLORS[1],
    milestones: {
      "大纲": "2026-05-26",
      "脚本": "2026-05-27",
      "拍摄": "2026-05-28",
      "初稿": "2026-06-01",
      "发布": "2026-06-03"
    }
  },
  {
    id: "lenovo-laptop",
    name: "拜托了闻学长 & 联想笔记本",
    color: PROJECT_COLORS[2],
    milestones: {
      "大纲": "2026-06-01",
      "脚本": "2026-06-02",
      "拍摄": "2026-06-03",
      "初稿": "2026-06-05",
      "发布": "2026-06-10"
    }
  }
];

const localState = loadLocalState();
let projects = localState.projects;
let localUpdatedAt = localState.updatedAt;
let projectSyncVersions = localState.sync.versions;
let syncedProjects = localState.sync.projects;
let projectTombstones = localState.sync.tombstones;
let dirtyProjectIds = new Set(localState.sync.dirtyIds);
let currentView = "calendar";
let selected = null;
let editingProjectId = null;
let selectedProjectColor = PROJECT_COLORS[0];
let projectSearchTerm = "";
let projectFilter = "active";
let projectSort = "next";
let syncAuthMode = "signin";
let mobilePage = "plan";
let selectedCalendarDate = getInitialCalendarDate();
let calendarMode = getInitialCalendarMode();
let calendarMonthAnchor = startOfMonthIso(selectedCalendarDate);
let toastTimer = null;
let syncRefreshTimer = null;
let smartParseTimer = null;

const SMART_PASTE_DEFAULT_NOTE = "粘贴项目名和阶段日期，会自动填入下面的表单。";

const syncState = {
  client: null,
  user: null,
  configured: false,
  ready: false,
  initializing: true,
  error: null,
  saving: false,
  loadingRemote: false,
  pendingSaveTimer: null,
  lastSavedAt: null,
  authError: null,
  connectionError: null,
  conflicts: 0,
  schemaVersion: 2
};

let iconFrame = null;
let syncRetryCount = 0;
let snapshotPending = Boolean(localState.sync.snapshotPending);

const elements = {
  appShell: document.querySelector("#appShell"),
  projectCount: document.querySelector("#projectCount"),
  milestoneCount: document.querySelector("#milestoneCount"),
  conflictCount: document.querySelector("#conflictCount"),
  rangeCount: document.querySelector("#rangeCount"),
  projectList: document.querySelector("#projectList"),
  projectSearch: document.querySelector("#projectSearch"),
  projectFilterButtons: [...document.querySelectorAll("[data-project-filter]")],
  projectLegend: document.querySelector("#projectLegend"),
  focusRow: document.querySelector("#focusRow"),
  rangeTitle: document.querySelector("#rangeTitle"),
  sideInsights: document.querySelector("#sideInsights"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarDayDetails: document.querySelector("#calendarDayDetails"),
  calendarModeButtons: [...document.querySelectorAll("[data-calendar-mode]")],
  calendarPeriodNav: document.querySelector("#calendarPeriodNav"),
  calendarPeriodLabel: document.querySelector("#calendarPeriodLabel"),
  previousMonthButton: document.querySelector("#previousMonthButton"),
  nextMonthButton: document.querySelector("#nextMonthButton"),
  timelineShell: document.querySelector("#timelineShell"),
  conflictList: document.querySelector("#conflictList"),
  viewButtons: [...document.querySelectorAll("[data-view]")],
  views: {
    calendar: document.querySelector("#calendarView"),
    projects: document.querySelector("#projectsView"),
    timeline: document.querySelector("#timelineView"),
    conflicts: document.querySelector("#conflictsView")
  },
  inspectorTitle: document.querySelector("#inspectorTitle"),
  emptyInspector: document.querySelector("#emptyInspector"),
  activeInspector: document.querySelector("#activeInspector"),
  inspector: document.querySelector(".inspector"),
  selectedDot: document.querySelector("#selectedDot"),
  selectedProject: document.querySelector("#selectedProject"),
  selectedStage: document.querySelector("#selectedStage"),
  inspectorDate: document.querySelector("#inspectorDate"),
  stageStack: document.querySelector("#stageStack"),
  sequenceAlert: document.querySelector("#sequenceAlert"),
  sequenceAlertText: document.querySelector("#sequenceAlertText"),
  deleteProjectButton: document.querySelector("#deleteProjectButton"),
  editProjectButton: document.querySelector("#editProjectButton"),
  moveEarlierButton: document.querySelector("#moveEarlierButton"),
  moveLaterButton: document.querySelector("#moveLaterButton"),
  addProjectButton: document.querySelector("#addProjectButton"),
  projectDialog: document.querySelector("#projectDialog"),
  projectForm: document.querySelector("#projectForm"),
  projectDialogTitle: document.querySelector("#projectDialogTitle"),
  smartPasteInput: document.querySelector("#smartPasteInput"),
  smartPasteStatus: document.querySelector("#smartPasteStatus"),
  smartPastePreview: document.querySelector("#smartPastePreview"),
  parseScheduleButton: document.querySelector("#parseScheduleButton"),
  projectNameInput: document.querySelector("#projectNameInput"),
  projectColorFields: document.querySelector("#projectColorFields"),
  projectDateFields: document.querySelector("#projectDateFields"),
  projectSort: document.querySelector("#projectSort"),
  dialogSequenceAlert: document.querySelector("#dialogSequenceAlert"),
  dialogSequenceAlertText: document.querySelector("#dialogSequenceAlertText"),
  copyProjectTlButton: document.querySelector("#copyProjectTlButton"),
  deleteProjectFromDialogButton: document.querySelector("#deleteProjectFromDialogButton"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  cancelDialogButton: document.querySelector("#cancelDialogButton"),
  quickAddButton: document.querySelector("#quickAddButton"),
  todayButton: document.querySelector("#todayButton"),
  themeButton: document.querySelector("#themeButton"),
  themeColorLight: document.querySelector("#themeColorLight"),
  themeColorDark: document.querySelector("#themeColorDark"),
  exportButton: document.querySelector("#exportButton"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  importButton: document.querySelector("#importButton"),
  importFile: document.querySelector("#importFile"),
  dataMenu: document.querySelector("#dataMenu"),
  dataMenuButton: document.querySelector("#dataMenuButton"),
  dataPopover: document.querySelector("#dataPopover"),
  resetButton: document.querySelector("#resetButton"),
  syncStatus: document.querySelector("#syncStatus"),
  syncNote: document.querySelector("#syncNote"),
  syncLoginForm: document.querySelector("#syncLoginForm"),
  syncEmail: document.querySelector("#syncEmail"),
  syncPassword: document.querySelector("#syncPassword"),
  syncLoginButton: document.querySelector("#syncLoginButton"),
  syncAuthModeButtons: [...document.querySelectorAll("[data-sync-mode]")],
  syncResetPasswordButton: document.querySelector("#syncResetPasswordButton"),
  syncUserPanel: document.querySelector("#syncUserPanel"),
  syncUserEmail: document.querySelector("#syncUserEmail"),
  syncLastSaved: document.querySelector("#syncLastSaved"),
  syncNowButton: document.querySelector("#syncNowButton"),
  syncRefreshButton: document.querySelector("#syncRefreshButton"),
  syncHistoryButton: document.querySelector("#syncHistoryButton"),
  syncLogoutButton: document.querySelector("#syncLogoutButton"),
  syncPasswordUpdateForm: document.querySelector("#syncPasswordUpdateForm"),
  syncNewPassword: document.querySelector("#syncNewPassword"),
  syncPasswordUpdateButton: document.querySelector("#syncPasswordUpdateButton"),
  workspaceBar: document.querySelector(".workspace-bar"),
  accountMenu: document.querySelector("#accountMenu"),
  avatarButton: document.querySelector("#avatarButton"),
  avatarInitial: document.querySelector("#avatarInitial"),
  accountBackdrop: document.querySelector("#accountBackdrop"),
  accountPopover: document.querySelector("#accountPopover"),
  closeAccountPopoverButton: document.querySelector("#closeAccountPopoverButton"),
  historyDialog: document.querySelector("#historyDialog"),
  historyList: document.querySelector("#historyList"),
  closeHistoryDialogButton: document.querySelector("#closeHistoryDialogButton"),
  mobilePageButtons: [...document.querySelectorAll("[data-mobile-page]")],
  toast: document.querySelector("#toast")
};

const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function getActiveTheme() {
  const selectedTheme = document.documentElement.dataset.theme;
  if (selectedTheme === "light" || selectedTheme === "dark") return selectedTheme;
  return systemThemeQuery.matches ? "dark" : "light";
}

function updateThemeControls() {
  const activeTheme = getActiveTheme();
  const nextTheme = activeTheme === "dark" ? "light" : "dark";
  const explicitTheme = document.documentElement.dataset.theme === activeTheme;
  const label = `切换到${nextTheme === "dark" ? "深色" : "浅色"}模式`;

  if (elements.themeButton) {
    elements.themeButton.innerHTML = `<i data-lucide="${activeTheme === "dark" ? "sun" : "moon"}"></i>`;
    elements.themeButton.title = label;
    elements.themeButton.setAttribute("aria-label", label);
    elements.themeButton.setAttribute("aria-pressed", String(activeTheme === "dark"));
  }

  if (elements.themeColorLight && elements.themeColorDark) {
    elements.themeColorLight.media = explicitTheme
      ? (activeTheme === "light" ? "all" : "not all")
      : "(prefers-color-scheme: light)";
    elements.themeColorDark.media = explicitTheme
      ? (activeTheme === "dark" ? "all" : "not all")
      : "(prefers-color-scheme: dark)";
  }
}

function toggleTheme() {
  const nextTheme = getActiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  try {
    localStorage.setItem(THEME_KEY, nextTheme);
  } catch {
    // The theme still applies for the current session.
  }
  updateThemeControls();
  activateIcons();
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyLocalState(normalizeProjects(DEFAULT_PROJECTS));
    const parsed = JSON.parse(raw);
    const parsedProjects = parsed.projects || parsed;
    if (!validateProjects(parsedProjects)) {
      return createEmptyLocalState(normalizeProjects(DEFAULT_PROJECTS));
    }
    return {
      projects: normalizeProjects(parsedProjects),
      updatedAt: parsed.updatedAt || null,
      sync: normalizeLocalSyncState(parsed.sync)
    };
  } catch {
    return createEmptyLocalState(normalizeProjects(DEFAULT_PROJECTS));
  }
}

function createEmptyLocalState(initialProjects) {
  return {
    projects: initialProjects,
    updatedAt: null,
    sync: normalizeLocalSyncState()
  };
}

function normalizeLocalSyncState(value = {}) {
  const versions = value && typeof value.versions === "object" ? value.versions : {};
  const baseProjects = value && typeof value.projects === "object" ? value.projects : {};
  const tombstones = value && typeof value.tombstones === "object" ? value.tombstones : {};
  const dirtyIds = Array.isArray(value?.dirtyIds) ? value.dirtyIds.filter(Boolean) : [];
  return {
    versions: { ...versions },
    projects: Object.fromEntries(Object.entries(baseProjects).filter(([, project]) => project && typeof project === "object")),
    tombstones: Object.fromEntries(Object.entries(tombstones).filter(([, item]) => item && typeof item === "object")),
    dirtyIds,
    snapshotPending: Boolean(value?.snapshotPending)
  };
}

function normalizeProjects(value) {
  return value.map((project, index) => ({
    id: project.id || makeId(project.name),
    name: project.name,
    color: project.color || PROJECT_COLORS[index % PROJECT_COLORS.length],
    owner: normalizeText(project.owner) || "未分配",
    priority: PRIORITY_OPTIONS[project.priority] ? project.priority : inferPriority(project, index),
    notes: normalizeText(project.notes),
    link: normalizeText(project.link),
    milestones: normalizeMilestones(project.milestones),
    completedMilestones: normalizeCompletedMilestones(project.completedMilestones, project.milestones)
  }));
}

function validateProjects(value) {
  return Array.isArray(value) && value.every((project) => {
    if (!project || typeof project.name !== "string" || !project.milestones) return false;
    const dates = STAGES.map((stage) => project.milestones[stage.name] || "");
    return dates.some(Boolean) && dates.every((date) => !date || /^\d{4}-\d{2}-\d{2}$/.test(date));
  });
}

function normalizeMilestones(value = {}) {
  return STAGES.reduce((milestones, stage) => {
    const date = String(value?.[stage.name] || "");
    milestones[stage.name] = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
    return milestones;
  }, {});
}

function normalizeCompletedMilestones(value = {}, milestones = null) {
  return STAGES.reduce((completed, stage) => {
    completed[stage.name] = Boolean(value[stage.name]) && (!milestones || Boolean(milestones?.[stage.name]));
    return completed;
  }, {});
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function inferPriority(project, index = 0) {
  if (getProjectConflictCountSafe(project) > 1) return "high";
  return index === 0 ? "high" : "medium";
}

function getProjectConflictCountSafe(project) {
  if (!project?.milestones) return 0;
  const dates = Object.values(project.milestones).filter(Boolean);
  return dates.length - new Set(dates).size;
}

function persistLocalProjects(updatedAt = new Date().toISOString()) {
  localUpdatedAt = updatedAt;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    projects,
    updatedAt: localUpdatedAt,
    sync: {
      versions: projectSyncVersions,
      projects: syncedProjects,
      tombstones: projectTombstones,
      dirtyIds: [...dirtyProjectIds],
      snapshotPending
    }
  }));
}

function saveProjects(options = {}) {
  markDirtyProjects();
  persistLocalProjects();
  createLocalRecoveryPoint(options.reason || "本机自动保存");
  if (options.sync !== false) queueCloudSave();
}

function projectFingerprint(project) {
  return JSON.stringify(cloneProject(project));
}

function markDirtyProjects() {
  const currentById = new Map(projects.map((project) => [project.id, project]));
  currentById.forEach((project, projectId) => {
    const baseProject = syncedProjects[projectId];
    if (!baseProject || projectTombstones[projectId] || projectFingerprint(project) !== projectFingerprint(baseProject)) {
      dirtyProjectIds.add(projectId);
    } else {
      dirtyProjectIds.delete(projectId);
    }
  });

  Object.keys(syncedProjects).forEach((projectId) => {
    if (!currentById.has(projectId) && !projectTombstones[projectId]) {
      projectTombstones[projectId] = {
        project: cloneProject(syncedProjects[projectId]),
        version: Number(projectSyncVersions[projectId] || 0)
      };
      dirtyProjectIds.add(projectId);
    }
  });
}

function createLocalRecoveryPoint(reason, recoveryProjects = projects) {
  try {
    const normalized = recoveryProjects.map(cloneProject);
    const fingerprint = JSON.stringify(normalized);
    const stored = JSON.parse(localStorage.getItem(LOCAL_RECOVERY_KEY) || "[]");
    const points = Array.isArray(stored) ? stored : [];
    if (points[0]?.fingerprint === fingerprint) return points[0];
    const point = {
      id: `local-${Date.now()}`,
      createdAt: new Date().toISOString(),
      reason,
      fingerprint,
      projects: normalized
    };
    localStorage.setItem(LOCAL_RECOVERY_KEY, JSON.stringify([point, ...points].slice(0, 20)));
    return point;
  } catch {
    return null;
  }
}

function getLocalRecoveryPoints() {
  try {
    const points = JSON.parse(localStorage.getItem(LOCAL_RECOVERY_KEY) || "[]");
    return Array.isArray(points) ? points.filter((point) => validateProjects(point.projects)) : [];
  } catch {
    return [];
  }
}

function cloneProject(project) {
  return {
    id: project.id || makeId(project.name),
    name: project.name,
    color: project.color || PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
    owner: normalizeText(project.owner) || "未分配",
    priority: PRIORITY_OPTIONS[project.priority] ? project.priority : "medium",
    notes: normalizeText(project.notes),
    link: normalizeText(project.link),
    milestones: normalizeMilestones(project.milestones),
    completedMilestones: normalizeCompletedMilestones(project.completedMilestones, project.milestones)
  };
}

function getAllMilestones() {
  return projects.flatMap((project) => STAGES
    .filter((stage) => Boolean(project.milestones[stage.name]))
    .map((stage) => ({
      project,
      stage: stage.name,
      date: project.milestones[stage.name],
      completed: Boolean(project.completedMilestones?.[stage.name])
    })));
}

function getActiveProjectMilestones() {
  return getAllMilestones().filter((item) => !isProjectComplete(item.project));
}

function getInitialCalendarMode() {
  try {
    const savedMode = localStorage.getItem(CALENDAR_MODE_KEY);
    if (["month", "week", "agenda"].includes(savedMode)) return savedMode;
  } catch {
    // Use the device-appropriate default when preferences are unavailable.
  }
  return window.matchMedia("(max-width: 860px)").matches ? "agenda" : "month";
}

function getInitialCalendarDate() {
  if (!window.matchMedia("(max-width: 860px)").matches) return TODAY_ISO;
  const pending = projects
    .filter((project) => !isProjectComplete(project))
    .flatMap((project) => STAGES
      .filter((stage) => !project.completedMilestones?.[stage.name])
      .map((stage) => project.milestones[stage.name]))
    .filter(Boolean)
    .sort();
  return pending.find((iso) => iso >= TODAY_ISO) || pending[0] || TODAY_ISO;
}

function startOfMonthIso(iso) {
  const date = isoToDate(iso || TODAY_ISO);
  return dateToIso(new Date(date.getFullYear(), date.getMonth(), 1));
}

function getMonthGridDays(anchorIso) {
  const monthStart = isoToDate(startOfMonthIso(anchorIso));
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const start = startOfWeek(monthStart);
  const end = endOfWeek(monthEnd);
  const days = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    days.push(dateToIso(date));
  }
  return days;
}

function getRelevantMonthGridDays(anchorIso, grouped) {
  const monthDays = getMonthGridDays(anchorIso);
  const monthKey = startOfMonthIso(anchorIso).slice(0, 7);
  const relevantDates = [...grouped.keys()]
    .filter((iso) => iso.startsWith(monthKey))
    .sort();
  if (!relevantDates.length) return [];

  const firstVisible = dateToIso(startOfWeek(isoToDate(relevantDates[0])));
  const lastVisible = dateToIso(endOfWeek(isoToDate(relevantDates.at(-1))));
  return monthDays.filter((iso) => iso >= firstVisible && iso <= lastVisible);
}

function changeCalendarMonth(offset) {
  const current = isoToDate(calendarMonthAnchor);
  calendarMonthAnchor = dateToIso(new Date(current.getFullYear(), current.getMonth() + offset, 1));
  const monthKey = calendarMonthAnchor.slice(0, 7);
  const firstScheduledDate = getActiveProjectMilestones()
    .filter((item) => item.date.startsWith(monthKey))
    .sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  selectedCalendarDate = firstScheduledDate || calendarMonthAnchor;
  render();
}

function getDateBounds(items = getAllMilestones()) {
  const dates = items.map((item) => isoToDate(item.date));
  if (!dates.length) {
    const today = isoToDate(TODAY_ISO);
    return { min: today, max: today };
  }
  return {
    min: new Date(Math.min(...dates.map((date) => date.getTime()))),
    max: new Date(Math.max(...dates.map((date) => date.getTime())))
  };
}

function getCalendarDays(items = getActiveProjectMilestones()) {
  const { min, max } = getDateBounds(items);
  const start = startOfWeek(min);
  const end = endOfWeek(max);
  const days = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    days.push(dateToIso(date));
  }
  return { days, start: dateToIso(start), end: dateToIso(end) };
}

function groupMilestonesByDate(items = getAllMilestones()) {
  return items.reduce((map, item) => {
    if (!map.has(item.date)) map.set(item.date, []);
    map.get(item.date).push(item);
    return map;
  }, new Map());
}

function render() {
  ensureValidSelection();
  const allMilestones = getAllMilestones();
  const visibleMilestones = allMilestones.filter((item) => !isProjectComplete(item.project));
  const pendingMilestones = visibleMilestones.filter((item) => !item.completed);
  const activeProjects = projects.filter((project) => !isProjectComplete(project));
  const grouped = groupMilestonesByDate(visibleMilestones);
  const { min, max } = getDateBounds(visibleMilestones);
  const conflictDays = [...grouped.entries()]
    .map(([iso, items]) => [iso, items.filter((item) => !item.completed)])
    .filter(([, items]) => items.length > 1);

  elements.projectCount.textContent = String(activeProjects.length);
  elements.milestoneCount.textContent = String(pendingMilestones.length);
  elements.conflictCount.textContent = String(conflictDays.length);
  elements.rangeCount.textContent = visibleMilestones.length ? String(daysBetween(dateToIso(min), dateToIso(max)) + 1) : "0";
  elements.rangeTitle.textContent = visibleMilestones.length ? `${formatDateShort(dateToIso(min))} 至 ${formatDateShort(dateToIso(max))}` : "所有项目已完成";

  if (currentView === "projects") renderProjectList();
  renderSideInsights(grouped, allMilestones, conflictDays);
  renderFocusRow(grouped, visibleMilestones);
  renderLegend();
  if (currentView === "calendar") renderCalendar(grouped);
  if (currentView === "timeline") renderTimeline();
  if (currentView === "conflicts") renderConflicts(grouped);
  renderInspector();
  renderSyncPanel();
  activateIcons();
}

function renderProjectList() {
  elements.projectList.innerHTML = "";
  renderProjectControls();

  const visibleProjects = getVisibleProjects();
  if (!visibleProjects.length) {
    const empty = document.createElement("div");
    empty.className = "empty-block compact";
    const emptyMessages = {
      active: "当前没有进行中的项目",
      done: "还没有已完成项目",
      conflict: "当前没有撞期项目"
    };
    empty.textContent = projectSearchTerm.trim() ? "没有匹配的项目" : emptyMessages[projectFilter] || "暂无项目";
    elements.projectList.append(empty);
    return;
  }

  visibleProjects.forEach((project) => {
    const dates = getProjectDates(project);
    const stageCount = getProjectStageCount(project);
    const completedCount = getProjectCompletedCount(project);
    const progress = stageCount ? Math.round((completedCount / stageCount) * 100) : 0;
    const isSelectedProject = selected && selected.projectId === project.id;
    const conflictCount = getProjectConflictCount(project);
    const next = getNextPendingMilestone(project);
    const card = document.createElement("article");
    card.className = "project-card";
    card.style.setProperty("--project-color", project.color);
    if (isSelectedProject) card.classList.add("selected");
    if (isProjectComplete(project)) card.classList.add("completed");
    card.addEventListener("click", () => {
      selected = { projectId: project.id, stage: next?.stage || getFirstScheduledStage(project)?.name };
      render();
    });

    const head = document.createElement("div");
    head.className = "project-card-head";

    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.className = "project-done-toggle";
    doneButton.title = isProjectComplete(project) ? "标记为未完成" : "标记项目完成";
    doneButton.setAttribute("aria-label", doneButton.title);
    doneButton.setAttribute("aria-pressed", String(isProjectComplete(project)));
    doneButton.innerHTML = '<i data-lucide="check"></i>';
    doneButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleProjectCompleted(project.id);
    });

    const titleWrap = document.createElement("div");
    titleWrap.className = "project-title-wrap";
    const title = document.createElement("h3");
    title.textContent = project.name;

    const meta = document.createElement("p");
    meta.className = "project-meta";
    meta.textContent = `${formatDateShort(dates[0])} 至 ${formatDateShort(dates[dates.length - 1])} · ${completedCount}/${stageCount} 已完成 · ${progress}%`;
    titleWrap.append(title, meta);

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "icon-button project-edit-button";
    editButton.title = "编辑项目";
    editButton.setAttribute("aria-label", `编辑 ${project.name}`);
    editButton.innerHTML = '<i data-lucide="pencil"></i>';
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openProjectDialog(project.id);
    });

    head.append(doneButton, titleWrap, editButton);
    card.append(head);

    if (!isProjectComplete(project)) {
      const tags = document.createElement("div");
      tags.className = "project-tags";
      tags.innerHTML = `<span>${describeRelativeDate(next?.date || getProjectDeadline(project))}</span>`;
      card.append(tags);
    }

    const progressTrack = document.createElement("div");
    progressTrack.className = "project-progress";
    progressTrack.setAttribute("aria-label", `完成进度 ${progress}%`);
    const progressBar = document.createElement("span");
    progressBar.style.width = `${progress}%`;
    progressTrack.append(progressBar);
    card.append(progressTrack);

    const signals = document.createElement("div");
    signals.className = "project-signals";
    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "project-next-step";
    nextButton.innerHTML = next
      ? `<span>下一步</span><strong>${next.stage}</strong><small>${formatDateWithWeekday(next.date)}</small>`
      : "<span>状态</span><strong>全部完成</strong><small>无需处理</small>";
    nextButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (next) selectMilestone(project.id, next.stage);
    });
    signals.append(nextButton);

    if (conflictCount) {
      const conflictBadge = document.createElement("button");
      conflictBadge.type = "button";
      conflictBadge.className = "project-signal-pill warning";
      conflictBadge.textContent = `撞期 ${conflictCount}`;
      conflictBadge.addEventListener("click", (event) => {
        event.stopPropagation();
        selected = { projectId: project.id, stage: getFirstConflictedStage(project) || "大纲" };
        switchView("conflicts");
        render();
      });
      signals.append(conflictBadge);
    }

    card.append(signals);

    if (!isSelectedProject) {
      elements.projectList.append(card);
      return;
    }

    const stageList = document.createElement("div");
    stageList.className = "project-stage-list";

    getScheduledStages(project).forEach((stage) => {
      const row = document.createElement("div");
      row.className = "project-stage-row";
      if (project.completedMilestones?.[stage.name]) row.classList.add("completed");

      const statusButton = document.createElement("button");
      statusButton.type = "button";
      statusButton.className = "stage-complete-toggle";
      statusButton.title = project.completedMilestones?.[stage.name] ? "标记为未完成" : "标记为完成";
      statusButton.setAttribute("aria-label", `${project.name} ${stage.name} ${statusButton.title}`);
      statusButton.setAttribute("aria-pressed", String(Boolean(project.completedMilestones?.[stage.name])));
      statusButton.innerHTML = '<i data-lucide="check"></i>';
      statusButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleMilestoneCompleted(project.id, stage.name);
      });

      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-stage-main";
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        selectMilestone(project.id, stage.name);
      });

      const label = document.createElement("span");
      label.textContent = stage.name;
      const date = document.createElement("strong");
      date.textContent = formatDateWithWeekday(project.milestones[stage.name]);
      button.append(label, date);

      row.append(statusButton, button);
      stageList.append(row);
    });

    card.append(stageList);
    elements.projectList.append(card);
  });
}

function renderProjectControls() {
  if (elements.projectSearch && elements.projectSearch.value !== projectSearchTerm) {
    elements.projectSearch.value = projectSearchTerm;
  }

  const counts = {
    all: projects.length,
    active: projects.filter((project) => !isProjectComplete(project)).length,
    done: projects.filter(isProjectComplete).length,
    conflict: projects.filter((project) => getProjectConflictCount(project) > 0).length
  };
  const labels = { all: "全部", active: "进行中", done: "已完成", conflict: "撞期" };

  elements.projectFilterButtons.forEach((button) => {
    const key = button.dataset.projectFilter;
    const active = button.dataset.projectFilter === projectFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.textContent = `${labels[key] || key} ${counts[key] ?? 0}`;
  });

  if (elements.projectSort && elements.projectSort.value !== projectSort) {
    elements.projectSort.value = projectSort;
  }
}

function getVisibleProjects() {
  const query = projectSearchTerm.trim().toLowerCase();
  return projects.filter((project) => {
    const milestoneText = STAGES
      .map((stage) => `${stage.name} ${project.milestones[stage.name]}`)
      .join(" ");
    const haystack = `${project.name} ${getClientName(project.name)} ${project.owner} ${project.notes} ${getPriorityMeta(project.priority).label} ${milestoneText}`.toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (projectFilter === "active") return !isProjectComplete(project);
    if (projectFilter === "done") return isProjectComplete(project);
    if (projectFilter === "conflict") return getProjectConflictCount(project) > 0;
    return true;
  }).sort(compareProjectsForView);
}

function compareProjectsForView(a, b) {
  if (projectSort === "priority") {
    return getPriorityMeta(b.priority).weight - getPriorityMeta(a.priority).weight || compareProjectNextDate(a, b);
  }
  if (projectSort === "progress") {
    return getProjectCompletedCount(b) - getProjectCompletedCount(a) || compareProjectNextDate(a, b);
  }
  if (projectSort === "conflict") {
    return getProjectConflictCount(b) - getProjectConflictCount(a) || compareProjectNextDate(a, b);
  }
  if (projectSort === "name") {
    return getClientName(a.name).localeCompare(getClientName(b.name), "zh-Hans-CN");
  }
  return compareProjectNextDate(a, b);
}

function compareProjectNextDate(a, b) {
  return (getNextPendingMilestone(a)?.date || getProjectDeadline(a) || "9999-12-31")
    .localeCompare(getNextPendingMilestone(b)?.date || getProjectDeadline(b) || "9999-12-31");
}

function renderSideInsights(grouped, allMilestones, conflictDays) {
  if (!elements.sideInsights) return;
  elements.sideInsights.innerHTML = "";

  const nextItems = allMilestones
    .filter((item) => !item.completed)
    .sort((a, b) => a.date.localeCompare(b.date) || compareMilestones(a, b))
    .slice(0, 4);

  const nextSection = createSideSection("接下来", "最近要处理的节点");
  if (nextItems.length) {
    nextItems.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "side-event-row";
      if (getOverdueDays(item.date)) button.classList.add("overdue");
      button.style.setProperty("--project-color", item.project.color);
      button.innerHTML = `<span class="side-project-rail"></span><span class="side-event-copy"><strong>${escapeHtml(getClientName(item.project.name))}</strong><em>${item.stage} · ${formatDateWithWeekday(item.date)} · ${describeRelativeDate(item.date)}</em></span>`;
      button.addEventListener("click", () => openMilestoneInCalendar(item.project.id, item.stage));
      nextSection.append(button);
    });
  } else {
    nextSection.append(createSideEmpty("所有节点都完成了"));
  }
  elements.sideInsights.append(nextSection);

  const conflictSection = createSideSection("风险", "需要协调的日期");
  const activeConflicts = conflictDays
    .map(([iso, items]) => [iso, items.filter((item) => !item.completed).sort(compareMilestones)])
    .slice(0, 3);
  if (activeConflicts.length) {
    activeConflicts.forEach(([iso, items]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "side-conflict-row";
      button.innerHTML = `<strong>${formatDateWithWeekday(iso)}</strong><span>${escapeHtml(items.map((item) => getClientName(item.project.name)).join(" / "))}</span>`;
      button.addEventListener("click", () => {
        selectedCalendarDate = iso;
        switchView("conflicts");
        render();
      });
      conflictSection.append(button);
    });
  } else {
    conflictSection.append(createSideEmpty("暂无撞期"));
  }
  elements.sideInsights.append(conflictSection);

  const progressSection = createSideSection("项目进度", "仅显示进行中");
  const activeProjects = projects.filter((project) => !isProjectComplete(project));
  activeProjects.forEach((project) => {
    const stageCount = getProjectStageCount(project);
    const completedCount = getProjectCompletedCount(project);
    const progress = stageCount ? Math.round((completedCount / stageCount) * 100) : 0;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "side-progress-row";
    row.style.setProperty("--project-color", project.color);
    row.innerHTML = `<span><strong>${escapeHtml(getClientName(project.name))}</strong><em>${progress}% · ${completedCount}/${stageCount}</em></span><b><i></i></b>`;
    row.querySelector("b i").style.width = `${progress}%`;
    row.addEventListener("click", () => {
      selected = { projectId: project.id, stage: getNextPendingMilestone(project)?.stage || getFirstScheduledStage(project)?.name };
      switchView("projects");
      render();
    });
    progressSection.append(row);
  });
  if (!activeProjects.length) progressSection.append(createSideEmpty("所有项目都完成了"));
  elements.sideInsights.append(progressSection);

}

function createSideSection(title, subtitle) {
  const section = document.createElement("section");
  section.className = "side-section";
  const head = document.createElement("div");
  head.className = "side-section-head";
  head.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
  section.append(head);
  return section;
}

function createSideEmpty(text) {
  const empty = document.createElement("p");
  empty.className = "side-empty";
  empty.textContent = text;
  return empty;
}

function getNextPendingMilestone(project) {
  return STAGES
    .map((stage) => ({
      stage: stage.name,
      date: project.milestones[stage.name],
      completed: Boolean(project.completedMilestones?.[stage.name])
    }))
    .filter((item) => item.date && !item.completed)
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

function getScheduledStages(project) {
  return STAGES.filter((stage) => Boolean(project.milestones?.[stage.name]));
}

function getFirstScheduledStage(project) {
  return getScheduledStages(project)[0] || null;
}

function getProjectStageCount(project) {
  return getScheduledStages(project).length;
}

function getProjectDates(project) {
  return getScheduledStages(project)
    .map((stage) => project.milestones[stage.name])
    .sort();
}

function getPriorityMeta(priority) {
  return PRIORITY_OPTIONS[priority] || PRIORITY_OPTIONS.medium;
}

function getProjectDeadline(project) {
  return getProjectDates(project).at(-1) || "";
}

function getProjectStart(project) {
  return getProjectDates(project)[0] || "";
}

function getOverdueDays(iso) {
  if (!iso || iso >= TODAY_ISO) return 0;
  return Math.max(0, daysBetween(iso, TODAY_ISO));
}

function describeRelativeDate(iso) {
  if (!iso) return "";
  const diff = daysBetween(TODAY_ISO, iso);
  if (diff < 0) return `逾期 ${Math.abs(diff)} 天`;
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  return `${diff} 天后`;
}

function getActiveDateCounts() {
  return getAllMilestones()
    .filter((item) => !item.completed)
    .reduce((map, item) => {
      map.set(item.date, (map.get(item.date) || 0) + 1);
      return map;
    }, new Map());
}

function getProjectConflictCount(project) {
  const dateCounts = getActiveDateCounts();
  return STAGES.filter((stage) => {
    const date = project.milestones[stage.name];
    return date && !project.completedMilestones?.[stage.name] && (dateCounts.get(date) || 0) > 1;
  }).length;
}

function getFirstConflictedStage(project) {
  const dateCounts = getActiveDateCounts();
  const match = STAGES.find((stage) => {
    const date = project.milestones[stage.name];
    return date && !project.completedMilestones?.[stage.name] && (dateCounts.get(date) || 0) > 1;
  });
  return match?.name || null;
}

function getProjectCompletedCount(project) {
  return getScheduledStages(project).filter((stage) => project.completedMilestones?.[stage.name]).length;
}

function isProjectComplete(project) {
  const stageCount = getProjectStageCount(project);
  return stageCount > 0 && getProjectCompletedCount(project) === stageCount;
}

function toggleProjectCompleted(projectId) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return;
  const nextDone = !isProjectComplete(project);
  project.completedMilestones = normalizeCompletedMilestones(project.completedMilestones, project.milestones);
  getScheduledStages(project).forEach((stage) => {
    project.completedMilestones[stage.name] = nextDone;
  });
  if (nextDone && selected?.projectId === projectId) {
    selected = null;
  } else if (!nextDone) {
    if (projectFilter === "done") projectFilter = "active";
    const firstStage = getFirstScheduledStage(project);
    selected = firstStage ? { projectId, stage: firstStage.name } : null;
    selectedCalendarDate = firstStage ? project.milestones[firstStage.name] : selectedCalendarDate;
  }
  saveProjects();
  render();
  showToast(nextDone ? `${getClientName(project.name)} 已完成，已移入“已完成”` : `${getClientName(project.name)} 已恢复到“进行中”`);
}

function toggleMilestoneCompleted(projectId, stageName) {
  const project = projects.find((item) => item.id === projectId);
  if (!project || !project.milestones[stageName]) return;
  project.completedMilestones = normalizeCompletedMilestones(project.completedMilestones, project.milestones);
  project.completedMilestones[stageName] = !project.completedMilestones[stageName];
  const projectNowComplete = isProjectComplete(project);
  if (project.completedMilestones[stageName]) {
    const next = getNextPendingMilestone(project);
    if (selected?.projectId === projectId && selected.stage === stageName) {
      selected = next ? { projectId, stage: next.stage } : null;
      if (next) selectedCalendarDate = next.date;
    }
  } else {
    if (projectFilter === "done") projectFilter = "active";
    selected = { projectId, stage: stageName };
    selectedCalendarDate = project.milestones[stageName];
  }
  saveProjects();
  render();
  showToast(projectNowComplete
    ? `${getClientName(project.name)} 已完成，已移入“已完成”`
    : `${getClientName(project.name)} · ${stageName} ${project.completedMilestones[stageName] ? "已完成" : "已恢复"}`);
}

function renderFocusRow(grouped, activeMilestones) {
  elements.focusRow.innerHTML = "";
  const pending = activeMilestones
    .filter((item) => !item.completed)
    .sort((a, b) => a.date.localeCompare(b.date) || compareMilestones(a, b));
  const doneCount = activeMilestones.length - pending.length;
  const dueItems = pending.filter((item) => item.date <= TODAY_ISO);
  const nextItem = pending.find((item) => item.date > TODAY_ISO) || pending[0];
  const conflicts = [...grouped.entries()]
    .map(([iso, items]) => [iso, items.filter((item) => !item.completed)])
    .filter(([, items]) => items.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));
  const nextConflict = conflicts[0];
  const progress = activeMilestones.length ? Math.round((doneCount / activeMilestones.length) * 100) : 100;

  elements.focusRow.append(
    createFocusCard({
      icon: "sun-medium",
      label: "当前焦点",
      title: dueItems.length ? `${dueItems.length} 个逾期/今日节点` : "今天没有卡住的节点",
      meta: dueItems.length ? `${describeMilestone(dueItems[0])} · ${describeRelativeDate(dueItems[0].date)}` : "可以从下一节点继续推进",
      tone: dueItems.length ? "warning" : "calm",
      onClick: dueItems.length ? () => openMilestoneInCalendar(dueItems[0].project.id, dueItems[0].stage) : () => switchView("timeline")
    }),
    createFocusCard({
      icon: "arrow-right-circle",
      label: "下一步",
      title: nextItem ? `${nextItem.stage} · ${getClientName(nextItem.project.name)}` : "全部完成",
      meta: nextItem ? formatDateWithWeekday(nextItem.date) : "没有待办节点",
      tone: "accent",
      onClick: nextItem ? () => openMilestoneInCalendar(nextItem.project.id, nextItem.stage) : () => switchView("calendar")
    }),
    createFocusCard({
      icon: "triangle-alert",
      label: "风险",
      title: nextConflict ? `${formatDateWithWeekday(nextConflict[0])}` : "暂无风险",
      meta: nextConflict ? `${nextConflict[1].length} 个节点需要协调` : "当前排期很干净",
      tone: nextConflict ? "danger" : "calm",
      onClick: nextConflict ? () => switchView("conflicts") : () => switchView("calendar")
    }),
    createFocusCard({
      icon: "gauge",
      label: "当前完成率",
      title: activeMilestones.length ? `${progress}%` : "全部完成",
      meta: activeMilestones.length ? `${doneCount}/${activeMilestones.length} 个进行中项目节点已完成` : "暂无进行中的项目",
      tone: "progress",
      onClick: () => switchView("timeline")
    })
  );
}

function createFocusCard({ icon, label, title, meta, tone, onClick }) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `focus-card ${tone || ""}`;
  card.addEventListener("click", onClick);

  const iconWrap = document.createElement("span");
  iconWrap.className = "focus-icon";
  iconWrap.innerHTML = `<i data-lucide="${icon}"></i>`;

  const copy = document.createElement("span");
  copy.className = "focus-copy";
  const labelNode = document.createElement("span");
  labelNode.className = "focus-label";
  labelNode.textContent = label;
  const titleNode = document.createElement("strong");
  titleNode.textContent = title;
  const metaNode = document.createElement("small");
  metaNode.textContent = meta;
  copy.append(labelNode, titleNode, metaNode);

  card.append(iconWrap, copy);
  return card;
}

function describeMilestone(item) {
  return `${formatDateWithWeekday(item.date)} · ${item.stage} · ${getClientName(item.project.name)}`;
}

function renderLegend() {
  elements.projectLegend.innerHTML = "";
  projects.filter((project) => !isProjectComplete(project)).forEach((project) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.style.setProperty("--project-color", project.color);

    const dot = document.createElement("span");
    dot.className = "color-dot";

    const label = document.createElement("span");
    label.textContent = getClientName(project.name);

    item.append(dot, label);
    elements.projectLegend.append(item);
  });
}

function renderCalendar(grouped) {
  const { days: scheduleDays } = getCalendarDays();
  if (calendarMode === "agenda" && !scheduleDays.includes(selectedCalendarDate)) {
    selectedCalendarDate = scheduleDays.find((iso) => grouped.has(iso)) || scheduleDays[0] || TODAY_ISO;
  }
  if (calendarMode === "month") {
    calendarMonthAnchor = startOfMonthIso(selectedCalendarDate);
  }
  elements.calendarGrid.innerHTML = "";
  elements.calendarGrid.classList.toggle("agenda-grid", calendarMode === "agenda");
  elements.calendarGrid.classList.toggle("week-grid", calendarMode === "week");
  elements.views.calendar.dataset.calendarMode = calendarMode;
  elements.views.calendar.classList.toggle("calendar-mode-agenda", calendarMode === "agenda");
  renderCalendarModeControls();

  if (calendarMode === "agenda") {
    renderAgendaCalendar(scheduleDays, grouped);
    renderCalendarDayDetails(selectedCalendarDate, grouped.get(selectedCalendarDate) || []);
    return;
  }

  const visibleDays = calendarMode === "week"
    ? getWeekDays(selectedCalendarDate)
    : getRelevantMonthGridDays(calendarMonthAnchor, grouped);
  const monthIsEmpty = calendarMode === "month" && !visibleDays.length;
  elements.views.calendar.classList.toggle("calendar-month-empty", monthIsEmpty);

  if (monthIsEmpty) {
    const empty = document.createElement("div");
    empty.className = "calendar-month-empty-card";
    empty.innerHTML = '<i data-lucide="calendar-off"></i><strong>本月没有进行中的项目</strong>';
    elements.calendarGrid.append(empty);
    return;
  }

  ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].forEach((weekday) => {
    const cell = document.createElement("div");
    cell.className = "weekday-cell";
    cell.textContent = weekday;
    elements.calendarGrid.append(cell);
  });

  visibleDays.forEach((iso) => {
    const items = (grouped.get(iso) || []).sort(compareMilestones);
    const activeCount = items.filter((item) => !item.completed).length;
    const cell = document.createElement("section");
    cell.className = "day-cell";
    cell.dataset.date = iso;
    if (isWeekend(iso)) cell.classList.add("weekend");
    if (iso === TODAY_ISO) cell.classList.add("today");
    if (iso === selectedCalendarDate) cell.classList.add("selected-day");
    if (activeCount === 2) cell.classList.add("medium-density");
    if (activeCount >= 3) cell.classList.add("high-density");
    addDropTarget(cell);
    cell.addEventListener("click", (event) => {
      if (event.target.closest(".milestone-chip, button")) return;
      selectedCalendarDate = iso;
      render();
    });

    const head = document.createElement("div");
    head.className = "day-head";

    const dateLabel = document.createElement("div");
    const number = document.createElement("span");
    number.className = "date-number";
    number.textContent = String(isoToDate(iso).getDate());
    const month = document.createElement("span");
    month.className = "date-month";
    month.textContent = ` ${isoToDate(iso).getMonth() + 1}月`;
    dateLabel.append(number, month);

    const load = document.createElement("span");
    load.className = "load-pill";
    if (activeCount > 1) load.classList.add("busy");
    if (!activeCount && items.length) load.classList.add("done");
    load.textContent = activeCount ? String(activeCount) : items.length ? "✓" : "0";

    head.append(dateLabel);
    if (activeCount || items.length) head.append(load);
    cell.append(head);

    const stack = document.createElement("div");
    stack.className = "chip-stack";
    const compactMonth = calendarMode === "month" && isMobileLayout();
    const visibleItems = compactMonth ? items.slice(0, 2) : items;
    visibleItems.forEach((item) => stack.append(createMilestoneChip(item.project, item.stage, iso, true)));
    if (compactMonth && items.length > visibleItems.length) {
      const more = document.createElement("span");
      more.className = "calendar-more-count";
      more.textContent = `+${items.length - visibleItems.length}`;
      more.setAttribute("aria-label", `还有 ${items.length - visibleItems.length} 个节点，点击日期查看`);
      stack.append(more);
    }
    cell.append(stack);

    elements.calendarGrid.append(cell);
  });

  renderCalendarDayDetails(selectedCalendarDate, grouped.get(selectedCalendarDate) || []);
}

function renderCalendarModeControls() {
  elements.calendarModeButtons.forEach((button) => {
    const active = button.dataset.calendarMode === calendarMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (elements.calendarPeriodNav) {
    elements.calendarPeriodNav.classList.toggle("hidden", calendarMode !== "month");
  }
  if (elements.calendarPeriodLabel) {
    const month = isoToDate(calendarMonthAnchor);
    elements.calendarPeriodLabel.textContent = `${month.getFullYear()}年${month.getMonth() + 1}月`;
  }
}

function getWeekDays(anchorIso) {
  const start = startOfWeek(isoToDate(anchorIso || TODAY_ISO));
  return Array.from({ length: 7 }, (_, index) => dateToIso(addDays(start, index)));
}

function renderAgendaCalendar(days, grouped) {
  const visibleDays = days.filter((iso) => grouped.has(iso)).slice(0, 30);
  visibleDays.forEach((iso) => {
    const items = (grouped.get(iso) || []).sort(compareMilestones);
    const row = document.createElement("section");
    row.className = "agenda-day";
    row.dataset.date = iso;
    if (iso === selectedCalendarDate) row.classList.add("selected-day");

    const head = document.createElement("button");
    head.type = "button";
    head.className = "agenda-day-head";
    head.innerHTML = `<strong>${formatDateWithWeekday(iso)}</strong><span>${items.length ? `${items.length} 个节点` : "无节点"}</span>`;
    head.addEventListener("click", () => {
      selectedCalendarDate = iso;
      render();
    });
    row.append(head);

    const stack = document.createElement("div");
    stack.className = "agenda-stack";
    if (items.length) {
      items.forEach((item) => stack.append(createMilestoneChip(item.project, item.stage, iso, false)));
    } else {
      const empty = document.createElement("p");
      empty.className = "agenda-empty";
      empty.textContent = "这一天没有项目节点";
      stack.append(empty);
    }
    row.append(stack);
    elements.calendarGrid.append(row);
  });
}

function renderCalendarDayDetails(iso, items) {
  if (!elements.calendarDayDetails) return;
  elements.calendarDayDetails.innerHTML = "";
  const head = document.createElement("div");
  head.className = "calendar-details-head";
  head.innerHTML = `<strong>${formatDateWithWeekday(iso)}</strong><span>${items.length ? `${items.length} 个节点` : "当天无节点"}</span>`;
  elements.calendarDayDetails.append(head);

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "calendar-details-empty";
    empty.textContent = "这一天没有进行中的项目节点。";
    elements.calendarDayDetails.append(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "calendar-details-list";
  items.sort(compareMilestones).forEach(({ project, stage, completed }) => {
    const card = document.createElement("article");
    card.className = "calendar-detail-card";
    card.style.setProperty("--project-color", project.color);
    if (completed) card.classList.add("completed");

    const main = document.createElement("button");
    main.type = "button";
    main.className = "calendar-detail-main";
    main.innerHTML = `<span class="detail-dot"></span><strong>${escapeHtml(getClientName(project.name))}</strong><em>${stage}${completed ? " · 已完成" : ""}</em>`;
    main.addEventListener("click", () => selectMilestone(project.id, stage));

    const actions = document.createElement("div");
    actions.className = "detail-actions";
    const complete = document.createElement("button");
    complete.type = "button";
    complete.className = "icon-button mini-button";
    complete.title = completed ? "标记为未完成" : "标记完成";
    complete.setAttribute("aria-label", `${getClientName(project.name)} ${stage} ${complete.title}`);
    complete.innerHTML = `<i data-lucide="${completed ? "rotate-ccw" : "check"}"></i>`;
    complete.addEventListener("click", () => toggleMilestoneCompleted(project.id, stage));

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "icon-button mini-button";
    edit.title = "编辑项目";
    edit.setAttribute("aria-label", `编辑 ${getClientName(project.name)}`);
    edit.innerHTML = '<i data-lucide="pencil"></i>';
    edit.addEventListener("click", () => openProjectDialog(project.id));

    actions.append(complete, edit);
    card.append(main, actions);
    list.append(card);
  });
  elements.calendarDayDetails.append(list);
}

function renderTimeline() {
  elements.timelineShell.innerHTML = "";
  const grouped = getAllMilestones()
    .filter((item) => !isProjectComplete(item.project))
    .sort((a, b) => a.date.localeCompare(b.date) || compareMilestones(a, b))
    .reduce((map, item) => {
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date).push(item);
      return map;
    }, new Map());

  if (!grouped.size) {
    const empty = document.createElement("div");
    empty.className = "empty-block";
    empty.textContent = "暂无进行中的项目";
    elements.timelineShell.append(empty);
    return;
  }

  const axis = document.createElement("section");
  axis.className = "timeline-axis";

  const groups = document.createElement("div");
  groups.className = "timeline-date-groups";

  grouped.forEach((items, iso) => {
    const group = document.createElement("section");
    group.className = "timeline-date-group";
    group.dataset.date = iso;

    const marker = document.createElement("div");
    marker.className = "timeline-date-marker";

    const dot = document.createElement("span");
    dot.className = "timeline-date-dot";

    const label = document.createElement("span");
    label.className = "timeline-date-label";
    label.textContent = formatDateWithWeekday(iso);
    marker.append(dot, label);

    const stack = document.createElement("div");
    stack.className = "timeline-event-stack";
    items.forEach((item) => {
      stack.append(createTimelineEvent(item));
    });

    group.append(marker, stack);
    groups.append(group);
  });

  axis.append(groups);
  elements.timelineShell.append(axis);
}

function createTimelineEvent(item) {
  const { project, stage, date, completed } = item;
  const card = document.createElement("div");
  card.className = "timeline-event-card";
  card.role = "button";
  card.tabIndex = 0;
  card.dataset.projectId = project.id;
  card.dataset.stage = stage;
  card.style.setProperty("--project-color", project.color);
  card.title = `${project.name} · ${stage} · ${formatDateWithWeekday(date)}`;
  if (completed) card.classList.add("completed");
  if (selected && selected.projectId === project.id && selected.stage === stage) {
    card.classList.add("selected");
  }

  const check = document.createElement("button");
  check.type = "button";
  check.className = "chip-check timeline-event-check";
  check.title = completed ? "标记为未完成" : "标记完成";
  check.setAttribute("aria-label", `${project.name} ${stage} ${check.title}`);
  check.setAttribute("aria-pressed", String(completed));
  check.innerHTML = '<i data-lucide="check"></i>';
  check.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMilestoneCompleted(project.id, stage);
  });

  const text = document.createElement("span");
  text.className = "timeline-event-text";

  const stageLabel = document.createElement("strong");
  stageLabel.textContent = stage;

  const projectLabel = document.createElement("span");
  projectLabel.textContent = getClientName(project.name);

  const dateLabel = document.createElement("small");
  dateLabel.textContent = formatTinyDate(date);

  text.append(stageLabel, projectLabel, dateLabel);
  card.append(check, text);

  card.addEventListener("click", () => openMilestoneInCalendar(project.id, stage));
  card.addEventListener("keydown", (event) => {
    if (event.target !== card) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMilestoneInCalendar(project.id, stage);
    }
  });

  return card;
}

function renderConflicts(grouped) {
  elements.conflictList.innerHTML = "";
  const conflicts = [...grouped.entries()]
    .map(([iso, items]) => [iso, items.filter((item) => !item.completed)])
    .filter(([, items]) => items.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  if (!conflicts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-block";
    empty.textContent = "暂无撞期";
    elements.conflictList.append(empty);
    return;
  }

  conflicts.forEach(([iso, items]) => {
    const section = document.createElement("section");
    section.className = "conflict-day";
    if (items.length >= 3) section.classList.add("severe");

    const title = document.createElement("h3");
    const left = document.createElement("strong");
    left.textContent = formatDateWithWeekday(iso);
    const right = document.createElement("span");
    right.textContent = `${items.length} 个节点 · ${items.length >= 3 ? "高风险" : "需协调"}`;
    title.append(left, right);

    const stack = document.createElement("div");
    stack.className = "chip-stack";
    items.sort(compareMilestones).forEach((item) => {
      stack.append(createMilestoneChip(item.project, item.stage, iso, false));
    });

    section.append(title, stack);
    elements.conflictList.append(section);
  });
}

function renderInspector() {
  if (!selected) {
    elements.inspectorTitle.textContent = "未选择节点";
    elements.emptyInspector.classList.remove("hidden");
    elements.activeInspector.classList.add("hidden");
    return;
  }

  const project = projects.find((item) => item.id === selected.projectId);
  if (!project) {
    selected = null;
    renderInspector();
    return;
  }

  const date = project.milestones[selected.stage];
  elements.inspectorTitle.textContent = selected.stage;
  elements.emptyInspector.classList.add("hidden");
  elements.activeInspector.classList.remove("hidden");
  elements.selectedDot.style.setProperty("--project-color", project.color);
  elements.selectedProject.textContent = project.name;
  elements.selectedStage.textContent = `${selected.stage} · ${formatDateWithWeekday(date)}${project.completedMilestones?.[selected.stage] ? " · 已完成" : ""}`;
  elements.inspectorDate.value = date;

  elements.stageStack.innerHTML = "";
  getScheduledStages(project).forEach((stage) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stage-button";
    if (stage.name === selected.stage) button.classList.add("active");
    if (project.completedMilestones?.[stage.name]) button.classList.add("completed");
    button.addEventListener("click", () => selectMilestone(project.id, stage.name));

    const label = document.createElement("span");
    label.textContent = stage.name;
    const value = document.createElement("span");
    value.textContent = formatDateWithWeekday(project.milestones[stage.name]);
    button.append(label, value);
    elements.stageStack.append(button);
  });

  const warnings = getSequenceWarnings(project);
  if (warnings.length) {
    elements.sequenceAlert.classList.remove("hidden");
    elements.sequenceAlertText.textContent = warnings.join("；");
  } else {
    elements.sequenceAlert.classList.add("hidden");
    elements.sequenceAlertText.textContent = "";
  }
}

function createMilestoneChip(project, stage, iso, draggable) {
  const chip = document.createElement("div");
  chip.className = "milestone-chip";
  chip.role = "button";
  chip.tabIndex = 0;
  chip.draggable = draggable;
  chip.dataset.projectId = project.id;
  chip.dataset.stage = stage;
  chip.style.setProperty("--project-color", project.color);
  chip.title = `${project.name} · ${stage} · ${formatDateWithWeekday(iso)}`;
  if (project.completedMilestones?.[stage]) chip.classList.add("completed");
  if (selected && selected.projectId === project.id && selected.stage === stage) {
    chip.classList.add("selected");
  }

  const rail = document.createElement("span");
  rail.className = "chip-rail";

  const check = document.createElement("button");
  check.type = "button";
  check.className = "chip-check";
  check.title = project.completedMilestones?.[stage] ? "标记为未完成" : "标记完成";
  check.setAttribute("aria-label", `${project.name} ${stage} ${check.title}`);
  check.setAttribute("aria-pressed", String(Boolean(project.completedMilestones?.[stage])));
  check.innerHTML = '<i data-lucide="check"></i>';
  check.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMilestoneCompleted(project.id, stage);
  });

  const text = document.createElement("span");
  text.className = "chip-text";
  const stageLabel = document.createElement("span");
  stageLabel.className = "chip-stage";
  stageLabel.textContent = stage;
  const projectLabel = document.createElement("span");
  projectLabel.className = "chip-project";
  projectLabel.textContent = getClientName(project.name);
  text.append(stageLabel, projectLabel);
  const date = document.createElement("span");
  date.className = "chip-date";
  date.textContent = formatTinyDate(iso);

  chip.append(rail, check, text, date);
  chip.addEventListener("click", () => {
    selectedCalendarDate = iso;
    selectMilestone(project.id, stage);
  });
  chip.addEventListener("keydown", (event) => {
    if (event.target !== chip) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectedCalendarDate = iso;
      selectMilestone(project.id, stage);
    }
  });
  chip.addEventListener("dragstart", (event) => {
    selected = { projectId: project.id, stage };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify({ projectId: project.id, stage }));
    requestAnimationFrame(() => chip.classList.add("is-dragging"));
  });
  chip.addEventListener("dragend", () => {
    chip.classList.remove("is-dragging");
    document.querySelectorAll(".drag-over").forEach((node) => node.classList.remove("drag-over"));
  });

  return chip;
}

function addDropTarget(target) {
  target.addEventListener("dragover", (event) => {
    event.preventDefault();
    target.classList.add("drag-over");
  });
  target.addEventListener("dragleave", () => target.classList.remove("drag-over"));
  target.addEventListener("drop", (event) => {
    event.preventDefault();
    target.classList.remove("drag-over");
    const payload = readDragPayload(event);
    if (!payload) return;
    moveMilestone(payload.projectId, payload.stage, target.dataset.date);
  });
}

function readDragPayload(event) {
  try {
    return JSON.parse(event.dataTransfer.getData("application/json"));
  } catch {
    return null;
  }
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function setMobilePage(page) {
  const nextPage = ["projects", "timeline", "conflicts"].includes(page) ? page : "plan";
  const changed = mobilePage !== nextPage;
  mobilePage = nextPage;
  if (elements.appShell) {
    ["plan", "projects", "timeline", "conflicts"].forEach((name) => {
      elements.appShell.classList.toggle(`mobile-page-${name}`, name === mobilePage);
    });
  }

  elements.mobilePageButtons.forEach((button) => {
    const active = button.dataset.mobilePage === mobilePage;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (changed && isMobileLayout()) window.scrollTo({ top: 0, behavior: "auto" });
}

function selectMilestone(projectId, stage) {
  selected = { projectId, stage };
  const project = projects.find((item) => item.id === projectId);
  if (project?.milestones?.[stage]) selectedCalendarDate = project.milestones[stage];
  if (isMobileLayout() && currentView !== "calendar") {
    openMilestoneInCalendar(projectId, stage);
    return;
  }
  render();
  if (isMobileLayout()) {
    setMobilePage("plan");
  }
}

function openMilestoneInCalendar(projectId, stage) {
  const project = projects.find((item) => item.id === projectId);
  if (!project || !project.milestones[stage]) return;
  const targetDate = project.milestones[stage];
  selected = { projectId, stage };
  selectedCalendarDate = targetDate;
  if (isMobileLayout()) setMobilePage("plan");
  switchView("calendar");

  requestAnimationFrame(() => {
    const dayCell = document.querySelector(`.day-cell[data-date="${targetDate}"], .agenda-day[data-date="${targetDate}"]`);
    if (!dayCell) return;
    dayCell.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    dayCell.classList.remove("timeline-focus");
    window.setTimeout(() => dayCell.classList.add("timeline-focus"), 0);
    window.setTimeout(() => dayCell.classList.remove("timeline-focus"), 1100);
  });
}

function moveMilestone(projectId, stage, iso) {
  const project = projects.find((item) => item.id === projectId);
  if (!project || !project.milestones[stage] || !iso) return;
  project.milestones[stage] = iso;
  selected = { projectId, stage };
  selectedCalendarDate = iso;
  saveProjects();
  render();
  showToast(`${getClientName(project.name)} · ${stage} 已调整到 ${formatDateWithWeekday(iso)}`);
}

function shiftSelected(days) {
  if (!selected) return;
  const project = projects.find((item) => item.id === selected.projectId);
  if (!project) return;
  const nextIso = dateToIso(addDays(isoToDate(project.milestones[selected.stage]), days));
  moveMilestone(project.id, selected.stage, nextIso);
}

function ensureValidSelection() {
  if (!selected) return;
  const project = projects.find((item) => item.id === selected.projectId);
  if (!project || !project.milestones[selected.stage]) selected = null;
}

function getSequenceWarnings(project) {
  const warnings = [];
  const scheduledStages = getScheduledStages(project);
  for (let index = 1; index < scheduledStages.length; index += 1) {
    const previous = scheduledStages[index - 1].name;
    const current = scheduledStages[index].name;
    if (project.milestones[current] < project.milestones[previous]) {
      warnings.push(`${current} 早于 ${previous}`);
    }
  }
  return warnings;
}

function compareMilestones(a, b) {
  const projectDiff = projects.findIndex((project) => project.id === a.project.id) - projects.findIndex((project) => project.id === b.project.id);
  if (projectDiff !== 0) return projectDiff;
  return stageIndex(a.stage) - stageIndex(b.stage);
}

function stageIndex(stageName) {
  return STAGES.findIndex((stage) => stage.name === stageName);
}

function getClientName(name) {
  return name.includes("&") ? name.split("&").pop().trim() : name;
}

function makeId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "project"}-${Date.now().toString(36)}`;
}

function isoToDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateToIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
}

function endOfWeek(date) {
  return addDays(startOfWeek(date), 6);
}

function daysBetween(a, b) {
  const diff = isoToDate(b).getTime() - isoToDate(a).getTime();
  return Math.round(diff / 86400000);
}

function isWeekend(iso) {
  const day = isoToDate(iso).getDay();
  return day === 0 || day === 6;
}

function formatDateShort(iso) {
  const date = isoToDate(iso);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function formatTinyDate(iso) {
  const date = isoToDate(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateWithWeekday(iso) {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const date = isoToDate(iso);
  return `${date.getMonth() + 1}.${date.getDate()} ${weekdays[date.getDay()]}`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function setDataMenuOpen(open) {
  if (!elements.dataPopover || !elements.dataMenuButton) return;
  const focusWasInside = elements.dataPopover.contains(document.activeElement);
  elements.dataPopover.classList.toggle("hidden", !open);
  elements.dataMenu?.classList.toggle("open", open);
  elements.dataMenuButton.setAttribute("aria-expanded", String(open));
  if (open) {
    activateIcons();
    window.requestAnimationFrame(() => elements.dataPopover.querySelector("button")?.focus({ preventScroll: true }));
  } else if (focusWasInside) {
    elements.dataMenuButton.focus({ preventScroll: true });
  }
}

function toggleDataMenu() {
  if (!elements.dataPopover) return;
  setDataMenuOpen(elements.dataPopover.classList.contains("hidden"));
}

function renderAccountAvatar() {
  if (!elements.avatarButton || !elements.avatarInitial) return;
  const email = syncState.user?.email || "";
  elements.avatarInitial.textContent = email ? email.trim().charAt(0).toUpperCase() : "云";
  elements.avatarButton.classList.toggle("signed-in", Boolean(syncState.user));
  elements.avatarButton.title = syncState.user ? "账户与退出登录" : "登录云同步";
  elements.avatarButton.setAttribute("aria-label", elements.avatarButton.title);
}

function positionAccountPopover() {
  if (!elements.accountPopover || !elements.avatarButton) return;
  if (!isMobileLayout()) {
    elements.accountPopover.style.removeProperty("--account-popover-top");
    return;
  }
  const buttonRect = elements.avatarButton.getBoundingClientRect();
  const top = Math.min(window.innerHeight - 180, Math.max(12, Math.round(buttonRect.bottom + 10)));
  elements.accountPopover.style.setProperty("--account-popover-top", `${top}px`);
}

function setAccountPopoverOpen(open) {
  if (!elements.accountPopover || !elements.avatarButton) return;
  const focusWasInside = elements.accountPopover.contains(document.activeElement);
  elements.accountPopover.classList.toggle("hidden", !open);
  elements.accountBackdrop?.classList.toggle("hidden", !open);
  elements.accountMenu?.classList.toggle("open", open);
  elements.workspaceBar?.classList.toggle("account-open", open);
  elements.avatarButton.setAttribute("aria-expanded", String(open));
  if (open) {
    positionAccountPopover();
    activateIcons();
    window.requestAnimationFrame(() => elements.closeAccountPopoverButton?.focus({ preventScroll: true }));
  } else if (focusWasInside || document.activeElement === elements.accountBackdrop) {
    elements.avatarButton.focus({ preventScroll: true });
  }
}

function toggleAccountPopover() {
  if (!elements.accountPopover) return;
  setAccountPopoverOpen(elements.accountPopover.classList.contains("hidden"));
}

function getCloudErrorMessage(error, fallback = "云服务操作失败") {
  const message = String(error?.message || "").trim();
  const normalized = message.toLowerCase();

  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/.test(normalized)) {
    return "无法连接云服务，请检查网络或代理设置后重试";
  }
  if (/invalid login credentials/.test(normalized)) return "邮箱或密码不正确";
  if (/email not confirmed/.test(normalized)) return "请先完成邮箱验证，再重新登录";
  if (/user already registered/.test(normalized)) return "这个邮箱已经注册，请直接登录";
  if (/password.*(?:6|weak)|weak password/.test(normalized)) return "密码至少需要 6 位";
  if (/rate limit|too many requests/.test(normalized)) return "操作太频繁，请稍后再试";
  if (/云服务暂时无法连接/.test(message)) return message;
  return message || fallback;
}

function createSupabaseProxyFetch(proxyUrl) {
  const endpoint = new URL(proxyUrl, window.location.origin);

  return async (input, init) => {
    const request = new Request(input, init);
    const target = new URL(request.url);
    const method = request.method.toUpperCase();
    const headers = new Headers(request.headers);
    headers.set("x-tl-calendar-proxy", "1");
    endpoint.searchParams.set("path", `${target.pathname}${target.search}`);

    return fetch(endpoint.toString(), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      signal: request.signal,
      cache: "no-store"
    });
  };
}

function renderSyncPanel() {
  if (!elements.syncStatus) return;

  elements.syncLoginForm.classList.toggle("hidden", !syncState.configured || Boolean(syncState.user));
  elements.syncUserPanel.classList.toggle("hidden", !syncState.user);
  elements.syncPasswordUpdateForm.classList.add("hidden");
  setSyncAuthMode(syncAuthMode);
  renderAccountAvatar();

  if (syncState.initializing) {
    elements.syncStatus.textContent = "连接中";
    elements.syncStatus.className = "sync-status saving";
    elements.syncNote.textContent = "正在连接云端";
    elements.syncLoginButton.disabled = true;
    elements.syncResetPasswordButton.disabled = true;
    elements.syncPasswordUpdateButton.disabled = true;
    activateIcons();
    return;
  }

  if (syncState.error === "connection") {
    elements.syncStatus.textContent = "连接失败";
    elements.syncStatus.className = "sync-status muted";
    elements.syncNote.textContent = syncState.connectionError || "云服务暂时无法连接，请刷新页面重试";
    elements.syncLoginButton.disabled = true;
    elements.syncResetPasswordButton.disabled = true;
    elements.syncPasswordUpdateButton.disabled = true;
    activateIcons();
    return;
  }

  if (!syncState.configured) {
    elements.syncStatus.textContent = "未配置";
    elements.syncStatus.className = "sync-status muted";
    elements.syncNote.textContent = "云同步未连接：需要配置 Supabase URL 和 Anon Key";
    elements.syncLoginButton.disabled = true;
    elements.syncResetPasswordButton.disabled = true;
    elements.syncPasswordUpdateButton.disabled = true;
    activateIcons();
    return;
  }

  elements.syncLoginButton.disabled = !syncState.ready;
  elements.syncResetPasswordButton.disabled = !syncState.ready;
  elements.syncPasswordUpdateButton.disabled = !syncState.ready;

  if (!syncState.user) {
    elements.syncStatus.textContent = syncState.ready ? "未登录" : "连接中";
    elements.syncStatus.className = "sync-status";
    elements.syncNote.textContent = syncState.authError || (syncState.ready ? "邮箱密码登录后自动同步" : "连接云端中");
    activateIcons();
    return;
  }

  elements.syncUserEmail.textContent = syncState.user.email || "已登录";
  elements.syncStatus.textContent = syncState.saving ? "保存中" : "已登录";
  elements.syncStatus.className = syncState.saving ? "sync-status saving" : "sync-status synced";
  elements.syncNote.textContent = syncState.loadingRemote
    ? "安全合并云端数据中"
    : syncState.conflicts
      ? `已保护 ${syncState.conflicts} 次跨设备冲突`
      : "项目级自动同步与版本保护已开启";
  elements.syncLastSaved.textContent = syncState.lastSavedAt ? `上次同步 ${formatClock(syncState.lastSavedAt)}` : "等待同步";
  activateIcons();
}

function setSyncAuthMode(mode) {
  syncAuthMode = mode === "signup" ? "signup" : "signin";
  elements.syncAuthModeButtons.forEach((button) => {
    const active = button.dataset.syncMode === syncAuthMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  if (elements.syncPassword) {
    elements.syncPassword.autocomplete = syncAuthMode === "signup" ? "new-password" : "current-password";
  }

  if (elements.syncLoginButton) {
    elements.syncLoginButton.innerHTML = syncAuthMode === "signup"
      ? '<i data-lucide="user-plus"></i> 注册'
      : '<i data-lucide="log-in"></i> 登录';
  }
}

async function initCloudSync() {
  syncState.initializing = true;
  syncState.error = null;
  renderSyncPanel();
  try {
    const response = await fetch(SUPABASE_CONFIG_ENDPOINT, { cache: "no-store" });
    const config = response.ok ? await response.json() : {};
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      syncState.configured = false;
      syncState.initializing = false;
      syncState.error = "config";
      renderSyncPanel();
      return;
    }

    syncState.configured = true;
    const { createClient } = await import(SUPABASE_CLIENT_MODULE);
    const proxyFetch = config.supabaseProxyUrl ? createSupabaseProxyFetch(config.supabaseProxyUrl) : undefined;
    if (proxyFetch) {
      const healthResponse = await proxyFetch(`${config.supabaseUrl}/auth/v1/health`, {
        headers: { apikey: config.supabaseAnonKey }
      });
      if (!healthResponse.ok) {
        const healthError = await healthResponse.json().catch(() => ({}));
        throw new Error(healthError.message || "云服务暂时无法连接，请稍后重试");
      }
    }
    syncState.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      global: proxyFetch ? { fetch: proxyFetch } : undefined
    });
    syncState.ready = true;
    syncState.initializing = false;

    const { data } = await syncState.client.auth.getSession();
    syncState.user = data.session?.user || null;

    syncState.client.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;
      const userChanged = nextUser?.id !== syncState.user?.id;
      syncState.user = nextUser;
      renderSyncPanel();
      if (nextUser && userChanged) {
        loadCloudProjects({ preferNewer: true });
        startCloudRefresh();
      }
      if (!nextUser) stopCloudRefresh();
    });

    if (syncState.user) {
      await loadCloudProjects({ preferNewer: true });
      startCloudRefresh();
    } else {
      renderSyncPanel();
    }
  } catch (error) {
    syncState.ready = false;
    syncState.initializing = false;
    syncState.error = "connection";
    syncState.connectionError = getCloudErrorMessage(error, "云服务暂时无法连接，请刷新页面重试");
    renderSyncPanel();
    console.warn("Cloud sync unavailable", error);
  }
}

async function submitPasswordAuth(event) {
  event.preventDefault();
  if (!syncState.client || !syncState.ready) return;
  const email = elements.syncEmail.value.trim();
  const password = elements.syncPassword.value;
  if (!email) {
    showToast("请输入邮箱");
    return;
  }
  if (!password || password.length < 6) {
    showToast("密码至少 6 位");
    return;
  }

  elements.syncLoginButton.disabled = true;
  elements.syncResetPasswordButton.disabled = true;
  syncState.authError = null;
  elements.syncNote.textContent = syncAuthMode === "signup" ? "创建账号中" : "登录中";
  try {
    const redirectTo = getAuthRedirectUrl();
    const result = syncAuthMode === "signup"
      ? await syncState.client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo }
      })
      : await syncState.client.auth.signInWithPassword({ email, password });
    const { data, error } = result;
    if (error) throw error;
    syncState.user = data.session?.user || data.user || syncState.user;
    elements.syncPassword.value = "";

    if (syncState.user) {
      syncState.authError = null;
      elements.syncNote.textContent = syncAuthMode === "signup" ? "账号已创建，开始同步" : "登录成功，开始同步";
      showToast(syncAuthMode === "signup" ? "注册成功" : "登录成功");
      await loadCloudProjects({ preferNewer: true });
      startCloudRefresh();
    } else {
      elements.syncNote.textContent = "账号已创建，请先完成邮箱确认";
      showToast("请确认邮箱后再登录");
    }
  } catch (error) {
    syncState.authError = getCloudErrorMessage(error, syncAuthMode === "signup" ? "注册失败" : "登录失败");
    elements.syncNote.textContent = syncState.authError;
    showToast(syncState.authError);
  } finally {
    elements.syncLoginButton.disabled = false;
    elements.syncResetPasswordButton.disabled = false;
    renderSyncPanel();
    activateIcons();
  }
}

async function sendPasswordReset() {
  if (!syncState.client || !syncState.ready) return;
  const email = elements.syncEmail.value.trim();
  if (!email) {
    showToast("先输入邮箱");
    return;
  }

  elements.syncResetPasswordButton.disabled = true;
  elements.syncNote.textContent = "发送密码重置邮件中";
  try {
    const { error } = await syncState.client.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl()
    });
    if (error) throw error;
    elements.syncNote.textContent = "请打开邮件设置新密码";
    showToast("密码重置邮件已发送");
  } catch (error) {
    elements.syncNote.textContent = "密码重置失败";
    showToast(getCloudErrorMessage(error, "密码重置失败"));
  } finally {
    elements.syncResetPasswordButton.disabled = false;
  }
}

async function updateCloudPassword(event) {
  event.preventDefault();
  if (!syncState.client || !syncState.user) return;
  const password = elements.syncNewPassword.value;
  if (!password || password.length < 6) {
    showToast("新密码至少 6 位");
    return;
  }

  elements.syncPasswordUpdateButton.disabled = true;
  try {
    const { error } = await syncState.client.auth.updateUser({ password });
    if (error) throw error;
    elements.syncNewPassword.value = "";
    showToast("密码已更新");
  } catch (error) {
    showToast(getCloudErrorMessage(error, "密码更新失败"));
  } finally {
    elements.syncPasswordUpdateButton.disabled = false;
  }
}

function getAuthRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function signOutCloud() {
  if (!syncState.client) return;
  await syncState.client.auth.signOut();
  syncState.user = null;
  syncState.lastSavedAt = null;
  stopCloudRefresh();
  renderSyncPanel();
  showToast("已退出云同步");
}

function queueCloudSave() {
  if (!syncState.client || !syncState.user || syncState.loadingRemote || !navigator.onLine) return;
  window.clearTimeout(syncState.pendingSaveTimer);
  syncState.pendingSaveTimer = window.setTimeout(() => {
    saveCloudProjects();
  }, syncRetryCount ? Math.min(60000, 2000 * 2 ** Math.min(syncRetryCount - 1, 5)) : 700);
}

async function saveCloudProjects(options = {}) {
  if (!syncState.client || !syncState.user || syncState.saving || syncState.loadingRemote || !navigator.onLine) return;
  window.clearTimeout(syncState.pendingSaveTimer);
  syncState.pendingSaveTimer = null;
  markDirtyProjects();
  if (!dirtyProjectIds.size && !snapshotPending) {
    syncState.lastSavedAt = new Date().toISOString();
    renderSyncPanel();
    return;
  }

  syncState.saving = true;
  renderSyncPanel();

  try {
    createLocalRecoveryPoint("云同步前");
    let pass = 0;
    while (dirtyProjectIds.size && pass < 4) {
      pass += 1;
      const batch = [...dirtyProjectIds];
      for (const projectId of batch) {
        const localProject = projects.find((project) => project.id === projectId) || null;
        const sentFingerprint = localProject ? projectFingerprint(localProject) : null;
        const tombstone = projectTombstones[projectId];
        const payload = localProject || tombstone?.project || syncedProjects[projectId] || { id: projectId };
        const { data, error } = await syncState.client.rpc("sync_timeline_project", {
          p_project_id: projectId,
          p_project: payload,
          p_base_version: Number(projectSyncVersions[projectId] || tombstone?.version || 0),
          p_deleted: !localProject
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (!result) throw new Error("云端未返回同步结果");

        if (result.status === "conflict") {
          const latestLocalProject = projects.find((project) => project.id === projectId) || null;
          resolveCloudConflict(projectId, latestLocalProject, result);
          continue;
        }

        applySyncedCloudRow(result, sentFingerprint, !localProject);
        snapshotPending = true;
        persistLocalProjects();
      }
    }

    if (dirtyProjectIds.size) {
      throw new Error("部分项目需要稍后继续同步");
    }

    const { error: snapshotError } = await syncState.client.rpc("create_timeline_snapshot", {
      p_reason: options.reason || "auto"
    });
    if (snapshotError) throw snapshotError;
    snapshotPending = false;
    syncRetryCount = 0;
    syncState.lastSavedAt = new Date().toISOString();
    persistLocalProjects();
    render();
    renderSyncPanel();
  } catch (error) {
    syncRetryCount += 1;
    showToast(getCloudErrorMessage(error, "云同步失败"));
  } finally {
    syncState.saving = false;
    renderSyncPanel();
    if (dirtyProjectIds.size || snapshotPending) queueCloudSave();
  }
}

async function loadCloudProjects(options = {}) {
  if (!syncState.client || !syncState.user || syncState.saving || syncState.loadingRemote || !navigator.onLine) return;
  syncState.loadingRemote = true;
  renderSyncPanel();

  try {
    const { data, error } = await syncState.client
      .from(SUPABASE_PROJECTS_TABLE)
      .select("project_id, project, version, deleted, updated_at")
      .eq("user_id", syncState.user.id)
      .order("project_id");
    if (error) throw error;

    let rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      rows = await bootstrapVersionedCloudData();
    }

    const previousProjects = JSON.stringify(projects);
    createLocalRecoveryPoint(options.manual ? "手动刷新前" : "云端合并前");
    mergeRemoteProjectRows(rows);
    persistLocalProjects();
    if (JSON.stringify(projects) !== previousProjects) render();
    syncState.lastSavedAt = new Date().toISOString();

    if (dirtyProjectIds.size || snapshotPending) {
      syncState.loadingRemote = false;
      await saveCloudProjects({ reason: "merge" });
    }
  } catch (error) {
    showToast(getCloudErrorMessage(error, "读取云端失败"));
  } finally {
    syncState.loadingRemote = false;
    renderSyncPanel();
  }
}

async function bootstrapVersionedCloudData() {
  let sourceProjects = projects.map(cloneProject);
  const { data: legacy, error: legacyError } = await syncState.client
    .from(SUPABASE_LEGACY_TABLE)
    .select("projects, updated_at")
    .eq("user_id", syncState.user.id)
    .maybeSingle();

  if (!legacyError && legacy && validateProjects(legacy.projects)) {
    const remoteIsNewer = !localUpdatedAt || !legacy.updated_at
      || new Date(legacy.updated_at) >= new Date(localUpdatedAt);
    if (remoteIsNewer) {
      createLocalRecoveryPoint("旧版云数据迁移前", projects);
      sourceProjects = legacy.projects.map(cloneProject);
    }
  }

  const { data, error } = await syncState.client.rpc("bootstrap_timeline_projects", {
    p_projects: sourceProjects
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function mergeRemoteProjectRows(rows) {
  markDirtyProjects();
  const seen = new Set();

  rows.forEach((row) => {
    const projectId = row.project_id;
    if (!projectId) return;
    seen.add(projectId);
    const localProject = projects.find((project) => project.id === projectId) || null;
    const localVersion = Number(projectSyncVersions[projectId] || projectTombstones[projectId]?.version || 0);
    const isDirty = dirtyProjectIds.has(projectId);
    const hasKnownBase = Boolean(syncedProjects[projectId] || projectTombstones[projectId]);
    const samePayload = localProject && row.project
      && projectFingerprint(localProject) === projectFingerprint(row.project);

    if (!hasKnownBase && samePayload && !row.deleted) {
      applySyncedCloudRow({ ...row, status: "applied" });
      return;
    }

    if (!isDirty) {
      applyRemoteCloudRow(row);
      return;
    }

    if (localVersion === Number(row.version || 0)) {
      return;
    }

    resolveCloudConflict(projectId, localProject, { ...row, status: "conflict" });
  });

  projects.forEach((project) => {
    if (!seen.has(project.id) && !syncedProjects[project.id]) {
      dirtyProjectIds.add(project.id);
    }
  });
}

function applyRemoteCloudRow(row) {
  const projectId = row.project_id;
  const index = projects.findIndex((project) => project.id === projectId);
  projectSyncVersions[projectId] = Number(row.version || 0);
  dirtyProjectIds.delete(projectId);

  if (row.deleted) {
    if (index >= 0) projects.splice(index, 1);
    delete syncedProjects[projectId];
    projectTombstones[projectId] = {
      project: row.project,
      version: Number(row.version || 0)
    };
    return;
  }

  const remoteProject = cloneProject(row.project);
  if (index >= 0) projects[index] = remoteProject;
  else projects.push(remoteProject);
  syncedProjects[projectId] = cloneProject(remoteProject);
  delete projectTombstones[projectId];
}

function applySyncedCloudRow(row, sentFingerprint = null, sentAsDeleted = false) {
  const projectId = row.project_id;
  const latestLocalProject = projects.find((project) => project.id === projectId) || null;
  const changedWhileSaving = sentFingerprint !== null
    && (!latestLocalProject || projectFingerprint(latestLocalProject) !== sentFingerprint);
  const recreatedWhileDeleting = sentAsDeleted && latestLocalProject;

  if (!changedWhileSaving && !recreatedWhileDeleting) {
    applyRemoteCloudRow(row);
    return;
  }

  projectSyncVersions[projectId] = Number(row.version || 0);
  if (row.deleted) {
    delete syncedProjects[projectId];
    projectTombstones[projectId] = {
      project: row.project,
      version: Number(row.version || 0)
    };
  } else {
    syncedProjects[projectId] = cloneProject(row.project);
    delete projectTombstones[projectId];
  }
  dirtyProjectIds.add(projectId);
}

function resolveCloudConflict(projectId, localProject, remoteRow) {
  createLocalRecoveryPoint("同步冲突保护", projects);
  const remoteDeleted = Boolean(remoteRow.deleted);
  const remoteProject = remoteRow.project && typeof remoteRow.project === "object"
    ? cloneProject(remoteRow.project)
    : null;
  const localDiffers = localProject && (!remoteProject || projectFingerprint(localProject) !== projectFingerprint(remoteProject));

  if (localDiffers) {
    const conflictCopy = cloneProject(localProject);
    conflictCopy.id = `${projectId}-conflict-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    conflictCopy.name = `${localProject.name}（本机冲突副本）`;
    projects.push(conflictCopy);
    dirtyProjectIds.add(conflictCopy.id);
  }

  applyRemoteCloudRow({
    ...remoteRow,
    project_id: projectId,
    project: remoteProject || projectTombstones[projectId]?.project || syncedProjects[projectId] || { id: projectId },
    deleted: remoteDeleted
  });
  syncState.conflicts += 1;
  showToast(localDiffers ? "检测到跨设备冲突，已保留本机副本" : "云端已有更新，已安全合并");
}

function startCloudRefresh() {
  stopCloudRefresh();
  syncRefreshTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      loadCloudProjects({ preferNewer: true });
    }
  }, 45000);
}

function stopCloudRefresh() {
  window.clearInterval(syncRefreshTimer);
  syncRefreshTimer = null;
}

async function openHistoryDialog() {
  if (!elements.historyDialog || !syncState.user) return;
  setAccountPopoverOpen(false);
  elements.historyList.innerHTML = '<div class="history-empty">正在读取恢复记录...</div>';
  elements.historyDialog.showModal();
  activateIcons();
  await renderRecoveryHistory();
}

async function renderRecoveryHistory() {
  if (!elements.historyList) return;
  elements.historyList.innerHTML = "";

  const cloudSection = createHistorySection("云端版本", "每次成功同步自动保存");
  try {
    const { data, error } = await syncState.client
      .from(SUPABASE_SNAPSHOTS_TABLE)
      .select("id, created_at, reason, projects")
      .eq("user_id", syncState.user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    if (data?.length) {
      data.forEach((snapshot) => {
        cloudSection.append(createHistoryRow({
          title: formatRecoveryTime(snapshot.created_at),
          meta: `${snapshot.projects?.length || 0} 个项目 · ${formatSnapshotReason(snapshot.reason)}`,
          onRestore: () => restoreCloudSnapshot(snapshot.id)
        }));
      });
    } else {
      cloudSection.append(createHistoryEmpty("还没有云端版本"));
    }
  } catch (error) {
    cloudSection.append(createHistoryEmpty(getCloudErrorMessage(error, "云端版本读取失败")));
  }

  const localSection = createHistorySection("本机恢复点", "即使断网也可以恢复");
  const localPoints = getLocalRecoveryPoints();
  if (localPoints.length) {
    localPoints.forEach((point) => {
      localSection.append(createHistoryRow({
        title: formatRecoveryTime(point.createdAt),
        meta: `${point.projects.length} 个项目 · ${point.reason || "自动保存"}`,
        onRestore: () => restoreLocalRecoveryPoint(point.id)
      }));
    });
  } else {
    localSection.append(createHistoryEmpty("还没有本机恢复点"));
  }

  elements.historyList.append(cloudSection, localSection);
}

function createHistorySection(title, meta) {
  const section = document.createElement("section");
  section.className = "history-section";
  const heading = document.createElement("div");
  heading.className = "history-section-heading";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = meta;
  heading.append(strong, small);
  section.append(heading);
  return section;
}

function createHistoryRow({ title, meta, onRestore }) {
  const row = document.createElement("div");
  row.className = "history-row";
  const copy = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = meta;
  copy.append(strong, small);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost-button history-restore-button";
  button.textContent = "恢复";
  button.addEventListener("click", onRestore);
  row.append(copy, button);
  return row;
}

function createHistoryEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "history-empty";
  empty.textContent = message;
  return empty;
}

function formatRecoveryTime(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "未知时间";
  return value.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatSnapshotReason(reason) {
  const labels = {
    auto: "自动同步",
    merge: "跨设备合并",
    migration: "旧数据迁移",
    restore: "版本恢复"
  };
  return labels[reason] || "自动同步";
}

async function restoreCloudSnapshot(snapshotId) {
  if (!window.confirm("恢复这个云端版本？当前数据会先自动保存一份。")) return;
  createLocalRecoveryPoint("云端版本恢复前");
  try {
    const { data, error } = await syncState.client.rpc("restore_timeline_snapshot", {
      p_snapshot_id: snapshotId
    });
    if (error) throw error;
    projects = [];
    projectSyncVersions = {};
    syncedProjects = {};
    projectTombstones = {};
    dirtyProjectIds = new Set();
    (data || []).forEach(applyRemoteCloudRow);
    selected = null;
    persistLocalProjects();
    createLocalRecoveryPoint("已恢复云端版本");
    render();
    await renderRecoveryHistory();
    showToast("已恢复云端版本，并生成新的保护快照");
  } catch (error) {
    showToast(getCloudErrorMessage(error, "恢复失败"));
  }
}

function restoreLocalRecoveryPoint(pointId) {
  const point = getLocalRecoveryPoints().find((item) => item.id === pointId);
  if (!point || !window.confirm("恢复这个本机版本？当前数据会先自动保存一份。")) return;
  createLocalRecoveryPoint("本机版本恢复前");
  projects = point.projects.map(cloneProject);
  selected = null;
  saveProjects({ reason: "恢复本机版本" });
  render();
  elements.historyDialog.close();
  showToast("已恢复本机版本，正在安全同步");
}

function formatClock(iso) {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function activateIcons() {
  if (!window.lucide || iconFrame !== null) return;
  iconFrame = requestAnimationFrame(() => {
    iconFrame = null;
    window.lucide.createIcons();
  });
}

function decodeSmartPasteText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/&#x0*a;|&#10;/gi, "\n")
    .replace(/&nbsp;|&#x20;|&#32;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function normalizeSmartProjectName(value) {
  const cleaned = String(value || "")
    .replace(/^项目(?:名称|名)?\s*[:：]\s*/, "")
    .replace(/[＆﹠]/g, "&")
    .trim();
  const parts = cleaned.split("&").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(" & ") : cleaned.replace(/\s+/g, " ");
}

function buildSmartDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return dateToIso(date);
}

function parseSmartDate(value, fallbackYear) {
  const source = String(value || "").trim();
  const fullDate = source.match(/(\d{4})\s*(?:年|[./-])\s*(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})(?:\s*日)?/);
  const shortDate = source.match(/(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})(?:\s*日)?/);
  const match = fullDate || shortDate;
  if (!match) return null;

  const yearExplicit = Boolean(fullDate);
  const year = yearExplicit ? Number(match[1]) : fallbackYear;
  const month = Number(match[yearExplicit ? 2 : 1]);
  const day = Number(match[yearExplicit ? 3 : 2]);
  const iso = buildSmartDate(year, month, day);
  return iso ? { iso, year, month, day, yearExplicit } : null;
}

function parseSmartSchedule(rawValue) {
  const text = decodeSmartPasteText(rawValue);
  const baseYear = isoToDate(TODAY_ISO).getFullYear();
  const parsedStages = new Map();
  let projectName = "";

  text.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const cleanedLine = line.replace(/^[\s\-—•·、]+/, "").trim();
    const matchedStages = STAGES.filter((stage) => cleanedLine.includes(stage.name));
    const parsedDate = matchedStages.length ? parseSmartDate(cleanedLine, baseYear) : null;
    if (parsedDate) {
      matchedStages.forEach((stage) => parsedStages.set(stage.name, parsedDate));
      return;
    }
    if (!projectName) projectName = normalizeSmartProjectName(cleanedLine);
  });

  const milestones = {};
  let previousIso = null;
  STAGES.forEach((stage) => {
    const parsedDate = parsedStages.get(stage.name);
    if (!parsedDate) return;

    let resolvedIso = parsedDate.iso;
    if (!parsedDate.yearExplicit && previousIso && resolvedIso < previousIso && daysBetween(resolvedIso, previousIso) > 180) {
      resolvedIso = buildSmartDate(parsedDate.year + 1, parsedDate.month, parsedDate.day) || resolvedIso;
    }
    milestones[stage.name] = resolvedIso;
    previousIso = resolvedIso;
  });

  return {
    projectName,
    milestones,
    matchedStages: STAGES.filter((stage) => milestones[stage.name]).map((stage) => stage.name)
  };
}

function setSmartPasteStatus(message = SMART_PASTE_DEFAULT_NOTE, tone = "") {
  if (!elements.smartPasteStatus) return;
  elements.smartPasteStatus.textContent = message;
  elements.smartPasteStatus.classList.toggle("success", tone === "success");
  elements.smartPasteStatus.classList.toggle("warning", tone === "warning");
}

function renderSmartPastePreview(result = null) {
  if (!elements.smartPastePreview) return;
  elements.smartPastePreview.innerHTML = "";
  if (!result) {
    elements.smartPastePreview.classList.add("hidden");
    return;
  }

  const project = document.createElement("div");
  project.className = "smart-preview-project";
  const projectLabel = document.createElement("span");
  projectLabel.textContent = "项目";
  const projectName = document.createElement("strong");
  projectName.textContent = result.projectName || "未识别项目名";
  project.append(projectLabel, projectName);

  const stages = document.createElement("div");
  stages.className = "smart-preview-stages";
  STAGES.forEach((stage) => {
    const item = document.createElement("span");
    const date = result.milestones[stage.name];
    item.className = date ? "recognized" : "missing";
    item.textContent = `${stage.name} ${date ? formatTinyDate(date) : "未安排"}`;
    stages.append(item);
  });

  elements.smartPastePreview.append(project, stages);
  elements.smartPastePreview.classList.remove("hidden");
}

function applySmartSchedule({ showConfirmation = false } = {}) {
  const rawValue = elements.smartPasteInput?.value || "";
  if (!rawValue.trim()) {
    setSmartPasteStatus();
    renderSmartPastePreview();
    return null;
  }

  const result = parseSmartSchedule(rawValue);
  renderSmartPastePreview(result);
  if (result.projectName) elements.projectNameInput.value = result.projectName;
  STAGES.forEach((stage) => {
    const stageName = stage.name;
    const input = elements.projectForm.elements[stageName];
    if (input) input.value = result.milestones[stageName] || "";
  });
  renderDialogSequenceWarning();

  const missingStages = STAGES.map((stage) => stage.name).filter((stageName) => !result.milestones[stageName]);
  if (!result.projectName && !result.matchedStages.length) {
    setSmartPasteStatus("还没有识别到项目名或阶段日期，请检查输入格式。", "warning");
    return result;
  }

  const recognized = [result.projectName ? "项目名" : "", `${result.matchedStages.length}/${STAGES.length} 个节点`].filter(Boolean).join("、");
  const detail = missingStages.length ? `；未安排：${missingStages.join("、")}` : "";
  const tone = result.projectName && result.matchedStages.length ? "success" : "warning";
  setSmartPasteStatus(`已识别${recognized}${detail}`, tone);
  if (showConfirmation) showToast("已按输入内容填入排期");
  return result;
}

function queueSmartScheduleParse() {
  window.clearTimeout(smartParseTimer);
  smartParseTimer = window.setTimeout(() => applySmartSchedule(), 140);
}

function openProjectDialog(projectId = null) {
  editingProjectId = projectId;
  const editingProject = projects.find((project) => project.id === projectId) || null;
  elements.projectForm.reset();
  elements.projectDateFields.innerHTML = "";
  elements.projectColorFields.innerHTML = "";
  selectedProjectColor = editingProject?.color || PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
  elements.projectDialogTitle.textContent = editingProject ? "编辑项目" : "新增项目";
  elements.copyProjectTlButton.classList.toggle("hidden", !editingProject);
  elements.deleteProjectFromDialogButton.classList.toggle("hidden", !editingProject);

  STAGES.forEach((stage) => {
    const wrapper = document.createElement("div");
    const label = document.createElement("label");
    label.className = "field-label";
    label.setAttribute("for", `new-${stage.name}`);
    label.textContent = stage.name;

    const input = document.createElement("input");
    input.id = `new-${stage.name}`;
    input.name = stage.name;
    input.type = "date";
    input.value = editingProject ? editingProject.milestones[stage.name] || "" : "";
    input.addEventListener("change", renderDialogSequenceWarning);

    wrapper.append(label, input);
    elements.projectDateFields.append(wrapper);
  });

  renderColorSwatches();
  elements.projectNameInput.value = editingProject ? editingProject.name : "";
  if (elements.smartPasteInput) elements.smartPasteInput.value = "";
  renderSmartPastePreview();
  setSmartPasteStatus();
  renderDialogSequenceWarning();
  elements.projectDialog.showModal();
  if (isMobileLayout()) {
    requestAnimationFrame(() => {
      elements.projectForm.scrollTop = 0;
      elements.closeDialogButton.focus({ preventScroll: true });
    });
  } else {
    (editingProject ? elements.projectNameInput : elements.smartPasteInput)?.focus();
  }
}

function renderDialogSequenceWarning() {
  const values = STAGES.map((stage) => ({
    name: stage.name,
    value: elements.projectForm.elements[stage.name]?.value || ""
  }));
  const warnings = [];
  const scheduledValues = values.filter((item) => item.value);
  for (let index = 1; index < scheduledValues.length; index += 1) {
    if (scheduledValues[index].value < scheduledValues[index - 1].value) {
      warnings.push(`${scheduledValues[index].name} 早于 ${scheduledValues[index - 1].name}`);
    }
  }
  elements.dialogSequenceAlert.classList.toggle("hidden", !warnings.length);
  elements.dialogSequenceAlertText.textContent = warnings.join("；");
}

function renderColorSwatches() {
  elements.projectColorFields.innerHTML = "";
  PROJECT_COLORS.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-swatch";
    button.style.setProperty("--swatch-color", color);
    button.setAttribute("aria-label", `选择颜色 ${color}`);
    button.setAttribute("aria-pressed", String(color === selectedProjectColor));
    if (color === selectedProjectColor) button.classList.add("active");
    button.addEventListener("click", () => {
      selectedProjectColor = color;
      renderColorSwatches();
    });
    elements.projectColorFields.append(button);
  });
}

function saveProjectFromForm() {
  const formData = new FormData(elements.projectForm);
  const name = String(formData.get("name") || "").trim();
  if (!name) return false;

  const milestones = {};
  STAGES.forEach((stage) => {
    milestones[stage.name] = String(formData.get(stage.name) || "");
  });
  const scheduledStages = STAGES.filter((stage) => milestones[stage.name]);
  if (!scheduledStages.length) {
    showToast("请至少填写一个需要安排的阶段");
    return false;
  }

  const editingProject = projects.find((project) => project.id === editingProjectId) || null;
  if (editingProject) {
    editingProject.name = name;
    editingProject.color = selectedProjectColor;
    editingProject.milestones = milestones;
    editingProject.completedMilestones = normalizeCompletedMilestones(editingProject.completedMilestones, milestones);
    const selectedStage = milestones[selected?.stage] ? selected.stage : scheduledStages[0].name;
    selected = { projectId: editingProject.id, stage: selectedStage };
    showToast("已更新项目");
  } else {
    const project = cloneProject({
      id: makeId(name),
      name,
      color: selectedProjectColor,
      milestones
    });

    projects.push(project);
    selected = { projectId: project.id, stage: scheduledStages[0].name };
    showToast("已新增项目");
  }
  editingProjectId = null;
  saveProjects();
  render();
  return true;
}

function exportProjects() {
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), projects }, null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tl-calendar-planner-${TODAY_ISO}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("已导出 JSON");
}

function exportProjectsCsv() {
  const rows = [["项目", "客户", "负责人", "优先级", "阶段", "日期", "状态", "备注", "链接"]];
  projects.forEach((project) => {
    getScheduledStages(project).forEach((stage) => {
      rows.push([
        project.name,
        getClientName(project.name),
        project.owner || "未分配",
        getPriorityMeta(project.priority).label,
        stage.name,
        project.milestones[stage.name],
        project.completedMilestones?.[stage.name] ? "已完成" : "待处理",
        project.notes || "",
        project.link || ""
      ]);
    });
  });
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tl-calendar-planner-${TODAY_ISO}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("已导出 CSV");
}

function buildProjectTlContent(project) {
  const projectName = project.name
    .split("&")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("&");
  const title = /(?:^|\s)TL$/i.test(projectName) ? projectName : `${projectName} TL`;
  const lines = STAGES.filter((stage) => project.milestones[stage.name]).map((stage) => {
    const [, month, day] = String(project.milestones[stage.name] || "").split("-");
    const date = `${Number(month)}.${Number(day)}`;
    return `${stage.name}：${date}`;
  });
  return [title, ...lines].join("\n");
}

async function copyProjectTlFromDialog() {
  const formData = new FormData(elements.projectForm);
  const name = String(formData.get("name") || "").trim();
  if (!name) {
    showToast("请先填写项目名称");
    elements.projectNameInput.focus();
    return;
  }

  const milestones = {};
  STAGES.forEach((stage) => {
    milestones[stage.name] = String(formData.get(stage.name) || "");
  });
  const content = buildProjectTlContent({ name, milestones });
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("copy failed");
    }
    showToast(`已复制「${name}」TL，可直接粘贴`);
  } catch {
    showToast("复制失败，请检查浏览器的剪贴板权限");
  }
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function importProjects(file) {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const imported = payload.projects || payload;
    if (!validateProjects(imported)) throw new Error("Invalid project shape");
    if (!window.confirm(`导入 ${imported.length} 个项目？当前数据会被覆盖。`)) return;
    projects = imported.map(cloneProject);
    selected = null;
    saveProjects();
    render();
    showToast("已导入 JSON");
  } catch {
    showToast("导入失败：JSON 格式不匹配");
  } finally {
    elements.importFile.value = "";
  }
}

function deleteSelectedProject() {
  if (!selected) return;
  const project = projects.find((item) => item.id === selected.projectId);
  if (!project) return;
  if (!window.confirm(`删除「${project.name}」？`)) return;
  projects = projects.filter((item) => item.id !== project.id);
  selected = null;
  saveProjects();
  render();
  showToast("已删除项目");
}

function deleteEditingProject() {
  if (!editingProjectId) return;
  const project = projects.find((item) => item.id === editingProjectId);
  if (!project) return;
  if (!window.confirm(`删除「${project.name}」？这个操作会同步到云端。`)) return;
  projects = projects.filter((item) => item.id !== project.id);
  if (selected?.projectId === project.id) selected = null;
  editingProjectId = null;
  elements.projectDialog.close();
  saveProjects();
  render();
  showToast("已删除项目");
}

function resetToDefaults() {
  const confirmation = window.prompt("恢复初始时间线会覆盖当前本地和云端数据。请输入 RESET 确认。");
  if (confirmation !== "RESET") {
    showToast("已取消恢复初始数据");
    return;
  }
  projects = normalizeProjects(DEFAULT_PROJECTS);
  selected = null;
  saveProjects();
  render();
  showToast("已恢复初始数据");
}

function switchView(view) {
  if (!elements.views[view]) view = "calendar";
  currentView = view;
  elements.viewButtons.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  Object.entries(elements.views).forEach(([key, node]) => {
    node.classList.toggle("active", key === view);
  });
  if (isMobileLayout()) setMobilePage(view === "projects" || view === "timeline" || view === "conflicts" ? view : "plan");
  render();
}

function jumpToToday() {
  selectedCalendarDate = TODAY_ISO;
  calendarMonthAnchor = startOfMonthIso(TODAY_ISO);
  if (isMobileLayout() && calendarMode === "agenda") calendarMode = "month";
  if (isMobileLayout()) setMobilePage("plan");
  switchView("calendar");
  requestAnimationFrame(() => {
    const todayCell = document.querySelector(`[data-date="${TODAY_ISO}"]`);
    if (!todayCell) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    todayCell.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center", inline: "center" });
    if (reduced) return;
    todayCell.animate(
      [{ boxShadow: "inset 0 0 0 4px rgba(40, 124, 142, 0.62)" }, { boxShadow: "inset 0 0 0 2px rgba(40, 124, 142, 1)" }],
      { duration: 680, easing: "ease-out" }
    );
  });
}

function wireEvents() {
  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  elements.mobilePageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.mobilePage;
      switchView(target === "plan" ? "calendar" : target);
    });
  });

  elements.calendarModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      calendarMode = ["week", "agenda"].includes(button.dataset.calendarMode) ? button.dataset.calendarMode : "month";
      if (calendarMode === "month") calendarMonthAnchor = startOfMonthIso(selectedCalendarDate);
      try {
        localStorage.setItem(CALENDAR_MODE_KEY, calendarMode);
      } catch {
        // The selected mode still applies for the current session.
      }
      render();
    });
  });
  elements.previousMonthButton?.addEventListener("click", () => changeCalendarMonth(-1));
  elements.nextMonthButton?.addEventListener("click", () => changeCalendarMonth(1));

  elements.projectFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      projectFilter = button.dataset.projectFilter || "all";
      render();
    });
  });

  elements.projectSearch.addEventListener("input", (event) => {
    projectSearchTerm = event.target.value;
    renderProjectList();
    activateIcons();
  });
  elements.projectSort.addEventListener("change", (event) => {
    projectSort = event.target.value;
    render();
  });

  elements.inspectorDate.addEventListener("change", (event) => {
    if (!selected || !event.target.value) return;
    moveMilestone(selected.projectId, selected.stage, event.target.value);
  });

  elements.moveEarlierButton.addEventListener("click", () => shiftSelected(-1));
  elements.moveLaterButton.addEventListener("click", () => shiftSelected(1));
  elements.editProjectButton.addEventListener("click", () => {
    if (selected) openProjectDialog(selected.projectId);
  });
  elements.addProjectButton.addEventListener("click", () => openProjectDialog());
  elements.quickAddButton.addEventListener("click", () => openProjectDialog());
  elements.smartPasteInput?.addEventListener("input", queueSmartScheduleParse);
  elements.parseScheduleButton?.addEventListener("click", () => applySmartSchedule({ showConfirmation: true }));
  elements.closeDialogButton.addEventListener("click", () => elements.projectDialog.close());
  elements.cancelDialogButton.addEventListener("click", () => elements.projectDialog.close());
  elements.projectDialog.addEventListener("close", () => {
    window.clearTimeout(smartParseTimer);
    editingProjectId = null;
  });
  elements.projectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (saveProjectFromForm()) elements.projectDialog.close();
  });
  elements.copyProjectTlButton.addEventListener("click", copyProjectTlFromDialog);
  elements.deleteProjectFromDialogButton.addEventListener("click", deleteEditingProject);
  elements.deleteProjectButton.addEventListener("click", deleteSelectedProject);
  elements.todayButton.addEventListener("click", jumpToToday);
  elements.themeButton?.addEventListener("click", toggleTheme);
  elements.dataMenuButton?.addEventListener("click", () => {
    setAccountPopoverOpen(false);
    toggleDataMenu();
  });
  elements.exportButton.addEventListener("click", () => {
    setDataMenuOpen(false);
    exportProjects();
  });
  elements.exportCsvButton.addEventListener("click", () => {
    setDataMenuOpen(false);
    exportProjectsCsv();
  });
  elements.importButton.addEventListener("click", () => {
    setDataMenuOpen(false);
    elements.importFile.click();
  });
  elements.importFile.addEventListener("change", (event) => importProjects(event.target.files[0]));
  elements.resetButton.addEventListener("click", resetToDefaults);
  elements.avatarButton.addEventListener("click", () => {
    setDataMenuOpen(false);
    toggleAccountPopover();
  });
  elements.accountBackdrop?.addEventListener("click", () => setAccountPopoverOpen(false));
  elements.closeAccountPopoverButton?.addEventListener("click", () => setAccountPopoverOpen(false));
  document.addEventListener("click", (event) => {
    const path = event.composedPath();
    if (!path.includes(elements.accountMenu)) setAccountPopoverOpen(false);
    if (!path.includes(elements.dataMenu)) setDataMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setAccountPopoverOpen(false);
      setDataMenuOpen(false);
    }
  });
  elements.syncAuthModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSyncAuthMode(button.dataset.syncMode);
      activateIcons();
    });
  });
  elements.syncLoginForm.addEventListener("submit", submitPasswordAuth);
  elements.syncResetPasswordButton.addEventListener("click", sendPasswordReset);
  elements.syncPasswordUpdateForm.addEventListener("submit", updateCloudPassword);
  elements.syncNowButton.addEventListener("click", () => saveCloudProjects({ reason: "manual" }));
  elements.syncRefreshButton.addEventListener("click", () => loadCloudProjects({ manual: true }));
  elements.syncHistoryButton?.addEventListener("click", openHistoryDialog);
  elements.syncLogoutButton.addEventListener("click", signOutCloud);
  elements.closeHistoryDialogButton?.addEventListener("click", () => elements.historyDialog.close());
  elements.historyDialog?.addEventListener("click", (event) => {
    if (event.target === elements.historyDialog) elements.historyDialog.close();
  });
  window.addEventListener("focus", () => loadCloudProjects({ preferNewer: true }));
  window.addEventListener("online", () => {
    syncRetryCount = 0;
    loadCloudProjects({ preferNewer: true });
  });
  window.addEventListener("resize", () => {
    if (!elements.accountPopover.classList.contains("hidden")) positionAccountPopover();
  });
  setMobilePage(mobilePage);
}

updateThemeControls();
systemThemeQuery.addEventListener?.("change", () => {
  if (!document.documentElement.dataset.theme) {
    updateThemeControls();
    activateIcons();
  }
});
wireEvents();
render();
initCloudSync();

if ("serviceWorker" in navigator && window.location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Offline support unavailable", error);
    });
  });
}
