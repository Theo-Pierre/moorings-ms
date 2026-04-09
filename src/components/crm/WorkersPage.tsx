"use client";

import { useMemo, useState, type ReactNode } from "react";

import type { WorkerQualityReport } from "@/lib/operations-data";

import { LineChart, PieChart } from "./charts";
import styles from "./crm.module.css";

interface WorkersPageProps {
  title: string;
  subtitle: string;
  workers: WorkerQualityReport[];
  topSection?: ReactNode;
}

export function WorkersPage({ title, subtitle, workers, topSection }: WorkersPageProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(workers[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return workers;
    }

    return workers.filter((worker) => {
      return (
        worker.workerLabel.toLowerCase().includes(q) ||
        worker.vessels.some((vessel) => vessel.toLowerCase().includes(q))
      );
    });
  }, [query, workers]);

  const selected = filtered.find((worker) => worker.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className={styles.pageStack}>
      <section className={styles.heroCard}>
        <div>
          <h1 className={styles.pageTitle}>{title}</h1>
          <p className={styles.pageSubtitle}>{subtitle}</p>
        </div>
      </section>

      {topSection}

      <section className={styles.panelCard}>
        <div className={styles.filterRow}>
          <label className={styles.searchWrap}>
            <span className={styles.visuallyHidden}>Search workers</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search by team member or vessel"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className={styles.splitPanel}>
        <article className={styles.listPanel}>
          <h2 className={styles.sectionTitle}>Team Members</h2>
          <p className={styles.sectionHint}>{filtered.length} profiles in this role.</p>

          <div className={styles.stackList}>
            {filtered.map((worker) => (
              <button
                key={worker.id}
                type="button"
                className={
                  worker.id === selectedId
                    ? `${styles.selectorCard} ${styles.selectorCardActive}`
                    : styles.selectorCard
                }
                onClick={() => setSelectedId(worker.id)}
              >
                <div className={styles.selectorTopRow}>
                  <p className={styles.rowMain}>{worker.workerLabel}</p>
                  <span className={styles.statusBadge}>{worker.qualityScore}%</span>
                </div>
                <p className={styles.rowMeta}>
                  Assignments {worker.assignments} | Planned load {worker.plannedLoad}
                </p>
                <p className={styles.rowMeta}>
                  Completed {worker.completed} | Pending {worker.pending} | On-time {worker.onTimeRate}%
                </p>
              </button>
            ))}
          </div>
        </article>

        <article className={styles.detailPanel}>
          {selected ? (
            <>
              <div className={styles.panelHeaderSplit}>
                <div>
                  <h2 className={styles.sectionTitle}>{selected.workerLabel}</h2>
                  <p className={styles.sectionHint}>
                    {selected.role} quality profile with assignment outcomes and vessel impact.
                  </p>
                </div>
                <div className={styles.pillCluster}>
                  <span className={styles.metricPill}>Quality {selected.qualityScore}%</span>
                  <span className={styles.metricPill}>On-time {selected.onTimeRate}%</span>
                  <span className={styles.metricPill}>Late {selected.lateAssignments}</span>
                </div>
              </div>

              <div className={styles.detailMetaGrid}>
                <article className={styles.metaCard}>
                  <h3>Assignment Metrics</h3>
                  <p>Total assignments: {selected.assignments}</p>
                  <p>Completed: {selected.completed}</p>
                  <p>In progress: {selected.inProgress}</p>
                  <p>Pending: {selected.pending}</p>
                </article>

                <article className={styles.metaCard}>
                  <h3>Operational Impact</h3>
                  <p>Average vessel completion: {selected.averageVesselCompletionPct}%</p>
                  <p>Planned load: {selected.plannedLoad}</p>
                  <p>Unique vessels: {selected.vessels.length}</p>
                </article>

                <article className={styles.metaCard}>
                  <h3>Recent Vessels</h3>
                  <div className={styles.chipWrap}>
                    {selected.vessels.length > 0 ? (
                      selected.vessels.slice(0, 16).map((vessel) => (
                        <span key={`${selected.id}-${vessel}`} className={styles.roleChip}>
                          {vessel}
                        </span>
                      ))
                    ) : (
                      <span className={styles.rowMeta}>No vessels on record.</span>
                    )}
                  </div>
                </article>
              </div>

              <div className={styles.twoCol}>
                <LineChart
                  title="Individual Trend"
                  subtitle="Recent assignments and completion"
                  points={selected.trend}
                />
                <PieChart
                  title="Assignment Status Mix"
                  subtitle="Completed vs in progress vs pending"
                  slices={selected.pie}
                />
              </div>
            </>
          ) : (
            <p className={styles.sectionHint}>No workers available for this filter.</p>
          )}
        </article>
      </section>
    </div>
  );
}
