import "server-only";

import fs from "node:fs";
import path from "node:path";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminDb, getFirebaseAdminRealtimeDb } from "./firebase/admin";

export interface PlanningDateOverrideRecord {
  dateIso: string;
  updatedAtMs: number;
  updatedBy: string;
}

const PLANNING_DATE_RTDB_PATH =
  process.env.MOORINGS_PLANNING_DATE_RTDB_PATH?.trim() || "planning_settings/report_date_override";
const PLANNING_DATE_COLLECTION =
  process.env.MOORINGS_PLANNING_DATE_COLLECTION?.trim() || "planning_settings";
const PLANNING_DATE_DOC_ID =
  process.env.MOORINGS_PLANNING_DATE_DOC_ID?.trim() || "report_date_override";

const FALLBACK_DIR = path.join("/tmp", "moorings-ms");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "planning-date-override.json");

const BACKEND_TIMEOUT_MS = clampMs(
  Number(process.env.MOORINGS_BACKEND_TIMEOUT_MS || "2500"),
  500,
  10000,
);

export async function getPlanningDateOverride(): Promise<PlanningDateOverrideRecord | null> {
  const realtimeValue = await readPlanningDateOverrideFromRealtimeDb();
  if (realtimeValue) {
    return realtimeValue;
  }

  const firestoreValue = await readPlanningDateOverrideFromFirestore();
  if (firestoreValue) {
    return firestoreValue;
  }

  return readFallbackPlanningDateOverride();
}

export async function setPlanningDateOverride(input: {
  dateIso: string | null;
  updatedBy: string;
}): Promise<boolean> {
  const normalizedDateIso = normalizeDateIso(input.dateIso ?? "");
  const updatedBy = input.updatedBy.trim();
  if (!updatedBy) {
    return false;
  }

  const payload =
    normalizedDateIso !== ""
      ? ({
          dateIso: normalizedDateIso,
          updatedAtMs: Date.now(),
          updatedBy,
        } satisfies PlanningDateOverrideRecord)
      : null;

  const realtimeSaved = await writePlanningDateOverrideToRealtimeDb(payload);
  if (realtimeSaved) {
    return true;
  }

  const firestoreSaved = await writePlanningDateOverrideToFirestore(payload);
  if (firestoreSaved) {
    return true;
  }

  return writeFallbackPlanningDateOverride(payload);
}

async function readPlanningDateOverrideFromRealtimeDb(): Promise<PlanningDateOverrideRecord | null> {
  try {
    const snapshot = await withTimeout(
      getFirebaseAdminRealtimeDb().ref(PLANNING_DATE_RTDB_PATH).get(),
      BACKEND_TIMEOUT_MS,
      "RTDB planning-date read timeout",
    );
    return sanitizePlanningDateRecord(snapshot.val());
  } catch (error) {
    console.warn(
      "[moorings.ms] Could not read planning-date override from Realtime Database.",
      error,
    );
    return null;
  }
}

async function readPlanningDateOverrideFromFirestore(): Promise<PlanningDateOverrideRecord | null> {
  try {
    const snapshot = await withTimeout(
      getFirebaseAdminDb().collection(PLANNING_DATE_COLLECTION).doc(PLANNING_DATE_DOC_ID).get(),
      BACKEND_TIMEOUT_MS,
      "Firestore planning-date read timeout",
    );
    if (!snapshot.exists) {
      return null;
    }
    return sanitizePlanningDateRecord(snapshot.data());
  } catch (error) {
    console.warn("[moorings.ms] Could not read planning-date override from Firestore.", error);
    return null;
  }
}

async function writePlanningDateOverrideToRealtimeDb(
  payload: PlanningDateOverrideRecord | null,
): Promise<boolean> {
  try {
    const ref = getFirebaseAdminRealtimeDb().ref(PLANNING_DATE_RTDB_PATH);
    if (payload) {
      await withTimeout(
        ref.set(payload),
        BACKEND_TIMEOUT_MS,
        "RTDB planning-date write timeout",
      );
    } else {
      await withTimeout(
        ref.remove(),
        BACKEND_TIMEOUT_MS,
        "RTDB planning-date clear timeout",
      );
    }
    return true;
  } catch (error) {
    console.warn(
      "[moorings.ms] Could not write planning-date override to Realtime Database.",
      error,
    );
    return false;
  }
}

async function writePlanningDateOverrideToFirestore(
  payload: PlanningDateOverrideRecord | null,
): Promise<boolean> {
  try {
    const ref = getFirebaseAdminDb().collection(PLANNING_DATE_COLLECTION).doc(PLANNING_DATE_DOC_ID);
    if (payload) {
      await withTimeout(
        ref.set(
          {
            dateIso: payload.dateIso,
            updatedAtMs: payload.updatedAtMs,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: payload.updatedBy,
          },
          { merge: true },
        ),
        BACKEND_TIMEOUT_MS,
        "Firestore planning-date write timeout",
      );
    } else {
      await withTimeout(
        ref.delete(),
        BACKEND_TIMEOUT_MS,
        "Firestore planning-date clear timeout",
      );
    }
    return true;
  } catch (error) {
    console.warn("[moorings.ms] Could not write planning-date override to Firestore.", error);
    return false;
  }
}

function readFallbackPlanningDateOverride(): PlanningDateOverrideRecord | null {
  try {
    if (!fs.existsSync(FALLBACK_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(FALLBACK_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return sanitizePlanningDateRecord(parsed);
  } catch (error) {
    console.warn("[moorings.ms] Could not read fallback planning-date override.", error);
    return null;
  }
}

function writeFallbackPlanningDateOverride(payload: PlanningDateOverrideRecord | null): boolean {
  try {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    if (payload) {
      fs.writeFileSync(FALLBACK_FILE, JSON.stringify(payload, null, 2), "utf8");
    } else if (fs.existsSync(FALLBACK_FILE)) {
      fs.unlinkSync(FALLBACK_FILE);
    }
    return true;
  } catch (error) {
    console.warn("[moorings.ms] Could not write fallback planning-date override.", error);
    return false;
  }
}

function sanitizePlanningDateRecord(value: unknown): PlanningDateOverrideRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<PlanningDateOverrideRecord> & Partial<{ updatedAt: unknown }>;
  const dateIso = normalizeDateIso(typeof row.dateIso === "string" ? row.dateIso : "");
  if (!dateIso) {
    return null;
  }

  const updatedBy = typeof row.updatedBy === "string" ? row.updatedBy.trim() : "";
  const updatedAtMs = toMillis(row.updatedAtMs ?? row.updatedAt);

  return {
    dateIso,
    updatedAtMs,
    updatedBy,
  };
}

function normalizeDateIso(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "";
  }

  const [yearRaw, monthRaw, dayRaw] = trimmed.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return "";
  }
  if (year < 2000 || year > 2100) {
    return "";
  }
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }
  return trimmed;
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
    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber)) {
      return parsedNumber;
    }
    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate)) {
      return parsedDate;
    }
  }
  return Date.now();
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
