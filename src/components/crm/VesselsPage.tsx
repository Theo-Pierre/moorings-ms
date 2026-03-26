"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { VesselQualityReport } from "@/lib/operations-data";

import { LineChart, PieChart } from "./charts";
import styles from "./crm.module.css";

type VesselStatusFilter = "all" | "Critical" | "Watch" | "On track";
const PAGE_SIZE = 10;

interface VesselsPageProps {
  vessels: VesselQualityReport[];
  reportDateLabel: string;
}

export function VesselsPage({ vessels, reportDateLabel }: VesselsPageProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VesselStatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(vessels[0]?.id ?? null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return vessels.filter((vessel) => {
      if (statusFilter !== "all" && vessel.risk !== statusFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      return (
        vessel.boatName.toLowerCase().includes(q) ||
        vessel.stat.toLowerCase().includes(q) ||
        vessel.assignedRigger.toLowerCase().includes(q) ||
        vessel.assignedShipwright.toLowerCase().includes(q)
      );
    });
  }, [query, statusFilter, vessels]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pagedVessels = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const selected = pagedVessels.find((vessel) => vessel.id === selectedId) ?? pagedVessels[0] ?? null;

  return (
    <div className={styles.pageStack}>
      <section className={styles.heroCard}>
        <div>
          <h1 className={styles.pageTitle}>Per-Vessel Quality Reporting</h1>
          <p className={styles.pageSubtitle}>
            Individual vessel quality profile for report cycle ending {reportDateLabel}. Includes assigned rigger and
            shipwright, trend, and role-status mix.
          </p>
        </div>
      </section>

      <section className={styles.panelCard}>
        <div className={styles.filterRow}>
          <label className={styles.searchWrap}>
            <span className={styles.visuallyHidden}>Search vessels</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search vessel, stat, or assignee"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className={styles.selectWrap}>
            <span className={styles.visuallyHidden}>Filter by vessel status</span>
            <select
              className={styles.selectInput}
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as VesselStatusFilter);
                setPage(1);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="Critical">Critical</option>
              <option value="Watch">Watch</option>
              <option value="On track">On track</option>
            </select>
          </label>
        </div>
      </section>

      <section className={styles.splitPanel}>
        <article className={styles.listPanel}>
          <h2 className={styles.sectionTitle}>Vessel List</h2>
          <p className={styles.sectionHint}>
            Showing {pagedVessels.length} of {filtered.length} vessels. Page {currentPage} of {totalPages}.
          </p>

          <div className={styles.stackList}>
            {pagedVessels.map((vessel) => (
              <button
                key={vessel.id}
                type="button"
                className={
                  vessel.id === selectedId
                    ? `${styles.selectorCard} ${styles.selectorCardActive}`
                    : styles.selectorCard
                }
                onClick={() => setSelectedId(vessel.id)}
              >
                <div className={styles.selectorTopRow}>
                  <p className={styles.rowMain}>{vessel.boatName}</p>
                  <RiskBadge risk={vessel.risk} />
                </div>
                <p className={styles.rowMeta}>
                  Quality {vessel.qualityScore}% | Avg {vessel.averageCompletionPct}% | {vessel.stat}
                </p>
                <p className={styles.rowMeta}>
                  Rigger: {vessel.assignedRigger} | Shipwright: {vessel.assignedShipwright}
                </p>
              </button>
            ))}
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

            <div className={styles.pagerNumbers} aria-label="Vessel pages">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  key={`vessels-page-${pageNumber}`}
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
        </article>

        <article className={styles.detailPanel}>
          {selected ? (
            <>
              <div className={styles.panelHeaderSplit}>
                <div>
                  <h2 className={styles.sectionTitle}>{selected.boatName}</h2>
                  <p className={styles.sectionHint}>
                    Due {selected.latestDueDate} | {selected.stat} | {selected.note}
                  </p>
                </div>
                <div className={styles.pillCluster}>
                  <span className={styles.metricPill}>Quality {selected.qualityScore}%</span>
                  <span className={styles.metricPill}>Current {selected.currentCompletionPct}%</span>
                  <RiskBadge risk={selected.risk} />
                </div>
              </div>

              <div className={styles.detailMetaGrid}>
                <article className={styles.metaCard}>
                  <h3>Assigned Team</h3>
                  <p>{selected.assignedRigger}</p>
                  <p>{selected.assignedShipwright}</p>
                </article>

                <article className={styles.metaCard}>
                  <h3>Turnaround Metrics</h3>
                  <p>Total tracked: {selected.totalTurnarounds}</p>
                  <p>Late: {selected.lateTurnarounds}</p>
                  <p>Critical history: {selected.criticalTurnarounds}</p>
                </article>

                <article className={styles.metaCard}>
                  <h3>Pending Roles</h3>
                  <div className={styles.chipWrap}>
                    {selected.pendingRoles.length > 0 ? (
                      selected.pendingRoles.map((role) => (
                        <span key={`${selected.id}-${role}`} className={styles.roleChip}>
                          {role}
                        </span>
                      ))
                    ) : (
                      <span className={styles.rowMeta}>No pending roles.</span>
                    )}
                  </div>
                </article>
              </div>

              <div className={styles.twoCol}>
                <LineChart
                  title="Vessel Completion Trend"
                  subtitle="Recent turnaround jobs"
                  points={selected.trend}
                />
                <PieChart
                  title="Current Role Status"
                  subtitle="Completed vs in progress vs pending"
                  slices={selected.pie}
                />
              </div>

              <div className={styles.inlineActions}>
                <Link
                  href={`https://www.google.com/search?q=${encodeURIComponent(`Moorings ${selected.boatName} yacht`)}`}
                  className={styles.ghostButton}
                  target="_blank"
                  rel="noreferrer"
                >
                  External Vessel Lookup
                </Link>
              </div>
            </>
          ) : (
            <p className={styles.sectionHint}>No vessel data available for this filter.</p>
          )}
        </article>
      </section>
    </div>
  );
}

function RiskBadge({ risk }: { risk: VesselQualityReport["risk"] }) {
  if (risk === "Critical") {
    return <span className={`${styles.statusBadge} ${styles.badgeCritical}`}>{risk}</span>;
  }
  if (risk === "Watch") {
    return <span className={`${styles.statusBadge} ${styles.badgeHigh}`}>{risk}</span>;
  }
  return <span className={`${styles.statusBadge} ${styles.badgeMedium}`}>{risk}</span>;
}
