import "server-only";

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

import { listDailyCallInLabelsByDate } from "./daily-callins";
import { getPlanningDateOverride } from "./planning-date-override";
import { listCanonicalTaskCompletions } from "./schedule-task-state";
import { listTeamOverrides, type TeamOverrideRecord } from "./team-overrides";

type RoleStatus = 0 | 1 | 2;

type Priority = "Critical" | "High" | "Medium";
type AssignmentSource = "Yesterday" | "Carryover" | "Today" | "Tomorrow" | "Next Week";
export type CharterPriorityLevel = "owner" | "ownerBerth" | "none";
export type CharterPriorityFlag = "O" | "OB" | null;

export interface SummaryMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
}

export interface StartFigure {
  category: string;
  noon: number;
  saEs: number;
  total: number;
}

export interface ScheduleItem {
  id: string;
  boatName: string;
  size: string;
  stat: string;
  priority: Priority;
  source: AssignmentSource;
  focusRoles: string[];
  completionPct: number;
  dueDate: string;
  timeWindow: string;
  reason: string;
}

export interface FleetRow {
  id: string;
  boatName: string;
  dueDate: string;
  stat: string;
  completionPct: number;
  pendingRoles: number;
  status: "Critical" | "Watch" | "On track";
  charterPriority: CharterPriorityLevel;
  charterPriorityFlag: CharterPriorityFlag;
  detailLink: string | null;
}

export interface ReportPoint {
  label: string;
  jobs: number;
  completion: number;
  critical: number;
}

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

export interface ReportBlock {
  title: string;
  periodLabel: string;
  summary: string;
  points: ReportPoint[];
  pie: PieSlice[];
}

export interface InsightItem {
  tone: "positive" | "warning" | "critical" | "neutral";
  message: string;
}

export interface SourceReference {
  name: string;
  filePath: string;
  downloadUrl: string;
  records: number;
  note: string;
}

export interface AssignedWorker {
  workerId: number | null;
  workerLabel: string;
  assignmentState: "Assigned" | "Recommended" | "Unassigned";
  qualityScore: number;
  plannedLoad: number;
}

export interface AssignmentPlanItem {
  id: string;
  boatName: string;
  stat: string;
  source: AssignmentSource;
  dueDate: string;
  dueDateLabel: string;
  departureDate: string;
  departureDateLabel: string;
  plannedArrivalDate: string | null;
  plannedArrivalDateLabel: string | null;
  plannedArrivalTime: string | null;
  daysUntilDeparture: number;
  timeWindow: string;
  priority: Priority;
  completionPct: number;
  charterPriority: CharterPriorityLevel;
  charterPriorityFlag: CharterPriorityFlag;
  technician: AssignedWorker;
  rigger: AssignedWorker;
  shipwright: AssignedWorker;
  rationale: string;
}

export interface VesselQualityReport {
  id: string;
  boatName: string;
  boatLink: string | null;
  stat: string;
  latestDueDate: string;
  currentCompletionPct: number;
  averageCompletionPct: number;
  totalTurnarounds: number;
  lateTurnarounds: number;
  criticalTurnarounds: number;
  qualityScore: number;
  risk: "Critical" | "Watch" | "On track";
  charterPriority: CharterPriorityLevel;
  charterPriorityFlag: CharterPriorityFlag;
  assignedTechnician: string;
  assignedRigger: string;
  assignedShipwright: string;
  pendingRoles: string[];
  trend: ReportPoint[];
  pie: PieSlice[];
  note: string;
}

export interface WorkerQualityReport {
  id: string;
  workerId: number;
  workerLabel: string;
  role: "Technician" | "Rigger" | "Shipwright" | "AC Tech";
  assignments: number;
  completed: number;
  inProgress: number;
  pending: number;
  lateAssignments: number;
  onTimeRate: number;
  averageVesselCompletionPct: number;
  qualityScore: number;
  plannedLoad: number;
  vessels: string[];
  trend: ReportPoint[];
  pie: PieSlice[];
}

export type WorkforceRoleKey = "technicians" | "riggers" | "shipwrights" | "acTechs";

export interface RoleCapacitySnapshot {
  roleKey: WorkforceRoleKey;
  roleLabel: "Technician" | "Rigger" | "Shipwright" | "AC Tech";
  perWorkerCapacity: number;
  totalWorkers: number;
  availableWorkers: number;
  offWorkers: number;
  availableWorkerNames: string[];
  capacity: number;
  demand: number;
  shortageBoats: number;
  shortageWorkers: number;
  surplusBoats: number;
}

export interface DailyPlanningSnapshot {
  dateIso: string;
  dateLabel: string;
  demandBoats: number;
  bottleneckRole: string;
  totalCapacityBoats: number;
  status: "shortage" | "sufficient" | "surplus";
  roles: RoleCapacitySnapshot[];
  recommendations: string[];
}

export interface OperationalStoryBlock {
  dateIso: string;
  dateLabel: string;
  demandBoats: number;
  completedBoats: number;
  inProgressBoats: number;
  missedBoats: number;
  completionRate: number;
  workloadVsCapacity: string;
  narrative: string;
}

export interface PlanningEngineData {
  today: DailyPlanningSnapshot;
  tomorrow: DailyPlanningSnapshot;
  horizon: DailyPlanningSnapshot[];
  recommendations: string[];
  alerts: string[];
}

export interface DailyApprovalData {
  dateIso: string;
  dateLabel: string;
  demandBoats: number;
  assignedBoats: number;
  shortages: Array<{
    roleKey: WorkforceRoleKey;
    roleLabel: string;
    neededWorkers: number;
    candidateWorkers: string[];
  }>;
  assignments: Array<{
    vessel: string;
    technician: string;
    rigger: string;
    shipwright: string;
    priority: Priority;
    source: AssignmentSource;
  }>;
}

export interface OperationsDashboardData {
  appName: string;
  reportDateIso: string;
  reportDateLabel: string;
  planningDateOverride: {
    active: boolean;
    dateIso: string | null;
    dateLabel: string | null;
    updatedBy: string | null;
  };
  previousDateLabel: string;
  nextDateLabel: string;
  summaryMetrics: SummaryMetric[];
  startsFigures: StartFigure[];
  todaySchedule: ScheduleItem[];
  tomorrowSchedule: ScheduleItem[];
  reports: {
    daily: ReportBlock;
    weekly: ReportBlock;
    monthly: ReportBlock;
  };
  reporting: {
    startDateIso: string;
    startDateLabel: string;
    vesselReports: VesselQualityReport[];
    workerReports: {
      technicians: WorkerQualityReport[];
      riggers: WorkerQualityReport[];
      shipwrights: WorkerQualityReport[];
      acTechs: WorkerQualityReport[];
    };
  };
  fleetRows: FleetRow[];
  insights: InsightItem[];
  assignmentPlan: AssignmentPlanItem[];
  vesselReports: VesselQualityReport[];
  operationalNarrative: {
    yesterday: OperationalStoryBlock;
    today: OperationalStoryBlock;
    tomorrow: OperationalStoryBlock;
  };
  planningEngine: PlanningEngineData;
  dailyApproval: DailyApprovalData;
  workerReports: {
    technicians: WorkerQualityReport[];
    riggers: WorkerQualityReport[];
    shipwrights: WorkerQualityReport[];
    acTechs: WorkerQualityReport[];
  };
  teamRoster: {
    members: Array<{
      id: string;
      roleKey: WorkforceRoleKey;
      roleLabel: string;
      positionLabel: string;
      label: string;
      daysOff: string[];
      onLeave: boolean;
      backAtWorkDateIso: string | null;
      availableToday: boolean;
      availableTomorrow: boolean;
      todayVessels: string[];
    }>;
    previousMembers: Array<{
      id: string;
      roleKey: WorkforceRoleKey;
      roleLabel: string;
      positionLabel: string;
      label: string;
      daysOff: string[];
      removedAtMs: number;
    }>;
    availability: {
      today: Record<WorkforceRoleKey, number>;
      tomorrow: Record<WorkforceRoleKey, number>;
    };
  };
  sources: SourceReference[];
}

interface RoleState {
  key: string;
  label: string;
  status: RoleStatus;
  assigneeId: number;
  updatedAtIso: string | null;
}

interface TurnaroundEntry {
  id: string;
  dateIso: string;
  sourceDateIso: string;
  departureDateIso: string;
  plannedArrivalDateIso: string | null;
  plannedArrivalTime: string | null;
  daysUntilDeparture: number;
  stat: string;
  boatName: string;
  boatLink: string | null;
  roleStates: RoleState[];
  completionPct: number;
  completedRoles: number;
  pendingRoles: number;
  inProgressRoles: number;
  charterPriority: CharterPriorityLevel;
  charterPriorityFlag: CharterPriorityFlag;
  charterer: string;
}

interface CurrentDayMovement {
  dateIso?: string;
  stat?: string;
  section: string;
  type: "end" | "start";
  boatName: string;
  size: string;
  contract: string;
  pax: number;
  charterer: string;
  time: string;
}

interface CurrentDayData {
  reportDate: Date;
  startsFigures: StartFigure[];
  movements: CurrentDayMovement[];
}

const bundledDriveDataDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "drive");
const runtimeDriveDataDir =
  process.env.MOORINGS_RUNTIME_DATA_DIR?.trim() ||
  path.join("/tmp", "moorings-ms", "drive-cache");
const fleetScheduleWorkbookPath = path.join(bundledDriveDataDir, "fleet_schedule_example.xlsm");
const dashboardCacheIntervalMs = clampNumber(
  Number(process.env.MOORINGS_DASHBOARD_CACHE_SECONDS || "5"),
  5,
  3600,
) * 1000;
const maxDailySheetRows = clampNumber(
  Number(process.env.MOORINGS_MAX_DAILY_SHEET_ROWS || "20000"),
  12000,
  60000,
);
const maxDailySheetCols = clampNumber(
  Number(process.env.MOORINGS_MAX_DAILY_SHEET_COLS || "40"),
  10,
  200,
);
const maxTechSheetRows = clampNumber(
  Number(process.env.MOORINGS_MAX_TECH_SHEET_ROWS || "2000"),
  200,
  20000,
);
const maxTechSheetCols = clampNumber(
  Number(process.env.MOORINGS_MAX_TECH_SHEET_COLS || "24"),
  8,
  120,
);

const techWorkbookPatterns = [
  /^tech_teams_by_brand\.xlsx$/i,
  /^Tech Teams by Brand and Schedule.*\.xlsx$/i,
  /^Tech Teams.*\.xlsx$/i,
  /Brand and Schedule.*\.xlsx$/i,
];
const dailyTargetSheetNameHints = [
  "Daily TA Tortola - MP",
  "Daily TA Tortola",
  "Daily TH Tortola",
  "Daily TH",
  "Daily TA",
];

const dayTimeSlots = [
  "06:00-07:30",
  "07:30-09:00",
  "09:00-10:30",
  "10:30-12:00",
  "12:30-14:00",
  "14:00-15:30",
  "15:30-17:00",
  "17:00-18:30",
];

const roleCapacityRules: ReadonlyArray<{
  key: WorkforceRoleKey;
  label: RoleCapacitySnapshot["roleLabel"];
  perWorkerCapacity: number;
}> = [
  { key: "technicians", label: "Technician", perWorkerCapacity: 3 },
  { key: "riggers", label: "Rigger", perWorkerCapacity: 9 },
  { key: "shipwrights", label: "Shipwright", perWorkerCapacity: 5 },
  { key: "acTechs", label: "AC Tech", perWorkerCapacity: 5 },
];

interface DailyTargetRow {
  dateIso: string;
  section: string;
  movementType: "arrival" | "departure";
  type: string;
  size: string;
  boatName: string;
  lastCharterDateIso: string;
  daysUntilNextCharter: string;
  nextCharterDateIso: string;
  nextCharterStartTime: string;
  technicalCompletionRaw: string;
  cleaningCompletionRaw: string;
}

interface TechWorkerProfile {
  id: number;
  label: string;
  positionLabel: string;
  daysOff: Set<string>;
  onLeave: boolean;
  backAtWorkDateIso: string | null;
  source: "sheet" | "manual" | "fallback";
}

interface WorkerPools {
  technicians: TechWorkerProfile[];
  riggers: TechWorkerProfile[];
  shipwrights: TechWorkerProfile[];
  acTechs: TechWorkerProfile[];
}

type DailyCallInByDate = Map<string, Record<WorkforceRoleKey, Set<string>>>;

interface VesselCharterPriority {
  level: CharterPriorityLevel;
  flag: CharterPriorityFlag;
  charterer: string;
}

interface ParsedOperationsSource {
  entries: TurnaroundEntry[];
  currentDay: CurrentDayData;
  planningDateOverride: {
    dateIso: string;
    updatedAtMs: number;
    updatedBy: string;
  } | null;
  workerPools: WorkerPools;
  workerDirectory: {
    technicians: Map<number, string>;
    riggers: Map<number, string>;
    shipwrights: Map<number, string>;
    acTechs: Map<number, string>;
  };
  sources: SourceReference[];
  startsByDate: Map<string, CurrentDayMovement[]>;
}

let dashboardCache: { expiresAt: number; data: OperationsDashboardData } | null = null;
let dashboardRefreshPromise: Promise<OperationsDashboardData> | null = null;

export function invalidateOperationsDashboardCache(): void {
  dashboardCache = null;
  dashboardRefreshPromise = null;
}

export async function getOperationsDashboardData(): Promise<OperationsDashboardData> {
  const now = Date.now();
  if (dashboardCache && dashboardCache.expiresAt > now) {
    return dashboardCache.data;
  }

  if (!dashboardRefreshPromise) {
    dashboardRefreshPromise = loadOperationsDashboardData()
      .then((data) => {
        dashboardCache = {
          data,
          expiresAt: Date.now() + dashboardCacheIntervalMs,
        };
        return data;
      })
      .finally(() => {
        dashboardRefreshPromise = null;
      });
  }

  return dashboardRefreshPromise;
}

async function loadOperationsDashboardData(): Promise<OperationsDashboardData> {
  const sourceData = await safeReadOperationsSourceData();
  let turnaroundEntries = sourceData.entries;
  const currentDay = sourceData.currentDay;
  const datasetStartIso = resolveDatasetStartIso(turnaroundEntries);

  const reportDate = currentDay.reportDate;
  const previousDate = addDays(reportDate, -1);
  const nextDate = addDays(reportDate, 1);

  const reportDateIso = toIsoDate(reportDate);
  const previousIso = toIsoDate(previousDate);
  const nextIso = toIsoDate(nextDate);
  const nextWeekEndIso = toIsoDate(addDays(reportDate, 7));

  const completionDueDates = [
    ...new Set(
      turnaroundEntries
        .map((entry) => entry.dateIso)
        .filter(
          (dateIso) =>
            isOperationalIsoDate(dateIso) && dateIso >= previousIso && dateIso <= nextWeekEndIso,
        ),
    ),
  ];
  const completionByCanonicalTask = await listCanonicalTaskCompletions(completionDueDates);
  const filteredCompletionByCanonicalTask = filterCanonicalCompletionsForDataset({
    records: completionByCanonicalTask,
    datasetStartIso,
  });
  turnaroundEntries = applyCanonicalTaskCompletionsToEntries(
    turnaroundEntries,
    filteredCompletionByCanonicalTask,
  );
  const dailyCallInsByDate = await listDailyCallInLabelsByDate(completionDueDates);

  const reportingStartIso = resolveReportingStartIso();
  const reportingStartDate = parseDate(reportingStartIso);
  const reportingReferenceDate =
    reportDate.getTime() >= reportingStartDate.getTime() ? reportDate : reportingStartDate;
  const reportingEntries = turnaroundEntries.filter((entry) => entry.dateIso >= reportingStartIso);

  const todayRowsRaw = turnaroundEntries.filter((entry) => entry.dateIso === reportDateIso);
  const previousRowsRaw = turnaroundEntries.filter((entry) => entry.dateIso === previousIso);
  const tomorrowRowsByOpsDate = turnaroundEntries.filter((entry) => entry.dateIso === nextIso);
  const tomorrowRowsByDeparture = projectEntriesToOperationalDate(
    dedupeByBoat(
      turnaroundEntries
        .filter((entry) => entry.departureDateIso === nextIso && entry.dateIso <= nextIso)
        .map((entry) => ({ entry, source: "Tomorrow" as const })),
    ).map((candidate) => candidate.entry),
    nextIso,
  );
  const tomorrowRowsRaw =
    tomorrowRowsByOpsDate.length > 0 ? tomorrowRowsByOpsDate : tomorrowRowsByDeparture;
  const nextWeekRowsRaw = turnaroundEntries.filter(
    (entry) => entry.dateIso > nextIso && entry.dateIso <= nextWeekEndIso,
  );

  const previousRows = previousRowsRaw;
  const tomorrowRows = tomorrowRowsRaw;
  const nextWeekRows = nextWeekRowsRaw;
  const carryoverRows = previousRows.filter((entry) => entry.completionPct < 100);
  const carryoverOpenRows = carryoverRows.filter((entry) => entry.completionPct < 95);

  const todayCapacitySnapshot = buildDailyPlanningSnapshot({
    dateIso: reportDateIso,
    demandBoats: 0,
    workerPools: sourceData.workerPools,
    dailyCallInsByDate,
  });
  const pulledForwardRows = buildPulledForwardRowsForToday({
    reportDateIso,
    nextWeekEndIso,
    todayRows: todayRowsRaw,
    carryoverRows: carryoverOpenRows,
    futureRows: [...tomorrowRowsRaw, ...nextWeekRowsRaw],
    todayCapacityBoats: todayCapacitySnapshot.totalCapacityBoats,
  });

  const todayRows = [...todayRowsRaw, ...pulledForwardRows];
  const todayOpenRows = todayRows.filter((entry) => entry.completionPct < 95);
  const tomorrowOpenRows = tomorrowRows.filter((entry) => entry.completionPct < 95);

  const movementTimeByBoat = new Map<string, string>();
  for (const movement of currentDay.movements) {
    if (movement.type === "start" && movement.time) {
      movementTimeByBoat.set(normalizeBoatName(movement.boatName), movement.time);
    }
  }

  const todaySchedule = buildSchedule({
    primaryRows: todayOpenRows,
    supportRows: carryoverRows,
    sourcePrimary: "Today",
    sourceSupport: "Carryover",
    movementTimeByBoat,
    limit: 14,
  });

  const unresolvedToday = todayOpenRows.filter((entry) => entry.completionPct < 65);
  const tomorrowSchedule = buildSchedule({
    primaryRows: tomorrowOpenRows,
    supportRows: unresolvedToday,
    sourcePrimary: "Tomorrow",
    sourceSupport: "Carryover",
    movementTimeByBoat,
    limit: 12,
  });

  const planningEngineBase = buildPlanningEngine({
    entries: turnaroundEntries,
    workerPools: sourceData.workerPools,
    reportDate,
    dailyCallInsByDate,
  });
  const yesterdayCapacity = buildDailyPlanningSnapshot({
    dateIso: previousIso,
    demandBoats: previousRows.length,
    workerPools: sourceData.workerPools,
    dailyCallInsByDate,
  });
  const actionPlan = buildYesterdayTodayTomorrowActionPlan({
    previousRows,
    todayRows,
    tomorrowRows,
    planningEngine: planningEngineBase,
    reportDate,
  });
  const planningEngine: PlanningEngineData = {
    ...planningEngineBase,
    recommendations: [...actionPlan, ...planningEngineBase.recommendations].slice(0, 10),
  };
  const operationalNarrative = buildOperationalNarrative({
    previousRows,
    todayRows,
    tomorrowRows,
    planningEngine,
    yesterdayCapacity,
    reportDate,
  });
  const tomorrowShortages = planningEngine.tomorrow.roles.filter(
    (role) => role.shortageWorkers > 0,
  );

  const summaryMetrics: SummaryMetric[] = [
    {
      id: "dueToday",
      label: "Today's Target Boats",
      value: String(planningEngine.today.demandBoats),
      detail: `${operationalNarrative.today.inProgressBoats} currently in progress`,
    },
    {
      id: "capacityToday",
      label: "Today's Capacity",
      value: String(planningEngine.today.totalCapacityBoats),
      detail: `Bottleneck role: ${planningEngine.today.bottleneckRole}`,
    },
    {
      id: "tomorrowDemand",
      label: "Tomorrow Demand",
      value: String(planningEngine.tomorrow.demandBoats),
      detail: `${planningEngine.tomorrow.totalCapacityBoats} boats of role-balanced capacity`,
    },
    {
      id: "tomorrowStatus",
      label: "Tomorrow Workforce Check",
      value: tomorrowShortages.length > 0 ? "Gap" : "Sufficient",
      detail:
        tomorrowShortages.length > 0
          ? `${tomorrowShortages.length} role shortages detected`
          : "All core roles meet target demand",
    },
  ];

  const fleetRows = buildFleetRows(todayRows, tomorrowRows);
  const insights = buildPlanningInsights(planningEngine, operationalNarrative);

  const reports = buildReports(reportingEntries, reportingReferenceDate);
  const planningCandidates = dedupeByBoat([
    ...todayRows.map((entry) => ({ entry, source: "Today" as const })),
    ...tomorrowRows.map((entry) => ({ entry, source: "Tomorrow" as const })),
    ...carryoverRows.map((entry) => ({ entry, source: "Carryover" as const })),
  ]);
  planningCandidates.sort((a, b) =>
    priorityScore(b.entry, b.source) - priorityScore(a.entry, a.source),
  );
  const assignmentCandidates = dedupeBySourceAndBoat([
    ...previousRows.map((entry) => ({ entry, source: "Yesterday" as const })),
    ...todayRows.map((entry) => ({ entry, source: "Today" as const })),
    ...tomorrowRows.map((entry) => ({ entry, source: "Tomorrow" as const })),
    ...nextWeekRows.map((entry) => ({ entry, source: "Next Week" as const })),
    ...carryoverRows.map((entry) => ({ entry, source: "Carryover" as const })),
  ]);
  assignmentCandidates.sort((a, b) =>
    priorityScore(b.entry, b.source) - priorityScore(a.entry, a.source),
  );

  const plannedLoads = buildPlannedLoads(planningCandidates);
  const technicianReports = buildWorkerQualityReports({
    entries: turnaroundEntries,
    roleKey: "technical",
    roleName: "Technician",
    reportDate,
    plannedLoads: plannedLoads.technicians,
    workerLabels: sourceData.workerDirectory.technicians,
  });
  const riggerReports = buildWorkerQualityReports({
    entries: turnaroundEntries,
    roleKey: "riggers",
    roleName: "Rigger",
    reportDate,
    plannedLoads: plannedLoads.riggers,
    workerLabels: sourceData.workerDirectory.riggers,
  });
  const shipwrightReports = buildWorkerQualityReports({
    entries: turnaroundEntries,
    roleKey: "shipwright",
    roleName: "Shipwright",
    reportDate,
    plannedLoads: plannedLoads.shipwrights,
    workerLabels: sourceData.workerDirectory.shipwrights,
  });
  const acTechReports = buildWorkerQualityReports({
    entries: turnaroundEntries,
    roleKey: "acTech",
    roleName: "AC Tech",
    reportDate,
    plannedLoads: plannedLoads.acTechs,
    workerLabels: sourceData.workerDirectory.acTechs,
  });
  const assignmentPlan = buildAssignmentPlan({
    candidates: assignmentCandidates,
    reportDate,
    workerPools: sourceData.workerPools,
    dailyCallInsByDate,
    movementTimeByBoat,
    technicianReports,
    riggerReports,
    shipwrightReports,
    limit: 200,
  });
  const vesselReports = buildVesselQualityReports(turnaroundEntries, reportDate);
  const reportingTechnicianReports = buildWorkerQualityReports({
    entries: reportingEntries,
    roleKey: "technical",
    roleName: "Technician",
    reportDate: reportingReferenceDate,
    plannedLoads: plannedLoads.technicians,
    workerLabels: sourceData.workerDirectory.technicians,
  });
  const reportingRiggerReports = buildWorkerQualityReports({
    entries: reportingEntries,
    roleKey: "riggers",
    roleName: "Rigger",
    reportDate: reportingReferenceDate,
    plannedLoads: plannedLoads.riggers,
    workerLabels: sourceData.workerDirectory.riggers,
  });
  const reportingShipwrightReports = buildWorkerQualityReports({
    entries: reportingEntries,
    roleKey: "shipwright",
    roleName: "Shipwright",
    reportDate: reportingReferenceDate,
    plannedLoads: plannedLoads.shipwrights,
    workerLabels: sourceData.workerDirectory.shipwrights,
  });
  const reportingAcTechReports = buildWorkerQualityReports({
    entries: reportingEntries,
    roleKey: "acTech",
    roleName: "AC Tech",
    reportDate: reportingReferenceDate,
    plannedLoads: plannedLoads.acTechs,
    workerLabels: sourceData.workerDirectory.acTechs,
  });
  const reportingVesselReports = buildVesselQualityReports(reportingEntries, reportingReferenceDate);
  const rosterToday = startOfDay(new Date());
  const rosterTomorrow = addDays(rosterToday, 1);
  const teamOverrides = await listTeamOverrides();
  const baseTeamRoster = buildTeamRoster(
    sourceData.workerPools,
    rosterToday,
    rosterTomorrow,
    dailyCallInsByDate,
  );
  const todayAssignmentsByRole = buildRoleAssignmentsByDay(
    turnaroundEntries,
    reportDateIso,
    sourceData.workerDirectory,
  );
  const teamRoster = {
    ...baseTeamRoster,
    members: baseTeamRoster.members.map((member) => ({
      ...member,
      todayVessels: todayAssignmentsByRole[member.roleKey].get(normalizeBoatName(member.label)) ?? [],
    })),
    previousMembers: derivePreviousTeamMembers(teamOverrides),
  };
  const dailyApproval = buildDailyApprovalData({
    reportDateIso,
    reportDate,
    planningEngine,
    teamRoster,
    assignmentPlan,
  });

  return {
    appName: "moorings.ms",
    reportDateIso,
    reportDateLabel: formatDate(reportDate),
    planningDateOverride: sourceData.planningDateOverride
      ? {
          active: true,
          dateIso: sourceData.planningDateOverride.dateIso,
          dateLabel: formatDate(parseDate(sourceData.planningDateOverride.dateIso)),
          updatedBy: sourceData.planningDateOverride.updatedBy || null,
        }
      : {
          active: false,
          dateIso: null,
          dateLabel: null,
          updatedBy: null,
        },
    previousDateLabel: formatDate(previousDate),
    nextDateLabel: formatDate(nextDate),
    summaryMetrics,
    startsFigures: currentDay.startsFigures,
    todaySchedule,
    tomorrowSchedule,
    reports,
    reporting: {
      startDateIso: reportingStartIso,
      startDateLabel: formatDate(reportingStartDate),
      vesselReports: reportingVesselReports,
      workerReports: {
        technicians: reportingTechnicianReports,
        riggers: reportingRiggerReports,
        shipwrights: reportingShipwrightReports,
        acTechs: reportingAcTechReports,
      },
    },
    fleetRows,
    insights,
    assignmentPlan,
    vesselReports,
    operationalNarrative,
    planningEngine,
    dailyApproval,
    workerReports: {
      technicians: technicianReports,
      riggers: riggerReports,
      shipwrights: shipwrightReports,
      acTechs: acTechReports,
    },
    teamRoster,
    sources: sourceData.sources,
  };
}

async function safeReadOperationsSourceData(): Promise<ParsedOperationsSource> {
  try {
    return await readOperationsSourceData();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[moorings.ms] Could not read Google Drive source files during this request.", error);
    }
    const now = startOfDay(new Date());
    return {
      entries: [],
      currentDay: {
        reportDate: now,
        startsFigures: [],
        movements: [],
      },
      planningDateOverride: null,
      workerPools: buildEmptyWorkerPools(),
      workerDirectory: {
        technicians: new Map<number, string>(),
        riggers: new Map<number, string>(),
        shipwrights: new Map<number, string>(),
        acTechs: new Map<number, string>(),
      },
      sources: [],
      startsByDate: new Map<string, CurrentDayMovement[]>(),
    };
  }
}

async function readOperationsSourceData(): Promise<ParsedOperationsSource> {
  const workbookPath = fleetScheduleWorkbookPath;
  ensureFileExists(workbookPath);

  const workbookBuffer = fs.readFileSync(workbookPath);
  const workbook = XLSX.read(workbookBuffer, {
    type: "buffer",
    raw: true,
    cellDates: true,
  });

  const dailyTargetRows = parseDailyTargetRows(workbook);

  const planningDateOverrideRaw = await getPlanningDateOverride();
  const planningDateOverride = shouldUsePlanningDateOverride(
    planningDateOverrideRaw,
    dailyTargetRows,
  )
    ? planningDateOverrideRaw
    : null;
  const reportDate = planningDateOverride
    ? parseDate(planningDateOverride.dateIso)
    : selectOperationalReportDate(dailyTargetRows);
  const reportDateIso = toIsoDate(reportDate);

  const workerPools = await readTechWorkerPools();
  const entries = buildTurnaroundEntries(dailyTargetRows, workerPools, new Map());
  const startsFigures = buildStartsFiguresFromDailyTargets(dailyTargetRows, reportDateIso);

  const workbookFile = path.basename(workbookPath);
  const techWorkbookPath = resolveDriveDataFileByPatterns(techWorkbookPatterns, true);

  const sources: SourceReference[] = [
    {
      name: "Fleet Schedule Example",
      filePath: filePathLabel(workbookPath, `data/drive/${workbookFile}`),
      downloadUrl: "",
      records: dailyTargetRows.length,
      note: "Only vessel and turnaround schedule source currently used by the app.",
    },
  ];

  if (techWorkbookPath) {
    sources.push({
      name: "Tech Teams by Brand and Schedule",
      filePath: filePathLabel(
        techWorkbookPath,
        `data/drive/${path.basename(techWorkbookPath)}`,
      ),
      downloadUrl: "/reports/tech_teams_by_brand.xlsx",
      records:
        workerPools.technicians.length +
        workerPools.riggers.length +
        workerPools.shipwrights.length +
        workerPools.acTechs.length,
      note: "Power-team workforce roster (technicians, riggers, shipwrights, AC techs) used for daily supply and capacity calculations.",
    });
  }

  return {
    entries,
    currentDay: {
      reportDate,
      startsFigures,
      movements: [],
    },
    planningDateOverride,
    workerPools,
    workerDirectory: {
      technicians: new Map(workerPools.technicians.map((worker) => [worker.id, worker.label])),
      riggers: new Map(workerPools.riggers.map((worker) => [worker.id, worker.label])),
      shipwrights: new Map(workerPools.shipwrights.map((worker) => [worker.id, worker.label])),
      acTechs: new Map(workerPools.acTechs.map((worker) => [worker.id, worker.label])),
    },
    sources,
    startsByDate: new Map<string, CurrentDayMovement[]>(),
  };
}

function filePathLabel(actualPath: string, fallbackPath: string): string {
  if (actualPath.startsWith(runtimeDriveDataDir)) {
    return `runtime-cache/${path.basename(actualPath)}`;
  }
  return fallbackPath;
}

function parseDailyTargetRows(workbook: XLSX.WorkBook): DailyTargetRow[] {
  const sheet = resolveDailyTargetSheet(workbook);
  if (!sheet) {
    throw new Error(
      "Daily target sheet (Daily TA/TH Tortola) is missing from the BVI turnaround workbook.",
    );
  }

  const rows = sheetToRowsLimited(sheet, maxDailySheetRows, maxDailySheetCols);
  const parsedGridRows = parseDailyTargetRowsFromSimpleMovementGrid(rows);
  if (parsedGridRows.length > 0) {
    return parsedGridRows;
  }

  const parsedRows: DailyTargetRow[] = [];
  let currentDateIso = "";
  let currentSection = "";
  let mode: "turnaround" | "maintenance" | null = null;
  let typeColumnOffset = 0;

  for (const row of rows) {
    const possibleDate = findDateInDailyHeaderRow(row);
    if (possibleDate) {
      currentDateIso = possibleDate;
      mode = null;
      continue;
    }

    const sectionCandidate = findSingleCellSectionLabel(row);
    if (sectionCandidate) {
      currentSection = sectionCandidate;
      continue;
    }

    const header = detectDailySheetHeader(row);
    if (header) {
      mode = header.mode;
      typeColumnOffset = header.typeColumnOffset;
      continue;
    }

    if (mode !== "turnaround" || !currentDateIso) {
      continue;
    }

    const type = cleanCellText(row[typeColumnOffset]).toUpperCase();
    const size = cleanCellText(row[typeColumnOffset + 1]);
    const boatName = cleanCellText(row[typeColumnOffset + 2]);
    if (!type || !boatName || type === "TYPE" || boatName.toUpperCase().includes("TOTAL")) {
      continue;
    }

    parsedRows.push({
      dateIso: currentDateIso,
      section: currentSection || "Daily TA Tortola",
      movementType: "departure",
      type,
      size,
      boatName,
      lastCharterDateIso: normalizeSheetDate(row[typeColumnOffset + 4]),
      daysUntilNextCharter: cleanCellText(row[typeColumnOffset + 5]),
      nextCharterDateIso: normalizeSheetDate(row[typeColumnOffset + 6]),
      nextCharterStartTime: cleanCellText(row[typeColumnOffset + 7]),
      technicalCompletionRaw: cleanCellText(row[typeColumnOffset + 8]),
      cleaningCompletionRaw: cleanCellText(row[typeColumnOffset + 9]),
    });
  }

  return parsedRows;
}

function parseDailyTargetRowsFromSimpleMovementGrid(rows: unknown[][]): DailyTargetRow[] {
  if (rows.length === 0) {
    return [];
  }

  const headerIndex = rows.findIndex((row) => detectSimpleDailyGridHeader(row) !== null);
  if (headerIndex < 0) {
    return [];
  }

  const header = detectSimpleDailyGridHeader(rows[headerIndex] || []);
  if (!header) {
    return [];
  }

  const output: DailyTargetRow[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const hasContent = row.some((cell) => cleanCellText(cell));
    if (!hasContent) {
      continue;
    }

    const dateIso =
      normalizeFleetScheduleDate(row[header.dateColumn]) ||
      normalizeDateHeaderText(cleanCellText(row[header.dateColumn]));
    if (!dateIso) {
      continue;
    }

    const movement = cleanCellText(row[header.movementColumn]).toUpperCase();
    const boatName = cleanCellText(row[header.vesselColumn]);
    if (!movement || movement === "NONE" || !boatName) {
      continue;
    }

    const movementType = movement.includes("ARRIVAL")
      ? "arrival"
      : movement.includes("DEPART")
        ? "departure"
        : null;
    if (!movementType) {
      continue;
    }

    const turnTypeRaw =
      header.turnTypeColumn >= 0 ? cleanCellText(row[header.turnTypeColumn]).toUpperCase() : "";
    const turnType = turnTypeRaw === "TA" || turnTypeRaw === "TH" ? turnTypeRaw : "TA";
    const startTime = header.timeColumn >= 0 ? cleanCellText(row[header.timeColumn]) : "";
    const bookingRef = header.bookingColumn >= 0 ? cleanCellText(row[header.bookingColumn]) : "";
    const notes = header.notesColumn >= 0 ? cleanCellText(row[header.notesColumn]) : "";
    const annotationParts = [movement, turnType, bookingRef, notes].filter(Boolean);

    output.push({
      dateIso,
      section: "Daily TA Tortola",
      movementType,
      type: "MP",
      size: "",
      boatName,
      lastCharterDateIso: "",
      daysUntilNextCharter: "",
      nextCharterDateIso: dateIso,
      nextCharterStartTime: startTime,
      technicalCompletionRaw: movementType === "arrival" ? "ARRIVAL" : "PENDING",
      cleaningCompletionRaw: annotationParts.join(" | "),
    });
  }

  return output;
}

function normalizeFleetScheduleDate(value: unknown): string {
  if (value instanceof Date) {
    const midday = new Date(value.getTime() + 12 * 60 * 60 * 1000);
    return toIsoDate(midday);
  }
  return normalizeSheetDate(value);
}

function detectSimpleDailyGridHeader(row: unknown[]): {
  dateColumn: number;
  movementColumn: number;
  vesselColumn: number;
  timeColumn: number;
  turnTypeColumn: number;
  bookingColumn: number;
  notesColumn: number;
} | null {
  const labels = row.map((cell) => cleanCellText(cell).toLowerCase());
  const dateColumn = labels.findIndex((value) => value === "date");
  const movementColumn = labels.findIndex((value) => value === "movement");
  const vesselColumn = labels.findIndex((value) => value === "vessel");
  if (dateColumn < 0 || movementColumn < 0 || vesselColumn < 0) {
    return null;
  }

  const timeColumn = labels.findIndex((value) => value === "time");
  const turnTypeColumn = labels.findIndex(
    (value) => value === "turn type" || value === "turntype" || value === "turn",
  );
  const bookingColumn = labels.findIndex(
    (value) => value === "booking ref" || value === "booking reference" || value === "booking",
  );
  const notesColumn = labels.findIndex((value) => value === "notes" || value === "note");

  return {
    dateColumn,
    movementColumn,
    vesselColumn,
    timeColumn,
    turnTypeColumn,
    bookingColumn,
    notesColumn,
  };
}

function resolveDailyTargetSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  for (const nameHint of dailyTargetSheetNameHints) {
    const namedSheet = findSheetByNamePart(workbook, nameHint);
    if (namedSheet && looksLikeDailyTargetSheet(namedSheet)) {
      return namedSheet;
    }
  }

  // Legacy fallback: some old files had the target as the 3rd sheet.
  const thirdSheetName = workbook.SheetNames[2];
  if (thirdSheetName) {
    const thirdSheet = workbook.Sheets[thirdSheetName];
    if (thirdSheet && looksLikeDailyTargetSheet(thirdSheet)) {
      return thirdSheet;
    }
  }

  for (const sheetName of workbook.SheetNames) {
    const normalized = sheetName.trim().toLowerCase();
    const looksNamedLikeDaily =
      normalized.includes("daily") &&
      (normalized.includes("ta") || normalized.includes("th")) &&
      normalized.includes("tortola");
    if (!looksNamedLikeDaily) {
      continue;
    }
    const sheet = workbook.Sheets[sheetName];
    if (sheet && looksLikeDailyTargetSheet(sheet)) {
      return sheet;
    }
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet && looksLikeDailyTargetSheet(sheet)) {
      return sheet;
    }
  }

  return null;
}

function looksLikeDailyTargetSheet(sheet: XLSX.WorkSheet): boolean {
  const rows = sheetToRowsLimited(sheet, Math.min(maxDailySheetRows, 240), maxDailySheetCols);
  for (let index = 0; index < Math.min(rows.length, 160); index += 1) {
    const header = detectDailySheetHeader(rows[index]);
    if (header?.mode === "turnaround") {
      return true;
    }

    // New simplified scheduling template:
    // Date | Day | Movement | Vessel | Booking Ref | Time | Turn Type | Notes
    if (detectSimpleDailyGridHeader(rows[index])) {
      return true;
    }
  }
  return false;
}

function findDateInDailyHeaderRow(row: unknown[]): string {
  const nonEmptyCells = row
    .map((cell, index) => ({ index, value: cleanCellText(cell) }))
    .filter((cell) => cell.value);
  if (nonEmptyCells.length === 0) {
    return "";
  }

  // Never treat actual vessel/header/total rows as a date boundary.
  if (detectDailySheetHeader(row)) {
    return "";
  }

  // Vessel rows can shift one or more columns depending on how the workbook
  // block is formatted. Detect a TYPE+BOAT pattern at any likely offset so
  // charter dates in row cells never get mistaken for a new date boundary.
  if (findDailyDataTypeOffset(row) !== null) {
    return "";
  }

  const rowTextUpper = nonEmptyCells.map((cell) => cell.value.toUpperCase()).join(" | ");
  if (rowTextUpper.includes("TOTAL ENDS") || rowTextUpper.includes("TOTAL STARTS")) {
    return "";
  }

  for (const cell of nonEmptyCells) {
    if (cell.index > 8) {
      continue;
    }

    const normalizedDirect = normalizeSheetDate(row[cell.index]);
    if (normalizedDirect && isOperationalIsoDate(normalizedDirect)) {
      return normalizedDirect;
    }

    const normalizedText = normalizeDateHeaderText(cell.value);
    if (normalizedText) {
      return normalizedText;
    }
  }

  return "";
}

function findDailyDataTypeOffset(row: unknown[]): number | null {
  for (let index = 0; index <= 8; index += 1) {
    const typeCell = cleanCellText(row[index]).toUpperCase();
    if (!isDailyTypeCode(typeCell)) {
      continue;
    }

    const boatCell = cleanCellText(row[index + 2]).toUpperCase();
    if (!boatCell || boatCell === "BOAT NAME" || boatCell.includes("TOTAL")) {
      continue;
    }

    return index;
  }

  return null;
}

function isDailyTypeCode(value: string): boolean {
  if (!value) {
    return false;
  }
  return value === "MP" || value === "TM" || value === "CY" || value === "SS";
}

function normalizeDateHeaderText(value: string): string {
  const raw = cleanCellText(value);
  if (!raw) {
    return "";
  }

  const cleaned = raw
    .replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();

  const fullWeekdayMatch = cleaned.match(
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b,?\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  );
  if (fullWeekdayMatch) {
    const parsed = new Date(fullWeekdayMatch[1]);
    if (!Number.isNaN(parsed.getTime())) {
      return toIsoDate(parsed);
    }
  }

  const monthDateMatch = cleaned.match(
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i,
  );
  if (monthDateMatch) {
    const parsed = new Date(monthDateMatch[0]);
    if (!Number.isNaN(parsed.getTime())) {
      return toIsoDate(parsed);
    }
  }

  return "";
}

function findSingleCellSectionLabel(row: unknown[]): string {
  const nonEmpty = row
    .map((cell, index) => ({ index, value: cleanCellText(cell) }))
    .filter((cell) => cell.value);

  if (nonEmpty.length !== 1) {
    return "";
  }

  const value = nonEmpty[0]?.value || "";
  const upper = value.toUpperCase();
  if (upper === "TYPE") {
    return "";
  }
  if (upper.includes("LAST CHARTER DATE") || upper.includes("MAINT START DATE")) {
    return "";
  }

  return value;
}

function detectDailySheetHeader(
  row: unknown[],
): { mode: "turnaround" | "maintenance"; typeColumnOffset: number } | null {
  for (let index = 0; index <= 8; index += 1) {
    const possibleType = toText(row[index]).toUpperCase();
    if (possibleType !== "TYPE") {
      continue;
    }

    const charterHeaders = [toText(row[index + 4]).toUpperCase(), toText(row[index + 5]).toUpperCase()];
    if (charterHeaders.some((value) => value.includes("LAST CHARTER DATE"))) {
      return {
        mode: "turnaround",
        typeColumnOffset: index,
      };
    }

    const maintenanceHeaders = [
      toText(row[index + 3]).toUpperCase(),
      toText(row[index + 4]).toUpperCase(),
    ];
    if (maintenanceHeaders.some((value) => value.includes("MAINT START DATE"))) {
      return {
        mode: "maintenance",
        typeColumnOffset: index,
      };
    }
  }

  return null;
}

function selectOperationalReportDate(dailyRows: DailyTargetRow[]): Date {
  const today = startOfDay(new Date());
  const todayIso = toIsoDate(today);

  const dailyDates = [
    ...new Set(
      dailyRows.map((row) => {
        const blockIso = normalizeSheetDate(row.dateIso);
        if (blockIso) {
          return blockIso;
        }
        const departureIso = normalizeSheetDate(row.nextCharterDateIso);
        return departureIso;
      }),
    ),
  ]
    .filter((dateIso) => isOperationalIsoDate(dateIso))
    .sort((left, right) => left.localeCompare(right));

  if (dailyDates.includes(todayIso)) {
    return today;
  }

  // Operational UX must always stay anchored to the real local day, even when
  // the workbook has sparse/missing day blocks.
  return today;
}

function shouldUsePlanningDateOverride(
  override: {
    dateIso: string;
    updatedAtMs: number;
    updatedBy: string;
  } | null,
  dailyRows: DailyTargetRow[],
): boolean {
  if (!override || !isOperationalIsoDate(override.dateIso)) {
    return false;
  }

  return hasOperationalRowsNearDate(dailyRows, override.dateIso);
}

function hasOperationalRowsNearDate(rows: DailyTargetRow[], dateIso: string): boolean {
  if (!isOperationalIsoDate(dateIso)) {
    return false;
  }

  const startIso = toIsoDate(addDays(parseDate(dateIso), -1));
  const endIso = toIsoDate(addDays(parseDate(dateIso), 7));

  for (const row of rows) {
    const rowIso =
      normalizeSheetDate(row.dateIso) || normalizeSheetDate(row.nextCharterDateIso);
    if (!rowIso) {
      continue;
    }
    if (rowIso >= startIso && rowIso <= endIso) {
      return true;
    }
  }

  return false;
}

function resolveDatasetStartIso(entries: TurnaroundEntry[]): string | null {
  const dates = entries
    .map((entry) => (isOperationalIsoDate(entry.dateIso) ? entry.dateIso : ""))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  return dates[0] || null;
}

function filterCanonicalCompletionsForDataset<
  TRecord extends { completedAtIso: string; updatedAtMs: number },
>(input: {
  records: Record<string, TRecord>;
  datasetStartIso: string | null;
}): Record<string, TRecord> {
  if (!input.datasetStartIso || !isOperationalIsoDate(input.datasetStartIso)) {
    return input.records;
  }

  const cutoffMs = parseDate(input.datasetStartIso).getTime();
  if (!Number.isFinite(cutoffMs)) {
    return input.records;
  }

  const filtered = Object.entries(input.records).filter(([, value]) => {
    const completedMs = Date.parse(value.completedAtIso);
    if (Number.isFinite(completedMs)) {
      return completedMs >= cutoffMs;
    }
    return Number.isFinite(value.updatedAtMs) ? value.updatedAtMs >= cutoffMs : true;
  });

  return Object.fromEntries(filtered);
}

function buildStartsFiguresFromDailyTargets(
  dailyRows: DailyTargetRow[],
  reportDateIso: string,
): StartFigure[] {
  const grouped = new Map<string, StartFigure>();

  for (const row of dailyRows) {
    if (row.dateIso !== reportDateIso || row.movementType !== "departure" || !isPowerType(row.type)) {
      continue;
    }

    const category = row.type.toUpperCase() === "MP" ? "Moorings Power" : row.type;
    const bucket =
      grouped.get(category) ??
      ({
        category,
        noon: 0,
        saEs: 0,
        total: 0,
      } satisfies StartFigure);

    const time = cleanCellText(row.nextCharterStartTime).toUpperCase();
    const isNoon = time.includes("12") || time.includes("NOON");
    if (isNoon) {
      bucket.noon += 1;
    } else {
      bucket.saEs += 1;
    }
    bucket.total += 1;
    grouped.set(category, bucket);
  }

  return [...grouped.values()].sort((left, right) => right.total - left.total);
}

async function readTechWorkerPools(): Promise<WorkerPools> {
  const workbookPath = resolveDriveDataFileByPatterns(techWorkbookPatterns, true);
  const basePools = workbookPath
    ? (() => {
        const workbook = XLSX.read(fs.readFileSync(workbookPath), {
          type: "buffer",
          raw: true,
        });
        const fromForApp = readTechWorkerPoolsFromForAppSheet(workbook);
        return fromForApp ?? readTechWorkerPoolsFromPowerColumns(workbook);
      })()
    : buildEmptyWorkerPools();
  const normalizedBase = normalizeWorkerPoolIds(basePools);

  const overrides = await listTeamOverrides();
  if (overrides.length === 0) {
    return normalizedBase;
  }

  return applyTeamOverrides(normalizedBase, overrides);
}

function readTechWorkerPoolsFromForAppSheet(workbook: XLSX.WorkBook): WorkerPools | null {
  const sheet = findForAppSheet(workbook);
  if (!sheet) {
    return null;
  }

  const rows = sheetToRowsLimited(sheet, maxTechSheetRows, maxTechSheetCols);

  if (rows.length === 0) {
    return null;
  }

  const headerIndex = rows.findIndex((row) => {
    const columns = row.map((cell) => cleanCellText(cell).toLowerCase());
    return columns.some((value) => value.includes("position")) && columns.some((value) => value.includes("day"));
  });
  if (headerIndex < 0) {
    return null;
  }

  const headerRow = rows[headerIndex].map((cell) => cleanCellText(cell).toLowerCase());
  const firstNameColumn = findColumnIndex(headerRow, ["first", "name"]);
  const surnameColumn = findColumnIndex(headerRow, ["surname", "last"]);
  const fullNameColumn = findColumnIndex(headerRow, ["full name", "name surname", "employee"]);
  const positionColumn = findColumnIndex(headerRow, ["position", "role"]);
  const daysOffColumn = findColumnIndex(headerRow, ["days off", "off day", "off"]);

  if (positionColumn < 0 || daysOffColumn < 0 || (firstNameColumn < 0 && fullNameColumn < 0)) {
    return null;
  }

  const bucketMaps = createWorkerBucketMaps();
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const positionValue = cleanCellText(row[positionColumn]);
    const role = parseRoleFromPosition(positionValue);
    if (!role) {
      continue;
    }

    const fullName = fullNameColumn >= 0 ? cleanCellText(row[fullNameColumn]) : "";
    const firstName = firstNameColumn >= 0 ? cleanCellText(row[firstNameColumn]) : "";
    const surname = surnameColumn >= 0 ? cleanCellText(row[surnameColumn]) : "";
    const combined = cleanCellText(`${firstName} ${surname}`) || fullName;
    if (!combined) {
      continue;
    }

    const daysOff = parseDaysOffCell(cleanCellText(row[daysOffColumn]));
    upsertWorkerBucket(
      bucketMaps[role],
      combined,
      cleanCellText(positionValue) || roleLabelFromKey(role),
      daysOff,
    );
  }

  return mapBucketsToWorkerPools(bucketMaps);
}

function findForAppSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet | null {
  const namedMatch = findSheetByNamePart(workbook, "for app");
  if (namedMatch) {
    return namedMatch;
  }

  const secondSheetName = workbook.SheetNames[1];
  if (secondSheetName) {
    const secondSheet = workbook.Sheets[secondSheetName];
    if (secondSheet && looksLikeForAppSheet(secondSheet)) {
      return secondSheet;
    }
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet && looksLikeForAppSheet(sheet)) {
      return sheet;
    }
  }

  return null;
}

function looksLikeForAppSheet(sheet: XLSX.WorkSheet): boolean {
  const rows = sheetToRowsLimited(sheet, Math.min(maxTechSheetRows, 120), maxTechSheetCols);
  for (let index = 0; index < Math.min(rows.length, 12); index += 1) {
    const row = rows[index].map((cell) => cleanCellText(cell).toLowerCase());
    const hasPosition = row.some((value) => value.includes("position") || value === "role");
    const hasDaysOff = row.some((value) => value.includes("days off") || value.includes("day off"));
    if (hasPosition && hasDaysOff) {
      return true;
    }
  }
  return false;
}

function sheetToRowsLimited(
  sheet: XLSX.WorkSheet,
  maxRows: number,
  maxCols: number,
): unknown[][] {
  const normalizedRows = Math.max(1, maxRows);
  const normalizedCols = Math.max(1, maxCols);
  let rangeRef: string | number = 0;

  try {
    const rawRef = typeof sheet["!ref"] === "string" ? sheet["!ref"] : "";
    if (rawRef) {
      const decoded = XLSX.utils.decode_range(rawRef);
      const bounded = {
        s: decoded.s,
        e: {
          r: Math.min(decoded.e.r, normalizedRows - 1),
          c: Math.min(decoded.e.c, normalizedCols - 1),
        },
      };
      rangeRef = XLSX.utils.encode_range(bounded);
    }
  } catch {
    rangeRef = 0;
  }

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    range: rangeRef,
  });
}

function readTechWorkerPoolsFromPowerColumns(workbook: XLSX.WorkBook): WorkerPools {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return buildEmptyWorkerPools();
  }

  const rows = sheetToRowsLimited(sheet, maxTechSheetRows, Math.min(maxTechSheetCols, 8));

  const bucketMaps = createWorkerBucketMaps();
  const powerWorkerColumn = 2; // Column C (Power)
  const powerDaysOffColumn = 3; // Column D (days off)

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const workerCell = cleanCellText(row[powerWorkerColumn]);
    if (!workerCell) {
      continue;
    }

    const parsed = parseWorkerCell(workerCell);
    if (!parsed) {
      continue;
    }

    const daysOff = parseDaysOffCell(cleanCellText(row[powerDaysOffColumn]));
    upsertWorkerBucket(
      bucketMaps[parsed.role],
      parsed.name,
      roleLabelFromKey(parsed.role),
      daysOff,
    );
  }

  return mapBucketsToWorkerPools(bucketMaps);
}

function createWorkerBucketMaps(): Record<
  WorkforceRoleKey,
  Map<string, { label: string; positionLabel: string; daysOff: Set<string> }>
> {
  return {
    technicians: new Map(),
    riggers: new Map(),
    shipwrights: new Map(),
    acTechs: new Map(),
  };
}

function upsertWorkerBucket(
  target: Map<string, { label: string; positionLabel: string; daysOff: Set<string> }>,
  label: string,
  positionLabel: string,
  daysOff: Set<string>,
) {
  const key = normalizeBoatName(label);
  const existing = target.get(key);
  if (existing) {
    for (const day of daysOff) {
      existing.daysOff.add(day);
    }
    if (positionLabel) {
      existing.positionLabel = positionLabel;
    }
    return;
  }
  target.set(key, {
    label,
    positionLabel,
    daysOff: new Set(daysOff),
  });
}

function mapBucketsToWorkerPools(
  bucketMaps: Record<
    WorkforceRoleKey,
    Map<string, { label: string; positionLabel: string; daysOff: Set<string> }>
  >,
): WorkerPools {
  const technicians = mapWorkersFromBucket(bucketMaps.technicians);
  const riggers = mapWorkersFromBucket(bucketMaps.riggers);
  const shipwrights = mapWorkersFromBucket(bucketMaps.shipwrights);
  const acTechs = mapWorkersFromBucket(bucketMaps.acTechs);
  return { technicians, riggers, shipwrights, acTechs };
}

function normalizeWorkerPoolIds(pools: WorkerPools): WorkerPools {
  return {
    technicians: pools.technicians.map((worker, index) => ({ ...worker, id: index + 1 })),
    riggers: pools.riggers.map((worker, index) => ({ ...worker, id: index + 1 })),
    shipwrights: pools.shipwrights.map((worker, index) => ({ ...worker, id: index + 1 })),
    acTechs: pools.acTechs.map((worker, index) => ({ ...worker, id: index + 1 })),
  };
}

function applyTeamOverrides(
  pools: WorkerPools,
  overrides: Awaited<ReturnType<typeof listTeamOverrides>>,
): WorkerPools {
  const mapByRole: Record<WorkforceRoleKey, Map<string, TechWorkerProfile>> = {
    technicians: new Map(pools.technicians.map((worker) => [normalizeBoatName(worker.label), { ...worker }])),
    riggers: new Map(pools.riggers.map((worker) => [normalizeBoatName(worker.label), { ...worker }])),
    shipwrights: new Map(pools.shipwrights.map((worker) => [normalizeBoatName(worker.label), { ...worker }])),
    acTechs: new Map(pools.acTechs.map((worker) => [normalizeBoatName(worker.label), { ...worker }])),
  };

  for (const override of overrides) {
    if (override.action === "update") {
      const previousRole = override.previousRole ?? override.role;
      const previousTarget = mapByRole[previousRole];
      const previousKey = normalizeBoatName(override.previousLabel || override.label);
      const previousWorker = previousTarget.get(previousKey);
      if (previousWorker) {
        previousTarget.delete(previousKey);
      }

      const updatedKey = normalizeBoatName(override.label);
      const updatedTarget = mapByRole[override.role];
      const existingUpdated = updatedTarget.get(updatedKey);
      updatedTarget.set(updatedKey, {
        id: existingUpdated?.id ?? previousWorker?.id ?? 0,
        label: override.label,
        positionLabel:
          override.positionLabel ||
          existingUpdated?.positionLabel ||
          previousWorker?.positionLabel ||
          roleLabelFromKey(override.role),
        daysOff: new Set(override.daysOff),
        onLeave: existingUpdated?.onLeave ?? previousWorker?.onLeave ?? false,
        backAtWorkDateIso:
          existingUpdated?.backAtWorkDateIso ?? previousWorker?.backAtWorkDateIso ?? null,
        source: "manual",
      });
      continue;
    }

    const key = normalizeBoatName(override.label);
    const target = mapByRole[override.role];
    const existing = target.get(key);
    if (override.action === "remove") {
      target.delete(key);
      continue;
    }
    if (override.action === "leave") {
      if (existing) {
        existing.onLeave = true;
        existing.daysOff = override.daysOff.length > 0 ? new Set(override.daysOff) : existing.daysOff;
        existing.backAtWorkDateIso = override.backAtWorkDateIso ?? null;
        if (override.positionLabel) {
          existing.positionLabel = override.positionLabel;
        }
      } else {
        target.set(key, {
          id: 0,
          label: override.label,
          positionLabel: override.positionLabel || roleLabelFromKey(override.role),
          daysOff: new Set(override.daysOff),
          onLeave: true,
          backAtWorkDateIso: override.backAtWorkDateIso ?? null,
          source: "manual",
        });
      }
      continue;
    }
    if (override.action === "return") {
      if (existing) {
        existing.onLeave = false;
        existing.backAtWorkDateIso = null;
        if (override.daysOff.length > 0) {
          existing.daysOff = new Set(override.daysOff);
        }
        if (override.positionLabel) {
          existing.positionLabel = override.positionLabel;
        }
      }
      continue;
    }
    target.set(key, {
      id: existing?.id ?? 0,
      label: override.label,
      positionLabel: override.positionLabel || existing?.positionLabel || roleLabelFromKey(override.role),
      daysOff: new Set(override.daysOff),
      onLeave: existing?.onLeave ?? false,
      backAtWorkDateIso: existing?.backAtWorkDateIso ?? null,
      source: "manual",
    });
  }

  const toArray = (target: Map<string, TechWorkerProfile>) =>
    [...target.values()].map((worker, index) => ({ ...worker, id: index + 1 }));

  return {
    technicians: toArray(mapByRole.technicians),
    riggers: toArray(mapByRole.riggers),
    shipwrights: toArray(mapByRole.shipwrights),
    acTechs: toArray(mapByRole.acTechs),
  };
}

function findColumnIndex(headers: string[], patterns: string[]): number {
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index] ?? "";
    if (patterns.some((pattern) => header.includes(pattern))) {
      return index;
    }
  }
  return -1;
}

function parseRoleFromPosition(value: string): WorkforceRoleKey | null {
  const text = cleanCellText(value).toUpperCase();
  if (!text) {
    return null;
  }
  if (text.includes("AC") || text.includes("REFRIG")) {
    return "acTechs";
  }
  if (text.includes("RIG")) {
    return "riggers";
  }
  if (text.includes("SHIPWRIGHT") || text.includes("SW")) {
    return "shipwrights";
  }
  if (text.includes("TECH") || text.includes("FG")) {
    return "technicians";
  }
  return null;
}

function mapWorkersFromBucket(
  map: Map<string, { label: string; positionLabel: string; daysOff: Set<string> }>,
): TechWorkerProfile[] {
  if (map.size === 0) {
    return [];
  }

  return [...map.values()].map((worker, index) => ({
    id: index + 1,
    label: worker.label,
    positionLabel: worker.positionLabel || "Technician",
    daysOff: worker.daysOff,
    onLeave: false,
    backAtWorkDateIso: null,
    source: "sheet",
  }));
}

function buildEmptyWorkerPools(): WorkerPools {
  return {
    technicians: [],
    riggers: [],
    shipwrights: [],
    acTechs: [],
  };
}

function parseWorkerCell(raw: string): { name: string; role: WorkforceRoleKey } | null {
  const cleaned = cleanCellText(raw);
  if (!cleaned) {
    return null;
  }

  if (/^CREWED$/i.test(cleaned)) {
    return null;
  }

  const role: WorkforceRoleKey | null = /\bAC\b/i.test(cleaned) || /\bREFRIG\b/i.test(cleaned)
    ? "acTechs"
    : /\bRIG(?:GER)?S?\b/i.test(cleaned)
      ? "riggers"
      : /\bSHIPWRIGHTS?\b/i.test(cleaned) || /\bSW\b/i.test(cleaned)
        ? "shipwrights"
        : /\bTECH(?:NICIAN)?S?\b/i.test(cleaned) || /\bFG\b/i.test(cleaned)
          ? "technicians"
          : null;

  if (!role) {
    return null;
  }

  let name = cleaned;
  if (cleaned.includes(",")) {
    name = cleaned.split(",", 1)[0]?.trim() ?? "";
  }

  name = name
    .replace(/\bTECH(?:NICIAN)?S?\b/gi, " ")
    .replace(/\bAC\b/gi, " ")
    .replace(/\bREFRIG\b/gi, " ")
    .replace(/\bFG\b/gi, " ")
    .replace(/\bRIG(?:GER)?S?\b/gi, " ")
    .replace(/\bSHIPWRIGHTS?\b/gi, " ")
    .replace(/\bSW\b/gi, " ")
    .replace(/[|()/_-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!name) {
    return null;
  }

  return { name, role };
}

function parseDaysOffCell(raw: string): Set<string> {
  const matches = raw.match(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/gi) ?? [];
  return new Set(matches.map(normalizeDayLabel));
}

function normalizeDayLabel(day: string): string {
  const short = day.trim().slice(0, 3).toLowerCase();
  if (!short) {
    return "";
  }
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function getCharterPriorityFromCharterer(charterer: string): VesselCharterPriority {
  const cleaned = cleanCellText(charterer);
  if (!cleaned) {
    return {
      level: "none",
      flag: null,
      charterer: "",
    };
  }

  if (/\(\s*OB\s*\)/i.test(cleaned)) {
    return {
      level: "ownerBerth",
      flag: "OB",
      charterer: cleaned,
    };
  }

  if (/\(\s*O\s*\)/i.test(cleaned)) {
    return {
      level: "owner",
      flag: "O",
      charterer: cleaned,
    };
  }

  return {
    level: "none",
    flag: null,
    charterer: cleaned,
  };
}

function buildTurnaroundEntries(
  rows: DailyTargetRow[],
  workerPools: WorkerPools,
  charterPriorityByDateBoat: Map<string, VesselCharterPriority>,
): TurnaroundEntry[] {
  const byDateBoat = new Map<string, TurnaroundEntry>();
  const arrivalsByBoat = buildArrivalRowsByBoat(rows);

  for (const row of rows) {
    const boatName = cleanCellText(row.boatName);
    if (!boatName) {
      continue;
    }
    if (!isPowerType(row.type)) {
      continue;
    }
    if (row.movementType !== "departure") {
      continue;
    }

    const boatKey = normalizeBoatName(boatName);
    const departureDateIso = normalizeSheetDate(row.nextCharterDateIso) || row.dateIso;
    const operationalDateIso = normalizeSheetDate(row.dateIso) || departureDateIso;
    const plannedArrival = resolvePlannedArrivalForDeparture(
      arrivalsByBoat.get(boatKey) ?? [],
      operationalDateIso,
    );
    const key = `${operationalDateIso}-${boatKey}`;
    const charterPriority =
      charterPriorityByDateBoat.get(`${departureDateIso}-${boatKey}`) ??
      charterPriorityByDateBoat.get(`${row.dateIso}-${boatKey}`) ??
      getCharterPriorityFromCharterer(boatName);
    const urgency = parseDaysUntilDeparture(row.daysUntilNextCharter, departureDateIso);
    const technicalStatus = parseTargetStatus(row.technicalCompletionRaw, urgency);
    const cleaningStatus = parseTargetStatus(row.cleaningCompletionRaw, urgency);

    const riggerStatus: RoleStatus = technicalStatus;
    const shipwrightStatus: RoleStatus =
      cleaningStatus === 0 && technicalStatus === 2 ? 1 : cleaningStatus;
    const acTechStatus: RoleStatus = technicalStatus === 2 ? 2 : urgency <= 1 ? 0 : 1;

    const technicianAssignee = resolveWorkerId(
      workerPools.technicians,
      operationalDateIso,
      boatName,
      "technicians",
    );
    const riggerAssignee = resolveWorkerId(
      workerPools.riggers,
      operationalDateIso,
      boatName,
      "riggers",
    );
    const shipwrightAssignee = resolveWorkerId(
      workerPools.shipwrights,
      operationalDateIso,
      boatName,
      "shipwright",
    );
    const acTechAssignee = resolveWorkerId(
      workerPools.acTechs,
      operationalDateIso,
      boatName,
      "acTechs",
    );

    const completedAtIso = `${operationalDateIso}T17:00:00.000Z`;
    const roleStates: RoleState[] = [
      {
        key: "technicians",
        label: "Technician",
        status: technicalStatus,
        assigneeId: technicianAssignee,
        updatedAtIso: technicalStatus === 2 ? completedAtIso : null,
      },
      {
        key: "riggers",
        label: "Rigger",
        status: riggerStatus,
        assigneeId: riggerAssignee,
        updatedAtIso: riggerStatus === 2 ? completedAtIso : null,
      },
      {
        key: "shipwright",
        label: "Shipwright",
        status: shipwrightStatus,
        assigneeId: shipwrightAssignee,
        updatedAtIso: shipwrightStatus === 2 ? completedAtIso : null,
      },
      {
        key: "technical",
        label: "Technical Turnaround",
        status: technicalStatus,
        assigneeId: technicianAssignee,
        updatedAtIso: technicalStatus === 2 ? completedAtIso : null,
      },
      {
        key: "acTech",
        label: "AC Tech",
        status: acTechStatus,
        assigneeId: acTechAssignee,
        updatedAtIso: acTechStatus === 2 ? completedAtIso : null,
      },
      {
        key: "cleaning",
        label: "Cleaning",
        status: cleaningStatus,
        assigneeId: shipwrightAssignee,
        updatedAtIso: cleaningStatus === 2 ? completedAtIso : null,
      },
    ];

    const completionRelevantStates = roleStates.filter((role) => role.key !== "acTech");
    const completedRoles = completionRelevantStates.filter((role) => role.status === 2).length;
    const inProgressRoles = completionRelevantStates.filter((role) => role.status === 1).length;
    const pendingRoles = completionRelevantStates.length - completedRoles - inProgressRoles;
    const completionPct =
      ((completedRoles + inProgressRoles * 0.55) / Math.max(completionRelevantStates.length, 1)) * 100;

    const entry: TurnaroundEntry = {
      id: `${operationalDateIso}-${boatKey}`,
      dateIso: operationalDateIso,
      sourceDateIso: row.dateIso,
      departureDateIso,
      plannedArrivalDateIso: plannedArrival?.dateIso ?? null,
      plannedArrivalTime: plannedArrival?.time ?? null,
      daysUntilDeparture: urgency,
      stat: row.type || "MP",
      boatName,
      boatLink: null,
      roleStates,
      completionPct,
      completedRoles,
      pendingRoles,
      inProgressRoles,
      charterPriority: charterPriority.level,
      charterPriorityFlag: charterPriority.flag,
      charterer: charterPriority.charterer,
    };

    const existing = byDateBoat.get(key);
    if (!existing) {
      byDateBoat.set(key, entry);
      continue;
    }

    const replace =
      completionPct < existing.completionPct ||
      (completionPct === existing.completionPct && entry.stat === "MP" && existing.stat !== "MP");

    if (replace) {
      byDateBoat.set(key, entry);
    }
  }

  return [...byDateBoat.values()].sort((left, right) => {
    if (left.dateIso !== right.dateIso) {
      return left.dateIso.localeCompare(right.dateIso);
    }
    return left.boatName.localeCompare(right.boatName);
  });
}

function buildArrivalRowsByBoat(
  rows: DailyTargetRow[],
): Map<string, Array<{ dateIso: string; time: string }>> {
  const byBoat = new Map<string, Array<{ dateIso: string; time: string }>>();
  for (const row of rows) {
    if (row.movementType !== "arrival" || !isPowerType(row.type)) {
      continue;
    }
    const boatKey = normalizeBoatName(row.boatName);
    const dateIso = normalizeSheetDate(row.dateIso);
    if (!boatKey || !dateIso) {
      continue;
    }
    const bucket = byBoat.get(boatKey) ?? [];
    bucket.push({
      dateIso,
      time: cleanCellText(row.nextCharterStartTime),
    });
    byBoat.set(boatKey, bucket);
  }

  for (const bucket of byBoat.values()) {
    bucket.sort((left, right) => {
      if (left.dateIso !== right.dateIso) {
        return left.dateIso.localeCompare(right.dateIso);
      }
      return left.time.localeCompare(right.time);
    });
  }

  return byBoat;
}

function resolvePlannedArrivalForDeparture(
  arrivals: Array<{ dateIso: string; time: string }>,
  departureDateIso: string,
): { dateIso: string; time: string } | null {
  let selected: { dateIso: string; time: string } | null = null;
  for (const arrival of arrivals) {
    if (arrival.dateIso > departureDateIso) {
      break;
    }
    selected = arrival;
  }
  return selected;
}

function applyCanonicalTaskCompletionsToEntries(
  entries: TurnaroundEntry[],
  completions: Awaited<ReturnType<typeof listCanonicalTaskCompletions>>,
): TurnaroundEntry[] {
  if (Object.keys(completions).length === 0) {
    return entries;
  }

  return entries.map((entry) => {
    const canonicalTaskKey = `${entry.dateIso}-${normalizeBoatName(entry.boatName)}`;
    const completion = completions[canonicalTaskKey];
    if (!completion || completion.done !== true) {
      return entry;
    }

    const completedAtIso = completion.completedAtIso || `${entry.dateIso}T17:00:00.000Z`;
    const roleStates = entry.roleStates.map((role) => ({
      ...role,
      status: 2 as RoleStatus,
      updatedAtIso: completedAtIso,
    }));
    const completionRelevantStates = roleStates.filter((role) => role.key !== "acTech");
    const completedRoles = completionRelevantStates.length;

    return {
      ...entry,
      roleStates,
      completionPct: 100,
      completedRoles,
      pendingRoles: 0,
      inProgressRoles: 0,
    };
  });
}

function isPowerType(value: string): boolean {
  const normalized = cleanCellText(value).toUpperCase();
  if (!normalized) {
    return false;
  }
  return normalized === "MP" || normalized.includes("POWER");
}

function parseDaysUntilDeparture(raw: string, departureDateIso: string): number {
  const cleaned = cleanCellText(raw).toUpperCase();
  if (cleaned) {
    if (cleaned === "QTA") {
      return 0;
    }
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }

  if (!isOperationalIsoDate(departureDateIso)) {
    return 2;
  }

  const today = startOfDay(new Date());
  const departureDate = parseDate(departureDateIso);
  const diffMs = departureDate.getTime() - today.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function parseTargetStatus(raw: string, urgency: number): RoleStatus {
  const cleaned = cleanCellText(raw).toUpperCase();
  if (!cleaned) {
    if (urgency <= 1) {
      return 0;
    }
    if (urgency <= 2) {
      return 1;
    }
    return 2;
  }

  if (
    cleaned === "Y" ||
    cleaned === "YES" ||
    cleaned.includes("COMPLETE") ||
    cleaned.includes("DONE")
  ) {
    return 2;
  }

  if (cleaned === "NOON" || cleaned === "SAB" || cleaned.includes("EVENING")) {
    return 1;
  }

  return 1;
}

function resolveWorkerId(
  workers: TechWorkerProfile[],
  dateIso: string,
  boatName: string,
  roleSalt: string,
): number {
  if (workers.length === 0) {
    return 0;
  }

  const dayLabel = parseDate(dateIso).toLocaleDateString("en-US", { weekday: "short" });
  const available = workers.filter(
    (worker) => !worker.daysOff.has(dayLabel) && !isWorkerOnLeaveForDate(worker, dateIso),
  );
  const pool = available.length > 0 ? available : workers;

  const hash = hashString(`${roleSalt}|${dateIso}|${normalizeBoatName(boatName)}`);
  return pool[hash % pool.length]?.id ?? pool[0].id;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function findSheetByNamePart(workbook: XLSX.WorkBook, namePart: string): XLSX.WorkSheet | null {
  const target = namePart.trim().toLowerCase();
  for (const name of workbook.SheetNames) {
    if (name.trim().toLowerCase() === target) {
      return workbook.Sheets[name];
    }
  }
  for (const name of workbook.SheetNames) {
    if (name.trim().toLowerCase().includes(target)) {
      return workbook.Sheets[name];
    }
  }
  return null;
}

function resolveDriveDataFileByPatterns(patterns: RegExp[]): string;
function resolveDriveDataFileByPatterns(patterns: RegExp[], optional: true): string | null;
function resolveDriveDataFileByPatterns(patterns: RegExp[], optional = false): string | null {
  const dataDirs = getDriveDataDirectories().filter((directoryPath) => fs.existsSync(directoryPath));
  const matches: string[] = [];

  for (const directoryPath of dataDirs) {
    const directoryMatches = fs
      .readdirSync(directoryPath)
      .filter((entry) => patterns.some((pattern) => pattern.test(entry)))
      .map((entry) => path.join(directoryPath, entry));
    matches.push(...directoryMatches);
  }

  if (matches.length > 0) {
    matches.sort((left, right) => {
      const mtimeDiff = fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
      if (mtimeDiff !== 0) {
        return mtimeDiff;
      }

      // Prefer runtime cache over bundled folder when timestamps tie.
      const leftRuntime = left.startsWith(runtimeDriveDataDir) ? 1 : 0;
      const rightRuntime = right.startsWith(runtimeDriveDataDir) ? 1 : 0;
      if (leftRuntime !== rightRuntime) {
        return rightRuntime - leftRuntime;
      }

      return right.localeCompare(left);
    });
    if (matches[0]) {
      return matches[0];
    }
  }

  if (optional) {
    return null;
  }

  throw new Error(
    `Could not find a data file matching patterns ${patterns.map((pattern) => pattern.toString()).join(", ")}`,
  );
}

function getDriveDataDirectories(): string[] {
  if (runtimeDriveDataDir === bundledDriveDataDir) {
    return [bundledDriveDataDir];
  }
  return [runtimeDriveDataDir, bundledDriveDataDir];
}

function isOperationalIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  if (year < 2000 || year > 2100) {
    return false;
  }

  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function parseOperationalIsoDate(value: string): Date | null {
  if (!isOperationalIsoDate(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function normalizeSheetDate(value: unknown): string {
  let normalized = "";
  if (value instanceof Date) {
    normalized = toIsoDate(value);
  } else if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      normalized = toIsoDate(new Date(parsed.y, parsed.m - 1, parsed.d));
    }
  } else {
    normalized = normalizeDateValue(value);
  }

  const parsed = parseOperationalIsoDate(normalized);
  return parsed ? toIsoDate(parsed) : "";
}

function buildSchedule(input: {
  primaryRows: TurnaroundEntry[];
  supportRows: TurnaroundEntry[];
  sourcePrimary: "Today" | "Tomorrow";
  sourceSupport: "Carryover";
  movementTimeByBoat: Map<string, string>;
  limit: number;
}): ScheduleItem[] {
  const candidates = [
    ...input.primaryRows.map((entry) => ({ entry, source: input.sourcePrimary })),
    ...input.supportRows.map((entry) => ({ entry, source: input.sourceSupport })),
  ];

  const deduped = dedupeByBoat(candidates);
  deduped.sort((a, b) =>
    priorityScore(b.entry, b.source) - priorityScore(a.entry, a.source),
  );

  return deduped.slice(0, input.limit).map((candidate, index) => {
    const pendingRoles = candidate.entry.roleStates.filter((role) => role.status !== 2);
    const focusRoles = pendingRoles.slice(0, 3).map((role) => role.label);

    const key = normalizeBoatName(candidate.entry.boatName);
    const preferredTime = input.movementTimeByBoat.get(key) ?? "";

    const timeWindow = preferredTime || dayTimeSlots[index % dayTimeSlots.length];
    const score = priorityScore(candidate.entry, candidate.source);

    return {
      id: `${candidate.entry.id}-${candidate.source}`,
      boatName: candidate.entry.boatName,
      size: guessSizeFromStat(candidate.entry.stat),
      stat: candidate.entry.stat,
      priority: score >= 82 ? "Critical" : score >= 64 ? "High" : "Medium",
      source: candidate.source,
      focusRoles: focusRoles.length > 0 ? focusRoles : ["General Turnaround"],
      completionPct: Math.round(candidate.entry.completionPct),
      dueDate: candidate.entry.dateIso,
      timeWindow,
      reason:
        candidate.source === "Carryover"
          ? `Carry-over with ${Math.round(candidate.entry.completionPct)}% completion from prior day.`
          : `Due ${candidate.source.toLowerCase()} with ${candidate.entry.pendingRoles} pending role checks.`,
    };
  });
}

function buildFleetRows(todayRows: TurnaroundEntry[], tomorrowRows: TurnaroundEntry[]): FleetRow[] {
  const merged = dedupeByBoat(
    [...todayRows, ...tomorrowRows].map((entry) => ({ entry, source: "Today" as const })),
  );

  return merged
    .map(({ entry }) => {
      let status: FleetRow["status"] = "On track";
      if (entry.completionPct < 25) {
        status = "Critical";
      } else if (entry.completionPct < 55) {
        status = "Watch";
      }

      return {
        id: entry.id,
        boatName: entry.boatName,
        dueDate: entry.dateIso,
        stat: entry.stat,
        completionPct: Math.round(entry.completionPct),
        pendingRoles: entry.pendingRoles,
        status,
        charterPriority: entry.charterPriority,
        charterPriorityFlag: entry.charterPriorityFlag,
        detailLink: entry.boatLink,
      };
    })
    .sort((left, right) => {
      if (left.status === right.status) {
        return left.boatName.localeCompare(right.boatName);
      }
      const rank: Record<FleetRow["status"], number> = {
        Critical: 0,
        Watch: 1,
        "On track": 2,
      };
      return rank[left.status] - rank[right.status];
    })
    .slice(0, 26);
}

function projectEntriesToOperationalDate(
  entries: TurnaroundEntry[],
  targetDateIso: string,
): TurnaroundEntry[] {
  return entries.map((entry) => ({
    ...entry,
    id: `${targetDateIso}-${normalizeBoatName(entry.boatName)}`,
    dateIso: targetDateIso,
  }));
}

function buildPulledForwardRowsForToday(input: {
  reportDateIso: string;
  nextWeekEndIso: string;
  todayRows: TurnaroundEntry[];
  carryoverRows: TurnaroundEntry[];
  futureRows: TurnaroundEntry[];
  todayCapacityBoats: number;
}): TurnaroundEntry[] {
  const openTodayCount = input.todayRows.filter((entry) => entry.completionPct < 95).length;
  const openCarryoverCount = input.carryoverRows.filter((entry) => entry.completionPct < 95).length;
  const availableSlots = Math.max(
    input.todayCapacityBoats - (openTodayCount + openCarryoverCount),
    0,
  );

  if (availableSlots <= 0) {
    return [];
  }

  const reservedBoats = new Set(
    [...input.todayRows, ...input.carryoverRows].map((entry) =>
      normalizeBoatName(entry.boatName),
    ),
  );

  const candidates = input.futureRows
    .filter(
      (entry) =>
        entry.completionPct < 95 &&
        entry.dateIso > input.reportDateIso &&
        entry.dateIso <= input.nextWeekEndIso &&
        !reservedBoats.has(normalizeBoatName(entry.boatName)),
    )
    .sort((left, right) => {
      if (left.daysUntilDeparture !== right.daysUntilDeparture) {
        return left.daysUntilDeparture - right.daysUntilDeparture;
      }
      const leftPriority = charterPriorityRank(left.charterPriority);
      const rightPriority = charterPriorityRank(right.charterPriority);
      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }
      if (left.pendingRoles !== right.pendingRoles) {
        return right.pendingRoles - left.pendingRoles;
      }
      if (left.completionPct !== right.completionPct) {
        return left.completionPct - right.completionPct;
      }
      return left.boatName.localeCompare(right.boatName);
    });

  const selected: TurnaroundEntry[] = [];
  const usedBoatKeys = new Set<string>();
  for (const candidate of candidates) {
    const boatKey = normalizeBoatName(candidate.boatName);
    if (usedBoatKeys.has(boatKey)) {
      continue;
    }
    usedBoatKeys.add(boatKey);
    selected.push(candidate);
    if (selected.length >= availableSlots) {
      break;
    }
  }
  return selected.map((entry) => ({
    ...entry,
    // Keep original identity for canonical completion linking, but execute today.
    dateIso: input.reportDateIso,
    sourceDateIso: entry.sourceDateIso || entry.dateIso,
  }));
}

function charterPriorityRank(priority: CharterPriorityLevel): number {
  if (priority === "owner") {
    return 2;
  }
  if (priority === "ownerBerth") {
    return 1;
  }
  return 0;
}

function buildPlanningEngine(input: {
  entries: TurnaroundEntry[];
  workerPools: WorkerPools;
  reportDate: Date;
  dailyCallInsByDate: DailyCallInByDate;
}): PlanningEngineData {
  const demandByDate = new Map<string, number>();
  const departureDemandByDate = new Map<string, number>();
  for (const entry of input.entries) {
    if (entry.completionPct >= 95) {
      continue;
    }
    demandByDate.set(entry.dateIso, (demandByDate.get(entry.dateIso) ?? 0) + 1);
    if (isOperationalIsoDate(entry.departureDateIso)) {
      departureDemandByDate.set(
        entry.departureDateIso,
        (departureDemandByDate.get(entry.departureDateIso) ?? 0) + 1,
      );
    }
  }

  const reportIso = toIsoDate(input.reportDate);
  const tomorrowIso = toIsoDate(addDays(input.reportDate, 1));
  const horizonDateSet = new Set<string>([reportIso, tomorrowIso]);

  const sortedDates = [...new Set([...demandByDate.keys(), ...departureDemandByDate.keys()])].sort(
    (left, right) => left.localeCompare(right),
  );
  for (const dateIso of sortedDates) {
    if (dateIso >= reportIso) {
      horizonDateSet.add(dateIso);
    }
  }

  const horizonDates = [...horizonDateSet]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 14);

  const horizon = horizonDates.map((dateIso) =>
    buildDailyPlanningSnapshot({
      dateIso,
      demandBoats: demandByDate.get(dateIso) ?? departureDemandByDate.get(dateIso) ?? 0,
      workerPools: input.workerPools,
      dailyCallInsByDate: input.dailyCallInsByDate,
    }),
  );

  const today =
    horizon.find((snapshot) => snapshot.dateIso === reportIso) ??
    buildDailyPlanningSnapshot({
      dateIso: reportIso,
      demandBoats: demandByDate.get(reportIso) ?? departureDemandByDate.get(reportIso) ?? 0,
      workerPools: input.workerPools,
      dailyCallInsByDate: input.dailyCallInsByDate,
    });
  const tomorrow =
    horizon.find((snapshot) => snapshot.dateIso === tomorrowIso) ??
    buildDailyPlanningSnapshot({
      dateIso: tomorrowIso,
      demandBoats: demandByDate.get(tomorrowIso) ?? departureDemandByDate.get(tomorrowIso) ?? 0,
      workerPools: input.workerPools,
      dailyCallInsByDate: input.dailyCallInsByDate,
    });

  const recommendations = [
    ...today.recommendations,
    ...tomorrow.recommendations,
    ...horizon.slice(2).flatMap((snapshot) => snapshot.recommendations.slice(0, 1)),
  ].slice(0, 8);

  const alerts = horizon
    .filter((snapshot) => snapshot.status === "shortage")
    .slice(0, 5)
    .map((snapshot) => {
      const gap = snapshot.roles
        .filter((role) => role.shortageWorkers > 0)
        .map(
          (role) =>
            `${role.shortageWorkers} ${pluralizeRoleForMessage(role.roleLabel, role.shortageWorkers)}`,
        )
        .join(", ");
      return `⚠️ ${snapshot.dateLabel}: ${gap}.`;
    });

  return {
    today,
    tomorrow,
    horizon,
    recommendations,
    alerts,
  };
}

function buildDailyPlanningSnapshot(input: {
  dateIso: string;
  demandBoats: number;
  workerPools: WorkerPools;
  dailyCallInsByDate: DailyCallInByDate;
}): DailyPlanningSnapshot {
  const date = parseDate(input.dateIso);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });

  const roles: RoleCapacitySnapshot[] = roleCapacityRules.map((rule) => {
    const pool = input.workerPools[rule.key] ?? [];
    const calledIn = input.dailyCallInsByDate.get(input.dateIso)?.[rule.key] ?? new Set<string>();
    const availableWorkers = pool.filter(
      (worker) =>
        calledIn.has(normalizeBoatName(worker.label)) ||
        (!worker.daysOff.has(weekday) && !isWorkerOnLeaveForDate(worker, input.dateIso)),
    );
    const capacity = availableWorkers.length * rule.perWorkerCapacity;
    const shortageBoats = Math.max(input.demandBoats - capacity, 0);
    const shortageWorkers =
      shortageBoats > 0 ? Math.ceil(shortageBoats / rule.perWorkerCapacity) : 0;

    return {
      roleKey: rule.key,
      roleLabel: rule.label,
      perWorkerCapacity: rule.perWorkerCapacity,
      totalWorkers: pool.length,
      availableWorkers: availableWorkers.length,
      offWorkers: Math.max(pool.length - availableWorkers.length, 0),
      availableWorkerNames: availableWorkers.map((worker) => worker.label),
      capacity,
      demand: input.demandBoats,
      shortageBoats,
      shortageWorkers,
      surplusBoats: Math.max(capacity - input.demandBoats, 0),
    };
  });

  const totalCapacityBoats =
    roles.length > 0 ? Math.min(...roles.map((role) => role.capacity)) : 0;
  const bottleneckRole =
    roles.length > 0
      ? [...roles].sort((left, right) => left.capacity - right.capacity)[0]?.roleLabel ?? "N/A"
      : "N/A";

  const hasShortage = roles.some((role) => role.shortageWorkers > 0);
  const hasSurplus = roles.some((role) => role.surplusBoats >= role.perWorkerCapacity);
  const status: DailyPlanningSnapshot["status"] = hasShortage
    ? "shortage"
    : hasSurplus
      ? "surplus"
      : "sufficient";

  return {
    dateIso: input.dateIso,
    dateLabel: formatDate(date),
    demandBoats: input.demandBoats,
    bottleneckRole,
    totalCapacityBoats,
    status,
    roles,
    recommendations: buildDailyRecommendations({
      date,
      demandBoats: input.demandBoats,
      roles,
      status,
    }),
  };
}

function buildDailyRecommendations(input: {
  date: Date;
  demandBoats: number;
  roles: RoleCapacitySnapshot[];
  status: DailyPlanningSnapshot["status"];
}): string[] {
  const dateLabel = formatDate(input.date);
  const shortages = input.roles.filter((role) => role.shortageWorkers > 0);
  if (shortages.length > 0) {
    return shortages.map(
      (role) =>
        `⚠️ Short ${role.shortageWorkers} ${pluralizeRoleForMessage(role.roleLabel, role.shortageWorkers)} for ${dateLabel}.`,
    );
  }

  if (input.demandBoats <= 0) {
    return [
      `✅ Workforce sufficient for ${dateLabel}.`,
      `💡 Spare capacity available for maintenance on ${dateLabel}.`,
    ];
  }

  const recommendations = [`✅ Workforce sufficient for ${dateLabel}.`];
  if (input.status === "surplus") {
    recommendations.push(`💡 Spare capacity available for maintenance on ${dateLabel}.`);
  }
  return recommendations;
}

function pluralizeRoleForMessage(
  roleLabel: RoleCapacitySnapshot["roleLabel"],
  count: number,
): string {
  if (count === 1) {
    return roleLabel.toLowerCase();
  }
  if (roleLabel === "AC Tech") {
    return "AC techs";
  }
  return `${roleLabel.toLowerCase()}s`;
}

function buildOperationalNarrative(input: {
  previousRows: TurnaroundEntry[];
  todayRows: TurnaroundEntry[];
  tomorrowRows: TurnaroundEntry[];
  planningEngine: PlanningEngineData;
  yesterdayCapacity: DailyPlanningSnapshot;
  reportDate: Date;
}): OperationsDashboardData["operationalNarrative"] {
  const previousDate = addDays(input.reportDate, -1);
  const nextDate = addDays(input.reportDate, 1);
  const previousStatus = summarizeExecution(input.previousRows);
  const todayStatus = summarizeExecution(input.todayRows);
  const tomorrowStatus = summarizeExecution(input.tomorrowRows);

  const todayShortageCount = input.planningEngine.today.roles.filter(
    (role) => role.shortageWorkers > 0,
  ).length;
  const tomorrowShortageCount = input.planningEngine.tomorrow.roles.filter(
    (role) => role.shortageWorkers > 0,
  ).length;
  const yesterdayShortageCount = input.yesterdayCapacity.roles.filter(
    (role) => role.shortageWorkers > 0,
  ).length;
  const unresolvedYesterday = previousStatus.missed + previousStatus.inProgress;

  return {
    yesterday: {
      dateIso: toIsoDate(previousDate),
      dateLabel: formatDate(previousDate),
      demandBoats: input.previousRows.length,
      completedBoats: previousStatus.completed,
      inProgressBoats: previousStatus.inProgress,
      missedBoats: previousStatus.missed,
      completionRate: previousStatus.completionRate,
      workloadVsCapacity: `${input.previousRows.length} boats vs ${input.yesterdayCapacity.totalCapacityBoats} role-balanced capacity`,
      narrative:
        previousStatus.missed > 0 || yesterdayShortageCount > 0
          ? `${previousStatus.completed} completed and ${previousStatus.missed} missed on ${formatDate(previousDate)}. ${yesterdayShortageCount} role shortages were present.`
          : `All ${previousStatus.completed} vessels from ${formatDate(previousDate)} were completed.`,
    },
    today: {
      dateIso: toIsoDate(input.reportDate),
      dateLabel: formatDate(input.reportDate),
      demandBoats: input.todayRows.length,
      completedBoats: todayStatus.completed,
      inProgressBoats: todayStatus.inProgress,
      missedBoats: todayStatus.missed,
      completionRate: todayStatus.completionRate,
      workloadVsCapacity: `${input.planningEngine.today.demandBoats} boats vs ${input.planningEngine.today.totalCapacityBoats} role-balanced capacity`,
      narrative:
        todayShortageCount > 0
          ? `${todayStatus.inProgress} vessels are in progress. ${todayShortageCount} role shortages need action today.${unresolvedYesterday > 0 ? ` Carryover pressure from yesterday: ${unresolvedYesterday} vessels.` : ""}`
          : `${todayStatus.inProgress} vessels are in progress and workforce capacity is currently sufficient.${unresolvedYesterday > 0 ? ` Priority today: clear ${unresolvedYesterday} unresolved vessel${unresolvedYesterday === 1 ? "" : "s"} from yesterday.` : ""}`,
    },
    tomorrow: {
      dateIso: toIsoDate(nextDate),
      dateLabel: formatDate(nextDate),
      demandBoats: input.tomorrowRows.length,
      completedBoats: tomorrowStatus.completed,
      inProgressBoats: tomorrowStatus.inProgress,
      missedBoats: tomorrowStatus.missed,
      completionRate: tomorrowStatus.completionRate,
      workloadVsCapacity: `${input.planningEngine.tomorrow.demandBoats} boats vs ${input.planningEngine.tomorrow.totalCapacityBoats} role-balanced capacity`,
      narrative:
        tomorrowShortageCount > 0
          ? `Primary focus: ${input.planningEngine.tomorrow.demandBoats} boats due and ${tomorrowShortageCount} role shortages forecast.`
          : `Primary focus: ${input.planningEngine.tomorrow.demandBoats} boats due and workforce is sufficient.`,
    },
  };
}

function summarizeExecution(rows: TurnaroundEntry[]): {
  completed: number;
  inProgress: number;
  missed: number;
  completionRate: number;
} {
  if (rows.length === 0) {
    return {
      completed: 0,
      inProgress: 0,
      missed: 0,
      completionRate: 0,
    };
  }

  const completed = rows.filter((row) => row.completionPct >= 95).length;
  const inProgress = rows.filter((row) => row.completionPct >= 35 && row.completionPct < 95).length;
  const missed = rows.filter((row) => row.completionPct < 35).length;

  return {
    completed,
    inProgress,
    missed,
    completionRate: Math.round((completed / rows.length) * 100),
  };
}

function buildYesterdayTodayTomorrowActionPlan(input: {
  previousRows: TurnaroundEntry[];
  todayRows: TurnaroundEntry[];
  tomorrowRows: TurnaroundEntry[];
  planningEngine: PlanningEngineData;
  reportDate: Date;
}): string[] {
  const yesterday = summarizeExecution(input.previousRows);
  const todayShortages = input.planningEngine.today.roles.filter((role) => role.shortageWorkers > 0);
  const tomorrowShortages = input.planningEngine.tomorrow.roles.filter(
    (role) => role.shortageWorkers > 0,
  );
  const todayLabel = formatDate(input.reportDate);
  const tomorrowDate = addDays(input.reportDate, 1);
  const tomorrowLabel = formatDate(tomorrowDate);

  const plan: string[] = [];
  const unresolvedYesterday = yesterday.missed + yesterday.inProgress;
  if (unresolvedYesterday > 0) {
    plan.push(
      `⚠️ Recovery plan for ${todayLabel}: close ${unresolvedYesterday} carryover ${unresolvedYesterday === 1 ? "vessel" : "vessels"} from yesterday before non-critical starts.`,
    );
  }

  if (todayShortages.length > 0) {
    const todayGap = todayShortages
      .slice(0, 2)
      .map(
        (role) =>
          `${role.shortageWorkers} ${pluralizeRoleForMessage(role.roleLabel, role.shortageWorkers)}`,
      )
      .join(", ");
    plan.push(`⚠️ Today's workforce gap: ${todayGap}. Reassign early shifts now to protect ${tomorrowLabel}.`);
  } else {
    plan.push(
      `✅ Today's workforce is role-balanced. Use spare bandwidth to pre-close critical vessels due ${tomorrowLabel}.`,
    );
  }

  if (tomorrowShortages.length > 0) {
    const tomorrowGap = tomorrowShortages
      .slice(0, 2)
      .map(
        (role) =>
          `${role.shortageWorkers} ${pluralizeRoleForMessage(role.roleLabel, role.shortageWorkers)}`,
      )
      .join(", ");
    plan.push(`💡 Tomorrow risk signal: ${tomorrowGap}. Pull prep and inspections forward into today.`);
  } else if (input.tomorrowRows.length > 0) {
    plan.push(`💡 Finish today's open work before handover so ${tomorrowLabel} starts without carryover drag.`);
  }

  if (plan.length === 0) {
    plan.push(`✅ Keep current execution rhythm. Close today's assignments to protect ${tomorrowLabel}.`);
  }

  return plan.slice(0, 4);
}

function buildPlanningInsights(
  planningEngine: PlanningEngineData,
  operationalNarrative: OperationsDashboardData["operationalNarrative"],
): InsightItem[] {
  const tomorrowTone: InsightItem["tone"] =
    planningEngine.tomorrow.status === "shortage" ? "critical" : "positive";
  const todayTone: InsightItem["tone"] =
    planningEngine.today.status === "shortage" ? "warning" : "positive";
  const yesterdayTone: InsightItem["tone"] =
    operationalNarrative.yesterday.missedBoats > 0 ? "warning" : "positive";

  const cards: InsightItem[] = [
    {
      tone: yesterdayTone,
      message: operationalNarrative.yesterday.narrative,
    },
    {
      tone: todayTone,
      message: operationalNarrative.today.narrative,
    },
    {
      tone: tomorrowTone,
      message: operationalNarrative.tomorrow.narrative,
    },
  ];

  for (const message of [...planningEngine.recommendations, ...planningEngine.alerts]) {
    if (cards.length >= 8) {
      break;
    }
    cards.push({
      tone: message.startsWith("⚠️")
        ? "critical"
        : message.startsWith("💡")
          ? "neutral"
          : "positive",
      message,
    });
  }

  return cards;
}

function buildDailyApprovalData(input: {
  reportDateIso: string;
  reportDate: Date;
  planningEngine: PlanningEngineData;
  teamRoster: OperationsDashboardData["teamRoster"];
  assignmentPlan: AssignmentPlanItem[];
}): DailyApprovalData {
  const assignments = input.assignmentPlan
    .filter(
      (row) =>
        row.dueDate === input.reportDateIso ||
        (row.source === "Carryover" && row.dueDate <= input.reportDateIso),
    )
    .slice(0, 30)
    .map((row) => ({
      vessel: row.boatName,
      technician: row.technician.workerLabel,
      rigger: row.rigger.workerLabel,
      shipwright: row.shipwright.workerLabel,
      priority: row.priority,
      source: row.source,
    }));

  const shortages = input.planningEngine.today.roles
    .filter(
      (role) =>
        (role.roleKey === "technicians" ||
          role.roleKey === "riggers" ||
          role.roleKey === "shipwrights") &&
        role.shortageWorkers > 0,
    )
    .map((role) => {
      const roleMembers = input.teamRoster.members
        .filter((member) => member.roleKey === role.roleKey)
        .sort((left, right) => left.label.localeCompare(right.label));
      const unavailableFirst = roleMembers
        .filter((member) => !member.availableToday)
        .map((member) => member.label);
      const all = roleMembers.map((member) => member.label);
      const candidates = [...new Set([...unavailableFirst, ...all])];
      return {
        roleKey: role.roleKey,
        roleLabel: role.roleLabel,
        neededWorkers: role.shortageWorkers,
        candidateWorkers: candidates,
      };
    });

  return {
    dateIso: input.reportDateIso,
    dateLabel: formatDate(input.reportDate),
    demandBoats: input.planningEngine.today.demandBoats,
    assignedBoats: assignments.length,
    shortages,
    assignments,
  };
}

function buildReports(entries: TurnaroundEntry[], reportDate: Date) {
  const dailyGroups = groupEntries(entries, (entry) => entry.dateIso);
  const weeklyGroups = groupEntries(entries, (entry) => getIsoWeekKey(parseDate(entry.dateIso)));
  const monthlyGroups = groupEntries(entries, (entry) => entry.dateIso.slice(0, 7));

  const dailyPoints = [...dailyGroups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, group]) => aggregatePoint(formatShortDate(parseDate(key)), group));

  const weeklyPoints = [...weeklyGroups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, group]) => aggregatePoint(key.replace("-W", " W"), group));

  const monthlyPoints = [...monthlyGroups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, group]) => aggregatePoint(formatMonth(parseDate(`${key}-01`)), group));

  const reportIso = toIsoDate(reportDate);
  const weekKey = getIsoWeekKey(reportDate);
  const monthKey = reportIso.slice(0, 7);

  const dailyRows = dailyGroups.get(reportIso) ?? [];
  const weeklyRows = weeklyGroups.get(weekKey) ?? [];
  const monthlyRows = monthlyGroups.get(monthKey) ?? [];

  return {
    daily: {
      title: "Daily Report",
      periodLabel: formatDate(reportDate),
      summary: buildReportSummary(dailyRows, "day"),
      points: dailyPoints,
      pie: buildPieFromRows(dailyRows),
    },
    weekly: {
      title: "Weekly Report",
      periodLabel: weekKey,
      summary: buildReportSummary(weeklyRows, "week"),
      points: weeklyPoints,
      pie: buildPieFromRows(weeklyRows),
    },
    monthly: {
      title: "Monthly Report",
      periodLabel: formatMonth(reportDate),
      summary: buildReportSummary(monthlyRows, "month"),
      points: monthlyPoints,
      pie: buildPieFromRows(monthlyRows),
    },
  };
}

function buildTeamRoster(
  workerPools: WorkerPools,
  reportDate: Date,
  nextDate: Date,
  dailyCallInsByDate: DailyCallInByDate,
): OperationsDashboardData["teamRoster"] {
  const reportDay = reportDate.toLocaleDateString("en-US", { weekday: "short" });
  const nextDay = nextDate.toLocaleDateString("en-US", { weekday: "short" });
  const reportDateIso = toIsoDate(reportDate);
  const nextDateIso = toIsoDate(nextDate);
  const callInsToday = dailyCallInsByDate.get(reportDateIso) ?? emptyDailyCallInRoleSets();
  const callInsTomorrow = dailyCallInsByDate.get(nextDateIso) ?? emptyDailyCallInRoleSets();

  const members = ([
    ...workerPools.technicians.map((worker) => ({ roleKey: "technicians" as const, worker })),
    ...workerPools.riggers.map((worker) => ({ roleKey: "riggers" as const, worker })),
    ...workerPools.shipwrights.map((worker) => ({ roleKey: "shipwrights" as const, worker })),
    ...workerPools.acTechs.map((worker) => ({ roleKey: "acTechs" as const, worker })),
  ]).map((item) => ({
      id: `${item.roleKey}-${item.worker.id}`,
      roleKey: item.roleKey,
      roleLabel: roleLabelFromKey(item.roleKey),
      positionLabel: item.worker.positionLabel || roleLabelFromKey(item.roleKey),
      label: item.worker.label,
      daysOff: [...item.worker.daysOff].sort((left, right) => left.localeCompare(right)),
      onLeave: isWorkerOnLeaveForDate(item.worker, toIsoDate(reportDate)),
      backAtWorkDateIso: item.worker.backAtWorkDateIso ?? null,
      availableToday:
        callInsToday[item.roleKey].has(normalizeBoatName(item.worker.label)) ||
        (!item.worker.daysOff.has(reportDay) &&
          !isWorkerOnLeaveForDate(item.worker, toIsoDate(reportDate))),
      availableTomorrow:
        callInsTomorrow[item.roleKey].has(normalizeBoatName(item.worker.label)) ||
        (!item.worker.daysOff.has(nextDay) &&
          !isWorkerOnLeaveForDate(item.worker, toIsoDate(nextDate))),
      todayVessels: [],
    }));

  const availability = {
    today: {
      technicians: workerPools.technicians.filter(
        (worker) =>
          callInsToday.technicians.has(normalizeBoatName(worker.label)) ||
          (!worker.daysOff.has(reportDay) &&
            !isWorkerOnLeaveForDate(worker, toIsoDate(reportDate))),
      ).length,
      riggers: workerPools.riggers.filter(
        (worker) =>
          callInsToday.riggers.has(normalizeBoatName(worker.label)) ||
          (!worker.daysOff.has(reportDay) &&
            !isWorkerOnLeaveForDate(worker, toIsoDate(reportDate))),
      ).length,
      shipwrights: workerPools.shipwrights.filter(
        (worker) =>
          callInsToday.shipwrights.has(normalizeBoatName(worker.label)) ||
          (!worker.daysOff.has(reportDay) &&
            !isWorkerOnLeaveForDate(worker, toIsoDate(reportDate))),
      ).length,
      acTechs: workerPools.acTechs.filter(
        (worker) =>
          callInsToday.acTechs.has(normalizeBoatName(worker.label)) ||
          (!worker.daysOff.has(reportDay) &&
            !isWorkerOnLeaveForDate(worker, toIsoDate(reportDate))),
      ).length,
    },
    tomorrow: {
      technicians: workerPools.technicians.filter(
        (worker) =>
          callInsTomorrow.technicians.has(normalizeBoatName(worker.label)) ||
          (!worker.daysOff.has(nextDay) &&
            !isWorkerOnLeaveForDate(worker, toIsoDate(nextDate))),
      ).length,
      riggers: workerPools.riggers.filter(
        (worker) =>
          callInsTomorrow.riggers.has(normalizeBoatName(worker.label)) ||
          (!worker.daysOff.has(nextDay) &&
            !isWorkerOnLeaveForDate(worker, toIsoDate(nextDate))),
      ).length,
      shipwrights: workerPools.shipwrights.filter(
        (worker) =>
          callInsTomorrow.shipwrights.has(normalizeBoatName(worker.label)) ||
          (!worker.daysOff.has(nextDay) &&
            !isWorkerOnLeaveForDate(worker, toIsoDate(nextDate))),
      ).length,
      acTechs: workerPools.acTechs.filter(
        (worker) =>
          callInsTomorrow.acTechs.has(normalizeBoatName(worker.label)) ||
          (!worker.daysOff.has(nextDay) &&
            !isWorkerOnLeaveForDate(worker, toIsoDate(nextDate))),
      ).length,
    },
  };

  members.sort((left, right) => {
    if (left.roleKey !== right.roleKey) {
      return left.roleKey.localeCompare(right.roleKey);
    }
    return left.label.localeCompare(right.label);
  });

  return {
    members,
    previousMembers: [],
    availability,
  };
}

function roleLabelFromKey(roleKey: WorkforceRoleKey): string {
  if (roleKey === "technicians") {
    return "Technician";
  }
  if (roleKey === "riggers") {
    return "Rigger";
  }
  if (roleKey === "shipwrights") {
    return "Shipwright";
  }
  return "AC Tech";
}

function emptyDailyCallInRoleSets(): Record<WorkforceRoleKey, Set<string>> {
  return {
    technicians: new Set<string>(),
    riggers: new Set<string>(),
    shipwrights: new Set<string>(),
    acTechs: new Set<string>(),
  };
}

function isWorkerOnLeaveForDate(
  worker: { onLeave: boolean; backAtWorkDateIso: string | null | undefined },
  dateIso: string,
): boolean {
  if (!worker.onLeave) {
    return false;
  }
  const backAtWorkIso = worker.backAtWorkDateIso?.trim() ?? "";
  if (!backAtWorkIso || !/^\d{4}-\d{2}-\d{2}$/.test(backAtWorkIso)) {
    return true;
  }
  return dateIso < backAtWorkIso;
}

function derivePreviousTeamMembers(
  overrides: TeamOverrideRecord[],
): OperationsDashboardData["teamRoster"]["previousMembers"] {
  const latestByPerson = new Map<
    string,
    {
      roleKey: WorkforceRoleKey;
      label: string;
      positionLabel: string;
      daysOff: string[];
      backAtWorkDateIso: string | null;
      action: TeamOverrideRecord["action"];
      createdAtMs: number;
    }
  >();

  for (const override of overrides) {
    const key = `${override.role}:${normalizeBoatName(override.label)}`;
    latestByPerson.set(key, {
      roleKey: override.role,
      label: override.label,
      positionLabel: override.positionLabel || roleLabelFromKey(override.role),
      daysOff: override.daysOff,
      backAtWorkDateIso: override.backAtWorkDateIso ?? null,
      action: override.action,
      createdAtMs: override.createdAtMs,
    });
  }

  return [...latestByPerson.values()]
    .filter((item) => item.action === "remove")
    .sort((left, right) => right.createdAtMs - left.createdAtMs)
    .map((item) => ({
      id: `previous-${item.roleKey}-${normalizeBoatName(item.label)}`,
      roleKey: item.roleKey,
      roleLabel: roleLabelFromKey(item.roleKey),
      positionLabel: item.positionLabel,
      label: item.label,
      daysOff: item.daysOff,
      removedAtMs: item.createdAtMs,
    }));
}

function buildRoleAssignmentsByDay(
  entries: TurnaroundEntry[],
  targetDateIso: string,
  workerDirectory: {
    technicians: Map<number, string>;
    riggers: Map<number, string>;
    shipwrights: Map<number, string>;
    acTechs: Map<number, string>;
  },
): Record<WorkforceRoleKey, Map<string, string[]>> {
  const grouped: Record<WorkforceRoleKey, Map<string, Set<string>>> = {
    technicians: new Map(),
    riggers: new Map(),
    shipwrights: new Map(),
    acTechs: new Map(),
  };

  for (const entry of entries) {
    if (entry.dateIso !== targetDateIso) {
      continue;
    }

    for (const role of entry.roleStates) {
      if (role.assigneeId <= 0) {
        continue;
      }

      if (role.key === "technical") {
        const worker = workerDirectory.technicians.get(role.assigneeId);
        if (!worker) {
          continue;
        }
        const key = normalizeBoatName(worker);
        if (!grouped.technicians.has(key)) {
          grouped.technicians.set(key, new Set());
        }
        grouped.technicians.get(key)?.add(entry.boatName);
        continue;
      }

      if (role.key === "riggers") {
        const worker = workerDirectory.riggers.get(role.assigneeId);
        if (!worker) {
          continue;
        }
        const key = normalizeBoatName(worker);
        if (!grouped.riggers.has(key)) {
          grouped.riggers.set(key, new Set());
        }
        grouped.riggers.get(key)?.add(entry.boatName);
        continue;
      }

      if (role.key === "shipwright") {
        const worker = workerDirectory.shipwrights.get(role.assigneeId);
        if (!worker) {
          continue;
        }
        const key = normalizeBoatName(worker);
        if (!grouped.shipwrights.has(key)) {
          grouped.shipwrights.set(key, new Set());
        }
        grouped.shipwrights.get(key)?.add(entry.boatName);
        continue;
      }

      if (role.key === "acTech") {
        const worker = workerDirectory.acTechs.get(role.assigneeId);
        if (!worker) {
          continue;
        }
        const key = normalizeBoatName(worker);
        if (!grouped.acTechs.has(key)) {
          grouped.acTechs.set(key, new Set());
        }
        grouped.acTechs.get(key)?.add(entry.boatName);
      }
    }
  }

  const toSortedMap = (input: Map<string, Set<string>>) =>
    new Map<string, string[]>(
      [...input.entries()].map(([key, vessels]) => [key, [...vessels].sort((left, right) => left.localeCompare(right))]),
    );

  return {
    technicians: toSortedMap(grouped.technicians),
    riggers: toSortedMap(grouped.riggers),
    shipwrights: toSortedMap(grouped.shipwrights),
    acTechs: toSortedMap(grouped.acTechs),
  };
}

function buildPlannedLoads(
  candidates: Array<{ entry: TurnaroundEntry; source: AssignmentSource }>,
) {
  const technicians = new Map<number, number>();
  const riggers = new Map<number, number>();
  const shipwrights = new Map<number, number>();
  const acTechs = new Map<number, number>();

  for (const candidate of candidates) {
    const technicianRole = candidate.entry.roleStates.find((role) => role.key === "technical");
    if (technicianRole && technicianRole.assigneeId > 0 && technicianRole.status !== 2) {
      technicians.set(
        technicianRole.assigneeId,
        (technicians.get(technicianRole.assigneeId) ?? 0) + 1,
      );
    }

    const riggerRole = candidate.entry.roleStates.find((role) => role.key === "riggers");
    if (riggerRole && riggerRole.assigneeId > 0 && riggerRole.status !== 2) {
      riggers.set(riggerRole.assigneeId, (riggers.get(riggerRole.assigneeId) ?? 0) + 1);
    }

    const shipwrightRole = candidate.entry.roleStates.find((role) => role.key === "shipwright");
    if (shipwrightRole && shipwrightRole.assigneeId > 0 && shipwrightRole.status !== 2) {
      shipwrights.set(
        shipwrightRole.assigneeId,
        (shipwrights.get(shipwrightRole.assigneeId) ?? 0) + 1,
      );
    }

    const acTechRole = candidate.entry.roleStates.find((role) => role.key === "acTech");
    if (acTechRole && acTechRole.assigneeId > 0 && acTechRole.status !== 2) {
      acTechs.set(acTechRole.assigneeId, (acTechs.get(acTechRole.assigneeId) ?? 0) + 1);
    }
  }

  return {
    technicians,
    riggers,
    shipwrights,
    acTechs,
  };
}

function buildWorkerQualityReports(input: {
  entries: TurnaroundEntry[];
  roleKey: "technical" | "riggers" | "shipwright" | "acTech";
  roleName: "Technician" | "Rigger" | "Shipwright" | "AC Tech";
  reportDate: Date;
  plannedLoads: Map<number, number>;
  workerLabels?: Map<number, string>;
}): WorkerQualityReport[] {
  interface WorkerAccumulator {
    workerId: number;
    assignments: number;
    completed: number;
    inProgress: number;
    pending: number;
    lateAssignments: number;
    onTimeCompletions: number;
    weightedCompletion: number;
    totalVesselCompletion: number;
    vessels: Set<string>;
    trendByDate: Map<string, { jobs: number; weightedCompletion: number; critical: number }>;
  }

  const byWorker = new Map<number, WorkerAccumulator>();
  const reportDateStart = startOfDay(input.reportDate).getTime();

  for (const entry of input.entries) {
    const role = entry.roleStates.find((state) => state.key === input.roleKey);
    if (!role || role.assigneeId <= 0) {
      continue;
    }

    const workerId = role.assigneeId;
    const weight = role.status === 2 ? 1 : role.status === 1 ? 0.55 : 0;
    const dueDate = parseDate(entry.dateIso);
    const dueDateTime = dueDate.getTime();

    const worker =
      byWorker.get(workerId) ??
      ({
        workerId,
        assignments: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        lateAssignments: 0,
        onTimeCompletions: 0,
        weightedCompletion: 0,
        totalVesselCompletion: 0,
        vessels: new Set<string>(),
        trendByDate: new Map(),
      } satisfies WorkerAccumulator);

    worker.assignments += 1;
    worker.weightedCompletion += weight;
    worker.totalVesselCompletion += entry.completionPct;
    worker.vessels.add(entry.boatName);

    if (role.status === 2) {
      worker.completed += 1;
      if (isRoleOnTime(entry.dateIso, role.updatedAtIso)) {
        worker.onTimeCompletions += 1;
      }
    } else if (role.status === 1) {
      worker.inProgress += 1;
      if (dueDateTime < reportDateStart) {
        worker.lateAssignments += 1;
      }
    } else {
      worker.pending += 1;
      if (dueDateTime < reportDateStart) {
        worker.lateAssignments += 1;
      }
    }

    const trendBucket =
      worker.trendByDate.get(entry.dateIso) ??
      ({
        jobs: 0,
        weightedCompletion: 0,
        critical: 0,
      } satisfies { jobs: number; weightedCompletion: number; critical: number });
    trendBucket.jobs += 1;
    trendBucket.weightedCompletion += weight * 100;
    if (role.status === 0) {
      trendBucket.critical += 1;
    }
    worker.trendByDate.set(entry.dateIso, trendBucket);

    byWorker.set(workerId, worker);
  }

  return [...byWorker.values()]
    .map((worker) => {
      const completionRate = worker.weightedCompletion / Math.max(worker.assignments, 1);
      const onTimeRateRaw =
        worker.completed > 0 ? worker.onTimeCompletions / worker.completed : 1;
      const pendingRate = worker.pending / Math.max(worker.assignments, 1);
      const lateRate = worker.lateAssignments / Math.max(worker.assignments, 1);

      const qualityScore = clampNumber(
        Math.round(
          completionRate * 62 +
            onTimeRateRaw * 22 +
            (1 - pendingRate) * 10 +
            (1 - lateRate) * 6,
        ),
        0,
        100,
      );

      const trend = [...worker.trendByDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-8)
        .map(([dateIso, bucket]) => ({
          label: formatShortDate(parseDate(dateIso)),
          jobs: bucket.jobs,
          completion: Math.round(bucket.weightedCompletion / Math.max(bucket.jobs, 1)),
          critical: bucket.critical,
        }));

      return {
        id: `${input.roleName.toLowerCase()}-${worker.workerId}`,
        workerId: worker.workerId,
        workerLabel:
          input.workerLabels?.get(worker.workerId) ?? `${input.roleName} #${worker.workerId}`,
        role: input.roleName,
        assignments: worker.assignments,
        completed: worker.completed,
        inProgress: worker.inProgress,
        pending: worker.pending,
        lateAssignments: worker.lateAssignments,
        onTimeRate: Math.round(onTimeRateRaw * 100),
        averageVesselCompletionPct: Math.round(
          worker.totalVesselCompletion / Math.max(worker.assignments, 1),
        ),
        qualityScore,
        plannedLoad: input.plannedLoads.get(worker.workerId) ?? 0,
        vessels: [...worker.vessels].sort((left, right) => left.localeCompare(right)),
        trend,
        pie: [
          { label: "Completed", value: worker.completed, color: "#0ea5e9" },
          { label: "In Progress", value: worker.inProgress, color: "#f59e0b" },
          { label: "Pending", value: worker.pending, color: "#ef4444" },
        ],
      } satisfies WorkerQualityReport;
    })
    .sort((left, right) => {
      if (left.qualityScore !== right.qualityScore) {
        return right.qualityScore - left.qualityScore;
      }
      if (left.plannedLoad !== right.plannedLoad) {
        return left.plannedLoad - right.plannedLoad;
      }
      return left.workerId - right.workerId;
    });
}

function buildAssignmentPlan(input: {
  candidates: Array<{ entry: TurnaroundEntry; source: AssignmentSource }>;
  reportDate: Date;
  workerPools: WorkerPools;
  dailyCallInsByDate: DailyCallInByDate;
  movementTimeByBoat: Map<string, string>;
  technicianReports: WorkerQualityReport[];
  riggerReports: WorkerQualityReport[];
  shipwrightReports: WorkerQualityReport[];
  limit: number;
}): AssignmentPlanItem[] {
  const technicianById = new Map(
    input.technicianReports.map((worker) => [worker.workerId, worker]),
  );
  const riggerById = new Map(input.riggerReports.map((worker) => [worker.workerId, worker]));
  const shipwrightById = new Map(input.shipwrightReports.map((worker) => [worker.workerId, worker]));
  const technicianDailyLoad = new Map<string, Map<number, number>>();
  const riggerDailyLoad = new Map<string, Map<number, number>>();
  const shipwrightDailyLoad = new Map<string, Map<number, number>>();
  const reportDateIso = toIsoDate(startOfDay(input.reportDate));
  const sortedCandidates = [...input.candidates].sort((left, right) =>
    compareAssignmentCandidatesForDispatch(left, right, reportDateIso),
  );

  return sortedCandidates.slice(0, input.limit).map((candidate, index) => {
    const timeWindow =
      input.movementTimeByBoat.get(normalizeBoatName(candidate.entry.boatName)) ??
      dayTimeSlots[index % dayTimeSlots.length];
    const score = priorityScore(candidate.entry, candidate.source);
    const assignmentDateIso = resolveAssignmentDateIsoForDispatch(
      candidate.entry,
      candidate.source,
      reportDateIso,
    );
    const departureDateIso = isOperationalIsoDate(candidate.entry.departureDateIso)
      ? candidate.entry.departureDateIso
      : candidate.entry.dateIso;
    const daysUntilDeparture = Math.max(
      0,
      Math.floor(
        (parseDate(departureDateIso).getTime() - startOfDay(input.reportDate).getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    );
    const countTowardCapacity = candidate.entry.completionPct < 95 && candidate.source !== "Yesterday";

    const technician = resolveWorkerAssignment({
      entry: candidate.entry,
      assignmentDateIso,
      roleKey: "technical",
      roleName: "Technician",
      rolePool: input.workerPools.technicians,
      dailyLoadMap: technicianDailyLoad,
      workerReports: input.technicianReports,
      workerById: technicianById,
      countTowardCapacity,
      dailyCallInsByDate: input.dailyCallInsByDate,
    });
    const rigger = resolveWorkerAssignment({
      entry: candidate.entry,
      assignmentDateIso,
      roleKey: "riggers",
      roleName: "Rigger",
      rolePool: input.workerPools.riggers,
      dailyLoadMap: riggerDailyLoad,
      workerReports: input.riggerReports,
      workerById: riggerById,
      countTowardCapacity,
      dailyCallInsByDate: input.dailyCallInsByDate,
    });
    const shipwright = resolveWorkerAssignment({
      entry: candidate.entry,
      assignmentDateIso,
      roleKey: "shipwright",
      roleName: "Shipwright",
      rolePool: input.workerPools.shipwrights,
      dailyLoadMap: shipwrightDailyLoad,
      workerReports: input.shipwrightReports,
      workerById: shipwrightById,
      countTowardCapacity,
      dailyCallInsByDate: input.dailyCallInsByDate,
    });
    const isPulledForward =
      candidate.source === "Today" &&
      isOperationalIsoDate(candidate.entry.sourceDateIso) &&
      candidate.entry.sourceDateIso > candidate.entry.dateIso;
    const rationale = isPulledForward
      ? `Pulled forward from ${formatDate(parseDate(candidate.entry.sourceDateIso))} to use today's available capacity. Priority by nearest departure.`
      : buildAssignmentRationale(
          candidate.entry,
          candidate.source,
          technician,
          rigger,
          shipwright,
        );

    return {
      id: `${candidate.entry.id}-${candidate.source}`,
      boatName: candidate.entry.boatName,
      stat: candidate.entry.stat,
      source: candidate.source,
      dueDate: candidate.entry.dateIso,
      dueDateLabel: formatDate(parseDate(candidate.entry.dateIso)),
      departureDate: departureDateIso,
      departureDateLabel: formatDate(parseDate(departureDateIso)),
      plannedArrivalDate: candidate.entry.plannedArrivalDateIso,
      plannedArrivalDateLabel: candidate.entry.plannedArrivalDateIso
        ? formatDate(parseDate(candidate.entry.plannedArrivalDateIso))
        : null,
      plannedArrivalTime: candidate.entry.plannedArrivalTime,
      daysUntilDeparture,
      timeWindow,
      priority: score >= 82 ? "Critical" : score >= 64 ? "High" : "Medium",
      completionPct: Math.round(candidate.entry.completionPct),
      charterPriority: candidate.entry.charterPriority,
      charterPriorityFlag: candidate.entry.charterPriorityFlag,
      technician,
      rigger,
      shipwright,
      rationale,
    };
  });
}

function resolveWorkerAssignment(input: {
  entry: TurnaroundEntry;
  assignmentDateIso: string;
  roleKey: "technical" | "riggers" | "shipwright";
  roleName: "Technician" | "Rigger" | "Shipwright";
  rolePool: TechWorkerProfile[];
  dailyLoadMap: Map<string, Map<number, number>>;
  workerReports: WorkerQualityReport[];
  workerById: Map<number, WorkerQualityReport>;
  countTowardCapacity: boolean;
  dailyCallInsByDate: DailyCallInByDate;
}): AssignedWorker {
  const role = input.entry.roleStates.find((state) => state.key === input.roleKey);
  if (!role) {
    return {
      workerId: null,
      workerLabel: "Unassigned",
      assignmentState: "Unassigned",
      qualityScore: 0,
      plannedLoad: 0,
    };
  }

  const perWorkerCapacity = roleCapacityFor(input.roleName);
  const weekday = parseDate(input.assignmentDateIso).toLocaleDateString("en-US", {
    weekday: "short",
  });
  const callInRoleKey = rolePoolKeyForAssignmentRole(input.roleKey);
  const calledIn =
    input.dailyCallInsByDate.get(input.assignmentDateIso)?.[callInRoleKey] ?? new Set<string>();
  const availableWorkers = input.rolePool.filter(
    (worker) =>
      calledIn.has(normalizeBoatName(worker.label)) ||
      (!worker.daysOff.has(weekday) &&
        !isWorkerOnLeaveForDate(worker, input.assignmentDateIso)),
  );
  const availableById = new Map(availableWorkers.map((worker) => [worker.id, worker]));
  const dayLoad = ensureDailyLoad(input.dailyLoadMap, input.assignmentDateIso);

  const getLoad = (workerId: number) => dayLoad.get(workerId) ?? 0;
  const bumpLoad = (workerId: number) => {
    if (!input.countTowardCapacity) {
      return getLoad(workerId);
    }
    const next = getLoad(workerId) + 1;
    dayLoad.set(workerId, next);
    return next;
  };
  const hasCapacity = (workerId: number) =>
    !input.countTowardCapacity || getLoad(workerId) < perWorkerCapacity;

  const workerPoolRanked = availableWorkers
    .map((worker) => {
      const report = input.workerById.get(worker.id);
      return {
        id: worker.id,
        label: worker.label,
        qualityScore: report?.qualityScore ?? 0,
        pending: report?.pending ?? 0,
      };
    })
    .sort((left, right) => {
      const loadGap = getLoad(left.id) - getLoad(right.id);
      if (loadGap !== 0) {
        return loadGap;
      }
      if (left.qualityScore !== right.qualityScore) {
        return right.qualityScore - left.qualityScore;
      }
      if (left.pending !== right.pending) {
        return left.pending - right.pending;
      }
      return left.label.localeCompare(right.label);
    });

  if (role.assigneeId > 0 && availableById.has(role.assigneeId) && hasCapacity(role.assigneeId)) {
    const worker = input.workerById.get(role.assigneeId);
    const currentLoad = bumpLoad(role.assigneeId);
    return {
      workerId: role.assigneeId,
      workerLabel: worker?.workerLabel ?? `${input.roleName} #${role.assigneeId}`,
      assignmentState: "Assigned",
      qualityScore: worker?.qualityScore ?? 0,
      plannedLoad: currentLoad,
    };
  }

  const recommendation = workerPoolRanked.find((worker) => hasCapacity(worker.id));

  if (!recommendation) {
    return {
      workerId: null,
      workerLabel: "Unassigned",
      assignmentState: "Unassigned",
      qualityScore: 0,
      plannedLoad: perWorkerCapacity,
    };
  }

  const nextLoad = bumpLoad(recommendation.id);
  const assignmentState: AssignedWorker["assignmentState"] =
    role.assigneeId > 0 ? "Recommended" : "Recommended";

  return {
    workerId: recommendation.id,
    workerLabel: recommendation.label,
    assignmentState,
    qualityScore: recommendation.qualityScore,
    plannedLoad: nextLoad,
  };
}

function compareAssignmentCandidatesForDispatch(
  left: { entry: TurnaroundEntry; source: AssignmentSource },
  right: { entry: TurnaroundEntry; source: AssignmentSource },
  reportDateIso: string,
): number {
  const leftExecutionDate = resolveAssignmentDateIsoForDispatch(
    left.entry,
    left.source,
    reportDateIso,
  );
  const rightExecutionDate = resolveAssignmentDateIsoForDispatch(
    right.entry,
    right.source,
    reportDateIso,
  );

  if (leftExecutionDate !== rightExecutionDate) {
    return leftExecutionDate.localeCompare(rightExecutionDate);
  }

  const leftCritical = isCriticalDispatchCandidate(left.entry, left.source);
  const rightCritical = isCriticalDispatchCandidate(right.entry, right.source);
  if (leftCritical !== rightCritical) {
    return leftCritical ? -1 : 1;
  }

  const leftScore = priorityScore(left.entry, left.source);
  const rightScore = priorityScore(right.entry, right.source);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  if (left.entry.daysUntilDeparture !== right.entry.daysUntilDeparture) {
    return left.entry.daysUntilDeparture - right.entry.daysUntilDeparture;
  }

  if (left.entry.completionPct !== right.entry.completionPct) {
    return left.entry.completionPct - right.entry.completionPct;
  }

  return left.entry.boatName.localeCompare(right.entry.boatName);
}

function isCriticalDispatchCandidate(
  entry: TurnaroundEntry,
  source: AssignmentSource,
): boolean {
  if (entry.daysUntilDeparture <= 1) {
    return true;
  }

  if (source === "Carryover" && entry.daysUntilDeparture <= 2) {
    return true;
  }

  return priorityScore(entry, source) >= 82;
}

function resolveAssignmentDateIsoForDispatch(
  entry: TurnaroundEntry,
  source: AssignmentSource,
  reportDateIso: string,
): string {
  const entryDateIso = isOperationalIsoDate(entry.dateIso) ? entry.dateIso : reportDateIso;
  if (source === "Carryover" && entryDateIso < reportDateIso) {
    return reportDateIso;
  }
  return entryDateIso;
}

function ensureDailyLoad(
  map: Map<string, Map<number, number>>,
  dateIso: string,
): Map<number, number> {
  const existing = map.get(dateIso);
  if (existing) {
    return existing;
  }
  const next = new Map<number, number>();
  map.set(dateIso, next);
  return next;
}

function roleCapacityFor(roleName: "Technician" | "Rigger" | "Shipwright"): number {
  if (roleName === "Technician") {
    return 3;
  }
  if (roleName === "Rigger") {
    return 9;
  }
  return 5;
}

function rolePoolKeyForAssignmentRole(
  roleKey: "technical" | "riggers" | "shipwright",
): WorkforceRoleKey {
  if (roleKey === "technical") {
    return "technicians";
  }
  if (roleKey === "shipwright") {
    return "shipwrights";
  }
  return "riggers";
}

function buildAssignmentRationale(
  entry: TurnaroundEntry,
  source: AssignmentSource,
  technician: AssignedWorker,
  rigger: AssignedWorker,
  shipwright: AssignedWorker,
): string {
  const pendingRoles = entry.roleStates
    .filter((role) => role.status !== 2)
    .map((role) => role.label)
    .slice(0, 3);

  const base =
    source === "Carryover"
      ? `Carryover from prior day with ${Math.round(entry.completionPct)}% completion.`
      : source === "Yesterday"
        ? `Yesterday execution review with ${Math.round(entry.completionPct)}% completion.`
      : source === "Next Week"
        ? `Forward plan for the next seven days with ${entry.pendingRoles} pending role checks.`
      : `Due ${source.toLowerCase()} with ${entry.pendingRoles} pending role checks.`;

  const assignmentNotes: string[] = [];
  if (technician.assignmentState === "Recommended") {
    assignmentNotes.push(`Technician reassigned to ${technician.workerLabel}`);
  }
  if (rigger.assignmentState === "Recommended") {
    assignmentNotes.push(`Rigger reassigned to ${rigger.workerLabel}`);
  }
  if (shipwright.assignmentState === "Recommended") {
    assignmentNotes.push(`Shipwright reassigned to ${shipwright.workerLabel}`);
  }
  if (
    technician.assignmentState === "Unassigned" ||
    rigger.assignmentState === "Unassigned" ||
    shipwright.assignmentState === "Unassigned"
  ) {
    assignmentNotes.push("requires dispatcher confirmation");
  }

  const rolesText =
    pendingRoles.length > 0 ? `Priority roles: ${pendingRoles.join(", ")}.` : "All core roles closed.";

  if (assignmentNotes.length === 0) {
    return `${base} ${rolesText}`;
  }

  return `${base} ${rolesText} ${assignmentNotes.join("; ")}.`;
}

function buildVesselQualityReports(entries: TurnaroundEntry[], reportDate: Date): VesselQualityReport[] {
  const byBoat = new Map<string, TurnaroundEntry[]>();
  for (const entry of entries) {
    const key = normalizeBoatName(entry.boatName);
    const bucket = byBoat.get(key) ?? [];
    bucket.push(entry);
    byBoat.set(key, bucket);
  }

  const reportDateIso = toIsoDate(reportDate);
  const reportDateStart = startOfDay(reportDate).getTime();

  const reports = [...byBoat.entries()].map(([boatKey, rows]) => {
    const sortedRows = [...rows].sort((left, right) => left.dateIso.localeCompare(right.dateIso));
    const todayRow = sortedRows.find((row) => row.dateIso === reportDateIso) ?? null;
    const upcomingRow =
      sortedRows.find((row) => parseDate(row.dateIso).getTime() > reportDateStart) ?? null;
    const latestRow = sortedRows.at(-1) ?? sortedRows[0];
    const focusRow = todayRow ?? upcomingRow ?? latestRow;

    const averageCompletionPct = Math.round(averageCompletion(sortedRows));
    const lateTurnarounds = sortedRows.filter((row) => {
      const dueDateTime = parseDate(row.dateIso).getTime();
      return dueDateTime < reportDateStart && row.completionPct < 100;
    }).length;
    const criticalTurnarounds = sortedRows.filter((row) => row.completionPct < 30).length;

    const currentCompletionPct = Math.round(focusRow.completionPct);
    let risk: VesselQualityReport["risk"] = "On track";
    if (currentCompletionPct < 25) {
      risk = "Critical";
    } else if (currentCompletionPct < 55) {
      risk = "Watch";
    }

    const qualityScore = clampNumber(
      Math.round(
        averageCompletionPct * 0.65 +
          currentCompletionPct * 0.25 -
          lateTurnarounds * 6 -
          criticalTurnarounds * 2 +
          Math.min(sortedRows.length, 10),
      ),
      0,
      100,
    );

    const focusTechnician = focusRow.roleStates.find((role) => role.key === "technical");
    const focusRigger = focusRow.roleStates.find((role) => role.key === "riggers");
    const focusShipwright = focusRow.roleStates.find((role) => role.key === "shipwright");
    const pendingRoles = focusRow.roleStates
      .filter((role) => role.status !== 2)
      .map((role) => role.label);

    return {
      id: boatKey,
      boatName: focusRow.boatName,
      boatLink: focusRow.boatLink,
      stat: focusRow.stat,
      latestDueDate: focusRow.dateIso,
      currentCompletionPct,
      averageCompletionPct,
      totalTurnarounds: sortedRows.length,
      lateTurnarounds,
      criticalTurnarounds,
      qualityScore,
      risk,
      charterPriority: focusRow.charterPriority,
      charterPriorityFlag: focusRow.charterPriorityFlag,
      assignedTechnician:
        focusTechnician && focusTechnician.assigneeId > 0
          ? `Technician #${focusTechnician.assigneeId}`
          : "Unassigned",
      assignedRigger:
        focusRigger && focusRigger.assigneeId > 0
          ? `Rigger #${focusRigger.assigneeId}`
          : "Unassigned",
      assignedShipwright:
        focusShipwright && focusShipwright.assigneeId > 0
          ? `Shipwright #${focusShipwright.assigneeId}`
          : "Unassigned",
      pendingRoles,
      trend: sortedRows.slice(-8).map((row) => ({
        label: formatShortDate(parseDate(row.dateIso)),
        jobs: 1,
        completion: Math.round(row.completionPct),
        critical: row.completionPct < 30 ? 1 : 0,
      })),
      pie: buildPieFromRows([focusRow]),
      note:
        lateTurnarounds > 0
          ? `${lateTurnarounds} late turnaround(s) recorded before ${formatDate(reportDate)}.`
          : `No late turnarounds before ${formatDate(reportDate)}.`,
    } satisfies VesselQualityReport;
  });

  const rank: Record<VesselQualityReport["risk"], number> = {
    Critical: 0,
    Watch: 1,
    "On track": 2,
  };

  return reports.sort((left, right) => {
    if (rank[left.risk] !== rank[right.risk]) {
      return rank[left.risk] - rank[right.risk];
    }
    if (left.qualityScore !== right.qualityScore) {
      return left.qualityScore - right.qualityScore;
    }
    return left.boatName.localeCompare(right.boatName);
  });
}

function isRoleOnTime(dueDateIso: string, updatedAtIso: string | null): boolean {
  if (!updatedAtIso) {
    return true;
  }
  const dueDate = parseDate(dueDateIso);
  const completedAt = new Date(updatedAtIso);
  if (Number.isNaN(completedAt.getTime())) {
    return true;
  }
  const dueEnd = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
    23,
    59,
    59,
    999,
  );
  return completedAt.getTime() <= dueEnd.getTime();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function aggregatePoint(label: string, rows: TurnaroundEntry[]): ReportPoint {
  const jobs = rows.length;
  const completion = Math.round(averageCompletion(rows));
  const critical = rows.filter((row) => row.completionPct < 30).length;

  return {
    label,
    jobs,
    completion,
    critical,
  };
}

function buildPieFromRows(rows: TurnaroundEntry[]): PieSlice[] {
  let completed = 0;
  let inProgress = 0;
  let pending = 0;

  for (const row of rows) {
    completed += row.completedRoles;
    inProgress += row.inProgressRoles;
    pending += row.pendingRoles;
  }

  return [
    { label: "Completed", value: completed, color: "#0ea5e9" },
    { label: "In Progress", value: inProgress, color: "#f59e0b" },
    { label: "Pending", value: pending, color: "#ef4444" },
  ];
}

function buildReportSummary(rows: TurnaroundEntry[], frame: "day" | "week" | "month") {
  if (rows.length === 0) {
    return `No ${frame} data found in the imported reports.`;
  }

  const completion = Math.round(averageCompletion(rows));
  const critical = rows.filter((row) => row.completionPct < 30).length;

  return `${rows.length} boats tracked this ${frame}; average completion ${completion}% with ${critical} critical-risk boats.`;
}

function averageCompletion(rows: TurnaroundEntry[]): number {
  if (rows.length === 0) {
    return 0;
  }

  return rows.reduce((sum, row) => sum + row.completionPct, 0) / rows.length;
}

function priorityScore(entry: TurnaroundEntry, source: AssignmentSource) {
  let score = 0;

  if (source === "Carryover") {
    score += 34;
  } else if (source === "Today") {
    score += 30;
  } else if (source === "Tomorrow") {
    score += 24;
  } else if (source === "Next Week") {
    score += 16;
  } else if (source === "Yesterday") {
    score += 10;
  } else {
    score += 20;
  }

  if (entry.daysUntilDeparture <= 0) {
    score += 62;
  } else if (entry.daysUntilDeparture === 1) {
    score += 52;
  } else if (entry.daysUntilDeparture === 2) {
    score += 42;
  } else if (entry.daysUntilDeparture === 3) {
    score += 32;
  } else if (entry.daysUntilDeparture === 4) {
    score += 24;
  } else if (entry.daysUntilDeparture === 5) {
    score += 18;
  } else {
    score += 10;
  }

  if (entry.stat === "QTA") {
    score += 10;
  }

  score += Math.round((100 - entry.completionPct) / 3);
  score += Math.min(entry.pendingRoles * 2, 14);

  const hasUnassignedPendingRole = entry.roleStates.some(
    (role) => role.status !== 2 && role.assigneeId === 0,
  );
  if (hasUnassignedPendingRole) {
    score += 7;
  }

  return score;
}

function dedupeByBoat<T extends { entry: TurnaroundEntry; source: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();

  for (const row of rows) {
    const key = normalizeBoatName(row.entry.boatName);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, row);
      continue;
    }

    const existingScore = priorityScore(existing.entry, mapSource(existing.source));
    const candidateScore = priorityScore(row.entry, mapSource(row.source));

    if (candidateScore > existingScore) {
      map.set(key, row);
    }
  }

  return [...map.values()];
}

function dedupeBySourceAndBoat<T extends { entry: TurnaroundEntry; source: string }>(
  rows: T[],
): T[] {
  const map = new Map<string, T>();

  for (const row of rows) {
    const key = `${row.source}:${normalizeBoatName(row.entry.boatName)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
      continue;
    }

    const existingScore = priorityScore(existing.entry, mapSource(existing.source));
    const candidateScore = priorityScore(row.entry, mapSource(row.source));
    if (candidateScore > existingScore) {
      map.set(key, row);
    }
  }

  return [...map.values()];
}

function mapSource(source: string): AssignmentSource {
  if (
    source === "Yesterday" ||
    source === "Today" ||
    source === "Tomorrow" ||
    source === "Next Week"
  ) {
    return source;
  }
  return "Carryover";
}

function guessSizeFromStat(stat: string): string {
  if (stat.includes("N")) {
    return "Nautical";
  }
  if (stat === "QTA") {
    return "Quick Turnaround";
  }
  return "Standard";
}

function groupEntries<T extends string>(
  entries: TurnaroundEntry[],
  keySelector: (entry: TurnaroundEntry) => T,
): Map<T, TurnaroundEntry[]> {
  const groups = new Map<T, TurnaroundEntry[]>();
  for (const entry of entries) {
    const key = keySelector(entry);
    const bucket = groups.get(key) ?? [];
    bucket.push(entry);
    groups.set(key, bucket);
  }
  return groups;
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function cleanCellText(value: unknown): string {
  if (value instanceof Date) {
    return toIsoDate(value);
  }
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
}

function formatDate(dateValue: Date): string {
  return dateValue.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(dateValue: Date): string {
  return dateValue.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatMonth(dateValue: Date): string {
  return dateValue.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function normalizeBoatName(boatName: string): string {
  return boatName
    .toUpperCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

function resolveReportingStartIso(): string {
  const configured = process.env.MOORINGS_REPORTING_START_DATE?.trim();
  if (configured && /^\d{4}-\d{2}-\d{2}$/.test(configured)) {
    return configured;
  }
  return "2026-04-01";
}

function parseDate(isoDate: string): Date {
  const normalized = normalizeDateValue(isoDate);
  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(2000, 0, 1);
  }
  return new Date(year, (month || 1) - 1, day || 1);
}

function addDays(dateValue: Date, days: number): Date {
  const next = new Date(dateValue);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function startOfDay(dateValue: Date): Date {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate());
}

function toIsoDate(dateValue: Date): string {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getIsoWeekKey(dateValue: Date): string {
  const utcDate = new Date(Date.UTC(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function ensureFileExists(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required data file: ${filePath}`);
  }
}

function normalizeDateValue(value: unknown): string {
  if (value instanceof Date) {
    return toIsoDate(value);
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  const isoDateTimeMatch = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/i,
  );
  if (isoDateTimeMatch) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return toIsoDate(parsed);
    }

    const year = Number(isoDateTimeMatch[1]);
    const month = Number(isoDateTimeMatch[2]);
    const day = Number(isoDateTimeMatch[3]);
    return toIsoDate(new Date(year, month - 1, day));
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return toIsoDate(new Date(year, month - 1, day));
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const yearRaw = Number(slashMatch[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    return toIsoDate(new Date(year, month - 1, day));
  }

  const textualDateCandidate = raw
    .replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const hasMonthName = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(
    textualDateCandidate,
  );
  const hasFourDigitYear = /\b20\d{2}\b/.test(textualDateCandidate);

  if (!hasMonthName || !hasFourDigitYear) {
    return raw;
  }

  const parsed = new Date(textualDateCandidate);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDate(parsed);
  }

  return raw;
}
