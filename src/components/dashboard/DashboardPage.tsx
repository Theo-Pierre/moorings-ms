"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import mooringsLogo from "@/assets/moorings-logo.png";
import sunsailLogo from "@/assets/sunsail-logo.png";

import type {
  OperationsDashboardData,
  PieSlice,
  ReportBlock,
} from "@/lib/operations-data";

import styles from "./dashboard.module.css";

interface DashboardPageProps {
  data: OperationsDashboardData;
}

type ReportTabKey = "daily" | "weekly" | "monthly";
type ScheduleTabKey = "today" | "tomorrow";

const reportTabLabels: Record<ReportTabKey, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const scheduleTabLabels: Record<ScheduleTabKey, string> = {
  today: "Current Day",
  tomorrow: "Next Day",
};

export function DashboardPage({ data }: DashboardPageProps) {
  const [reportTab, setReportTab] = useState<ReportTabKey>("daily");
  const [scheduleTab, setScheduleTab] = useState<ScheduleTabKey>("today");
  const [fleetQuery, setFleetQuery] = useState("");
  const [pinnedBoat, setPinnedBoat] = useState<string | null>(null);

  const reportData = data.reports[reportTab];
  const scheduleItems = scheduleTab === "today" ? data.todaySchedule : data.tomorrowSchedule;

  const filteredFleet = useMemo(() => {
    const query = fleetQuery.trim().toLowerCase();
    if (!query) {
      return data.fleetRows;
    }

    return data.fleetRows.filter((boat) => {
      return (
        boat.boatName.toLowerCase().includes(query) ||
        boat.stat.toLowerCase().includes(query) ||
        boat.status.toLowerCase().includes(query)
      );
    });
  }, [data.fleetRows, fleetQuery]);

  const pinBoat = (boatName: string) => {
    setPinnedBoat(boatName);

    const isToday = data.todaySchedule.some((item) => item.boatName === boatName);
    setScheduleTab(isToday ? "today" : "tomorrow");

    const scheduleSection = document.getElementById("schedule");
    scheduleSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.dashboardPage}>
      <header className={styles.topNav}>
        <div className={styles.navInner}>
          <a href="#top" className={styles.brandBlock}>
            <Image
              src={mooringsLogo}
              width={130}
              height={72}
              alt="Moorings logo"
              className={styles.mainLogo}
              priority
            />
            <div>
              <p className={styles.siteName}>{data.appName}</p>
              <p className={styles.siteDate}>Ops report date: {data.reportDateLabel}</p>
            </div>
          </a>

          <nav className={styles.navLinks} aria-label="Primary navigation">
            <a href="#schedule" className={styles.navLink}>
              Schedule
            </a>
            <a href="#reports" className={styles.navLink}>
              Reports
            </a>
            <a href="#fleet" className={styles.navLink}>
              Fleet
            </a>
            <a href="#sources" className={styles.navLink}>
              Sources
            </a>
          </nav>

          <div className={styles.partnerLogoWrap}>
            <Image
              src={sunsailLogo}
              width={42}
              height={42}
              alt="Sunsail partner logo"
              className={styles.partnerLogo}
            />
          </div>
        </div>
      </header>

      <main id="top" className={styles.dashboardBody}>
        <section className={styles.heroSection}>
          <div>
            <h1 className={styles.heroTitle}>Moorings Turnaround Command Deck</h1>
            <p className={styles.heroSubtitle}>
              Work plan for {data.reportDateLabel} and {data.nextDateLabel}, generated from previous-day
              turnaround outcomes ({data.previousDateLabel}).
            </p>
          </div>
          <div className={styles.heroBadge}>
            <SailIcon />
            <span>Mobile-ready live operations board</span>
          </div>
        </section>

        <section className={styles.summaryGrid} aria-label="Summary metrics">
          {data.summaryMetrics.map((metric) => (
            <article key={metric.id} className={styles.summaryCard}>
              <div className={styles.summaryHeader}>
                <h2 className={styles.summaryTitle}>{metric.label}</h2>
                <span className={styles.iconPill} aria-hidden="true">
                  <WaveIcon />
                </span>
              </div>
              <p className={styles.summaryValue}>{metric.value}</p>
              <p className={styles.summaryDetail}>{metric.detail}</p>
            </article>
          ))}
        </section>

        <section id="schedule" className={styles.panelCard}>
          <div className={styles.panelHeaderSplit}>
            <div>
              <h2 className={styles.sectionTitle}>Operational Work Schedule</h2>
              <p className={styles.sectionHint}>
                Generated from the imported reports with carryover logic from {data.previousDateLabel}.
              </p>
            </div>
            <div className={styles.tabGroup}>
              {(Object.keys(scheduleTabLabels) as ScheduleTabKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={
                    scheduleTab === key
                      ? `${styles.tabButton} ${styles.tabButtonActive}`
                      : styles.tabButton
                  }
                  onClick={() => setScheduleTab(key)}
                >
                  {scheduleTabLabels[key]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.scheduleGrid}>
            <div className={styles.scheduleList}>
              {scheduleItems.map((item) => (
                <article
                  key={item.id}
                  className={
                    item.boatName === pinnedBoat
                      ? `${styles.scheduleCard} ${styles.scheduleCardPinned}`
                      : styles.scheduleCard
                  }
                >
                  <div className={styles.scheduleTopRow}>
                    <div>
                      <p className={styles.scheduleBoat}>{item.boatName}</p>
                      <p className={styles.scheduleMeta}>
                        {item.source} | {item.stat} | {item.timeWindow}
                      </p>
                    </div>
                    <span
                      className={
                        item.priority === "Critical"
                          ? `${styles.statusBadge} ${styles.badgeCritical}`
                          : item.priority === "High"
                            ? `${styles.statusBadge} ${styles.badgeHigh}`
                            : `${styles.statusBadge} ${styles.badgeMedium}`
                      }
                    >
                      {item.priority}
                    </span>
                  </div>

                  <div className={styles.progressWrap}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${Math.max(item.completionPct, 4)}%` }}
                    />
                  </div>
                  <p className={styles.progressText}>Carryover completion: {item.completionPct}%</p>

                  <p className={styles.scheduleReason}>{item.reason}</p>

                  <div className={styles.roleChipWrap}>
                    {item.focusRoles.map((role) => (
                      <span key={`${item.id}-${role}`} className={styles.roleChip}>
                        {role}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <aside className={styles.startsPanel}>
              <h3 className={styles.sideTitle}>Daily Start Figures</h3>
              <div className={styles.figureList}>
                {data.startsFigures.map((figure) => (
                  <article key={figure.category} className={styles.figureCard}>
                    <p className={styles.figureCategory}>{figure.category}</p>
                    <div className={styles.figureStats}>
                      <span>Noon: {figure.noon}</span>
                      <span>SA/ES: {figure.saEs}</span>
                      <strong>Total: {figure.total}</strong>
                    </div>
                  </article>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section id="reports" className={styles.panelCard}>
          <div className={styles.panelHeaderSplit}>
            <div>
              <h2 className={styles.sectionTitle}>Daily, Weekly, and Monthly Reports</h2>
              <p className={styles.sectionHint}>{reportData.summary}</p>
            </div>
            <div className={styles.tabGroup}>
              {(Object.keys(reportTabLabels) as ReportTabKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={
                    reportTab === key
                      ? `${styles.tabButton} ${styles.tabButtonActive}`
                      : styles.tabButton
                  }
                  onClick={() => setReportTab(key)}
                >
                  {reportTabLabels[key]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.reportGrid}>
            <TrendLineChart report={reportData} />
            <StatusPieChart title={`${reportData.title} Role Status`} slices={reportData.pie} />
          </div>
        </section>

        <section className={styles.panelCard}>
          <h2 className={styles.sectionTitle}>Operational Insights</h2>
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
                <AnchorIcon />
                <p>{insight.message}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="fleet" className={styles.panelCard}>
          <div className={styles.panelHeaderSplit}>
            <div>
              <h2 className={styles.sectionTitle}>Fleet Watchboard</h2>
              <p className={styles.sectionHint}>Filter and pin any boat directly into the work schedule.</p>
            </div>
            <label className={styles.searchWrap}>
              <span className={styles.visuallyHidden}>Search boats</span>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search boat, stat, or status"
                value={fleetQuery}
                onChange={(event) => setFleetQuery(event.target.value)}
              />
            </label>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.fleetTable}>
              <thead>
                <tr>
                  <th>Boat</th>
                  <th>Due Date</th>
                  <th>Stat</th>
                  <th>Completion</th>
                  <th>Risk</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFleet.map((boat) => (
                  <tr key={boat.id}>
                    <td>{boat.boatName}</td>
                    <td>{boat.dueDate}</td>
                    <td>{boat.stat}</td>
                    <td>{boat.completionPct}%</td>
                    <td>
                      <span
                        className={
                          boat.status === "Critical"
                            ? `${styles.statusBadge} ${styles.badgeCritical}`
                            : boat.status === "Watch"
                              ? `${styles.statusBadge} ${styles.badgeHigh}`
                              : `${styles.statusBadge} ${styles.badgeSafe}`
                        }
                      >
                        {boat.status}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionButtons}>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() => pinBoat(boat.boatName)}
                        >
                          Pin to Schedule
                        </button>
                        <a
                          className={styles.actionButtonGhost}
                          href={`https://www.google.com/search?q=${encodeURIComponent(`Moorings ${boat.boatName} yacht`)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Web Lookup
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="sources" className={styles.panelCard}>
          <h2 className={styles.sectionTitle}>Report Sources</h2>
          <p className={styles.sectionHint}>
            Download links below are wired to the exact files imported into this build.
          </p>
          <div className={styles.sourcesList}>
            {data.sources.map((source) => (
              <article key={source.name} className={styles.sourceCard}>
                <div>
                  <p className={styles.sourceName}>{source.name}</p>
                  <p className={styles.sourceMeta}>{source.filePath}</p>
                  <p className={styles.sourceMeta}>{source.note}</p>
                </div>
                <div className={styles.sourceActions}>
                  <span className={styles.recordsBadge}>{source.records} rows</span>
                  <a className={styles.downloadButton} href={source.downloadUrl} download>
                    Download
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function TrendLineChart({ report }: { report: ReportBlock }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const maxJobs = Math.max(...report.points.map((point) => point.jobs), 1);
  const chartPoints = report.points.map((point, index) => {
    const x = chartX(index, report.points.length);
    const jobsPct = (point.jobs / maxJobs) * 100;
    return {
      ...point,
      x,
      jobsY: chartY(jobsPct),
      completionY: chartY(point.completion),
    };
  });

  const jobsPath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.jobsY}`)
    .join(" ");

  const completionPath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.completionY}`)
    .join(" ");

  const activePoint = activeIndex === null ? null : chartPoints[activeIndex];

  return (
    <article className={styles.chartCard}>
      <header className={styles.chartHeader}>
        <h3>{report.title} Trend</h3>
        <p>{report.periodLabel}</p>
      </header>

      <svg viewBox="0 0 640 280" className={styles.chartSvg} role="img" aria-label="Line chart">
        <line x1="48" y1="230" x2="608" y2="230" className={styles.chartAxis} />
        <line x1="48" y1="44" x2="48" y2="230" className={styles.chartAxis} />

        <path d={jobsPath} className={styles.jobsLine} />
        <path d={completionPath} className={styles.completionLine} />

        {chartPoints.map((point, index) => (
          <g
            key={`${point.label}-${index}`}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <circle cx={point.x} cy={point.jobsY} r="5" className={styles.jobsDot} />
            <circle cx={point.x} cy={point.completionY} r="5" className={styles.completionDot} />
            <text x={point.x} y="252" textAnchor="middle" className={styles.chartLabel}>
              {point.label}
            </text>
          </g>
        ))}
      </svg>

      <div className={styles.chartLegend}>
        <span>
          <i className={styles.legendJobs} /> Jobs
        </span>
        <span>
          <i className={styles.legendCompletion} /> Completion %
        </span>
        <span>
          <i className={styles.legendCritical} /> Critical Count
        </span>
      </div>

      {activePoint ? (
        <p className={styles.chartReadout}>
          <strong>{activePoint.label}</strong>: {activePoint.jobs} jobs, {activePoint.completion}%
          completion, {activePoint.critical} critical.
        </p>
      ) : (
        <p className={styles.chartReadout}>Hover chart points for detailed values.</p>
      )}
    </article>
  );
}

function StatusPieChart({ title, slices }: { title: string; slices: PieSlice[] }) {
  const [activeSlice, setActiveSlice] = useState<string | null>(slices[0]?.label ?? null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const gradient = buildConicGradient(slices, total);

  const highlighted = slices.find((slice) => slice.label === activeSlice) ?? slices[0] ?? null;

  return (
    <article className={styles.chartCard}>
      <header className={styles.chartHeader}>
        <h3>{title}</h3>
        <p>Role check status split</p>
      </header>

      <div className={styles.pieWrap}>
        <div className={styles.pie} style={{ background: gradient }} aria-hidden="true" />

        <div className={styles.pieLegend}>
          {slices.map((slice) => {
            const percent = total > 0 ? Math.round((slice.value / total) * 100) : 0;
            return (
              <button
                key={slice.label}
                type="button"
                className={
                  activeSlice === slice.label
                    ? `${styles.pieLegendButton} ${styles.pieLegendButtonActive}`
                    : styles.pieLegendButton
                }
                onMouseEnter={() => setActiveSlice(slice.label)}
                onFocus={() => setActiveSlice(slice.label)}
              >
                <span
                  className={styles.pieSwatch}
                  style={{ backgroundColor: slice.color }}
                  aria-hidden="true"
                />
                <span>{slice.label}</span>
                <strong>{percent}%</strong>
              </button>
            );
          })}
        </div>
      </div>

      {highlighted ? (
        <p className={styles.chartReadout}>
          {highlighted.label}: {highlighted.value} checks ({total > 0 ? Math.round((highlighted.value / total) * 100) : 0}
          %)
        </p>
      ) : (
        <p className={styles.chartReadout}>No status data available.</p>
      )}
    </article>
  );
}

function buildConicGradient(slices: PieSlice[], total: number): string {
  if (total <= 0 || slices.length === 0) {
    return "conic-gradient(#94a3b8 0 100%)";
  }

  let angleCursor = 0;
  const stops: string[] = [];

  for (const slice of slices) {
    const angle = (slice.value / total) * 360;
    const next = angleCursor + angle;
    stops.push(`${slice.color} ${angleCursor}deg ${next}deg`);
    angleCursor = next;
  }

  return `conic-gradient(${stops.join(", ")})`;
}

function chartX(index: number, total: number): number {
  if (total <= 1) {
    return 328;
  }
  const minX = 56;
  const maxX = 600;
  return minX + ((maxX - minX) * index) / (total - 1);
}

function chartY(value: number): number {
  const minY = 44;
  const maxY = 228;
  const clamped = Math.min(Math.max(value, 0), 100);
  return maxY - ((maxY - minY) * clamped) / 100;
}

function SailIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.svgIcon} aria-hidden="true">
      <path d="M12 2v18" />
      <path d="M12 3l7 8h-7z" />
      <path d="M12 8l-6 7h6z" />
      <path d="M3 20h18" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.svgIcon} aria-hidden="true">
      <path d="M2 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
      <path d="M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    </svg>
  );
}

function AnchorIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.svgIcon} aria-hidden="true">
      <circle cx="12" cy="5" r="2.2" />
      <path d="M12 7.5v9" />
      <path d="M8 12c0 4.5 2 7 4 7s4-2.5 4-7" />
      <path d="M6 12H3" />
      <path d="M21 12h-3" />
    </svg>
  );
}
