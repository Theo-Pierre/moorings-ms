"use client";

import Link from "next/link";

import type {
  AssignmentPlanItem,
  CharterPriorityLevel,
  DailyPlanningSnapshot,
  FleetRow,
  OperationsDashboardData,
} from "@/lib/operations-data";

import styles from "./crm.module.css";

interface OverviewPageProps {
  data: OperationsDashboardData;
}

export function OverviewPage({ data }: OverviewPageProps) {
  const tomorrowAssignments = data.assignmentPlan
    .filter((item) => item.source === "Tomorrow")
    .slice(0, 8);
  const fleetPreview = data.fleetRows.slice(0, 12);
  const intelligenceItems = [...data.planningEngine.alerts, ...data.planningEngine.recommendations].slice(
    0,
    8,
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
          tone={data.operationalNarrative.yesterday.missedBoats > 0 ? "warning" : "positive"}
          story={data.operationalNarrative.yesterday}
        />
        <NarrativeCard
          title="Today"
          tone={data.planningEngine.today.status === "shortage" ? "warning" : "positive"}
          story={data.operationalNarrative.today}
        />
        <NarrativeCard
          title="Tomorrow (Primary Focus)"
          tone={data.planningEngine.tomorrow.status === "shortage" ? "critical" : "positive"}
          story={data.operationalNarrative.tomorrow}
        />
      </section>

      <section className={styles.engineLayout}>
        <article className={styles.panelCard}>
          <div className={styles.panelHeaderSplit}>
            <div>
              <h2 className={styles.sectionTitle}>Tomorrow Planning Engine</h2>
              <p className={styles.sectionHint}>
                Demand: {data.planningEngine.tomorrow.demandBoats} boats | Bottleneck:{" "}
                {data.planningEngine.tomorrow.bottleneckRole} | Role-balanced capacity:{" "}
                {data.planningEngine.tomorrow.totalCapacityBoats}
              </p>
            </div>
          </div>

          <RoleCapacityTable snapshot={data.planningEngine.tomorrow} />

          <div className={styles.engineAssignmentBlock}>
            <h3 className={styles.sectionTitle}>Tomorrow Vessel Focus</h3>
            <p className={styles.sectionHint}>
              Owner-priority charters are highlighted and should be assigned first.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Vessel</th>
                    <th>Priority</th>
                    <th>Rigger</th>
                    <th>Shipwright</th>
                    <th>Slot</th>
                  </tr>
                </thead>
                <tbody>
                  {tomorrowAssignments.map((item) => (
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
                        <p className={styles.rowMain}>{item.rigger.workerLabel}</p>
                        <p className={styles.rowMeta}>{item.rigger.assignmentState}</p>
                      </td>
                      <td>
                        <p className={styles.rowMain}>{item.shipwright.workerLabel}</p>
                        <p className={styles.rowMeta}>{item.shipwright.assignmentState}</p>
                      </td>
                      <td>{item.timeWindow}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </article>

        <aside className={`${styles.panelCard} ${styles.intelligenceRail}`}>
          <h2 className={styles.sectionTitle}>System Intelligence</h2>
          <p className={styles.sectionHint}>
            Recommendations and warnings generated from role-capacity calculations.
          </p>
          <div className={styles.insightGrid}>
            {intelligenceItems.map((message, index) => (
              <article
                key={`${message}-${index}`}
                className={
                  message.startsWith("⚠️")
                    ? `${styles.insightCard} ${styles.insightCritical}`
                    : message.startsWith("💡")
                      ? `${styles.insightCard} ${styles.insightNeutral}`
                      : `${styles.insightCard} ${styles.insightPositive}`
                }
              >
                <p>{message}</p>
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
}) {
  return (
    <article
      className={
        input.tone === "critical"
          ? `${styles.narrativeCard} ${styles.narrativeCritical}`
          : input.tone === "warning"
            ? `${styles.narrativeCard} ${styles.narrativeWarning}`
            : `${styles.narrativeCard} ${styles.narrativePositive}`
      }
    >
      <p className={styles.narrativeLabel}>{input.title}</p>
      <p className={styles.narrativeHeadline}>{input.story.workloadVsCapacity}</p>
      <p className={styles.narrativeMeta}>
        Completed {input.story.completedBoats} | Missed {input.story.missedBoats}
      </p>
      <p className={styles.narrativeBody}>{input.story.narrative}</p>
    </article>
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
