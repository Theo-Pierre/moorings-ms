import type { PieSlice, ReportPoint } from "@/lib/operations-data";

import styles from "./crm.module.css";

interface LineChartProps {
  title: string;
  subtitle: string;
  points: ReportPoint[];
}

interface PieChartProps {
  title: string;
  subtitle: string;
  slices: PieSlice[];
}

export function LineChart({ title, subtitle, points }: LineChartProps) {
  const safePoints = points.length > 0 ? points : [{ label: "N/A", jobs: 0, completion: 0, critical: 0 }];
  const maxJobs = Math.max(...safePoints.map((point) => point.jobs), 1);

  const projected = safePoints.map((point, index) => {
    const x = chartX(index, safePoints.length);
    const jobsY = chartY((point.jobs / maxJobs) * 100);
    const completionY = chartY(point.completion);

    return {
      ...point,
      x,
      jobsY,
      completionY,
    };
  });

  const jobsPath = projected
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.jobsY}`)
    .join(" ");
  const completionPath = projected
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.completionY}`)
    .join(" ");

  return (
    <article className={styles.chartCard}>
      <header className={styles.chartHeader}>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>

      <svg viewBox="0 0 640 300" className={styles.chartSvg} role="img" aria-label={title}>
        <line x1="52" y1="244" x2="608" y2="244" className={styles.chartAxis} />
        <line x1="52" y1="48" x2="52" y2="244" className={styles.chartAxis} />

        <path d={jobsPath} className={styles.jobsLine} />
        <path d={completionPath} className={styles.completionLine} />

        {projected.map((point) => (
          <g key={`${point.label}-${point.x}`}>
            <circle cx={point.x} cy={point.jobsY} r="4.8" className={styles.jobsDot} />
            <circle cx={point.x} cy={point.completionY} r="4.8" className={styles.completionDot} />
            <text x={point.x} y="270" textAnchor="middle" className={styles.chartLabel}>
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
          <i className={styles.legendCritical} /> Critical
        </span>
      </div>
    </article>
  );
}

export function PieChart({ title, subtitle, slices }: PieChartProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const gradient = buildConicGradient(slices, total);

  return (
    <article className={styles.chartCard}>
      <header className={styles.chartHeader}>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>

      <div className={styles.pieWrap}>
        <div className={styles.pie} style={{ background: gradient }} aria-hidden="true" />

        <div className={styles.pieLegend}>
          {slices.map((slice) => {
            const percent = total > 0 ? Math.round((slice.value / total) * 100) : 0;
            return (
              <div key={slice.label} className={styles.pieLegendItem}>
                <span className={styles.pieSwatch} style={{ backgroundColor: slice.color }} aria-hidden="true" />
                <span>{slice.label}</span>
                <strong>{percent}%</strong>
              </div>
            );
          })}
        </div>
      </div>
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
    return 330;
  }

  const minX = 60;
  const maxX = 600;
  return minX + ((maxX - minX) * index) / (total - 1);
}

function chartY(value: number): number {
  const minY = 52;
  const maxY = 242;
  const clamped = Math.min(Math.max(value, 0), 100);
  return maxY - ((maxY - minY) * clamped) / 100;
}
