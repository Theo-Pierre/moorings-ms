"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { OperationsDashboardData } from "@/lib/operations-data";

import { LineChart, PieChart } from "./charts";
import { useManualVesselReports } from "./manual-vessels";
import styles from "./crm.module.css";

type ReportTab = "daily" | "weekly" | "monthly";

interface ReportsPageProps {
  data: OperationsDashboardData;
}

const reportLabel: Record<ReportTab, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function ReportsPage({ data }: ReportsPageProps) {
  const [tab, setTab] = useState<ReportTab>("daily");
  const manualVesselReports = useManualVesselReports();

  const report = data.reports[tab];
  const topVessels = useMemo(() => {
    const scopedManual = manualVesselReports.filter(
      (vessel) => vessel.latestDueDate >= data.reporting.startDateIso,
    );
    return [...scopedManual, ...data.reporting.vesselReports]
      .sort((left, right) => right.qualityScore - left.qualityScore)
      .slice(0, 5);
  }, [data.reporting.startDateIso, data.reporting.vesselReports, manualVesselReports]);
  const topRiggers = useMemo(
    () => [...data.reporting.workerReports.riggers].slice(0, 5),
    [data.reporting.workerReports.riggers],
  );
  const topShipwrights = useMemo(
    () => [...data.reporting.workerReports.shipwrights].slice(0, 5),
    [data.reporting.workerReports.shipwrights],
  );

  return (
    <div className={styles.pageStack}>
      <section className={styles.heroCard}>
        <div>
          <h1 className={styles.pageTitle}>Daily, Weekly, and Monthly Reporting</h1>
          <p className={styles.pageSubtitle}>
            Consolidated report center with line and pie visualizations from the current reporting cycle.
          </p>
        </div>
      </section>

      <section className={styles.panelCard}>
        <div className={styles.panelHeaderSplit}>
          <div>
            <h2 className={styles.sectionTitle}>{reportLabel[tab]} Operations Report</h2>
            <p className={styles.sectionHint}>
              Reporting cycle start: {data.reporting.startDateLabel}. {report.summary}
            </p>
          </div>

          <div className={styles.tabGroup}>
            {(Object.keys(reportLabel) as ReportTab[]).map((key) => (
              <button
                key={key}
                type="button"
                className={tab === key ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
                onClick={() => setTab(key)}
              >
                {reportLabel[key]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.twoCol}>
          <LineChart title={`${reportLabel[tab]} Trend`} subtitle={report.periodLabel} points={report.points} />
          <PieChart
            title={`${reportLabel[tab]} Role Status`}
            subtitle="Completed vs in progress vs pending"
            slices={report.pie}
          />
        </div>
      </section>

      <section className={styles.threeCol}>
        <article className={styles.panelCard}>
          <h2 className={styles.sectionTitle}>Vessel Quality Leaders</h2>
          <p className={styles.sectionHint}>Top-scoring vessels since {data.reporting.startDateLabel}.</p>
          <div className={styles.stackListCompact}>
            {topVessels.length > 0 ? (
              topVessels.map((vessel) => (
                <div key={vessel.id} className={styles.miniRow}>
                  <div>
                    <p className={styles.rowMain}>{vessel.boatName}</p>
                    <p className={styles.rowMeta}>{vessel.assignedRigger} | {vessel.assignedShipwright}</p>
                  </div>
                  <strong>{vessel.qualityScore}%</strong>
                </div>
              ))
            ) : (
              <p className={styles.sectionHint}>No cycle data captured yet.</p>
            )}
          </div>
          <Link href="/vessels" className={styles.inlineLinkButton}>
            Open Vessel Details
          </Link>
        </article>

        <article className={styles.panelCard}>
          <h2 className={styles.sectionTitle}>Rigger Leaderboard</h2>
          <p className={styles.sectionHint}>Best performance by quality score and on-time delivery in this cycle.</p>
          <div className={styles.stackListCompact}>
            {topRiggers.length > 0 ? (
              topRiggers.map((worker) => (
                <div key={worker.id} className={styles.miniRow}>
                  <div>
                    <p className={styles.rowMain}>{worker.workerLabel}</p>
                    <p className={styles.rowMeta}>On-time {worker.onTimeRate}% | Load {worker.plannedLoad}</p>
                  </div>
                  <strong>{worker.qualityScore}%</strong>
                </div>
              ))
            ) : (
              <p className={styles.sectionHint}>No rigger cycle data captured yet.</p>
            )}
          </div>
          <Link href="/riggers" className={styles.inlineLinkButton}>
            Open Rigger Profiles
          </Link>
        </article>

        <article className={styles.panelCard}>
          <h2 className={styles.sectionTitle}>Shipwright Leaderboard</h2>
          <p className={styles.sectionHint}>Shipwright quality score and workload visibility in this cycle.</p>
          <div className={styles.stackListCompact}>
            {topShipwrights.length > 0 ? (
              topShipwrights.map((worker) => (
                <div key={worker.id} className={styles.miniRow}>
                  <div>
                    <p className={styles.rowMain}>{worker.workerLabel}</p>
                    <p className={styles.rowMeta}>On-time {worker.onTimeRate}% | Load {worker.plannedLoad}</p>
                  </div>
                  <strong>{worker.qualityScore}%</strong>
                </div>
              ))
            ) : (
              <p className={styles.sectionHint}>No shipwright cycle data captured yet.</p>
            )}
          </div>
          <Link href="/shipwrights" className={styles.inlineLinkButton}>
            Open Shipwright Profiles
          </Link>
        </article>
      </section>

      <section className={styles.panelCard}>
        <h2 className={styles.sectionTitle}>Report Source Files</h2>
        <p className={styles.sectionHint}>Download the same files feeding this CRM.</p>

        <div className={styles.stackListCompact}>
          {data.sources.map((source) => (
            <article key={source.name} className={styles.sourceRow}>
              <div>
                <p className={styles.rowMain}>{source.name}</p>
                <p className={styles.rowMeta}>{source.filePath}</p>
                <p className={styles.rowMeta}>{source.note}</p>
              </div>
              <div className={styles.inlineActions}>
                <span className={styles.metricPill}>{source.records} rows</span>
                <a className={styles.primaryButton} href={source.downloadUrl} download>
                  Download
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
