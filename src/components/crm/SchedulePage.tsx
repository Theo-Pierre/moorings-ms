"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type {
  AssignmentPlanItem,
  CharterPriorityLevel,
  OperationsDashboardData,
} from "@/lib/operations-data";

import {
  applyVesselOverridesToAssignmentRows,
  useManualAssignmentRows,
  useVesselOverrides,
} from "./manual-vessels";
import { useSharedTaskState } from "./shared-task-state";
import styles from "./crm.module.css";

type TaskFilter = "all" | "open" | "done";
type DayView = "all" | "yesterday" | "today" | "tomorrow" | "nextWeek";
type SearchScope = "all" | "vessel" | "technician" | "rigger" | "shipwright";
const PAGE_SIZE = 5;

interface SchedulePageProps {
  data: OperationsDashboardData;
}

export function SchedulePage({ data }: SchedulePageProps) {
  const searchParams = useSearchParams();
  const manualAssignmentRows = useManualAssignmentRows();
  const vesselOverrides = useVesselOverrides();
  const assignmentRows = useMemo(
    () => applyVesselOverridesToAssignmentRows([...manualAssignmentRows, ...data.assignmentPlan], vesselOverrides),
    [manualAssignmentRows, data.assignmentPlan, vesselOverrides],
  );
  const requestedView = parseDayView(searchParams.get("view"));
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("all");
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [dayView, setDayView] = useState<DayView>(requestedView);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const { taskState, setTaskDone, pendingTaskIds } = useSharedTaskState(
    data.reportDateIso,
    assignmentRows,
  );
  const nextWeekEndIso = useMemo(() => toIsoDate(addDays(parseIsoDate(data.reportDateIso), 7)), [
    data.reportDateIso,
  ]);
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

  const effectiveExecutionRows = executionRows;

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return effectiveExecutionRows.filter((item) => {
      const isDone = Boolean(taskState[item.id]);

      if (dayView === "yesterday" && !(item.dueDate < data.reportDateIso || item.source === "Yesterday")) {
        return false;
      }
      if (dayView === "today" && item.dueDate !== data.reportDateIso) {
        return false;
      }
      if (dayView === "tomorrow" && item.dueDate !== nextOperationalIso) {
        return false;
      }
      if (dayView === "nextWeek" && !(item.dueDate > data.reportDateIso && item.dueDate <= nextWeekEndIso)) {
        return false;
      }
      if (dayView === "all" && item.dueDate < data.reportDateIso) {
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
  }, [data.reportDateIso, dayView, effectiveExecutionRows, nextOperationalIso, nextWeekEndIso, query, searchScope, taskFilter, taskState]);

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
    return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right)).slice(0, 200);
  }, [effectiveExecutionRows, searchScope]);

  const orderedRows = useMemo(
    () => [...rows].sort(compareTimelineRows),
    [rows],
  );
  const todayRows = useMemo(
    () => orderedRows.filter((item) => item.dueDate === data.reportDateIso),
    [data.reportDateIso, orderedRows],
  );
  const tomorrowRows = useMemo(
    () => orderedRows.filter((item) => item.dueDate === nextOperationalIso),
    [nextOperationalIso, orderedRows],
  );
  const yesterdayRows = useMemo(
    () => orderedRows.filter((item) => item.dueDate < data.reportDateIso || item.source === "Yesterday"),
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

  function toggleTask(id: string) {
    const nextDone = !Boolean(taskState[id]);
    void setTaskDone(id, nextDone);
  }

  return (
    <div className={styles.pageStack}>
      <section className={styles.heroCard}>
        <div>
          <h1 className={styles.pageTitle}>Execution Task Hub: Current + Next Day</h1>
          <p className={styles.pageSubtitle}>
            Every scheduled vessel is a task. Tick tasks as work is completed to keep dispatch, quality, and daily
            turnaround execution aligned.
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
                className={dayView === "yesterday" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
                onClick={() => setDayView("yesterday")}
              >
                Yesterday
              </button>
              <button
                type="button"
                className={dayView === "today" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
                onClick={() => setDayView("today")}
              >
                Today
              </button>
              <button
                type="button"
                className={dayView === "tomorrow" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
                onClick={() => setDayView("tomorrow")}
              >
                Tomorrow
              </button>
              <button
                type="button"
                className={dayView === "nextWeek" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
                onClick={() => setDayView("nextWeek")}
              >
                Next Week
              </button>
              <button
                type="button"
                className={dayView === "all" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
                onClick={() => setDayView("all")}
              >
                All
              </button>
            </div>
          </div>

          <div className={styles.filterRow}>
            <label className={styles.searchWrap}>
              <span className={styles.visuallyHidden}>Search schedule</span>
              <input
                type="search"
                className={styles.searchInput}
                placeholder={`Search ${searchScope === "all" ? "vessel, technician, rigger, shipwright" : searchScope}`}
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
                  {( ["all", "vessel", "technician", "rigger", "shipwright"] as SearchScope[]).map((scope) => (
                    <button
                      key={`scope-${scope}`}
                      type="button"
                      role="menuitem"
                      className={scope === searchScope ? `${styles.filterMenuItem} ${styles.filterMenuItemActive}` : styles.filterMenuItem}
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

        <div className={styles.timelineStack}>
          {dayView === "yesterday" ? (
            <TimelineLane
              title="Yesterday"
              subtitle={`${yesterdayRows.length} vessels reviewed`}
              rows={yesterdayRows}
              reportDateIso={data.reportDateIso}
              taskState={taskState}
              pendingTaskIds={pendingTaskIds}
              onToggleTask={toggleTask}
            />
          ) : null}

          {(dayView === "all" || dayView === "today") ? (
            <TimelineLane
              title="Today (Primary Focus)"
              subtitle={`${todayRows.length} vessels scheduled for ${formatDateLabel(data.reportDateIso)}`}
              rows={todayRows}
              reportDateIso={data.reportDateIso}
              taskState={taskState}
              pendingTaskIds={pendingTaskIds}
              onToggleTask={toggleTask}
            />
          ) : null}

          {(dayView === "all" || dayView === "tomorrow") ? (
            <TimelineLane
              title="Tomorrow"
              subtitle={`${tomorrowRows.length} vessels scheduled for ${formatDateLabel(nextOperationalIso)}`}
              rows={tomorrowRows}
              reportDateIso={data.reportDateIso}
              taskState={taskState}
              pendingTaskIds={pendingTaskIds}
              onToggleTask={toggleTask}
            />
          ) : null}

          {(dayView === "all" || dayView === "nextWeek") ? (
            upcomingDateGroups.map((group) => (
              <TimelineLane
                key={`upcoming-${group.dateIso}`}
                title={`Upcoming: ${group.label}`}
                subtitle={`${group.items.length} vessels in this operational block`}
                rows={group.items}
                reportDateIso={data.reportDateIso}
                taskState={taskState}
                pendingTaskIds={pendingTaskIds}
                onToggleTask={toggleTask}
              />
            ))
          ) : null}

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
  pendingTaskIds: Record<string, true>;
  onToggleTask: (taskId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(input.rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageRows = input.rows.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <article className={styles.timelineLane}>
      <header className={styles.timelineLaneHeader}>
        <h3 className={styles.timelineLaneTitle}>{input.title}</h3>
        <p className={styles.timelineLaneMeta}>{input.subtitle}</p>
      </header>
      <div className={styles.timelineItems}>
        {pageRows.map((item) => {
          const isDone = Boolean(input.taskState[item.id]);
          const departureDays = Number.isFinite(item.daysUntilDeparture)
            ? Math.max(0, Math.trunc(item.daysUntilDeparture))
            : daysUntilIsoFromReport(item.dueDate, input.reportDateIso);
          const cardClass = [
            styles.timelineItemCard,
            priorityRowClass(item.charterPriority),
            departureDays <= 0 ? styles.departureDueTodayRow : "",
            isDone ? styles.taskRowDone : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <article key={item.id} className={cardClass}>
              <div className={styles.timelineItemTop}>
                <label className={styles.taskToggle}>
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => input.onToggleTask(item.id)}
                    disabled={Boolean(input.pendingTaskIds[item.id])}
                    className={styles.taskCheckbox}
                    aria-label={`Mark task for ${item.boatName} as complete`}
                  />
                  <span>{isDone ? "Done" : "Open"}</span>
                </label>

                <span className={departureCountdownClass(departureDays)}>
                  {departureCountdownLabel(departureDays)}
                </span>
              </div>

              <div className={styles.timelineTaskMeta}>
                <div>
                  <p className={isDone ? `${styles.rowMain} ${styles.taskTextDone}` : styles.rowMain}>
                    {item.boatName}
                  </p>
                  <p className={styles.rowMeta}>
                    Ops Date {item.dueDateLabel} | {item.source} | {item.stat}
                    {item.charterPriorityFlag ? ` | Charter ${item.charterPriorityFlag}` : ""}
                  </p>
                </div>
                <PriorityBadge priority={item.priority} />
              </div>

              <div className={styles.timelineWorkers}>
                <WorkerCell worker={item.technician} />
                <WorkerCell worker={item.rigger} />
                <WorkerCell worker={item.shipwright} />
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

function WorkerCell({ worker }: { worker: AssignmentPlanItem["rigger"] }) {
  return (
    <div className={styles.timelineWorker}>
      <p className={styles.rowMain}>{worker.workerLabel}</p>
      <p className={styles.rowMeta}>
        {worker.assignmentState} | quality {worker.qualityScore}% | load {worker.plannedLoad}
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
