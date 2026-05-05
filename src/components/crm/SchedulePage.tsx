"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type {
  AssignmentPlanItem,
  CharterPriorityLevel,
  OperationsDashboardData,
} from "@/lib/operations-data";

import {
  applyVesselOverridesToAssignmentRows,
  clearAllVesselOverrides,
  getVesselOverrideSnapshot,
  removeVesselOverride,
  upsertVesselOverride,
  useManualAssignmentRows,
  useVesselOverrides,
} from "./manual-vessels";
import { useSharedTaskState } from "./shared-task-state";
import { pushUndoAction } from "./undo-stack";
import styles from "./crm.module.css";

type TaskFilter = "all" | "open" | "done";
type DayView = "all" | "yesterday" | "today" | "tomorrow" | "nextWeek";
type SearchScope = "all" | "vessel" | "technician" | "rigger" | "shipwright";
const PAGE_SIZE = 5;

interface SchedulePageProps {
  data: OperationsDashboardData;
  viewer: {
    name: string;
    email: string;
    role: "viewer" | "admin" | "super-admin";
  };
}

interface CompletionDialogState {
  taskId: string;
  boatName: string;
  completedBy: string;
  completedAtLocal: string;
  note: string;
  preCompleted: boolean;
}

export function SchedulePage({ data, viewer }: SchedulePageProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const manualAssignmentRows = useManualAssignmentRows();
  const vesselOverrides = useVesselOverrides();
  const assignmentRows = useMemo(
    () =>
      applyVesselOverridesToAssignmentRows(
        [...manualAssignmentRows, ...data.assignmentPlan],
        vesselOverrides,
      ),
    [manualAssignmentRows, data.assignmentPlan, vesselOverrides],
  );

  const requestedView = parseDayView(searchParams.get("view"));
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [dayView, setDayView] = useState<DayView>(requestedView);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [refreshingScheduling, setRefreshingScheduling] = useState(false);
  const [refreshDialogOpen, setRefreshDialogOpen] = useState(false);
  const [allowOverrideRebalance, setAllowOverrideRebalance] = useState(false);
  const [completionDialog, setCompletionDialog] = useState<CompletionDialogState | null>(null);
  const [editingRow, setEditingRow] = useState<AssignmentPlanItem | null>(null);
  const [savingBulkDone, setSavingBulkDone] = useState(false);

  const {
    taskState,
    taskMeta,
    setTaskDone,
    pendingTaskIds,
    refreshTaskState,
  } = useSharedTaskState(data.reportDateIso, assignmentRows);

  const nextWeekEndIso = useMemo(
    () => toIsoDate(addDays(parseIsoDate(data.reportDateIso), 7)),
    [data.reportDateIso],
  );
  const nextOperationalIso = useMemo(
    () => toIsoDate(addDays(parseIsoDate(data.reportDateIso), 1)),
    [data.reportDateIso],
  );

  useEffect(() => {
    setDayView(requestedView);
  }, [requestedView]);

  const completedYesterdayBoatKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of assignmentRows) {
      if (row.source !== "Yesterday") {
        continue;
      }
      if (taskState[row.id]) {
        keys.add(normalizeBoatKey(row.boatName));
      }
    }
    return keys;
  }, [assignmentRows, taskState]);

  const executionRows = useMemo(
    () =>
      assignmentRows.filter((row) => {
        if (row.source !== "Today" && row.source !== "Carryover") {
          return true;
        }
        return !completedYesterdayBoatKeys.has(normalizeBoatKey(row.boatName));
      }),
    [assignmentRows, completedYesterdayBoatKeys],
  );

  const effectiveExecutionRows = useMemo(() => dedupeAssignmentRows(executionRows), [executionRows]);

  const rowById = useMemo(
    () => new Map(effectiveExecutionRows.map((item) => [item.id, item])),
    [effectiveExecutionRows],
  );

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return effectiveExecutionRows.filter((item) => {
      const isDone = Boolean(taskState[item.id]);

      if (
        dayView === "yesterday" &&
        !(item.source === "Yesterday" && item.dueDate < data.reportDateIso)
      ) {
        return false;
      }
      if (dayView === "today" && item.dueDate !== data.reportDateIso) {
        if (!(item.source === "Carryover" && item.dueDate <= data.reportDateIso)) {
          return false;
        }
      }
      if (dayView === "tomorrow" && item.dueDate !== nextOperationalIso) {
        return false;
      }
      if (
        dayView === "nextWeek" &&
        !(item.dueDate > data.reportDateIso && item.dueDate <= nextWeekEndIso)
      ) {
        return false;
      }
      if (
        dayView === "all" &&
        item.dueDate < data.reportDateIso &&
        item.source !== "Carryover"
      ) {
        return false;
      }

      if (taskFilter === "open" && isDone) {
        return false;
      }
      if (taskFilter === "done" && !isDone) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const inVessel =
        item.boatName.toLowerCase().includes(normalizedQuery) ||
        item.stat.toLowerCase().includes(normalizedQuery);
      const inTechnician = item.technician.workerLabel.toLowerCase().includes(normalizedQuery);
      const inRigger = item.rigger.workerLabel.toLowerCase().includes(normalizedQuery);
      const inShipwright = item.shipwright.workerLabel.toLowerCase().includes(normalizedQuery);

      if (searchScope === "vessel") {
        return inVessel;
      }
      if (searchScope === "technician") {
        return inTechnician;
      }
      if (searchScope === "rigger") {
        return inRigger;
      }
      if (searchScope === "shipwright") {
        return inShipwright;
      }

      return inVessel || inTechnician || inRigger || inShipwright;
    });
  }, [
    data.reportDateIso,
    dayView,
    effectiveExecutionRows,
    nextOperationalIso,
    nextWeekEndIso,
    query,
    searchScope,
    taskFilter,
    taskState,
  ]);

  const searchSuggestions = useMemo(() => {
    const values =
      searchScope === "vessel"
        ? effectiveExecutionRows.flatMap((item) => [item.boatName, item.stat])
        : searchScope === "technician"
          ? effectiveExecutionRows.map((item) => item.technician.workerLabel)
          : searchScope === "rigger"
            ? effectiveExecutionRows.map((item) => item.rigger.workerLabel)
            : searchScope === "shipwright"
              ? effectiveExecutionRows.map((item) => item.shipwright.workerLabel)
              : effectiveExecutionRows.flatMap((item) => [
                  item.boatName,
                  item.stat,
                  item.technician.workerLabel,
                  item.rigger.workerLabel,
                  item.shipwright.workerLabel,
                ]);

    return [...new Set(values.filter(Boolean))]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 200);
  }, [effectiveExecutionRows, searchScope]);

  const orderedRows = useMemo(() => [...rows].sort(compareTimelineRows), [rows]);
  const technicianOptions = useMemo(
    () =>
      uniqueSorted([
        ...data.teamRoster.members
          .filter((member) => member.roleKey === "technicians")
          .map((member) => member.label),
        editingRow?.technician.workerLabel ?? "",
      ]),
    [data.teamRoster.members, editingRow?.technician.workerLabel],
  );
  const riggerOptions = useMemo(
    () =>
      uniqueSorted([
        ...data.teamRoster.members
          .filter((member) => member.roleKey === "riggers")
          .map((member) => member.label),
        editingRow?.rigger.workerLabel ?? "",
      ]),
    [data.teamRoster.members, editingRow?.rigger.workerLabel],
  );
  const shipwrightOptions = useMemo(
    () =>
      uniqueSorted([
        ...data.teamRoster.members
          .filter((member) => member.roleKey === "shipwrights")
          .map((member) => member.label),
        editingRow?.shipwright.workerLabel ?? "",
      ]),
    [data.teamRoster.members, editingRow?.shipwright.workerLabel],
  );
  const todayRows = useMemo(
    () =>
      orderedRows.filter(
        (item) =>
          item.dueDate === data.reportDateIso ||
          (item.source === "Carryover" && item.dueDate <= data.reportDateIso),
      ),
    [data.reportDateIso, orderedRows],
  );
  const tomorrowRows = useMemo(
    () => orderedRows.filter((item) => item.dueDate === nextOperationalIso),
    [nextOperationalIso, orderedRows],
  );
  const yesterdayRows = useMemo(
    () =>
      orderedRows.filter(
        (item) => item.source === "Yesterday" && item.dueDate < data.reportDateIso,
      ),
    [data.reportDateIso, orderedRows],
  );

  const upcomingDateGroups = useMemo(() => {
    const grouped = new Map<string, AssignmentPlanItem[]>();
    for (const row of orderedRows) {
      if (row.dueDate <= nextOperationalIso) {
        continue;
      }
      const bucket = grouped.get(row.dueDate) ?? [];
      bucket.push(row);
      grouped.set(row.dueDate, bucket);
    }
    return [...grouped.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([dateIso, items]) => ({ dateIso, label: formatDateLabel(dateIso), items }));
  }, [nextOperationalIso, orderedRows]);

  const totalTaskCount = rows.length;
  const completedTaskCount = rows.reduce(
    (count, row) => (taskState[row.id] ? count + 1 : count),
    0,
  );
  const openTaskCount = Math.max(0, totalTaskCount - completedTaskCount);

  async function toggleTask(id: string) {
    const nextDone = !Boolean(taskState[id]);
    if (!nextDone) {
      const previousMeta = taskMeta[id];
      await setTaskDone(id, false);
      pushUndoAction({
        type: "task-completion",
        reportDateIso: data.reportDateIso,
        taskId: id,
        previousDone: true,
        previousMeta: toUndoCompletionMeta(previousMeta),
        nextDone: false,
        nextMeta: null,
        createdAtIso: new Date().toISOString(),
      });
      return;
    }

    const row = rowById.get(id);
    if (!row) {
      const completionMeta = {
        completedBy: viewer.name || viewer.email,
        completedAtIso: new Date().toISOString(),
        note: "",
        preCompleted: false,
      };
      await setTaskDone(id, true, {
        completedBy: completionMeta.completedBy,
        completedAtIso: completionMeta.completedAtIso,
      });
      pushUndoAction({
        type: "task-completion",
        reportDateIso: data.reportDateIso,
        taskId: id,
        previousDone: false,
        previousMeta: null,
        nextDone: true,
        nextMeta: completionMeta,
        createdAtIso: new Date().toISOString(),
      });
      return;
    }

    setCompletionDialog({
      taskId: id,
      boatName: row.boatName,
      completedBy: viewer.name || viewer.email,
      completedAtLocal: toLocalDateTimeInput(new Date()),
      note: "",
      preCompleted: row.dueDate > data.reportDateIso,
    });
  }

  async function saveCompletionDialog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completionDialog) {
      return;
    }
    const previousDone = Boolean(taskState[completionDialog.taskId]);
    const previousMeta = taskMeta[completionDialog.taskId];

    const completedAtIso =
      localDateTimeInputToIso(completionDialog.completedAtLocal) || new Date().toISOString();
    const nextMeta = {
      completedBy: completionDialog.completedBy,
      completedAtIso,
      note: completionDialog.note,
      preCompleted: completionDialog.preCompleted,
    };

    await setTaskDone(completionDialog.taskId, true, {
      completedBy: nextMeta.completedBy,
      completedAtIso: nextMeta.completedAtIso,
      note: nextMeta.note,
      preCompleted: nextMeta.preCompleted,
    });
    pushUndoAction({
      type: "task-completion",
      reportDateIso: data.reportDateIso,
      taskId: completionDialog.taskId,
      previousDone,
      previousMeta: toUndoCompletionMeta(previousMeta),
      nextDone: true,
      nextMeta,
      createdAtIso: new Date().toISOString(),
    });
    setCompletionDialog(null);
  }

  async function markAllDone(rowsForLane: AssignmentPlanItem[], laneTitle: string) {
    if (savingBulkDone) {
      return;
    }
    const openRows = rowsForLane.filter((row) => !taskState[row.id]);
    if (openRows.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Mark all ${openRows.length} open vessel tasks in ${laneTitle} as done?`,
    );
    if (!confirmed) {
      return;
    }

    setSavingBulkDone(true);
    try {
      for (const row of openRows) {
        const previousDone = Boolean(taskState[row.id]);
        const previousMeta = taskMeta[row.id];
        const nextMeta = {
          completedBy: viewer.name || viewer.email,
          completedAtIso: new Date().toISOString(),
          note: `Bulk completion from ${laneTitle}.`,
          preCompleted: row.dueDate > data.reportDateIso,
        };
        await setTaskDone(row.id, true, {
          completedBy: nextMeta.completedBy,
          completedAtIso: nextMeta.completedAtIso,
          note: nextMeta.note,
          preCompleted: nextMeta.preCompleted,
        });
        pushUndoAction({
          type: "task-completion",
          reportDateIso: data.reportDateIso,
          taskId: row.id,
          previousDone,
          previousMeta: toUndoCompletionMeta(previousMeta),
          nextDone: true,
          nextMeta,
          createdAtIso: new Date().toISOString(),
        });
      }
    } finally {
      setSavingBulkDone(false);
    }
  }

  const refreshPreview = useMemo(() => {
    const todayOpen = todayRows.filter((row) => !taskState[row.id]).length;
    const tomorrowOpen = tomorrowRows.filter((row) => !taskState[row.id]).length;
    const nextWeekOpen = upcomingDateGroups.reduce(
      (sum, group) => sum + group.items.filter((row) => !taskState[row.id]).length,
      0,
    );
    const shortAssignments = todayRows.reduce((sum, row) => {
      const missing =
        Number(row.technician.assignmentState === "Unassigned") +
        Number(row.rigger.assignmentState === "Unassigned") +
        Number(row.shipwright.assignmentState === "Unassigned");
      return sum + missing;
    }, 0);
    return {
      todayOpen,
      tomorrowOpen,
      nextWeekOpen,
      shortAssignments,
    };
  }, [taskState, todayRows, tomorrowRows, upcomingDateGroups]);

  async function refreshSchedulingPlan(options?: { allowOverrideRebalance?: boolean }) {
    if (viewer.role !== "super-admin" || refreshingScheduling) {
      return;
    }

    setRefreshingScheduling(true);
    setSaveMessage(null);

    try {
      if (options?.allowOverrideRebalance) {
        clearAllVesselOverrides();
      }
      const response = await fetch("/api/scheduling-refresh", {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not refresh scheduling.");
      }

      router.refresh();
      await refreshTaskState();
      setRefreshDialogOpen(false);
      setSaveMessage("Scheduling refreshed for today, tomorrow, and next week.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Could not refresh scheduling.");
    } finally {
      setRefreshingScheduling(false);
    }
  }

  function openEditPanel(item: AssignmentPlanItem) {
    setEditingRow(item);
    setSaveMessage(null);
  }

  function saveEditedVessel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRow) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const completion = Number(form.get("completionPct") ?? editingRow.completionPct);
    const boatKey = editingRow.boatName;
    const previous = getVesselOverrideSnapshot(boatKey);

    const next = upsertVesselOverride({
      boatKey: editingRow.boatName,
      boatName: String(form.get("boatName") ?? editingRow.boatName),
      stat: String(form.get("stat") ?? editingRow.stat),
      dueDate: String(form.get("dueDate") ?? editingRow.dueDate),
      completionPct: Number.isFinite(completion) ? completion : editingRow.completionPct,
      assignedTechnician: String(
        form.get("assignedTechnician") ?? editingRow.technician.workerLabel,
      ),
      assignedRigger: String(form.get("assignedRigger") ?? editingRow.rigger.workerLabel),
      assignedShipwright: String(
        form.get("assignedShipwright") ?? editingRow.shipwright.workerLabel,
      ),
      note: String(form.get("note") ?? editingRow.rationale),
      deleted: false,
    });
    pushUndoAction({
      type: "vessel-override",
      boatKey,
      previous,
      next,
      createdAtIso: new Date().toISOString(),
    });

    setSaveMessage(`Updated ${editingRow.boatName}.`);
    setEditingRow(null);
  }

  function deleteEditedVessel() {
    if (!editingRow) {
      return;
    }
    const boatKey = editingRow.boatName;
    const previous = getVesselOverrideSnapshot(boatKey);

    const next = upsertVesselOverride({
      boatKey: editingRow.boatName,
      deleted: true,
    });
    pushUndoAction({
      type: "vessel-override",
      boatKey,
      previous,
      next,
      createdAtIso: new Date().toISOString(),
    });

    setSaveMessage(`Removed ${editingRow.boatName} from active planning view.`);
    setEditingRow(null);
  }

  function resetEditedVessel() {
    if (!editingRow) {
      return;
    }
    const boatKey = editingRow.boatName;
    const previous = getVesselOverrideSnapshot(boatKey);
    removeVesselOverride(editingRow.boatName);
    pushUndoAction({
      type: "vessel-override",
      boatKey,
      previous,
      next: null,
      createdAtIso: new Date().toISOString(),
    });
    setSaveMessage(`Reset override for ${editingRow.boatName}.`);
    setEditingRow(null);
  }

  function handleShortageAction(role: "technician" | "rigger" | "shipwright") {
    if (viewer.role === "super-admin") {
      router.push(`/team-control?add=${encodeURIComponent(role)}`);
      return;
    }

    setSaveMessage(
      `Shortage detected for ${role}. Ask a Super Admin to add a temporary team member in Team Control.`,
    );
  }

  return (
    <div className={styles.pageStack}>
      <section className={styles.heroCard}>
        <div>
          <h1 className={styles.pageTitle}>Execution Task Hub: Current + Next Day</h1>
          <p className={styles.pageSubtitle}>
            Every scheduled vessel is a task. Tick tasks as work is completed to keep dispatch,
            quality, and daily turnaround execution aligned.
          </p>
        </div>
      </section>

      <section className={styles.taskQuickGrid}>
        <article className={styles.taskQuickCard}>
          <p className={styles.taskQuickLabel}>Total Tasks</p>
          <p className={styles.taskQuickValue}>{totalTaskCount}</p>
        </article>
        <article className={styles.taskQuickCard}>
          <p className={styles.taskQuickLabel}>Open Tasks</p>
          <p className={styles.taskQuickValue}>{openTaskCount}</p>
        </article>
        <article className={styles.taskQuickCard}>
          <p className={styles.taskQuickLabel}>Completed Tasks</p>
          <p className={styles.taskQuickValue}>{completedTaskCount}</p>
        </article>
      </section>

      <section className={styles.panelCard}>
        <div className={styles.panelHeaderSplit}>
          <div>
            <h2 className={styles.sectionTitle}>Vessel Assignment Plan</h2>
            <p className={styles.sectionHint}>
              Date-block timeline view: vessels are grouped by operational day in continuous order.
            </p>
            <p className={styles.sectionHint}>
              Departure-first planning with live updates as tasks are completed.
            </p>
            <div className={styles.tabGroup}>
              <button
                type="button"
                className={
                  dayView === "yesterday"
                    ? `${styles.tabButton} ${styles.tabButtonActive}`
                    : styles.tabButton
                }
                onClick={() => setDayView("yesterday")}
              >
                Yesterday
              </button>
              <button
                type="button"
                className={
                  dayView === "today"
                    ? `${styles.tabButton} ${styles.tabButtonActive}`
                    : styles.tabButton
                }
                onClick={() => setDayView("today")}
              >
                Today
              </button>
              <button
                type="button"
                className={
                  dayView === "tomorrow"
                    ? `${styles.tabButton} ${styles.tabButtonActive}`
                    : styles.tabButton
                }
                onClick={() => setDayView("tomorrow")}
              >
                Tomorrow
              </button>
              <button
                type="button"
                className={
                  dayView === "nextWeek"
                    ? `${styles.tabButton} ${styles.tabButtonActive}`
                    : styles.tabButton
                }
                onClick={() => setDayView("nextWeek")}
              >
                Next Week
              </button>
              <button
                type="button"
                className={
                  dayView === "all"
                    ? `${styles.tabButton} ${styles.tabButtonActive}`
                    : styles.tabButton
                }
                onClick={() => setDayView("all")}
              >
                All
              </button>
              {viewer.role === "super-admin" ? (
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => {
                    setRefreshDialogOpen(true);
                  }}
                  disabled={refreshingScheduling}
                >
                  {refreshingScheduling ? "Refreshing..." : "Refresh Scheduling"}
                </button>
              ) : null}
            </div>
          </div>

          <div className={styles.filterRow}>
            <label className={styles.searchWrap}>
              <span className={styles.visuallyHidden}>Search schedule</span>
              <input
                type="search"
                className={styles.searchInput}
                placeholder={`Search ${
                  searchScope === "all"
                    ? "vessel, technician, rigger, shipwright"
                    : searchScope
                }`}
                value={query}
                list="schedule-search-suggestions"
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
              <datalist id="schedule-search-suggestions">
                {searchSuggestions.map((option) => (
                  <option key={`search-option-${option}`} value={option} />
                ))}
              </datalist>
            </label>

            <div className={styles.filterMenuWrap}>
              <button
                type="button"
                className={styles.filterMenuButton}
                onClick={() => setScopeMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={scopeMenuOpen}
                aria-label="Search scope"
              >
                ≡ {searchScope === "all" ? "All" : capitalize(searchScope)}
              </button>
              {scopeMenuOpen ? (
                <div className={styles.filterMenu} role="menu" aria-label="Search scope options">
                  {([
                    "all",
                    "vessel",
                    "technician",
                    "rigger",
                    "shipwright",
                  ] as SearchScope[]).map((scope) => (
                    <button
                      key={`scope-${scope}`}
                      type="button"
                      role="menuitem"
                      className={
                        scope === searchScope
                          ? `${styles.filterMenuItem} ${styles.filterMenuItemActive}`
                          : styles.filterMenuItem
                      }
                      onClick={() => {
                        setSearchScope(scope);
                        setScopeMenuOpen(false);
                      }}
                    >
                      {scope === "all" ? "All" : capitalize(scope)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <label className={styles.selectWrap}>
              <span className={styles.visuallyHidden}>Filter task status</span>
              <select
                className={styles.selectInput}
                value={taskFilter}
                onChange={(event) => {
                  setTaskFilter(event.target.value as TaskFilter);
                }}
              >
                <option value="all">All Tasks</option>
                <option value="open">Open</option>
                <option value="done">Done</option>
              </select>
            </label>
          </div>
        </div>

        {saveMessage ? <p className={styles.sectionHint}>{saveMessage}</p> : null}

        <div className={styles.timelineStack}>
          {dayView === "yesterday" ? (
            <TimelineLane
              title="Yesterday"
              subtitle={`${yesterdayRows.length} vessels reviewed`}
              rows={yesterdayRows}
              reportDateIso={data.reportDateIso}
              taskState={taskState}
              taskMeta={taskMeta}
              pendingTaskIds={pendingTaskIds}
              onToggleTask={toggleTask}
              onDoneAll={(laneRows) => {
                void markAllDone(laneRows, "Yesterday");
              }}
              onEditVessel={openEditPanel}
              onOpenShortageAction={handleShortageAction}
              canManageTeam={viewer.role === "super-admin"}
            />
          ) : null}

          {dayView === "all" || dayView === "today" ? (
            <TimelineLane
              title="Today (Primary Focus)"
              subtitle={`${todayRows.length} vessels scheduled for ${formatDateLabel(data.reportDateIso)}`}
              rows={todayRows}
              reportDateIso={data.reportDateIso}
              taskState={taskState}
              taskMeta={taskMeta}
              pendingTaskIds={pendingTaskIds}
              onToggleTask={toggleTask}
              onDoneAll={(laneRows) => {
                void markAllDone(laneRows, "Today");
              }}
              onEditVessel={openEditPanel}
              onOpenShortageAction={handleShortageAction}
              canManageTeam={viewer.role === "super-admin"}
            />
          ) : null}

          {dayView === "all" || dayView === "tomorrow" ? (
            <TimelineLane
              title="Tomorrow"
              subtitle={`${tomorrowRows.length} vessels scheduled for ${formatDateLabel(nextOperationalIso)}`}
              rows={tomorrowRows}
              reportDateIso={data.reportDateIso}
              taskState={taskState}
              taskMeta={taskMeta}
              pendingTaskIds={pendingTaskIds}
              onToggleTask={toggleTask}
              onDoneAll={(laneRows) => {
                void markAllDone(laneRows, "Tomorrow");
              }}
              onEditVessel={openEditPanel}
              onOpenShortageAction={handleShortageAction}
              canManageTeam={viewer.role === "super-admin"}
            />
          ) : null}

          {dayView === "all" || dayView === "nextWeek"
            ? upcomingDateGroups.map((group) => (
                <TimelineLane
                  key={`upcoming-${group.dateIso}`}
                  title={`Upcoming: ${group.label}`}
                  subtitle={`${group.items.length} vessels in this operational block`}
                  rows={group.items}
                  reportDateIso={data.reportDateIso}
                  taskState={taskState}
                  taskMeta={taskMeta}
                  pendingTaskIds={pendingTaskIds}
                  onToggleTask={toggleTask}
                  onDoneAll={(laneRows) => {
                    void markAllDone(laneRows, `Upcoming ${group.label}`);
                  }}
                  onEditVessel={openEditPanel}
                  onOpenShortageAction={handleShortageAction}
                  canManageTeam={viewer.role === "super-admin"}
                />
              ))
            : null}

          {(dayView === "all" &&
            todayRows.length === 0 &&
            tomorrowRows.length === 0 &&
            upcomingDateGroups.length === 0) ||
          (dayView === "yesterday" && yesterdayRows.length === 0) ||
          (dayView === "today" && todayRows.length === 0) ||
          (dayView === "tomorrow" && tomorrowRows.length === 0) ||
          (dayView === "nextWeek" && upcomingDateGroups.length === 0) ? (
            <article className={styles.timelineEmpty}>
              <p className={styles.rowMain}>No vessels match this timeline filter.</p>
              <p className={styles.rowMeta}>Try clearing search text or switching the day scope.</p>
            </article>
          ) : null}
        </div>
      </section>

      {completionDialog ? (
        <section
          className={styles.overlayRoot}
          role="dialog"
          aria-modal="true"
          aria-label="Mark task complete"
        >
          <button
            type="button"
            className={styles.overlayScrim}
            aria-label="Close completion dialog"
            onClick={() => setCompletionDialog(null)}
          />
          <article className={styles.overlayPanel}>
            <header className={styles.overlayHeader}>
              <div>
                <h3 className={styles.sectionTitle}>Mark Complete: {completionDialog.boatName}</h3>
                <p className={styles.sectionHint}>Capture who completed this vessel and when.</p>
              </div>
              <button
                type="button"
                className={styles.overlayCloseButton}
                onClick={() => setCompletionDialog(null)}
              >
                Close
              </button>
            </header>

            <form className={styles.overlayForm} onSubmit={saveCompletionDialog}>
              <label className={styles.overlayField}>
                <span>Completed By</span>
                <input
                  className={styles.overlayInput}
                  value={completionDialog.completedBy}
                  onChange={(event) =>
                    setCompletionDialog((current) =>
                      current
                        ? {
                            ...current,
                            completedBy: event.target.value,
                          }
                        : current,
                    )
                  }
                  required
                />
              </label>

              <label className={styles.overlayField}>
                <span>Completed At</span>
                <input
                  type="datetime-local"
                  className={styles.overlayInput}
                  value={completionDialog.completedAtLocal}
                  onChange={(event) =>
                    setCompletionDialog((current) =>
                      current
                        ? {
                            ...current,
                            completedAtLocal: event.target.value,
                          }
                        : current,
                    )
                  }
                  required
                />
              </label>

              <label className={`${styles.overlayField} ${styles.overlayFieldWide}`}>
                <span>Completion Note (optional)</span>
                <textarea
                  rows={3}
                  className={styles.overlayTextarea}
                  value={completionDialog.note}
                  onChange={(event) =>
                    setCompletionDialog((current) =>
                      current
                        ? {
                            ...current,
                            note: event.target.value,
                          }
                        : current,
                    )
                  }
                />
              </label>

              <label className={styles.teamCheckboxField}>
                <input
                  type="checkbox"
                  checked={completionDialog.preCompleted}
                  onChange={(event) =>
                    setCompletionDialog((current) =>
                      current
                        ? {
                            ...current,
                            preCompleted: event.target.checked,
                          }
                        : current,
                    )
                  }
                />
                <span>Pre-completed before this task day</span>
              </label>

              <div className={styles.overlayActions}>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={() => setCompletionDialog(null)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryButton}>
                  Save Completion
                </button>
              </div>
            </form>
          </article>
        </section>
      ) : null}

      {refreshDialogOpen && viewer.role === "super-admin" ? (
        <section
          className={styles.overlayRoot}
          role="dialog"
          aria-modal="true"
          aria-label="Refresh scheduling confirmation"
        >
          <button
            type="button"
            className={styles.overlayScrim}
            aria-label="Close refresh scheduling dialog"
            onClick={() => setRefreshDialogOpen(false)}
          />
          <article className={styles.overlayPanel}>
            <header className={styles.overlayHeader}>
              <div>
                <h3 className={styles.sectionTitle}>Confirm Scheduling Refresh</h3>
                <p className={styles.sectionHint}>
                  Refresh will rebalance open work from today through next week. Completed and
                  pre-completed vessels stay locked as done.
                </p>
              </div>
              <button
                type="button"
                className={styles.overlayCloseButton}
                onClick={() => setRefreshDialogOpen(false)}
              >
                Close
              </button>
            </header>

            <div className={styles.stackList}>
              <article className={styles.miniRow}>
                <p className={styles.rowMain}>Today open tasks: {refreshPreview.todayOpen}</p>
                <p className={styles.rowMeta}>Tomorrow open: {refreshPreview.tomorrowOpen}</p>
              </article>
              <article className={styles.miniRow}>
                <p className={styles.rowMain}>Next 7 days open tasks: {refreshPreview.nextWeekOpen}</p>
                <p className={styles.rowMeta}>Current unassigned role slots: {refreshPreview.shortAssignments}</p>
              </article>
            </div>

            <label className={styles.teamCheckboxField}>
              <input
                type="checkbox"
                checked={allowOverrideRebalance}
                onChange={(event) => setAllowOverrideRebalance(event.target.checked)}
              />
              <span>Allow refresh to clear manual vessel overrides and fully rebalance</span>
            </label>

            <div className={styles.overlayActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setRefreshDialogOpen(false)}
                disabled={refreshingScheduling}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => {
                  void refreshSchedulingPlan({
                    allowOverrideRebalance,
                  });
                }}
                disabled={refreshingScheduling}
              >
                {refreshingScheduling ? "Refreshing..." : "Apply Refresh"}
              </button>
            </div>
          </article>
        </section>
      ) : null}

      {editingRow ? (
        <section
          className={styles.overlayRoot}
          role="dialog"
          aria-modal="true"
          aria-label="Edit vessel task"
        >
          <button
            type="button"
            className={styles.overlayScrim}
            aria-label="Close vessel editor"
            onClick={() => setEditingRow(null)}
          />
          <article className={styles.overlayPanel}>
            <header className={styles.overlayHeader}>
              <div>
                <h3 className={styles.sectionTitle}>Edit Vessel Task: {editingRow.boatName}</h3>
                <p className={styles.sectionHint}>
                  Manual override updates assignments and due date for this vessel.
                </p>
              </div>
              <button
                type="button"
                className={styles.overlayCloseButton}
                onClick={() => setEditingRow(null)}
              >
                Close
              </button>
            </header>

            <form className={styles.overlayForm} onSubmit={saveEditedVessel}>
              <label className={styles.overlayField}>
                <span>Vessel Name</span>
                <input
                  name="boatName"
                  className={styles.overlayInput}
                  defaultValue={editingRow.boatName}
                />
              </label>

              <label className={styles.overlayField}>
                <span>Stat</span>
                <input name="stat" className={styles.overlayInput} defaultValue={editingRow.stat} />
              </label>

              <label className={styles.overlayField}>
                <span>Departure Date</span>
                <input
                  name="dueDate"
                  type="date"
                  className={styles.overlayInput}
                  defaultValue={editingRow.dueDate}
                />
              </label>

              <label className={styles.overlayField}>
                <span>Completion %</span>
                <input
                  name="completionPct"
                  type="number"
                  min={0}
                  max={100}
                  className={styles.overlayInput}
                  defaultValue={editingRow.completionPct}
                />
              </label>

                <label className={styles.overlayField}>
                  <span>Technician</span>
                <select
                  name="assignedTechnician"
                  className={styles.overlayInput}
                  defaultValue={editingRow.technician.workerLabel}
                >
                  <option value="">Unassigned</option>
                  {technicianOptions.map((label) => (
                    <option key={`tech-option-${label}`} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.overlayField}>
                <span>Rigger</span>
                <select
                  name="assignedRigger"
                  className={styles.overlayInput}
                  defaultValue={editingRow.rigger.workerLabel}
                >
                  <option value="">Unassigned</option>
                  {riggerOptions.map((label) => (
                    <option key={`rigger-option-${label}`} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.overlayField}>
                <span>Shipwright</span>
                <select
                  name="assignedShipwright"
                  className={styles.overlayInput}
                  defaultValue={editingRow.shipwright.workerLabel}
                >
                  <option value="">Unassigned</option>
                  {shipwrightOptions.map((label) => (
                    <option key={`shipwright-option-${label}`} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={`${styles.overlayField} ${styles.overlayFieldWide}`}>
                <span>Notes / Job Description</span>
                <textarea
                  name="note"
                  rows={3}
                  className={styles.overlayTextarea}
                  defaultValue={editingRow.rationale}
                />
              </label>

              <div className={styles.overlayActions}>
                <button type="button" className={styles.ghostButton} onClick={resetEditedVessel}>
                  Reset
                </button>
                <button type="button" className={styles.ghostButton} onClick={deleteEditedVessel}>
                  Delete Vessel
                </button>
                <button type="submit" className={styles.primaryButton}>
                  Save Changes
                </button>
              </div>
            </form>
          </article>
        </section>
      ) : null}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: AssignmentPlanItem["priority"] }) {
  if (priority === "Critical") {
    return <span className={`${styles.statusBadge} ${styles.badgeCritical}`}>{priority}</span>;
  }
  if (priority === "High") {
    return <span className={`${styles.statusBadge} ${styles.badgeHigh}`}>{priority}</span>;
  }
  return <span className={`${styles.statusBadge} ${styles.badgeMedium}`}>{priority}</span>;
}

function TimelineLane(input: {
  title: string;
  subtitle: string;
  rows: AssignmentPlanItem[];
  reportDateIso: string;
  taskState: Record<string, true>;
  taskMeta: Record<
    string,
    {
      completedBy: string;
      completedAtIso: string;
      note: string;
      preCompleted?: boolean;
    }
  >;
  pendingTaskIds: Record<string, true>;
  onToggleTask: (taskId: string) => void | Promise<void>;
  onDoneAll: (rows: AssignmentPlanItem[]) => void;
  onEditVessel: (row: AssignmentPlanItem) => void;
  onOpenShortageAction: (role: "technician" | "rigger" | "shipwright") => void;
  canManageTeam: boolean;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(input.rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageRows = input.rows.slice(startIndex, startIndex + PAGE_SIZE);

  const openRowCount = input.rows.filter((row) => !input.taskState[row.id]).length;

  return (
    <article className={styles.timelineLane}>
      <header className={styles.timelineLaneHeader}>
        <h3 className={styles.timelineLaneTitle}>{input.title}</h3>
        <p className={styles.timelineLaneMeta}>{input.subtitle}</p>
        {openRowCount > 0 ? (
          <div className={styles.inlineActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => input.onDoneAll(input.rows)}
            >
              Done All ({openRowCount})
            </button>
          </div>
        ) : null}
      </header>

      <div className={styles.timelineItems}>
        {pageRows.map((item) => {
          const isDone = Boolean(input.taskState[item.id]);
          const completionMeta = input.taskMeta[item.id];
          const departureDays = Number.isFinite(item.daysUntilDeparture)
            ? Math.max(0, Math.trunc(item.daysUntilDeparture))
            : daysUntilIsoFromReport(item.departureDate, input.reportDateIso);
          const cardClass = [
            styles.timelineItemCard,
            priorityRowClass(item.charterPriority),
            item.source === "Carryover" ? styles.carryoverRow : "",
            departureDays <= 0 ? styles.departureDueTodayRow : "",
            isDone ? styles.taskRowDone : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <article
              key={item.id}
              className={cardClass}
              onClick={() => input.onEditVessel(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  input.onEditVessel(item);
                }
              }}
            >
              <div className={styles.timelineItemTop}>
                <div className={styles.taskToggleWrap}>
                  <label
                    className={styles.taskToggle}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => {
                        void input.onToggleTask(item.id);
                      }}
                      disabled={Boolean(input.pendingTaskIds[item.id])}
                      className={styles.taskCheckbox}
                      aria-label={`Mark task for ${item.boatName} as complete`}
                    />
                    <span>{isDone ? "Done" : "Open"}</span>
                  </label>
                  {isDone && completionMeta ? (
                    <span className={styles.taskMarkedMeta}>
                      Marked by {completionMeta.completedBy}
                      {completionMeta.preCompleted ? " | Pre-completion" : ""}
                    </span>
                  ) : null}
                </div>

                <div className={styles.timelineBadgeGroup}>
                  <span className={`${styles.statusBadge} ${styles.badgeMedium}`}>
                    {formatShortDate(parseIsoDate(item.departureDate))}
                  </span>
                  <span className={departureCountdownClass(departureDays)}>
                    {departureCountdownLabel(departureDays)}
                  </span>
                </div>
              </div>

              <div className={styles.timelineTaskMeta}>
                <div>
                  <p className={isDone ? `${styles.rowMain} ${styles.taskTextDone}` : styles.rowMain}>
                    {item.boatName}
                  </p>
                  <p className={styles.rowMeta}>
                    Ops Date {item.dueDateLabel} | Departs {item.departureDateLabel} | {item.source} | {item.stat}
                    {item.charterPriorityFlag ? ` | Charter ${item.charterPriorityFlag}` : ""}
                  </p>
                </div>
                <PriorityBadge priority={item.priority} />
              </div>

              <div className={styles.timelineWorkers}>
                <WorkerCell
                  worker={item.technician}
                  roleLabel="technician"
                  onOpenShortageAction={input.onOpenShortageAction}
                  canManageTeam={input.canManageTeam}
                />
                <WorkerCell
                  worker={item.rigger}
                  roleLabel="rigger"
                  onOpenShortageAction={input.onOpenShortageAction}
                  canManageTeam={input.canManageTeam}
                />
                <WorkerCell
                  worker={item.shipwright}
                  roleLabel="shipwright"
                  onOpenShortageAction={input.onOpenShortageAction}
                  canManageTeam={input.canManageTeam}
                />
              </div>

              <p className={styles.timelineRationale}>{item.rationale}</p>
            </article>
          );
        })}
      </div>

      {input.rows.length > PAGE_SIZE ? (
        <div className={styles.timelinePager}>
          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage <= 1}
            aria-label={`Previous vessels for ${input.title}`}
          >
            ←
          </button>
          <p className={styles.timelinePagerMeta}>
            {startIndex + 1}-{Math.min(startIndex + PAGE_SIZE, input.rows.length)} of {input.rows.length}
          </p>
          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={currentPage >= totalPages}
            aria-label={`Next vessels for ${input.title}`}
          >
            →
          </button>
        </div>
      ) : null}
    </article>
  );
}

function WorkerCell(input: {
  worker: AssignmentPlanItem["rigger"];
  roleLabel: "technician" | "rigger" | "shipwright";
  onOpenShortageAction: (role: "technician" | "rigger" | "shipwright") => void;
  canManageTeam: boolean;
}) {
  if (input.worker.assignmentState === "Unassigned") {
    return (
      <div className={styles.timelineWorker}>
        <p className={styles.rowMain}>Short</p>
        <p className={styles.rowMeta}>Need temporary {input.roleLabel} support.</p>
        {input.canManageTeam ? (
          <button
            type="button"
            className={styles.inlineLinkButton}
            onClick={(event) => {
              event.stopPropagation();
              input.onOpenShortageAction(input.roleLabel);
            }}
          >
            Add Temporary {capitalize(input.roleLabel)}
          </button>
        ) : (
          <p className={styles.rowMeta}>Notify Super Admin.</p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.timelineWorker}>
      <p className={styles.rowMain}>{input.worker.workerLabel}</p>
      <p className={styles.rowMeta}>
        {input.worker.assignmentState} | quality {input.worker.qualityScore}% | load {input.worker.plannedLoad}
      </p>
    </div>
  );
}

function compareTimelineRows(left: AssignmentPlanItem, right: AssignmentPlanItem): number {
  if (left.dueDate !== right.dueDate) {
    return left.dueDate.localeCompare(right.dueDate);
  }

  const leftDays = Number.isFinite(left.daysUntilDeparture)
    ? Math.max(0, Math.trunc(left.daysUntilDeparture))
    : 99;
  const rightDays = Number.isFinite(right.daysUntilDeparture)
    ? Math.max(0, Math.trunc(right.daysUntilDeparture))
    : 99;
  if (leftDays !== rightDays) {
    return leftDays - rightDays;
  }

  if (left.completionPct !== right.completionPct) {
    return left.completionPct - right.completionPct;
  }

  return left.boatName.localeCompare(right.boatName);
}

function dedupeAssignmentRows(rows: AssignmentPlanItem[]): AssignmentPlanItem[] {
  const byKey = new Map<string, AssignmentPlanItem>();

  for (const row of rows) {
    const key = `${row.dueDate}-${normalizeBoatKey(row.boatName)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    const nextScore = assignmentSourceRank(row.source);
    const existingScore = assignmentSourceRank(existing.source);
    if (nextScore > existingScore) {
      byKey.set(key, row);
      continue;
    }

    if (nextScore === existingScore && row.completionPct < existing.completionPct) {
      byKey.set(key, row);
      continue;
    }

    if (
      nextScore === existingScore &&
      row.completionPct === existing.completionPct &&
      row.priority === "Critical" &&
      existing.priority !== "Critical"
    ) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values()];
}

function assignmentSourceRank(source: AssignmentPlanItem["source"]): number {
  if (source === "Carryover") {
    return 5;
  }
  if (source === "Today") {
    return 4;
  }
  if (source === "Tomorrow") {
    return 3;
  }
  if (source === "Next Week") {
    return 2;
  }
  return 1;
}

function priorityRowClass(priority: CharterPriorityLevel): string {
  if (priority === "owner") {
    return styles.priorityOwnerRow;
  }
  if (priority === "ownerBerth") {
    return styles.priorityOwnerBerthRow;
  }
  return "";
}

function parseDayView(value: string | null): DayView {
  if (value === "yesterday" || value === "today" || value === "tomorrow" || value === "nextWeek") {
    return value;
  }
  return "today";
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function departureCountdownLabel(days: number): string {
  if (days <= 0) {
    return "Due Today";
  }
  if (days === 1) {
    return "1 day";
  }
  return `${days} days`;
}

function departureCountdownClass(days: number): string {
  if (days <= 0) {
    return `${styles.statusBadge} ${styles.departureCountdownDueToday}`;
  }
  if (days === 1) {
    return `${styles.statusBadge} ${styles.departureCountdownDay1}`;
  }
  if (days === 2) {
    return `${styles.statusBadge} ${styles.departureCountdownDay2}`;
  }
  if (days === 3) {
    return `${styles.statusBadge} ${styles.departureCountdownDay3}`;
  }
  if (days === 4) {
    return `${styles.statusBadge} ${styles.departureCountdownDay4}`;
  }
  return `${styles.statusBadge} ${styles.departureCountdownDay5}`;
}

function normalizeBoatKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}

function toUndoCompletionMeta(
  value:
    | {
        completedBy: string;
        completedAtIso: string;
        note: string;
        preCompleted?: boolean;
      }
    | undefined,
): {
  completedBy: string;
  completedAtIso: string;
  note: string;
  preCompleted: boolean;
} | null {
  if (!value) {
    return null;
  }
  return {
    completedBy: value.completedBy,
    completedAtIso: value.completedAtIso,
    note: value.note,
    preCompleted: Boolean(value.preCompleted),
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysUntilIsoFromReport(targetIso: string, reportIso: string): number {
  const target = parseIsoDate(targetIso);
  const report = parseIsoDate(reportIso);
  const diffMs = target.getTime() - report.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function formatDateLabel(dateIso: string): string {
  const date = parseIsoDate(dateIso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function toLocalDateTimeInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function localDateTimeInputToIso(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}
