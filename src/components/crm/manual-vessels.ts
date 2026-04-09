"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  AssignmentPlanItem,
  CharterPriorityFlag,
  CharterPriorityLevel,
  FleetRow,
  PieSlice,
  ReportPoint,
  VesselQualityReport,
} from "@/lib/operations-data";

type ManualSource = "Carryover" | "Today" | "Tomorrow";
type ManualPriority = "Critical" | "High" | "Medium";

export interface ManualVesselRecord {
  id: string;
  boatName: string;
  stat: string;
  source: ManualSource;
  dueDate: string;
  timeWindow: string;
  priority: ManualPriority;
  completionPct: number;
  charterPriorityFlag: CharterPriorityFlag;
  charterer: string;
  technicianLabel: string;
  riggerLabel: string;
  shipwrightLabel: string;
  rationale: string;
  createdAtIso: string;
}

export interface ManualVesselInput {
  boatName: string;
  stat: string;
  source: ManualSource;
  dueDate: string;
  timeWindow: string;
  priority: ManualPriority;
  completionPct: number;
  charterPriorityFlag: CharterPriorityFlag;
  charterer: string;
  technicianLabel: string;
  riggerLabel: string;
  shipwrightLabel: string;
  rationale: string;
}

const STORAGE_KEY = "moorings-ms:manual-vessels";
const OVERRIDE_STORAGE_KEY = "moorings-ms:vessel-overrides";
const UPDATE_EVENT = "moorings-ms:manual-vessels-updated";

export function useManualVessels(): ManualVesselRecord[] {
  const [rows, setRows] = useState<ManualVesselRecord[]>(() => loadManualVessels());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const sync = () => setRows(loadManualVessels());
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY) {
        return;
      }
      sync();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(UPDATE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(UPDATE_EVENT, sync);
    };
  }, []);

  return rows;
}

export function addManualVessel(input: ManualVesselInput): ManualVesselRecord {
  const record: ManualVesselRecord = {
    id: `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    boatName: input.boatName.trim(),
    stat: input.stat.trim(),
    source: input.source,
    dueDate: input.dueDate,
    timeWindow: input.timeWindow.trim(),
    priority: input.priority,
    completionPct: clampPercentage(input.completionPct),
    charterPriorityFlag: input.charterPriorityFlag,
    charterer: input.charterer.trim(),
    technicianLabel: input.technicianLabel.trim(),
    riggerLabel: input.riggerLabel.trim(),
    shipwrightLabel: input.shipwrightLabel.trim(),
    rationale: input.rationale.trim(),
    createdAtIso: new Date().toISOString(),
  };

  const next = [record, ...loadManualVessels()];
  saveManualVessels(next);
  return record;
}

export function toAssignmentPlanItem(row: ManualVesselRecord): AssignmentPlanItem {
  return {
    id: row.id,
    boatName: row.boatName,
    stat: row.stat || "NOON",
    source: row.source,
    dueDate: row.dueDate,
    dueDateLabel: formatDateLabel(row.dueDate),
    daysUntilDeparture: daysUntilDateIso(row.dueDate),
    timeWindow: row.timeWindow || "08:00 - 10:00",
    priority: row.priority,
    completionPct: row.completionPct,
    charterPriority: mapPriorityLevel(row.charterPriorityFlag),
    charterPriorityFlag: row.charterPriorityFlag,
    technician: {
      workerId: null,
      workerLabel: row.technicianLabel || "Pending Assignment",
      assignmentState: row.technicianLabel ? "Assigned" : "Recommended",
      qualityScore: 82,
      plannedLoad: 1,
    },
    rigger: {
      workerId: null,
      workerLabel: row.riggerLabel || "Pending Assignment",
      assignmentState: row.riggerLabel ? "Assigned" : "Recommended",
      qualityScore: 82,
      plannedLoad: 1,
    },
    shipwright: {
      workerId: null,
      workerLabel: row.shipwrightLabel || "Pending Assignment",
      assignmentState: row.shipwrightLabel ? "Assigned" : "Recommended",
      qualityScore: 82,
      plannedLoad: 1,
    },
    rationale:
      row.rationale ||
      `Manual vessel entry by ${row.charterer || "operations team"} for ${formatDateLabel(row.dueDate)}.`,
  };
}

export function toFleetRow(row: ManualVesselRecord): FleetRow {
  return {
    id: row.id,
    boatName: row.boatName,
    dueDate: row.dueDate,
    stat: row.stat || "NOON",
    completionPct: row.completionPct,
    pendingRoles: row.completionPct >= 100 ? 0 : 2,
    status: deriveRisk(row.priority, row.completionPct),
    charterPriority: mapPriorityLevel(row.charterPriorityFlag),
    charterPriorityFlag: row.charterPriorityFlag,
    detailLink: null,
  };
}

export function toVesselQualityReport(row: ManualVesselRecord): VesselQualityReport {
  const completion = row.completionPct;
  const risk = deriveRisk(row.priority, completion);
  const trend = buildTrend(completion);
  const pie = buildPie(completion);

  return {
    id: row.id,
    boatName: row.boatName,
    boatLink: null,
    stat: row.stat || "NOON",
    latestDueDate: row.dueDate,
    currentCompletionPct: completion,
    averageCompletionPct: completion,
    totalTurnarounds: 1,
    lateTurnarounds: completion < 100 && isPast(row.dueDate) ? 1 : 0,
    criticalTurnarounds: row.priority === "Critical" ? 1 : 0,
    qualityScore: completion,
    risk,
    charterPriority: mapPriorityLevel(row.charterPriorityFlag),
    charterPriorityFlag: row.charterPriorityFlag,
    assignedTechnician: row.technicianLabel || "Pending Assignment",
    assignedRigger: row.riggerLabel || "Pending Assignment",
    assignedShipwright: row.shipwrightLabel || "Pending Assignment",
    pendingRoles: completion >= 100 ? [] : ["Rigger", "Shipwright"],
    trend,
    pie,
    note: row.rationale || "Manual vessel entry",
  };
}

function loadManualVessels(): ManualVesselRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(sanitizeRecord)
      .filter((row): row is ManualVesselRecord => row !== null)
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  } catch {
    return [];
  }
}

function saveManualVessels(rows: ManualVesselRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

function sanitizeRecord(value: unknown): ManualVesselRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Partial<ManualVesselRecord>;
  if (!row.id || !row.boatName || !row.dueDate) {
    return null;
  }

  return {
    id: String(row.id),
    boatName: String(row.boatName),
    stat: String(row.stat || "NOON"),
    source: mapSource(row.source),
    dueDate: normalizeDate(String(row.dueDate)),
    timeWindow: String(row.timeWindow || "08:00 - 10:00"),
    priority: mapPriority(row.priority),
    completionPct: clampPercentage(Number(row.completionPct ?? 0)),
    charterPriorityFlag: mapPriorityFlag(row.charterPriorityFlag),
    charterer: String(row.charterer || ""),
    technicianLabel: String(row.technicianLabel || ""),
    riggerLabel: String(row.riggerLabel || ""),
    shipwrightLabel: String(row.shipwrightLabel || ""),
    rationale: String(row.rationale || ""),
    createdAtIso: String(row.createdAtIso || new Date().toISOString()),
  };
}

function mapSource(source: unknown): ManualSource {
  if (source === "Today" || source === "Tomorrow") {
    return source;
  }
  return "Carryover";
}

function mapPriority(priority: unknown): ManualPriority {
  if (priority === "Critical" || priority === "High") {
    return priority;
  }
  return "Medium";
}

function mapPriorityFlag(flag: unknown): CharterPriorityFlag {
  if (flag === "O" || flag === "OB") {
    return flag;
  }
  return null;
}

function mapPriorityLevel(flag: CharterPriorityFlag): CharterPriorityLevel {
  if (flag === "O") {
    return "owner";
  }
  if (flag === "OB") {
    return "ownerBerth";
  }
  return "none";
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return dateIso;
  }
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function daysUntilDateIso(dateIso: string): number {
  const [y, m, d] = dateIso.split("-").map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return 0;
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(y, m - 1, d);
  const diffMs = target.getTime() - today.getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function deriveRisk(priority: ManualPriority, completionPct: number): FleetRow["status"] {
  if (priority === "Critical" || completionPct < 45) {
    return "Critical";
  }
  if (priority === "High" || completionPct < 75) {
    return "Watch";
  }
  return "On track";
}

function buildTrend(completionPct: number): ReportPoint[] {
  const base = clampPercentage(completionPct);
  return [
    { label: "D-2", jobs: 1, completion: Math.max(0, base - 25), critical: base < 40 ? 1 : 0 },
    { label: "D-1", jobs: 1, completion: Math.max(0, base - 10), critical: base < 50 ? 1 : 0 },
    { label: "Today", jobs: 1, completion: base, critical: base < 60 ? 1 : 0 },
  ];
}

function buildPie(completionPct: number): PieSlice[] {
  const completed = clampPercentage(completionPct);
  const pending = Math.max(0, 100 - completed);
  const inProgress = Math.min(100 - completed, Math.max(0, 100 - completed - 35));

  return [
    { label: "Completed", value: completed, color: "#0f766e" },
    { label: "In Progress", value: inProgress, color: "#0284c7" },
    { label: "Pending", value: Math.max(0, pending - inProgress), color: "#f59e0b" },
  ];
}

function isPast(dateIso: string): boolean {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = dateIso.split("-").map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return false;
  }
  const target = new Date(y, m - 1, d);
  return target.getTime() < current.getTime();
}

export function useManualFleetRows(): FleetRow[] {
  const rows = useManualVessels();
  return useMemo(() => rows.map(toFleetRow), [rows]);
}

export function useManualAssignmentRows(): AssignmentPlanItem[] {
  const rows = useManualVessels();
  return useMemo(() => rows.map(toAssignmentPlanItem), [rows]);
}

export function useManualVesselReports(): VesselQualityReport[] {
  const rows = useManualVessels();
  return useMemo(() => rows.map(toVesselQualityReport), [rows]);
}

export interface VesselOverrideRecord {
  boatKey: string;
  boatName?: string;
  stat?: string;
  dueDate?: string;
  completionPct?: number;
  assignedTechnician?: string;
  assignedRigger?: string;
  assignedShipwright?: string;
  note?: string;
  deleted?: boolean;
  updatedAtIso: string;
}

export function useVesselOverrides(): Record<string, VesselOverrideRecord> {
  const [overrides, setOverrides] = useState<Record<string, VesselOverrideRecord>>(() => loadVesselOverrides());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const sync = () => setOverrides(loadVesselOverrides());
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== OVERRIDE_STORAGE_KEY) {
        return;
      }
      sync();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(UPDATE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(UPDATE_EVENT, sync);
    };
  }, []);

  return overrides;
}

export function upsertVesselOverride(input: {
  boatKey: string;
  boatName?: string;
  stat?: string;
  dueDate?: string;
  completionPct?: number;
  assignedTechnician?: string;
  assignedRigger?: string;
  assignedShipwright?: string;
  note?: string;
  deleted?: boolean;
}): VesselOverrideRecord | null {
  const key = normalizeVesselKey(input.boatKey || input.boatName || "");
  if (!key) {
    return null;
  }

  const current = loadVesselOverrides();
  const previous = current[key];
  const next: VesselOverrideRecord = {
    boatKey: key,
    boatName: normalizeOptionalText(input.boatName) ?? previous?.boatName,
    stat: normalizeOptionalText(input.stat) ?? previous?.stat,
    dueDate: normalizeOptionalDate(input.dueDate) ?? previous?.dueDate,
    completionPct:
      typeof input.completionPct === "number"
        ? clampPercentage(input.completionPct)
        : previous?.completionPct,
    assignedTechnician:
      normalizeOptionalText(input.assignedTechnician) ?? previous?.assignedTechnician,
    assignedRigger: normalizeOptionalText(input.assignedRigger) ?? previous?.assignedRigger,
    assignedShipwright:
      normalizeOptionalText(input.assignedShipwright) ?? previous?.assignedShipwright,
    note: normalizeOptionalText(input.note) ?? previous?.note,
    deleted: typeof input.deleted === "boolean" ? input.deleted : previous?.deleted ?? false,
    updatedAtIso: new Date().toISOString(),
  };

  current[key] = next;
  saveVesselOverrides(current);
  return next;
}

export function removeVesselOverride(boatKey: string) {
  const key = normalizeVesselKey(boatKey);
  if (!key) {
    return;
  }
  const current = loadVesselOverrides();
  if (!current[key]) {
    return;
  }
  delete current[key];
  saveVesselOverrides(current);
}

export function applyVesselOverridesToAssignmentRows(
  rows: AssignmentPlanItem[],
  overrides: Record<string, VesselOverrideRecord>,
): AssignmentPlanItem[] {
  return rows
    .map((row) => {
      const override = lookupVesselOverride(overrides, row.id, row.boatName);
      if (!override || override.deleted) {
        return override?.deleted ? null : row;
      }

      const dueDate = override.dueDate || row.dueDate;
      const technicianLabel = override.assignedTechnician || row.technician.workerLabel;
      const riggerLabel = override.assignedRigger || row.rigger.workerLabel;
      const shipwrightLabel = override.assignedShipwright || row.shipwright.workerLabel;

      return {
        ...row,
        boatName: override.boatName || row.boatName,
        stat: override.stat || row.stat,
        dueDate,
        dueDateLabel: formatDateLabel(dueDate),
        daysUntilDeparture: daysUntilDateIso(dueDate),
        completionPct: typeof override.completionPct === "number" ? override.completionPct : row.completionPct,
        technician: {
          ...row.technician,
          workerLabel: technicianLabel,
          assignmentState: technicianLabel ? "Assigned" : row.technician.assignmentState,
        },
        rigger: {
          ...row.rigger,
          workerLabel: riggerLabel,
          assignmentState: riggerLabel ? "Assigned" : row.rigger.assignmentState,
        },
        shipwright: {
          ...row.shipwright,
          workerLabel: shipwrightLabel,
          assignmentState: shipwrightLabel ? "Assigned" : row.shipwright.assignmentState,
        },
        rationale: override.note || row.rationale,
      } satisfies AssignmentPlanItem;
    })
    .filter((row): row is AssignmentPlanItem => row !== null);
}

export function applyVesselOverridesToFleetRows(
  rows: FleetRow[],
  overrides: Record<string, VesselOverrideRecord>,
): FleetRow[] {
  return rows
    .map((row) => {
      const override = lookupVesselOverride(overrides, row.id, row.boatName);
      if (!override || override.deleted) {
        return override?.deleted ? null : row;
      }

      const completionPct =
        typeof override.completionPct === "number" ? override.completionPct : row.completionPct;
      return {
        ...row,
        boatName: override.boatName || row.boatName,
        stat: override.stat || row.stat,
        dueDate: override.dueDate || row.dueDate,
        completionPct,
        status: deriveRiskFromCompletion(completionPct),
      } satisfies FleetRow;
    })
    .filter((row): row is FleetRow => row !== null);
}

export function applyVesselOverridesToReports(
  rows: VesselQualityReport[],
  overrides: Record<string, VesselOverrideRecord>,
): VesselQualityReport[] {
  return rows
    .map((row) => {
      const override = lookupVesselOverride(overrides, row.id, row.boatName);
      if (!override || override.deleted) {
        return override?.deleted ? null : row;
      }

      const completionPct =
        typeof override.completionPct === "number"
          ? override.completionPct
          : row.currentCompletionPct;
      return {
        ...row,
        boatName: override.boatName || row.boatName,
        stat: override.stat || row.stat,
        latestDueDate: override.dueDate || row.latestDueDate,
        currentCompletionPct: completionPct,
        qualityScore: completionPct,
        risk: deriveRiskFromCompletion(completionPct),
        assignedTechnician: override.assignedTechnician || row.assignedTechnician,
        assignedRigger: override.assignedRigger || row.assignedRigger,
        assignedShipwright: override.assignedShipwright || row.assignedShipwright,
        note: override.note || row.note,
      } satisfies VesselQualityReport;
    })
    .filter((row): row is VesselQualityReport => row !== null);
}

function loadVesselOverrides(): Record<string, VesselOverrideRecord> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(OVERRIDE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const input = parsed as Record<string, Partial<VesselOverrideRecord>>;
    const normalized: Record<string, VesselOverrideRecord> = {};
    for (const [key, value] of Object.entries(input)) {
      const boatKey = normalizeVesselKey(key || value.boatKey || "");
      if (!boatKey) {
        continue;
      }
      normalized[boatKey] = {
        boatKey,
        boatName: normalizeOptionalText(value.boatName),
        stat: normalizeOptionalText(value.stat),
        dueDate: normalizeOptionalDate(value.dueDate),
        completionPct:
          typeof value.completionPct === "number"
            ? clampPercentage(value.completionPct)
            : undefined,
        assignedTechnician: normalizeOptionalText(value.assignedTechnician),
        assignedRigger: normalizeOptionalText(value.assignedRigger),
        assignedShipwright: normalizeOptionalText(value.assignedShipwright),
        note: normalizeOptionalText(value.note),
        deleted: Boolean(value.deleted),
        updatedAtIso: typeof value.updatedAtIso === "string" ? value.updatedAtIso : new Date().toISOString(),
      };
    }
    return normalized;
  } catch {
    return {};
  }
}

function saveVesselOverrides(overrides: Record<string, VesselOverrideRecord>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

function lookupVesselOverride(
  overrides: Record<string, VesselOverrideRecord>,
  id: string,
  boatName: string,
): VesselOverrideRecord | undefined {
  const byId = overrides[normalizeVesselKey(id)];
  if (byId) {
    return byId;
  }
  return overrides[normalizeVesselKey(boatName)];
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeOptionalDate(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

function normalizeVesselKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}

function deriveRiskFromCompletion(completionPct: number): FleetRow["status"] {
  if (completionPct < 25) {
    return "Critical";
  }
  if (completionPct < 55) {
    return "Watch";
  }
  return "On track";
}
