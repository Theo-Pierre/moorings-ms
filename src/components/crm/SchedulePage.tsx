"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  AssignmentPlanItem,
  CharterPriorityLevel,
  OperationsDashboardData,
} from "@/lib/operations-data";

import styles from "./crm.module.css";

type SourceFilter = "all" | "Today" | "Tomorrow" | "Carryover";
type TaskFilter = "all" | "open" | "done";
const PAGE_SIZE = 10;

interface SchedulePageProps {
  data: OperationsDashboardData;
}

export function SchedulePage({ data }: SchedulePageProps) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [page, setPage] = useState(1);
  const taskStorageKey = useMemo(() => `moorings-ms:schedule-task-state:${data.reportDateIso}`, [
    data.reportDateIso,
  ]);
  const [taskState, setTaskState] = useState<Record<string, true>>(() =>
    loadTaskState(taskStorageKey, data.assignmentPlan),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const doneIds = Object.keys(taskState);
    window.localStorage.setItem(taskStorageKey, JSON.stringify(doneIds));
  }, [taskState, taskStorageKey]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return data.assignmentPlan.filter((item) => {
      const isDone = Boolean(taskState[item.id]);

      if (sourceFilter !== "all" && item.source !== sourceFilter) {
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

      return (
        item.boatName.toLowerCase().includes(normalizedQuery) ||
        item.rigger.workerLabel.toLowerCase().includes(normalizedQuery) ||
        item.shipwright.workerLabel.toLowerCase().includes(normalizedQuery) ||
        item.stat.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [data.assignmentPlan, query, sourceFilter, taskFilter, taskState]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(startIndex, startIndex + PAGE_SIZE);
  const totalTaskCount = data.assignmentPlan.length;
  const completedTaskCount = Object.keys(taskState).length;
  const openTaskCount = Math.max(0, totalTaskCount - completedTaskCount);
  const completedVisibleCount = rows.reduce(
    (count, item) => (taskState[item.id] ? count + 1 : count),
    0,
  );

  function toggleTask(id: string) {
    setTaskState((current) => {
      if (current[id]) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      return {
        ...current,
        [id]: true,
      };
    });
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
              Showing {pagedRows.length} of {rows.length} tasks ({completedVisibleCount} completed in this filter).
              Page {currentPage} of {totalPages}.
            </p>
          </div>

          <div className={styles.filterRow}>
            <label className={styles.searchWrap}>
              <span className={styles.visuallyHidden}>Search schedule</span>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search vessel, rigger, shipwright, stat"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </label>

            <label className={styles.selectWrap}>
              <span className={styles.visuallyHidden}>Filter schedule source</span>
              <select
                className={styles.selectInput}
                value={sourceFilter}
                onChange={(event) => {
                  setSourceFilter(event.target.value as SourceFilter);
                  setPage(1);
                }}
              >
                <option value="all">All Sources</option>
                <option value="Today">Today</option>
                <option value="Tomorrow">Tomorrow</option>
                <option value="Carryover">Carryover</option>
              </select>
            </label>

            <label className={styles.selectWrap}>
              <span className={styles.visuallyHidden}>Filter task status</span>
              <select
                className={styles.selectInput}
                value={taskFilter}
                onChange={(event) => {
                  setTaskFilter(event.target.value as TaskFilter);
                  setPage(1);
                }}
              >
                <option value="all">All Tasks</option>
                <option value="open">Open</option>
                <option value="done">Done</option>
              </select>
            </label>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Task</th>
                <th>Vessel</th>
                <th>Due</th>
                <th>Priority</th>
                <th>Slot</th>
                <th>Rigger</th>
                <th>Shipwright</th>
                <th>Completion</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((item) => {
                const isDone = Boolean(taskState[item.id]);
                const rowClass = `${priorityRowClass(item.charterPriority)} ${isDone ? styles.taskRowDone : ""}`.trim();

                return (
                <tr key={item.id} className={rowClass}>
                  <td>
                    <label className={styles.taskToggle}>
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggleTask(item.id)}
                        className={styles.taskCheckbox}
                        aria-label={`Mark task for ${item.boatName} as complete`}
                      />
                      <span>{isDone ? "Done" : "Open"}</span>
                    </label>
                  </td>
                  <td>
                    <p className={isDone ? `${styles.rowMain} ${styles.taskTextDone}` : styles.rowMain}>{item.boatName}</p>
                    <p className={styles.rowMeta}>
                      {item.source} | {item.stat}
                      {item.charterPriorityFlag ? ` | Charter ${item.charterPriorityFlag}` : ""}
                    </p>
                  </td>
                  <td>{item.dueDateLabel}</td>
                  <td>
                    <PriorityBadge priority={item.priority} />
                  </td>
                  <td>{item.timeWindow}</td>
                  <td>
                    <WorkerCell worker={item.rigger} />
                  </td>
                  <td>
                    <WorkerCell worker={item.shipwright} />
                  </td>
                  <td>{item.completionPct}%</td>
                  <td className={styles.longCell}>{item.rationale}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.pagerBar}>
          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage <= 1}
          >
            ←
          </button>

          <div className={styles.pagerNumbers} aria-label="Schedule pages">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button
                key={`schedule-page-${pageNumber}`}
                type="button"
                className={
                  pageNumber === currentPage
                    ? `${styles.pagerButton} ${styles.pagerButtonActive}`
                    : styles.pagerButton
                }
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={currentPage >= totalPages}
          >
            →
          </button>
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

function WorkerCell({ worker }: { worker: AssignmentPlanItem["rigger"] }) {
  return (
    <div>
      <p className={styles.rowMain}>{worker.workerLabel}</p>
      <p className={styles.rowMeta}>
        {worker.assignmentState} | quality {worker.qualityScore}% | load {worker.plannedLoad}
      </p>
    </div>
  );
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

function loadTaskState(
  storageKey: string,
  rows: AssignmentPlanItem[],
): Record<string, true> {
  if (typeof window === "undefined") {
    return {};
  }

  const validIds = new Set(rows.map((item) => item.id));
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) {
      return {};
    }

    const taskState: Record<string, true> = {};
    for (const id of parsed) {
      if (typeof id === "string" && validIds.has(id)) {
        taskState[id] = true;
      }
    }
    return taskState;
  } catch {
    return {};
  }
}
