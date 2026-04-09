"use client";

import Link from "next/link";
import { useMemo } from "react";

import type {
  AssignmentPlanItem,
  CharterPriorityLevel,
  DailyPlanningSnapshot,
  FleetRow,
  OperationsDashboardData,
} from "@/lib/operations-data";

import {
  applyVesselOverridesToAssignmentRows,
  applyVesselOverridesToFleetRows,
  useManualAssignmentRows,
  useManualFleetRows,
  useVesselOverrides,
} from "./manual-vessels";
import { useSharedTaskState } from "./shared-task-state";
import styles from "./crm.module.css";

interface OverviewPageProps {
  data: OperationsDashboardData;
}

export function OverviewPage({ data }: OverviewPageProps) {
  const manualAssignmentRows = useManualAssignmentRows();
  const manualFleetRows = useManualFleetRows();
  const vesselOverrides = useVesselOverrides();

  const assignmentRows = useMemo(() => {
    const merged = [...manualAssignmentRows, ...data.assignmentPlan];
    return applyVesselOverridesToAssignmentRows(merged, vesselOverrides);
  }, [manualAssignmentRows, data.assignmentPlan, vesselOverrides]);
  const fleetRows = useMemo(() => {
    const merged = [...manualFleetRows, ...data.fleetRows];
    return applyVesselOverridesToFleetRows(merged, vesselOverrides);
  }, [manualFleetRows, data.fleetRows, vesselOverrides]);
  const { taskState } = useSharedTaskState(
    data.reportDateIso,
    assignmentRows,
  );
  const nextOperationalIso = useMemo(
    () => toIsoDate(addDays(parseIsoDate(data.reportDateIso), 1)),
    [data.reportDateIso],
  );

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

  const yesterdayRows = useMemo(
    () => assignmentRows.filter((item) => item.source === "Yesterday"),
    [assignmentRows],
  );
  const todayRows = useMemo(
    () =>
      effectiveExecutionRows.filter(
        (item) =>
          item.dueDate === data.reportDateIso &&
          (item.source === "Today" || item.source === "Carryover"),
      ),
    [data.reportDateIso, effectiveExecutionRows],
  );
  const tomorrowRows = useMemo(
    () =>
      effectiveExecutionRows.filter(
        (item) =>
          item.dueDate === nextOperationalIso &&
          (item.source === "Tomorrow" || item.source === "Carryover"),
      ),
    [effectiveExecutionRows, nextOperationalIso],
  );

  const openTodayCount = useMemo(
    () => todayRows.filter((item) => !taskState[item.id]).length,
    [todayRows, taskState],
  );
  const openTomorrowCount = useMemo(
    () => tomorrowRows.filter((item) => !taskState[item.id]).length,
    [tomorrowRows, taskState],
  );

  const liveTodaySnapshot = useMemo(
    () => buildLivePlanningSnapshot(data.planningEngine.today, openTodayCount),
    [data.planningEngine.today, openTodayCount],
  );
  const liveTomorrowSnapshot = useMemo(
    () => buildLivePlanningSnapshot(data.planningEngine.tomorrow, openTomorrowCount),
    [data.planningEngine.tomorrow, openTomorrowCount],
  );

  const liveNarrative = useMemo(
    () => ({
      yesterday: buildLiveNarrativeStory({
        sourceStory: data.operationalNarrative.yesterday,
        rows: yesterdayRows,
        taskState,
        workloadVsCapacity: `${yesterdayRows.length} scheduled | ${countDone(yesterdayRows, taskState)} completed`,
      }),
      today: buildLiveNarrativeStory({
        sourceStory: data.operationalNarrative.today,
        rows: todayRows,
        taskState,
        workloadVsCapacity: `${openTodayCount} boats vs ${liveTodaySnapshot.totalCapacityBoats} role-balanced capacity`,
      }),
      tomorrow: buildLiveNarrativeStory({
        sourceStory: data.operationalNarrative.tomorrow,
        rows: tomorrowRows,
        taskState,
        workloadVsCapacity: `${openTomorrowCount} boats vs ${liveTomorrowSnapshot.totalCapacityBoats} role-balanced capacity`,
      }),
    }),
    [
      data.operationalNarrative.yesterday,
      data.operationalNarrative.today,
      data.operationalNarrative.tomorrow,
      liveTodaySnapshot.totalCapacityBoats,
      liveTomorrowSnapshot.totalCapacityBoats,
      openTodayCount,
      openTomorrowCount,
      taskState,
      todayRows,
      tomorrowRows,
      yesterdayRows,
    ],
  );

  const todayAssignments = todayRows
    .filter((item) => !taskState[item.id])
    .slice(0, 8);
  const fleetPreview = fleetRows.slice(0, 12);
  const liveAlerts = useMemo(
    () => buildLiveAlerts(liveTodaySnapshot, liveTomorrowSnapshot),
    [liveTodaySnapshot, liveTomorrowSnapshot],
  );
  const liveRecommendations = useMemo(
    () => buildLiveRecommendations(liveTodaySnapshot, liveTomorrowSnapshot),
    [liveTodaySnapshot, liveTomorrowSnapshot],
  );
  const importantSummary = useMemo(
    () => buildImportantSummary(liveAlerts, liveRecommendations),
    [liveAlerts, liveRecommendations],
  );

  return (
    <div className={styles.pageStack}>
      <section className={styles.heroCard}>
        <div>
          <h1 className={styles.pageTitle}>Moorings Power Planning Intelligence Engine</h1>
          <p className={styles.pageSubtitle}>
            This system auto-evaluates demand, staffing capacity, and charter priority for {data.reportDateLabel} and{" "}
            {data.nextDateLabel}. It highlights shortages and recommendations before dispatch decisions are made.
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/schedule" className={styles.primaryButton}>
            Open Execution Plan
          </Link>
          <Link href="/reports" className={styles.ghostButton}>
            Open Report Center
          </Link>
        </div>
      </section>

      <section className={styles.narrativeGrid}>
        <NarrativeCard
          title="Yesterday"
          tone={liveNarrative.yesterday.missedBoats > 0 ? "warning" : "positive"}
          story={liveNarrative.yesterday}
          href="/schedule?view=yesterday"
        />
        <NarrativeCard
          title="Today"
          tone={liveTodaySnapshot.status === "shortage" ? "warning" : "positive"}
          story={liveNarrative.today}
          href="/schedule?view=today"
        />
        <NarrativeCard
          title="Tomorrow (Primary Focus)"
          tone={liveTomorrowSnapshot.status === "shortage" ? "critical" : "positive"}
          story={liveNarrative.tomorrow}
          href="/schedule?view=tomorrow"
        />
      </section>

      <section className={styles.engineLayout}>
        <article className={styles.panelCard}>
          <div className={styles.panelHeaderSplit}>
            <div>
              <h2 className={styles.sectionTitle}>Today Planning Engine</h2>
              <p className={styles.sectionHint}>
                Demand now: {liveTodaySnapshot.demandBoats} boats | Bottleneck:{" "}
                {liveTodaySnapshot.bottleneckRole} | Role-balanced capacity:{" "}
                {liveTodaySnapshot.totalCapacityBoats}
              </p>
            </div>
          </div>

          <RoleCapacityTable snapshot={liveTodaySnapshot} />

          <div className={styles.engineAssignmentBlock}>
            <h3 className={styles.sectionTitle}>Today Vessel Focus</h3>
            <p className={styles.sectionHint}>
              Owner-priority charters are highlighted and should be assigned first.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Vessel</th>
                    <th>Priority</th>
                    <th>Technician</th>
                    <th>Rigger</th>
                    <th>Shipwright</th>
                    <th>Slot</th>
                  </tr>
                </thead>
                <tbody>
                  {todayAssignments.length > 0 ? (
                    todayAssignments.map((item) => (
                      <tr key={item.id} className={priorityRowClass(item.charterPriority)}>
                        <td>
                          <p className={styles.rowMain}>{item.boatName}</p>
                          <p className={styles.rowMeta}>
                            {item.stat}
                            {item.charterPriorityFlag ? ` | Charter ${item.charterPriorityFlag}` : ""}
                          </p>
                        </td>
                        <td>
                          <PriorityBadge priority={item.priority} />
                        </td>
                        <td>
                          <p className={styles.rowMain}>{item.technician.workerLabel}</p>
                          <p className={styles.rowMeta}>{item.technician.assignmentState}</p>
                        </td>
                        <td>
                          <p className={styles.rowMain}>{item.rigger.workerLabel}</p>
                          <p className={styles.rowMeta}>{item.rigger.assignmentState}</p>
                        </td>
                        <td>
                          <p className={styles.rowMain}>{item.shipwright.workerLabel}</p>
                          <p className={styles.rowMeta}>{item.shipwright.assignmentState}</p>
                        </td>
                        <td>{item.timeWindow}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <p className={styles.rowMain}>No open vessels in today focus.</p>
                        <p className={styles.rowMeta}>All currently tracked today tasks are marked complete.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </article>

        <aside className={`${styles.panelCard} ${styles.intelligenceRail}`}>
          <h2 className={styles.sectionTitle}>Important Summary</h2>
          <p className={styles.sectionHint}>
            Clear action cues for today and tomorrow from capacity and completion trends.
          </p>

          <div className={styles.summaryBlocks}>
            {importantSummary.map((block) => (
              <article key={block.title} className={styles.insightCard}>
                <p className={styles.summaryBlockTitle}>{block.title}</p>
                <ul className={styles.summaryList}>
                  {block.items.map((item) => (
                    <li key={`${block.title}-${item}`}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className={styles.panelCard}>
        <div className={styles.panelHeaderSplit}>
          <div>
            <h2 className={styles.sectionTitle}>Fleet Overview</h2>
            <p className={styles.sectionHint}>Secondary view of at-risk vessels and completion posture.</p>
          </div>
          <Link href="/vessels" className={styles.inlineLinkButton}>
            Open Full Fleet View
          </Link>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Vessel</th>
                <th>Due</th>
                <th>Status</th>
                <th>Completion</th>
                <th>Pending Roles</th>
              </tr>
            </thead>
            <tbody>
              {fleetPreview.map((vessel) => (
                <tr key={vessel.id} className={priorityRowClass(vessel.charterPriority)}>
                  <td>
                    <p className={styles.rowMain}>{vessel.boatName}</p>
                    <p className={styles.rowMeta}>
                      {vessel.stat}
                      {vessel.charterPriorityFlag ? ` | Charter ${vessel.charterPriorityFlag}` : ""}
                    </p>
                  </td>
                  <td>{formatIsoForLabel(vessel.dueDate)}</td>
                  <td>
                    <RiskBadge risk={vessel.status} />
                  </td>
                  <td>{vessel.completionPct}%</td>
                  <td>{vessel.pendingRoles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NarrativeCard(input: {
  title: string;
  tone: "positive" | "warning" | "critical";
  story: OperationsDashboardData["operationalNarrative"]["yesterday"];
  href: string;
}) {
  return (
    <Link
      href={input.href}
      className={
        input.tone === "critical"
          ? `${styles.narrativeCard} ${styles.narrativeActionCard} ${styles.narrativeCritical}`
          : input.tone === "warning"
            ? `${styles.narrativeCard} ${styles.narrativeActionCard} ${styles.narrativeWarning}`
            : `${styles.narrativeCard} ${styles.narrativeActionCard} ${styles.narrativePositive}`
      }
    >
      <p className={styles.narrativeLabel}>{input.title}</p>
      <p className={styles.narrativeHeadline}>{input.story.workloadVsCapacity}</p>
      <p className={styles.narrativeMeta}>
        Completed {input.story.completedBoats} | Missed {input.story.missedBoats}
      </p>
      <p className={styles.narrativeBody}>{input.story.narrative}</p>
      <span className={styles.narrativeActionText}>Open {input.title} schedule →</span>
    </Link>
  );
}

function RoleCapacityTable({ snapshot }: { snapshot: DailyPlanningSnapshot }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>Role</th>
            <th>Available / Total</th>
            <th>Capacity</th>
            <th>Demand</th>
            <th>Shortage</th>
            <th>Surplus</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.roles.map((role) => (
            <tr key={`${snapshot.dateIso}-${role.roleKey}`}>
              <td>
                <p className={styles.rowMain}>{role.roleLabel}</p>
                <p className={styles.rowMeta}>
                  {role.offWorkers} off-day
                  {role.offWorkers === 1 ? "" : "s"}
                </p>
              </td>
              <td>
                {role.availableWorkers} / {role.totalWorkers}
              </td>
              <td>{role.capacity}</td>
              <td>{role.demand}</td>
              <td>
                {role.shortageWorkers > 0 ? (
                  <span className={`${styles.statusBadge} ${styles.badgeCritical}`}>
                    {role.shortageWorkers} {role.shortageWorkers === 1 ? "worker" : "workers"}
                  </span>
                ) : (
                  <span className={`${styles.statusBadge} ${styles.badgeMedium}`}>0</span>
                )}
              </td>
              <td>{role.surplusBoats}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskBadge({ risk }: { risk: FleetRow["status"] }) {
  if (risk === "Critical") {
    return <span className={`${styles.statusBadge} ${styles.badgeCritical}`}>{risk}</span>;
  }
  if (risk === "Watch") {
    return <span className={`${styles.statusBadge} ${styles.badgeHigh}`}>{risk}</span>;
  }
  return <span className={`${styles.statusBadge} ${styles.badgeMedium}`}>{risk}</span>;
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

function priorityRowClass(priority: CharterPriorityLevel): string {
  if (priority === "owner") {
    return styles.priorityOwnerRow;
  }
  if (priority === "ownerBerth") {
    return styles.priorityOwnerBerthRow;
  }
  return "";
}

function formatIsoForLabel(dateIso: string): string {
  const parts = dateIso.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return dateIso;
  }
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function buildImportantSummary(alerts: string[], recommendations: string[]) {
  const technical: string[] = [];
  const support: string[] = [];
  const action: string[] = [];
  const all = [...alerts, ...recommendations].map(cleanSummaryMessage).filter(Boolean);

  for (const message of all) {
    const lower = message.toLowerCase();
    if (
      lower.includes("technician") ||
      lower.includes("rigger") ||
      lower.includes("shipwright") ||
      lower.includes("ac tech") ||
      lower.includes("workforce") ||
      lower.includes("capacity")
    ) {
      technical.push(message);
      continue;
    }
    if (
      lower.includes("call in") ||
      lower.includes("hire") ||
      lower.includes("maintenance") ||
      lower.includes("spare")
    ) {
      support.push(message);
      continue;
    }
    action.push(message);
  }

  return [
    {
      title: "Technical Feedback",
      items: technical.slice(0, 3).length ? technical.slice(0, 3) : ["No technical shortages flagged right now."],
    },
    {
      title: "Support Feedback",
      items: support.slice(0, 3).length ? support.slice(0, 3) : ["No support call-ins required at the moment."],
    },
    {
      title: "Action Focus",
      items: action.slice(0, 3).length ? action.slice(0, 3) : ["Keep today's execution on track to improve tomorrow output."],
    },
  ];
}

function cleanSummaryMessage(value: string): string {
  const withoutEmoji = value.replace(/^[^\w]+/u, "").trim();
  if (!withoutEmoji) {
    return "";
  }
  return withoutEmoji
    .replace(/role-balanced capacity/gi, "capacity")
    .replace(/workforce is sufficient/gi, "workforce is sufficient for target demand")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeBoatKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}

function countDone(rows: AssignmentPlanItem[], taskState: Record<string, true>): number {
  return rows.reduce((count, row) => (taskState[row.id] ? count + 1 : count), 0);
}

function buildLivePlanningSnapshot(
  base: DailyPlanningSnapshot,
  demandBoats: number,
): DailyPlanningSnapshot {
  const roles = base.roles.map((role) => {
    const capacity = role.availableWorkers * role.perWorkerCapacity;
    const shortageBoats = Math.max(demandBoats - capacity, 0);
    const shortageWorkers =
      shortageBoats > 0 ? Math.ceil(shortageBoats / role.perWorkerCapacity) : 0;

    return {
      ...role,
      capacity,
      demand: demandBoats,
      shortageBoats,
      shortageWorkers,
      surplusBoats: Math.max(capacity - demandBoats, 0),
    };
  });

  const totalCapacityBoats = roles.length > 0 ? Math.min(...roles.map((role) => role.capacity)) : 0;
  const bottleneckRole =
    roles.length > 0
      ? [...roles].sort((left, right) => left.capacity - right.capacity)[0]?.roleLabel ?? "N/A"
      : "N/A";
  const hasShortage = roles.some((role) => role.shortageWorkers > 0);
  const hasSurplus = roles.some((role) => role.surplusBoats >= role.perWorkerCapacity);

  return {
    ...base,
    demandBoats,
    roles,
    totalCapacityBoats,
    bottleneckRole,
    status: hasShortage ? "shortage" : hasSurplus ? "surplus" : "sufficient",
  };
}

function buildLiveNarrativeStory(input: {
  sourceStory: OperationsDashboardData["operationalNarrative"]["today"];
  rows: AssignmentPlanItem[];
  taskState: Record<string, true>;
  workloadVsCapacity: string;
}): OperationsDashboardData["operationalNarrative"]["today"] {
  const completed = countDone(input.rows, input.taskState);
  const open = Math.max(0, input.rows.length - completed);
  const todayIso = toIsoDate(new Date());
  const isPastDate = input.sourceStory.dateIso < todayIso;
  const missed = isPastDate ? open : 0;
  const completionRate =
    input.rows.length > 0 ? Math.round((completed / input.rows.length) * 100) : 0;

  const narrative =
    open > 0
      ? `${completed} completed, ${open} still open for ${input.sourceStory.dateLabel}.`
      : `All tracked work for ${input.sourceStory.dateLabel} is completed.`;

  return {
    ...input.sourceStory,
    demandBoats: open,
    completedBoats: completed,
    inProgressBoats: open,
    missedBoats: missed,
    completionRate,
    workloadVsCapacity: input.workloadVsCapacity,
    narrative,
  };
}

function buildLiveAlerts(
  today: DailyPlanningSnapshot,
  tomorrow: DailyPlanningSnapshot,
): string[] {
  const alerts: string[] = [];
  for (const snapshot of [today, tomorrow]) {
    if (snapshot.status !== "shortage") {
      continue;
    }
    const gap = snapshot.roles
      .filter((role) => role.shortageWorkers > 0)
      .map((role) => `${role.shortageWorkers} ${pluralizeRole(role.roleLabel, role.shortageWorkers)}`)
      .join(", ");
    alerts.push(`⚠️ ${snapshot.dateLabel}: ${gap}.`);
  }
  return alerts;
}

function buildLiveRecommendations(
  today: DailyPlanningSnapshot,
  tomorrow: DailyPlanningSnapshot,
): string[] {
  const recommendations: string[] = [];

  if (today.status === "shortage") {
    for (const role of today.roles.filter((item) => item.shortageWorkers > 0)) {
      recommendations.push(
        `⚠️ Short ${role.shortageWorkers} ${pluralizeRole(role.roleLabel, role.shortageWorkers)} for ${today.dateLabel}.`,
      );
    }
  } else {
    recommendations.push(`✅ Workforce sufficient for ${today.dateLabel}.`);
  }

  if (tomorrow.status === "shortage") {
    for (const role of tomorrow.roles.filter((item) => item.shortageWorkers > 0)) {
      recommendations.push(
        `⚠️ Short ${role.shortageWorkers} ${pluralizeRole(role.roleLabel, role.shortageWorkers)} for ${tomorrow.dateLabel}.`,
      );
    }
  } else {
    recommendations.push(`✅ Workforce sufficient for ${tomorrow.dateLabel}.`);
  }

  return recommendations.slice(0, 8);
}

function pluralizeRole(roleLabel: string, count: number): string {
  if (count === 1) {
    return roleLabel.toLowerCase();
  }
  if (roleLabel === "AC Tech") {
    return "AC techs";
  }
  return `${roleLabel.toLowerCase()}s`;
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

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
