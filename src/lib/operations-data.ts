import "server-only";

import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const csvPath = path.join(process.cwd(), "data", "drive", "turnaround_plan (1).csv");
const workbookPath = path.join(
  process.cwd(),
  "data",
  "drive",
  "BVI Turnaround Schedule Mar 26th,  2026.xlsx",
);

type RoleStatus = 0 | 1 | 2;

type Priority = "Critical" | "High" | "Medium";

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
  source: "Carryover" | "Today" | "Tomorrow";
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
  source: "Carryover" | "Today" | "Tomorrow";
  dueDate: string;
  dueDateLabel: string;
  timeWindow: string;
  priority: Priority;
  completionPct: number;
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
  role: "Rigger" | "Shipwright";
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

export interface OperationsDashboardData {
  appName: string;
  reportDateIso: string;
  reportDateLabel: string;
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
  fleetRows: FleetRow[];
  insights: InsightItem[];
  assignmentPlan: AssignmentPlanItem[];
  vesselReports: VesselQualityReport[];
  workerReports: {
    riggers: WorkerQualityReport[];
    shipwrights: WorkerQualityReport[];
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
  stat: string;
  boatName: string;
  boatLink: string | null;
  roleStates: RoleState[];
  completionPct: number;
  completedRoles: number;
  pendingRoles: number;
  inProgressRoles: number;
}

interface CurrentDayMovement {
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

const roleMap = [
  {
    key: "qc",
    label: "Quality Check",
    statusColumn: "qc_status",
    assigneeColumn: "qc",
    updatedAtColumn: "qc_atc_time",
  },
  {
    key: "riggers",
    label: "Riggers",
    statusColumn: "Riggers_status",
    assigneeColumn: "Riggers",
    updatedAtColumn: "Riggers_atc_time",
  },
  {
    key: "shipwright",
    label: "Shipwright",
    statusColumn: "Shipwright_status",
    assigneeColumn: "Shipwright",
    updatedAtColumn: "Shipwright_atc_time",
  },
  {
    key: "cleanerAbove",
    label: "Cleaner Above Deck",
    statusColumn: "Cleaner above deck_status",
    assigneeColumn: "Cleaner above deck",
    updatedAtColumn: "Cleaner above deck_atc_time",
  },
  {
    key: "cleanerBelow",
    label: "Cleaner Below Deck",
    statusColumn: "Cleaner below deck_status",
    assigneeColumn: "Cleaner below deck",
    updatedAtColumn: "Cleaner below deck_atc_time",
  },
  {
    key: "safety",
    label: "Safety Equipment",
    statusColumn: "Safety Equipment_status",
    assigneeColumn: "Safety Equipment",
    updatedAtColumn: "Safety Equipment_atc_time",
  },
  {
    key: "technician",
    label: "Technician",
    statusColumn: "Technician_status",
    assigneeColumn: "Technician",
    updatedAtColumn: "Technician_atc_time",
  },
] as const;

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

export const getOperationsDashboardData = cache((): OperationsDashboardData => {
  const turnaroundEntries = safeReadTurnaroundCsv();
  const currentDay = safeReadCurrentDayWorkbook();

  const reportDate = currentDay.reportDate;
  const previousDate = addDays(reportDate, -1);
  const nextDate = addDays(reportDate, 1);

  const reportDateIso = toIsoDate(reportDate);
  const previousIso = toIsoDate(previousDate);
  const nextIso = toIsoDate(nextDate);

  const todayRows = turnaroundEntries.filter((entry) => entry.dateIso === reportDateIso);
  const previousRows = turnaroundEntries.filter(
    (entry) => entry.dateIso === previousIso,
  );
  const tomorrowRows = turnaroundEntries.filter((entry) => entry.dateIso === nextIso);

  const carryoverRows = previousRows.filter((entry) => entry.completionPct < 100);

  const movementTimeByBoat = new Map<string, string>();
  for (const movement of currentDay.movements) {
    if (movement.type === "start" && movement.time) {
      movementTimeByBoat.set(normalizeBoatName(movement.boatName), movement.time);
    }
  }

  const todaySchedule = buildSchedule({
    primaryRows: todayRows,
    supportRows: carryoverRows,
    sourcePrimary: "Today",
    sourceSupport: "Carryover",
    movementTimeByBoat,
    limit: 14,
  });

  const unresolvedToday = todayRows.filter((entry) => entry.completionPct < 65);
  const tomorrowSchedule = buildSchedule({
    primaryRows: tomorrowRows,
    supportRows: unresolvedToday,
    sourcePrimary: "Tomorrow",
    sourceSupport: "Carryover",
    movementTimeByBoat,
    limit: 12,
  });

  const startsTotal = currentDay.startsFigures.reduce((sum, figure) => sum + figure.total, 0);
  const yesterdayCompletion = averageCompletion(previousRows);
  const tomorrowAtRisk = tomorrowRows.filter((entry) => entry.completionPct < 35).length;

  const summaryMetrics: SummaryMetric[] = [
    {
      id: "dueToday",
      label: "Boats Due Today",
      value: String(todayRows.length),
      detail: `${carryoverRows.length} carryovers from ${formatDate(previousDate)}`,
    },
    {
      id: "startsPlanned",
      label: "Starts Planned",
      value: String(startsTotal),
      detail: `${currentDay.startsFigures.length} operating categories`,
    },
    {
      id: "yesterdayCompletion",
      label: "Yesterday Completion",
      value: `${Math.round(yesterdayCompletion)}%`,
      detail: `${previousRows.length} turnaround plans reviewed`,
    },
    {
      id: "tomorrowRisk",
      label: "Tomorrow At Risk",
      value: String(tomorrowAtRisk),
      detail: `${tomorrowRows.length} boats scheduled for ${formatDate(nextDate)}`,
    },
  ];

  const fleetRows = buildFleetRows(todayRows, tomorrowRows);
  const insights = buildInsights(previousRows, todayRows, tomorrowRows, carryoverRows);

  const reports = buildReports(turnaroundEntries, reportDate);
  const planningCandidates = dedupeByBoat([
    ...todayRows.map((entry) => ({ entry, source: "Today" as const })),
    ...tomorrowRows.map((entry) => ({ entry, source: "Tomorrow" as const })),
    ...carryoverRows.map((entry) => ({ entry, source: "Carryover" as const })),
  ]);
  planningCandidates.sort((a, b) =>
    priorityScore(b.entry, b.source) - priorityScore(a.entry, a.source),
  );

  const plannedLoads = buildPlannedLoads(planningCandidates);
  const riggerReports = buildWorkerQualityReports({
    entries: turnaroundEntries,
    roleKey: "riggers",
    roleName: "Rigger",
    reportDate,
    plannedLoads: plannedLoads.riggers,
  });
  const shipwrightReports = buildWorkerQualityReports({
    entries: turnaroundEntries,
    roleKey: "shipwright",
    roleName: "Shipwright",
    reportDate,
    plannedLoads: plannedLoads.shipwrights,
  });
  const assignmentPlan = buildAssignmentPlan({
    candidates: planningCandidates,
    reportDate,
    movementTimeByBoat,
    riggerReports,
    shipwrightReports,
    limit: 42,
  });
  const vesselReports = buildVesselQualityReports(turnaroundEntries, reportDate);

  return {
    appName: "moorings.ms",
    reportDateIso,
    reportDateLabel: formatDate(reportDate),
    previousDateLabel: formatDate(previousDate),
    nextDateLabel: formatDate(nextDate),
    summaryMetrics,
    startsFigures: currentDay.startsFigures,
    todaySchedule,
    tomorrowSchedule,
    reports,
    fleetRows,
    insights,
    assignmentPlan,
    vesselReports,
    workerReports: {
      riggers: riggerReports,
      shipwrights: shipwrightReports,
    },
    sources: [
      {
        name: "Turnaround Plan CSV",
        filePath: "data/drive/turnaround_plan (1).csv",
        downloadUrl: "/reports/turnaround_plan.csv",
        records: turnaroundEntries.length,
        note: "Role completion and assignment status per boat",
      },
      {
        name: "BVI Turnaround Schedule",
        filePath: "data/drive/BVI Turnaround Schedule Mar 26th,  2026.xlsx",
        downloadUrl: "/reports/bvi_turnaround_schedule.xlsx",
        records: currentDay.movements.length,
        note: "Current day starts, ends, and movement timing",
      },
      {
        name: "Booking Schedule Example",
        filePath: "data/drive/Booking schedule example.xlsx",
        downloadUrl: "/reports/booking_schedule_example.xlsx",
        records: 1,
        note: "Reference scheduling format from operations team",
      },
    ],
  };
});

function readTurnaroundCsv(): TurnaroundEntry[] {
  ensureFileExists(csvPath);

  const csvBuffer = fs.readFileSync(csvPath);
  const workbook = XLSX.read(csvBuffer, {
    type: "buffer",
    raw: false,
    cellDates: true,
    dense: true,
  });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  return rawRows.map((row) => {
    const { name: boatName, link: boatLink } = parseBoatName(String(row.boat_name ?? ""));
    const roleStates: RoleState[] = roleMap.map((role) => ({
      key: role.key,
      label: role.label,
      status: toRoleStatus(row[role.statusColumn]),
      assigneeId: toNumber(row[role.assigneeColumn]),
      updatedAtIso: normalizeTimestampValue(row[role.updatedAtColumn]),
    }));

    const completedRoles = roleStates.filter((role) => role.status === 2).length;
    const inProgressRoles = roleStates.filter((role) => role.status === 1).length;
    const pendingRoles = roleStates.length - completedRoles - inProgressRoles;
    const completionPct =
      ((completedRoles + inProgressRoles * 0.5) / Math.max(roleStates.length, 1)) * 100;

    return {
      id: String(row._tas_id ?? `${row.date}-${boatName}`),
      dateIso: normalizeDateValue(row.date),
      stat: String(row.stat ?? "").trim() || "Uncoded",
      boatName,
      boatLink,
      roleStates,
      completionPct,
      completedRoles,
      pendingRoles,
      inProgressRoles,
    };
  });
}

function readCurrentDayWorkbook(): CurrentDayData {
  ensureFileExists(workbookPath);

  const workbookBuffer = fs.readFileSync(workbookPath);
  const workbook = XLSX.read(workbookBuffer, {
    type: "buffer",
    raw: true,
    cellDates: true,
    dense: true,
  });

  const sheet = workbook.Sheets["Current Day"];
  if (!sheet) {
    throw new Error("Current Day sheet is missing from the BVI turnaround workbook.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  const reportDate = extractReportDate(rows);
  const startsFigures = extractStartFigures(rows);
  const movements = extractCurrentDayMovements(rows);

  return {
    reportDate,
    startsFigures,
    movements,
  };
}

function safeReadTurnaroundCsv(): TurnaroundEntry[] {
  try {
    return readTurnaroundCsv();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[moorings.ms] Could not read turnaround CSV during this dev request.", error);
    }
    return [];
  }
}

function safeReadCurrentDayWorkbook(): CurrentDayData {
  try {
    return readCurrentDayWorkbook();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[moorings.ms] Could not read current-day workbook during this dev request.", error);
    }
    const now = new Date();
    return {
      reportDate: startOfDay(now),
      startsFigures: [],
      movements: [],
    };
  }
}

function extractReportDate(rows: unknown[][]): Date {
  for (let index = 0; index < Math.min(rows.length, 25); index += 1) {
    const cell = rows[index]?.[0];
    if (cell instanceof Date) {
      return startOfDay(cell);
    }
    if (typeof cell === "number") {
      const parsed = XLSX.SSF.parse_date_code(cell);
      if (parsed) {
        return new Date(parsed.y, parsed.m - 1, parsed.d);
      }
    }
  }

  throw new Error("Could not determine report date from the Current Day sheet.");
}

function extractStartFigures(rows: unknown[][]): StartFigure[] {
  const startIndex = rows.findIndex((row) => toText(row[2]).includes("Daily Starts Figures"));
  if (startIndex === -1) {
    return [];
  }

  const figures: StartFigure[] = [];

  for (let idx = startIndex + 1; idx < Math.min(rows.length, startIndex + 12); idx += 1) {
    const row = rows[idx];
    const category = toText(row[2]);
    if (!category) {
      continue;
    }

    if (category.toLowerCase().startsWith("total starts")) {
      continue;
    }

    const figure: StartFigure = {
      category,
      noon: toNumber(row[3]),
      saEs: toNumber(row[4]),
      total: toNumber(row[5]),
    };

    if (figure.total > 0 || figure.noon > 0 || figure.saEs > 0) {
      figures.push(figure);
    }
  }

  return figures;
}

function extractCurrentDayMovements(rows: unknown[][]): CurrentDayMovement[] {
  const movements: CurrentDayMovement[] = [];
  let currentSection = "Operations";

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const onlyFirstCell =
      row.filter((cell) => cell !== null && cell !== "").length === 1 && toText(row[0]).length > 0;

    if (onlyFirstCell) {
      const label = toText(row[0]).toUpperCase();
      if (
        label &&
        !label.includes("TOTAL") &&
        label !== "ENDS" &&
        label !== "FUEL" &&
        label !== "POWER"
      ) {
        currentSection = toText(row[0]);
      }
      if (label === "POWER") {
        currentSection = "Power";
      }
    }

    const isHeader = toText(row[0]) === "FUEL" && toText(row[8]) === "SIZE";
    if (!isHeader) {
      continue;
    }

    for (let cursor = idx + 1; cursor < rows.length; cursor += 1) {
      const dataRow = rows[cursor];
      const firstCell = toText(dataRow[0]).toUpperCase();
      if (firstCell === "FUEL" || firstCell === "ENDS") {
        break;
      }

      const endBoat = cleanCellText(dataRow[2]);
      const startBoat = cleanCellText(dataRow[9]);

      if (endBoat && !endBoat.includes("TOTAL") && !endBoat.includes("SIZE")) {
        movements.push({
          section: currentSection,
          type: "end",
          boatName: endBoat,
          size: cleanCellText(dataRow[1]),
          contract: cleanCellText(dataRow[3]),
          pax: toNumber(dataRow[4]),
          charterer: cleanCellText(dataRow[5]),
          time: "",
        });
      }

      if (startBoat && !startBoat.includes("TOTAL") && !startBoat.includes("SIZE")) {
        movements.push({
          section: currentSection,
          type: "start",
          boatName: startBoat,
          size: cleanCellText(dataRow[8]),
          contract: cleanCellText(dataRow[17]),
          pax: toNumber(dataRow[18]),
          charterer: cleanCellText(dataRow[12]),
          time: formatTimeValue(dataRow[11]),
        });
      }

      const looksLikeSectionBreak =
        cleanCellText(dataRow[0]) === "" && cleanCellText(dataRow[9]) === "";
      if (looksLikeSectionBreak && cleanCellText(dataRow[2]) === "") {
        const nextRow = rows[cursor + 1];
        const nextFirst = toText(nextRow?.[0]).toUpperCase();
        if (
          nextFirst === "MOORINGS" ||
          nextFirst === "SKIPPERED PRODUCT" ||
          nextFirst === "CREWED" ||
          nextFirst === "SUNSAIL" ||
          nextFirst === "ACCOMMODATION" ||
          nextFirst === "TRANSFERS"
        ) {
          break;
        }
      }
    }
  }

  return movements;
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

function buildInsights(
  previousRows: TurnaroundEntry[],
  todayRows: TurnaroundEntry[],
  tomorrowRows: TurnaroundEntry[],
  carryovers: TurnaroundEntry[],
): InsightItem[] {
  const rolePending = new Map<string, number>();
  let completedChecks = 0;
  let totalChecks = 0;

  for (const entry of previousRows) {
    for (const role of entry.roleStates) {
      totalChecks += 1;
      if (role.status === 2) {
        completedChecks += 1;
      }
      if (role.status !== 2) {
        rolePending.set(role.label, (rolePending.get(role.label) ?? 0) + 1);
      }
    }
  }

  const completionPct = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;
  const topBottlenecks = [...rolePending.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([role]) => role);

  const tomorrowCritical = tomorrowRows.filter((entry) => entry.completionPct < 30).length;

  return [
    {
      tone: completionPct >= 50 ? "positive" : "warning",
      message: `Previous-day completion closed at ${completionPct}% across ${previousRows.length} boats.`,
    },
    {
      tone: topBottlenecks.length > 0 ? "warning" : "neutral",
      message:
        topBottlenecks.length > 0
          ? `Main bottlenecks are ${topBottlenecks.join(" and ")} from yesterday's carryovers.`
          : "No role bottlenecks detected from the previous-day report.",
    },
    {
      tone: carryovers.length > 12 ? "critical" : "neutral",
      message: `${todayRows.length} boats are due today with ${carryovers.length} carryovers to absorb.`,
    },
    {
      tone: tomorrowCritical > 3 ? "critical" : "positive",
      message: `${tomorrowRows.length} boats are queued for tomorrow; ${tomorrowCritical} are currently high risk.`,
    },
  ];
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

function buildPlannedLoads(
  candidates: Array<{ entry: TurnaroundEntry; source: "Carryover" | "Today" | "Tomorrow" }>,
) {
  const riggers = new Map<number, number>();
  const shipwrights = new Map<number, number>();

  for (const candidate of candidates) {
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
  }

  return {
    riggers,
    shipwrights,
  };
}

function buildWorkerQualityReports(input: {
  entries: TurnaroundEntry[];
  roleKey: "riggers" | "shipwright";
  roleName: "Rigger" | "Shipwright";
  reportDate: Date;
  plannedLoads: Map<number, number>;
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
        workerLabel: `${input.roleName} #${worker.workerId}`,
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
  candidates: Array<{ entry: TurnaroundEntry; source: "Carryover" | "Today" | "Tomorrow" }>;
  reportDate: Date;
  movementTimeByBoat: Map<string, string>;
  riggerReports: WorkerQualityReport[];
  shipwrightReports: WorkerQualityReport[];
  limit: number;
}): AssignmentPlanItem[] {
  const riggerById = new Map(input.riggerReports.map((worker) => [worker.workerId, worker]));
  const shipwrightById = new Map(input.shipwrightReports.map((worker) => [worker.workerId, worker]));

  return input.candidates.slice(0, input.limit).map((candidate, index) => {
    const timeWindow =
      input.movementTimeByBoat.get(normalizeBoatName(candidate.entry.boatName)) ??
      dayTimeSlots[index % dayTimeSlots.length];
    const score = priorityScore(candidate.entry, candidate.source);

    const rigger = resolveWorkerAssignment({
      entry: candidate.entry,
      roleKey: "riggers",
      roleName: "Rigger",
      workerReports: input.riggerReports,
      workerById: riggerById,
    });
    const shipwright = resolveWorkerAssignment({
      entry: candidate.entry,
      roleKey: "shipwright",
      roleName: "Shipwright",
      workerReports: input.shipwrightReports,
      workerById: shipwrightById,
    });

    return {
      id: `${candidate.entry.id}-${candidate.source}`,
      boatName: candidate.entry.boatName,
      stat: candidate.entry.stat,
      source: candidate.source,
      dueDate: candidate.entry.dateIso,
      dueDateLabel: formatDate(parseDate(candidate.entry.dateIso)),
      timeWindow,
      priority: score >= 82 ? "Critical" : score >= 64 ? "High" : "Medium",
      completionPct: Math.round(candidate.entry.completionPct),
      rigger,
      shipwright,
      rationale: buildAssignmentRationale(candidate.entry, candidate.source, rigger, shipwright),
    };
  });
}

function resolveWorkerAssignment(input: {
  entry: TurnaroundEntry;
  roleKey: "riggers" | "shipwright";
  roleName: "Rigger" | "Shipwright";
  workerReports: WorkerQualityReport[];
  workerById: Map<number, WorkerQualityReport>;
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

  if (role.assigneeId > 0) {
    const worker = input.workerById.get(role.assigneeId);
    return {
      workerId: role.assigneeId,
      workerLabel: worker?.workerLabel ?? `${input.roleName} #${role.assigneeId}`,
      assignmentState: "Assigned",
      qualityScore: worker?.qualityScore ?? 0,
      plannedLoad: worker?.plannedLoad ?? 0,
    };
  }

  const recommendation = [...input.workerReports]
    .sort((left, right) => {
      if (left.plannedLoad !== right.plannedLoad) {
        return left.plannedLoad - right.plannedLoad;
      }
      if (left.qualityScore !== right.qualityScore) {
        return right.qualityScore - left.qualityScore;
      }
      return left.pending - right.pending;
    })
    .at(0);

  if (!recommendation) {
    return {
      workerId: null,
      workerLabel: "Unassigned",
      assignmentState: "Unassigned",
      qualityScore: 0,
      plannedLoad: 0,
    };
  }

  return {
    workerId: recommendation.workerId,
    workerLabel: recommendation.workerLabel,
    assignmentState: "Recommended",
    qualityScore: recommendation.qualityScore,
    plannedLoad: recommendation.plannedLoad,
  };
}

function buildAssignmentRationale(
  entry: TurnaroundEntry,
  source: "Carryover" | "Today" | "Tomorrow",
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
      : `Due ${source.toLowerCase()} with ${entry.pendingRoles} pending role checks.`;

  const assignmentNotes: string[] = [];
  if (rigger.assignmentState === "Recommended") {
    assignmentNotes.push(`Rigger reassigned to ${rigger.workerLabel}`);
  }
  if (shipwright.assignmentState === "Recommended") {
    assignmentNotes.push(`Shipwright reassigned to ${shipwright.workerLabel}`);
  }
  if (rigger.assignmentState === "Unassigned" || shipwright.assignmentState === "Unassigned") {
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

function priorityScore(entry: TurnaroundEntry, source: "Carryover" | "Today" | "Tomorrow") {
  let score = 0;

  if (source === "Today") {
    score += 45;
  } else if (source === "Carryover") {
    score += 35;
  } else {
    score += 26;
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

function mapSource(source: string): "Carryover" | "Today" | "Tomorrow" {
  if (source === "Today" || source === "Tomorrow") {
    return source;
  }
  return "Carryover";
}

function parseBoatName(rawBoat: string): { name: string; link: string | null } {
  const match = rawBoat.match(/\[(.*?)\]\((.*?)\)/);
  if (!match) {
    return {
      name: cleanCellText(rawBoat),
      link: null,
    };
  }

  return {
    name: cleanCellText(match[1]),
    link: match[2] || null,
  };
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

function toRoleStatus(value: unknown): RoleStatus {
  const numeric = toNumber(value);
  if (numeric === 2) {
    return 2;
  }
  if (numeric === 1) {
    return 1;
  }
  return 0;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
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

function formatTimeValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function normalizeBoatName(boatName: string): string {
  return boatName
    .toUpperCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
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

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDate(parsed);
  }

  return raw;
}

function normalizeTimestampValue(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}
