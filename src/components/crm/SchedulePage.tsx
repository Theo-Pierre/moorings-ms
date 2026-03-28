"use client";

import { useMemo, useState } from "react";

import type {
  AssignmentPlanItem,
  CharterPriorityLevel,
  OperationsDashboardData,
} from "@/lib/operations-data";

import styles from "./crm.module.css";

type SourceFilter = "all" | "Today" | "Tomorrow" | "Carryover";
const PAGE_SIZE = 10;

interface SchedulePageProps {
  data: OperationsDashboardData;
}

export function SchedulePage({ data }: SchedulePageProps) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return data.assignmentPlan.filter((item) => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) {
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
  }, [data.assignmentPlan, query, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = rows.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className={styles.pageStack}>
      <section className={styles.heroCard}>
        <div>
          <h1 className={styles.pageTitle}>Execution Schedule: Current + Next Day</h1>
          <p className={styles.pageSubtitle}>
            Assignment matrix generated from previous-day carryover, role status, and worker quality/load balancing.
          </p>
        </div>
      </section>

      <section className={styles.panelCard}>
        <div className={styles.panelHeaderSplit}>
          <div>
            <h2 className={styles.sectionTitle}>Vessel Assignment Plan</h2>
            <p className={styles.sectionHint}>
              Showing {pagedRows.length} of {rows.length} schedule rows. Page {currentPage} of {totalPages}.
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
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
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
              {pagedRows.map((item) => (
                <tr key={item.id} className={priorityRowClass(item.charterPriority)}>
                  <td>
                    <p className={styles.rowMain}>{item.boatName}</p>
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
              ))}
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
