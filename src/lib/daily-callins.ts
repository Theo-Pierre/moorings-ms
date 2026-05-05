import "server-only";

import fs from "node:fs";
import path from "node:path";

import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb, getFirebaseAdminRealtimeDb } from "./firebase/admin";

export type CallInRoleKey = "technicians" | "riggers" | "shipwrights" | "acTechs";

const CALLINS_COLLECTION =
  process.env.MOORINGS_DAILY_CALLINS_COLLECTION?.trim() || "daily_callins";
const CALLINS_RTDB_ROOT =
  process.env.MOORINGS_DAILY_CALLINS_RTDB_ROOT?.trim() || "daily_callins";

const FALLBACK_DIR = path.join("/tmp", "moorings-ms");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "daily-callins.json");
const BACKEND_TIMEOUT_MS = clampMs(
  Number(process.env.MOORINGS_BACKEND_TIMEOUT_MS || "2500"),
  500,
  10000,
);

type CallInMapByRole = Record<CallInRoleKey, Set<string>>;

interface FallbackPayload {
  [dateIso: string]: Partial<Record<CallInRoleKey, string[]>>;
}

export async function listDailyCallInLabelsByDate(
  dateIsosRaw: string[],
): Promise<Map<string, CallInMapByRole>> {
  const dateIsos = [...new Set(dateIsosRaw.map(normalizeDateIso).filter(Boolean))];
  const result = new Map<string, CallInMapByRole>();
  for (const dateIso of dateIsos) {
    result.set(dateIso, emptyRoleSets());
  }
  if (dateIsos.length === 0) {
    return result;
  }

  const fallback = readFallback();
  for (const dateIso of dateIsos) {
    const row = fallback[dateIso];
    if (!row) {
      continue;
    }
    const sets = result.get(dateIso) ?? emptyRoleSets();
    for (const role of roleKeys()) {
      const list = Array.isArray(row[role]) ? row[role] : [];
      for (const label of list) {
        const normalized = normalizeWorkerLabel(label);
        if (normalized) {
          sets[role].add(normalized);
        }
      }
    }
    result.set(dateIso, sets);
  }

  try {
    const rtdb = getFirebaseAdminRealtimeDb();
    for (const dateIso of dateIsos) {
      const snapshot = await withTimeout(
        rtdb.ref(`${CALLINS_RTDB_ROOT}/${dateIso}`).get(),
        BACKEND_TIMEOUT_MS,
        "RTDB daily call-ins read timeout",
      );
      const parsed = parseRtdbRow(snapshot.val());
      result.set(dateIso, parsed);
    }
    return result;
  } catch (realtimeError) {
    console.warn(
      "[moorings.ms] Could not read daily call-ins from Realtime Database, trying Firestore.",
      realtimeError,
    );
  }

  try {
    const db = getFirebaseAdminDb();
    for (const dateIso of dateIsos) {
      const snapshot = await withTimeout(
        db.collection(CALLINS_COLLECTION).doc(dateIso).get(),
        BACKEND_TIMEOUT_MS,
        "Firestore daily call-ins read timeout",
      );
      const data = snapshot.data() as
        | Partial<Record<CallInRoleKey, string[]>> & { roles?: Partial<Record<CallInRoleKey, string[]>> }
        | undefined;
      const sets = emptyRoleSets();
      for (const role of roleKeys()) {
        const fromTop = Array.isArray(data?.[role]) ? (data?.[role] as string[]) : [];
        const fromNested = Array.isArray(data?.roles?.[role]) ? (data?.roles?.[role] as string[]) : [];
        for (const worker of [...fromTop, ...fromNested]) {
          const normalized = normalizeWorkerLabel(worker);
          if (normalized) {
            sets[role].add(normalized);
          }
        }
      }
      result.set(dateIso, sets);
    }
    return result;
  } catch (firestoreError) {
    console.warn(
      "[moorings.ms] Could not read daily call-ins from Firestore, using fallback store.",
      firestoreError,
    );
  }

  return result;
}

export async function replaceDailyCallIns(input: {
  dateIso: string;
  role: CallInRoleKey;
  workerLabels: string[];
  updatedBy: string;
}): Promise<boolean> {
  const dateIso = normalizeDateIso(input.dateIso);
  if (!dateIso) {
    return false;
  }
  const role = normalizeRoleKey(input.role);
  if (!role) {
    return false;
  }
  const labels = uniqueLabels(input.workerLabels);

  try {
    const ref = getFirebaseAdminRealtimeDb().ref(`${CALLINS_RTDB_ROOT}/${dateIso}/${role}`);
    await withTimeout(
      ref.set({
        workerLabels: labels,
        updatedBy: sanitizeActor(input.updatedBy),
        updatedAt: Date.now(),
      }),
      BACKEND_TIMEOUT_MS,
      "RTDB daily call-ins write timeout",
    );
    writeFallbackRow({
      dateIso,
      role,
      workerLabels: labels,
    });
    return true;
  } catch (realtimeError) {
    console.warn(
      "[moorings.ms] Could not write daily call-ins to Realtime Database, trying Firestore.",
      realtimeError,
    );
  }

  try {
    await withTimeout(
      getFirebaseAdminDb()
        .collection(CALLINS_COLLECTION)
        .doc(dateIso)
        .set(
          {
            [role]: labels,
            [`roles.${role}`]: labels,
            updatedBy: sanitizeActor(input.updatedBy),
            updatedAtIso: new Date().toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
      BACKEND_TIMEOUT_MS,
      "Firestore daily call-ins write timeout",
    );
    writeFallbackRow({
      dateIso,
      role,
      workerLabels: labels,
    });
    return true;
  } catch (firestoreError) {
    console.warn(
      "[moorings.ms] Could not write daily call-ins to Firestore, using fallback store.",
      firestoreError,
    );
  }

  return writeFallbackRow({
    dateIso,
    role,
    workerLabels: labels,
  });
}

function parseRtdbRow(raw: unknown): CallInMapByRole {
  const sets = emptyRoleSets();
  if (!raw || typeof raw !== "object") {
    return sets;
  }
  const value = raw as Partial<Record<CallInRoleKey, unknown>>;
  for (const role of roleKeys()) {
    const roleValue = value[role];
    if (Array.isArray(roleValue)) {
      for (const worker of roleValue) {
        const normalized = normalizeWorkerLabel(worker);
        if (normalized) {
          sets[role].add(normalized);
        }
      }
      continue;
    }

    if (roleValue && typeof roleValue === "object") {
      const maybeLabels = (roleValue as { workerLabels?: unknown }).workerLabels;
      if (Array.isArray(maybeLabels)) {
        for (const worker of maybeLabels) {
          const normalized = normalizeWorkerLabel(worker);
          if (normalized) {
            sets[role].add(normalized);
          }
        }
      }
    }
  }
  return sets;
}

function writeFallbackRow(input: {
  dateIso: string;
  role: CallInRoleKey;
  workerLabels: string[];
}): boolean {
  try {
    const payload = readFallback();
    const row = payload[input.dateIso] ?? {};
    row[input.role] = [...input.workerLabels];
    payload[input.dateIso] = row;
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(payload, null, 2), "utf8");
    return true;
  } catch (error) {
    console.warn("[moorings.ms] Could not write fallback daily call-ins.", error);
    return false;
  }
}

function readFallback(): FallbackPayload {
  try {
    if (!fs.existsSync(FALLBACK_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(FALLBACK_FILE, "utf8");
    const parsed = JSON.parse(raw) as FallbackPayload;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch (error) {
    console.warn("[moorings.ms] Could not read fallback daily call-ins.", error);
    return {};
  }
}

function emptyRoleSets(): CallInMapByRole {
  return {
    technicians: new Set<string>(),
    riggers: new Set<string>(),
    shipwrights: new Set<string>(),
    acTechs: new Set<string>(),
  };
}

function roleKeys(): CallInRoleKey[] {
  return ["technicians", "riggers", "shipwrights", "acTechs"];
}

function normalizeRoleKey(value: unknown): CallInRoleKey | null {
  if (value === "technicians" || value === "riggers" || value === "shipwrights" || value === "acTechs") {
    return value;
  }
  return null;
}

function normalizeDateIso(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function normalizeWorkerLabel(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toUpperCase();
  return trimmed ? trimmed : "";
}

function uniqueLabels(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeWorkerLabel(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function sanitizeActor(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 180);
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
