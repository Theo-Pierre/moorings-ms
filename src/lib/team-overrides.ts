import "server-only";

import fs from "node:fs";
import path from "node:path";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminDb, getFirebaseAdminRealtimeDb } from "./firebase/admin";

export type TeamRoleKey = "technicians" | "riggers" | "shipwrights" | "acTechs";
export type TeamOverrideAction = "add" | "remove" | "leave" | "return" | "update";

export interface TeamOverrideRecord {
  id: string;
  action: TeamOverrideAction;
  role: TeamRoleKey;
  label: string;
  positionLabel: string;
  previousRole: TeamRoleKey | null;
  previousLabel: string;
  daysOff: string[];
  createdAtMs: number;
  createdBy: string;
}

const TEAM_OVERRIDE_COLLECTION =
  process.env.MOORINGS_TEAM_OVERRIDES_COLLECTION?.trim() || "team_overrides";
const TEAM_OVERRIDE_RTDB_ROOT =
  process.env.MOORINGS_TEAM_OVERRIDES_RTDB_ROOT?.trim() || "team_overrides";
const FALLBACK_DIR = path.join("/tmp", "moorings-ms");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "team-overrides.json");

interface NormalizedOverridePayload {
  action: TeamOverrideAction;
  role: TeamRoleKey;
  label: string;
  positionLabel: string;
  previousRole: TeamRoleKey | null;
  previousLabel: string;
  daysOff: string[];
  createdBy: string;
}

const BACKEND_TIMEOUT_MS = clampMs(
  Number(process.env.MOORINGS_BACKEND_TIMEOUT_MS || "2500"),
  500,
  10000,
);

export async function listTeamOverrides(): Promise<TeamOverrideRecord[]> {
  const realtimeRecords = await listTeamOverridesFromRealtimeDb();
  if (realtimeRecords.length > 0) {
    return realtimeRecords;
  }

  const firestoreRecords = await listTeamOverridesFromFirestore();
  if (firestoreRecords.length > 0) {
    return firestoreRecords;
  }

  return readFallbackOverrides();
}

export async function addTeamOverride(input: {
  action: TeamOverrideAction;
  role: TeamRoleKey;
  label: string;
  positionLabel?: string;
  previousRole?: TeamRoleKey | null;
  previousLabel?: string;
  daysOff: string[];
  createdBy: string;
}): Promise<TeamOverrideRecord | null> {
  const payload = normalizeOverridePayload(input);
  if (!payload) {
    return null;
  }

  const realtimeRecord = await writeTeamOverrideToRealtimeDb(payload);
  if (realtimeRecord) {
    return realtimeRecord;
  }

  const firestoreRecord = await writeTeamOverrideToFirestore(payload);
  if (firestoreRecord) {
    return firestoreRecord;
  }

  const fallbackRecord: TeamOverrideRecord = {
    id: `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...payload,
    createdAtMs: Date.now(),
  };
  const existing = readFallbackOverrides();
  const merged = mergeOverrideRecords(existing, [fallbackRecord]);
  const saved = writeFallbackOverrides(merged);
  return saved ? fallbackRecord : null;
}

async function listTeamOverridesFromRealtimeDb(): Promise<TeamOverrideRecord[]> {
  try {
    const snapshot = await withTimeout(
      getFirebaseAdminRealtimeDb().ref(TEAM_OVERRIDE_RTDB_ROOT).get(),
      BACKEND_TIMEOUT_MS,
      "RTDB team override read timeout",
    );
    const raw = snapshot.val();
    if (!raw || typeof raw !== "object") {
      return [];
    }

    return Object.entries(raw as Record<string, unknown>)
      .map(([id, value]) => sanitizeRemoteRecord(id, value))
      .filter((record): record is TeamOverrideRecord => record !== null)
      .sort((left, right) => left.createdAtMs - right.createdAtMs);
  } catch (error) {
    console.warn(
      "[moorings.ms] Could not read team overrides from Realtime Database.",
      error,
    );
    return [];
  }
}

async function listTeamOverridesFromFirestore(): Promise<TeamOverrideRecord[]> {
  try {
    const db = getFirebaseAdminDb();
    const snapshot = await withTimeout(
      db.collection(TEAM_OVERRIDE_COLLECTION).get(),
      BACKEND_TIMEOUT_MS,
      "Firestore team override read timeout",
    );

    return snapshot.docs
      .map((doc) => sanitizeRemoteRecord(doc.id, doc.data()))
      .filter((record): record is TeamOverrideRecord => record !== null)
      .sort((left, right) => left.createdAtMs - right.createdAtMs);
  } catch (error) {
    console.warn("[moorings.ms] Could not read team overrides from Firestore.", error);
    return [];
  }
}

async function writeTeamOverrideToRealtimeDb(
  payload: NormalizedOverridePayload,
): Promise<TeamOverrideRecord | null> {
  const createdAtMs = Date.now();
  try {
    const ref = getFirebaseAdminRealtimeDb().ref(TEAM_OVERRIDE_RTDB_ROOT).push();
    if (!ref.key) {
      return null;
    }

    await withTimeout(
      ref.set({
        ...payload,
        createdAtMs,
      }),
      BACKEND_TIMEOUT_MS,
      "RTDB team override write timeout",
    );

    return {
      id: ref.key,
      ...payload,
      createdAtMs,
    };
  } catch (error) {
    console.warn(
      "[moorings.ms] Could not write team override to Realtime Database.",
      error,
    );
    return null;
  }
}

async function writeTeamOverrideToFirestore(
  payload: NormalizedOverridePayload,
): Promise<TeamOverrideRecord | null> {
  const createdAtMs = Date.now();
  try {
    const db = getFirebaseAdminDb();
    const ref = await withTimeout(
      db.collection(TEAM_OVERRIDE_COLLECTION).add({
        ...payload,
        createdAtMs,
        createdAt: FieldValue.serverTimestamp(),
      }),
      BACKEND_TIMEOUT_MS,
      "Firestore team override write timeout",
    );

    return {
      id: ref.id,
      ...payload,
      createdAtMs,
    };
  } catch (error) {
    console.warn("[moorings.ms] Could not write team override to Firestore.", error);
    return null;
  }
}

function normalizeOverridePayload(input: {
  action: TeamOverrideAction;
  role: TeamRoleKey;
  label: string;
  positionLabel?: string;
  previousRole?: TeamRoleKey | null;
  previousLabel?: string;
  daysOff: string[];
  createdBy: string;
}): NormalizedOverridePayload | null {
  const label = input.label.trim();
  if (!label) {
    return null;
  }

  return {
    action: input.action,
    role: input.role,
    label,
    positionLabel: normalizePositionLabel(input.positionLabel, input.role),
    previousRole: input.previousRole ?? null,
    previousLabel: typeof input.previousLabel === "string" ? input.previousLabel.trim() : "",
    daysOff: normalizeDaysOffArray(input.daysOff),
    createdBy: input.createdBy,
  };
}

function sanitizeRemoteRecord(id: string, value: unknown): TeamOverrideRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<TeamOverrideRecord> & Partial<{ createdAt: unknown }>;

  const action = parseAction(row.action);
  const role = isTeamRoleKey(row.role) ? row.role : null;
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!action || !role || !label) {
    return null;
  }

  const normalizedId = typeof id === "string" && id.trim() ? id.trim() : `fallback-${Date.now()}`;
  return {
    id: normalizedId,
    action,
    role,
    label,
    positionLabel: normalizePositionLabel(row.positionLabel, role),
    previousRole: isTeamRoleKey(row.previousRole) ? row.previousRole : null,
    previousLabel: typeof row.previousLabel === "string" ? row.previousLabel.trim() : "",
    daysOff: normalizeDaysOffArray(row.daysOff),
    createdAtMs: toMillis(row.createdAtMs ?? row.createdAt),
    createdBy: typeof row.createdBy === "string" ? row.createdBy : "",
  };
}

function isTeamRoleKey(value: unknown): value is TeamRoleKey {
  return value === "technicians" || value === "riggers" || value === "shipwrights" || value === "acTechs";
}

function parseAction(value: unknown): TeamOverrideAction | null {
  if (
    value === "add" ||
    value === "remove" ||
    value === "leave" ||
    value === "return" ||
    value === "update"
  ) {
    return value;
  }
  return null;
}

function normalizeDaysOffArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim().slice(0, 3) : ""))
    .filter(Boolean)
    .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1).toLowerCase());
  return [...new Set(normalized)];
}

function toMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

function readFallbackOverrides(): TeamOverrideRecord[] {
  try {
    if (!fs.existsSync(FALLBACK_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(FALLBACK_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => sanitizeFallbackRecord(value))
      .filter((value): value is TeamOverrideRecord => value !== null)
      .sort((left, right) => left.createdAtMs - right.createdAtMs);
  } catch (error) {
    console.warn("[moorings.ms] Could not read fallback team overrides.", error);
    return [];
  }
}

function writeFallbackOverrides(records: TeamOverrideRecord[]): boolean {
  try {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(records, null, 2), "utf8");
    return true;
  } catch (error) {
    console.warn("[moorings.ms] Could not write fallback team overrides.", error);
    return false;
  }
}

function sanitizeFallbackRecord(value: unknown): TeamOverrideRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<TeamOverrideRecord>;
  const action = parseAction(row.action);
  const role = isTeamRoleKey(row.role) ? row.role : null;
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!action || !role || !label) {
    return null;
  }
  return {
    id: typeof row.id === "string" ? row.id : `fallback-${Date.now()}`,
    action,
    role,
    label,
    positionLabel: normalizePositionLabel(row.positionLabel, role),
    previousRole: isTeamRoleKey(row.previousRole) ? row.previousRole : null,
    previousLabel: typeof row.previousLabel === "string" ? row.previousLabel.trim() : "",
    daysOff: normalizeDaysOffArray(row.daysOff),
    createdAtMs:
      typeof row.createdAtMs === "number" && Number.isFinite(row.createdAtMs)
        ? row.createdAtMs
        : Date.now(),
    createdBy: typeof row.createdBy === "string" ? row.createdBy : "",
  };
}

function mergeOverrideRecords(
  primary: TeamOverrideRecord[],
  secondary: TeamOverrideRecord[],
): TeamOverrideRecord[] {
  const merged = [...primary, ...secondary];
  merged.sort((left, right) => left.createdAtMs - right.createdAtMs);
  return merged;
}

function normalizePositionLabel(value: unknown, role: TeamRoleKey): string {
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (cleaned) {
      return cleaned;
    }
  }
  if (role === "technicians") {
    return "Technician";
  }
  if (role === "riggers") {
    return "Rigger";
  }
  if (role === "shipwrights") {
    return "Shipwright";
  }
  return "AC Tech";
}

function clampMs(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  }) as Promise<T>;
}
