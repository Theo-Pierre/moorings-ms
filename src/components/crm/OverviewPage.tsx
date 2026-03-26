"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { AssignmentPlanItem, OperationsDashboardData } from "@/lib/operations-data";

import { LineChart, PieChart } from "./charts";
import styles from "./crm.module.css";

type SchedulePreviewTab = "today" | "next";

interface OverviewPageProps {
  data: OperationsDashboardData;
}

export function OverviewPage({ data }: OverviewPageProps) {
  const [scheduleTab, setScheduleTab] = useState<SchedulePreviewTab>("today");

  const todayAssignments = useMemo(
    () => data.assignmentPlan.filter((item) => item.source === "Today" || item.source === "Carryover"),
    [data.assignmentPlan],
  );
  const nextAssignments = useMemo(
    () => data.assignmentPlan.filter((item) => item.source === "Tomorrow"),
    [data.assignmentPlan],
  );

  const previewItems = scheduleTab === "today" ? todayAssignments.slice(0, 9) : nextAssignments.slice(0, 9);

  return (
    <div className={styles.pageStack}>
      <section className={styles.heroCard}>
        <div>
          <h1 className={styles.pageTitle}>Moorings Multi-Page CRM Command Deck</h1>
          <p className={styles.pageSubtitle}>
            Planning board for {data.reportDateLabel} and {data.nextDateLabel}, using carryover analysis from {" "}
            {data.previousDateLabel} with assignment-quality balancing for riggers and shipwrights.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/schedule" className={styles.primaryButton}>
            Open Full Schedule
          </Link>
          <Link href="/reports" className={styles.ghostButton}>
            Open Reports
          </Link>
        </div>
      </section>

      <section className={styles.metricGrid}>
        {data.summaryMetrics.map((metric) => (
          <article key={metric.id} className={styles.metricCard}>
            <p className={styles.metricLabel}>{metric.label}</p>
            <p className={styles.metricValue}>{metric.value}</p>
            <p className={styles.metricDetail}>{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className={styles.panelCard}>
        <div className={styles.panelHeaderSplit}>
          <div>
            <h2 className={styles.sectionTitle}>Current + Next Day Assignment Snapshot</h2>
            <p className={styles.sectionHint}>
              Every vessel row includes explicit rigger and shipwright mapping with quality-aware recommendations.
            </p>
          </div>

          <div className={styles.tabGroup}>
            <button
              type="button"
              className={scheduleTab === "today" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
              onClick={() => setScheduleTab("today")}
            >
              Current Day
            </button>
            <button
              type="button"
              className={scheduleTab === "next" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
              onClick={() => setScheduleTab("next")}
            >
              Next Day
            </button>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Vessel</th>
                <th>Priority</th>
                <th>Slot</th>
                <th>Rigger</th>
                <th>Shipwright</th>
                <th>Completion</th>
              </tr>
            </thead>
            <tbody>
              {previewItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <p className={styles.rowMain}>{item.boatName}</p>
                    <p className={styles.rowMeta}>{item.source} | {item.stat}</p>
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.twoCol}>
        <LineChart
          title="Daily Operations Trend"
          subtitle={data.reports.daily.periodLabel}
          points={data.reports.daily.points}
        />
        <PieChart
          title="Daily Role Status"
          subtitle="Across imported turnaround checks"
          slices={data.reports.daily.pie}
        />
      </section>

      <section className={styles.panelCard}>
        <div className={styles.panelHeaderSplit}>
          <div>
            <h2 className={styles.sectionTitle}>Operational Insights</h2>
            <p className={styles.sectionHint}>Automatically generated from previous-day results and upcoming load.</p>
          </div>
          <Link href="/vessels" className={styles.inlineLinkButton}>
            Vessel Quality View
          </Link>
        </div>

        <div className={styles.insightGrid}>
          {data.insights.map((insight, index) => (
            <article
              key={`${insight.message}-${index}`}
              className={
                insight.tone === "critical"
                  ? `${styles.insightCard} ${styles.insightCritical}`
                  : insight.tone === "warning"
                    ? `${styles.insightCard} ${styles.insightWarning}`
                    : insight.tone === "positive"
                      ? `${styles.insightCard} ${styles.insightPositive}`
                      : `${styles.insightCard} ${styles.insightNeutral}`
              }
            >
              <p>{insight.message}</p>
            </article>
          ))}
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
