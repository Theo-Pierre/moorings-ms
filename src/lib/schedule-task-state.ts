import "server-only";

import fs from "node:fs";
import path from "node:path";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminDb, getFirebaseAdminRealtimeDb } from "./firebase/admin";

const TASK_STATE_COLLECTION =
  process.env.MOORINGS_SCHEDULE_TASK_STATE_COLLECTION?.trim() || "schedule_task_state";
const TASK_STATE_RTDB_ROOT =
  process.env.MOORINGS_SCHEDULE_TASK_STATE_RTDB_ROOT?.trim() || "schedule_task_state";
const TASK_STATE_CANONICAL_COLLECTION =
  process.env.MOORINGS_SCHEDULE_TASK_STATE_CANONICAL_COLLECTION?.trim() ||
  "schedule_task_state_canonical";
const TASK_STATE_CANONICAL_RTDB_ROOT =
  process.env.MOORINGS_SCHEDULE_TASK_STATE_CANONICAL_RTDB_ROOT?.trim() ||
  "schedule_task_state_canonical";
const COMPLETION_RESET_DATE_ISO =
  process.env.MOORINGS_COMPLETION_RESET_DATE?.trim() || "2026-05-01";
const FALLBACK_DIR = path.join("/tmp", "moorings-ms");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "schedule-task-state.json");
const FALLBACK_CANONICAL_FILE = path.join(FALLBACK_DIR, "schedule-task-state-canonical.json");

interface FallbackTaskStatePayload {
  [reportDateIso: string]: unknown;
}

interface FallbackCanonicalTaskStatePayload {
  [dueDateIso: string]: unknown;
}

export interface TaskCompletionRecord {
  taskId: string;
  done: true;
  completedBy: string;
  completedAtIso: string;
  note: string;
  preCompleted: boolean;
  updatedAtMs: number;
}

export interface CanonicalTaskCompletionRecord {
  canonicalTaskKey: string;
  dueDateIso: string;
  boatKey: string;
  done: true;
  completedBy: string;
  completedAtIso: string;
  note: string;
  preCompleted: boolean;
  updatedAtMs: number;
}

const BACKEND_TIMEOUT_MS = clampMs(
  Number(process.env.MOORINGS_BACKEND_TIMEOUT_MS || "2500"),
  500,
  10000,
);
const COMPLETION_RESET_AT_MS = parseResetDateToMs(COMPLETION_RESET_DATE_ISO);

export async function listTaskCompletions(
  reportDateIsoRaw: string,
): Promise<Record<string, TaskCompletionRecord>> {
  const reportDateIso = normalizeReportDate(reportDateIsoRaw);
  if (!reportDateIso) {
    return {};
  }

  const fallback = readFallbackState()[reportDateIso] ?? {};

  try {
    const rtdb = getFirebaseAdminRealtimeDb();
    const snapshot = await withTimeout(
      rtdb.ref(`${TASK_STATE_RTDB_ROOT}/${reportDateIso}`).get(),
      BACKEND_TIMEOUT_MS,
      "RTDB schedule task read timeout",
    );
    return filterTaskCompletionRecords(extractRealtimeTaskRecords(snapshot.val()));
  } catch (realtimeError) {
    console.warn(
      "[moorings.ms] Could not read shared schedule task state from Realtime Database, trying Firestore.",
      realtimeError,
    );
  }

  try {
    const db = getFirebaseAdminDb();
    const snapshot = await withTimeout(
      db
        .collection(TASK_STATE_COLLECTION)
        .doc(reportDateIso)
        .collection("tasks")
        .where("done", "==", true)
        .get(),
      BACKEND_TIMEOUT_MS,
      "Firestore schedule task read timeout",
    );

    const records: Record<string, TaskCompletionRecord> = {};
    for (const doc of snapshot.docs) {
      const taskId = sanitizeTaskId(doc.id);
      if (!taskId) {
        continue;
      }
      const data = doc.data() as Partial<{
        done: boolean;
        completedBy: string;
        updatedBy: string;
        completedAtIso: string;
        updatedAtIso: string;
        note: string;
        preCompleted: boolean;
        updatedAt: unknown;
      }>;
      records[taskId] = normalizeCompletionRecord({
        taskId,
        done: data.done,
        completedBy: data.completedBy,
        updatedBy: data.updatedBy,
        completedAtIso: data.completedAtIso,
        updatedAtIso: data.updatedAtIso,
        note: data.note,
        preCompleted: data.preCompleted,
        updatedAt: data.updatedAt,
      });
    }

    return filterTaskCompletionRecords(records);
  } catch (firestoreError) {
    console.warn(
      "[moorings.ms] Could not read shared schedule task state from Firestore, using fallback store.",
      firestoreError,
    );
  }

  return filterTaskCompletionRecords(fallback);
}

export async function listCompletedTaskIds(reportDateIsoRaw: string): Promise<string[]> {
  const records = await listTaskCompletions(reportDateIsoRaw);
  return uniqueIds(Object.keys(records));
}

export async function listCanonicalTaskCompletions(
  dueDateIsosRaw: string[],
): Promise<Record<string, CanonicalTaskCompletionRecord>> {
  const dueDateIsos = uniqueIds(
    dueDateIsosRaw.map((value) => normalizeReportDate(value)).filter(Boolean),
  );
  if (dueDateIsos.length === 0) {
    return {};
  }

  const fallback = readCanonicalFallbackState();
  const fallbackRecords: Record<string, CanonicalTaskCompletionRecord> = {};
  for (const dueDateIso of dueDateIsos) {
    const bucket = fallback[dueDateIso];
    if (!bucket) {
      continue;
    }
    for (const [canonicalTaskKey, record] of Object.entries(bucket)) {
      fallbackRecords[canonicalTaskKey] = record;
    }
  }

  try {
    const rtdb = getFirebaseAdminRealtimeDb();
    const output: Record<string, CanonicalTaskCompletionRecord> = {};
    for (const dueDateIso of dueDateIsos) {
      const snapshot = await withTimeout(
        rtdb.ref(`${TASK_STATE_CANONICAL_RTDB_ROOT}/${dueDateIso}`).get(),
        BACKEND_TIMEOUT_MS,
        "RTDB canonical task read timeout",
      );
      const records = extractRealtimeCanonicalTaskRecords(dueDateIso, snapshot.val());
      Object.assign(output, records);
    }
    return filterCanonicalTaskCompletionRecords(output);
  } catch (realtimeError) {
    console.warn(
      "[moorings.ms] Could not read shared canonical schedule task state from Realtime Database, trying Firestore.",
      realtimeError,
    );
  }

  try {
    const db = getFirebaseAdminDb();
    const output: Record<string, CanonicalTaskCompletionRecord> = {};
    for (const dueDateIso of dueDateIsos) {
      const snapshot = await withTimeout(
        db
          .collection(TASK_STATE_CANONICAL_COLLECTION)
          .doc(dueDateIso)
          .collection("tasks")
          .where("done", "==", true)
          .get(),
        BACKEND_TIMEOUT_MS,
        "Firestore canonical task read timeout",
      );
      for (const doc of snapshot.docs) {
        const boatKey = sanitizeBoatKey(doc.id);
        if (!boatKey) {
          continue;
        }
        const data = doc.data() as Partial<{
          done: boolean;
          completedBy: string;
          updatedBy: string;
          completedAtIso: string;
          updatedAtIso: string;
          note: string;
          preCompleted: boolean;
          updatedAt: unknown;
        }>;
        const canonicalTaskKey = `${dueDateIso}-${boatKey}`;
        output[canonicalTaskKey] = normalizeCanonicalCompletionRecord({
          canonicalTaskKey,
          dueDateIso,
          boatKey,
          done: data.done,
          completedBy: data.completedBy,
          updatedBy: data.updatedBy,
          completedAtIso: data.completedAtIso,
          updatedAtIso: data.updatedAtIso,
          note: data.note,
          preCompleted: data.preCompleted,
          updatedAt: data.updatedAt,
        });
      }
    }
    return filterCanonicalTaskCompletionRecords(output);
  } catch (firestoreError) {
    console.warn(
      "[moorings.ms] Could not read shared canonical schedule task state from Firestore, using fallback store.",
      firestoreError,
    );
  }

  return filterCanonicalTaskCompletionRecords(fallbackRecords);
}

export async function setTaskCompletion(input: {
  reportDateIso: string;
  taskId: string;
  done: boolean;
  updatedBy: string;
  completedBy?: string;
  completedAtIso?: string;
  note?: string;
  preCompleted?: boolean;
}): Promise<boolean> {
  const reportDateIso = normalizeReportDate(input.reportDateIso);
  const taskId = sanitizeTaskId(input.taskId);
  if (!reportDateIso || !taskId) {
    return false;
  }

  const completionBy = sanitizeActor(input.completedBy) || sanitizeActor(input.updatedBy) || "Unknown";
  const completionAtIso = sanitizeIsoDateTime(input.completedAtIso) || new Date().toISOString();
  const note = sanitizeNote(input.note);
  const preCompleted = Boolean(input.preCompleted);
  const identity = parseTaskIdentity(taskId);

  const realtimeSaved = await setTaskCompletionInRealtimeDb({
    reportDateIso,
    taskId,
    done: input.done,
    updatedBy: input.updatedBy,
    completedBy: completionBy,
    completedAtIso: completionAtIso,
    note,
    preCompleted,
  });
  if (realtimeSaved) {
    if (identity) {
      await setCanonicalTaskCompletion({
        dueDateIso: identity.dueDateIso,
        boatKey: identity.boatKey,
        done: input.done,
        updatedBy: input.updatedBy,
        completedBy: completionBy,
        completedAtIso: completionAtIso,
        note,
        preCompleted,
      });
    }
    return true;
  }

  try {
    const db = getFirebaseAdminDb();
    const taskRef = db
      .collection(TASK_STATE_COLLECTION)
      .doc(reportDateIso)
      .collection("tasks")
      .doc(taskId);

    if (input.done) {
      await withTimeout(
        taskRef.set(
          {
            done: true,
            reportDateIso,
            taskId,
            updatedBy: input.updatedBy,
            completedBy: completionBy,
            completedAtIso: completionAtIso,
            note,
            preCompleted,
            updatedAtIso: new Date().toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
        BACKEND_TIMEOUT_MS,
        "Firestore schedule task write timeout",
      );
    } else {
      await withTimeout(
        taskRef.delete(),
        BACKEND_TIMEOUT_MS,
        "Firestore schedule task delete timeout",
      );
    }

    if (identity) {
      await setCanonicalTaskCompletion({
        dueDateIso: identity.dueDateIso,
        boatKey: identity.boatKey,
        done: input.done,
        updatedBy: input.updatedBy,
        completedBy: completionBy,
        completedAtIso: completionAtIso,
        note,
        preCompleted,
      });
    }

    return true;
  } catch (firestoreError) {
    console.warn(
      "[moorings.ms] Could not write shared schedule task state to Firestore, using fallback store.",
      firestoreError,
    );
  }

  const fallbackSaved = writeFallbackTaskState({
    reportDateIso,
    taskId,
    done: input.done,
    completedBy: completionBy,
    completedAtIso: completionAtIso,
    note,
    preCompleted,
  });

  if (identity) {
    await setCanonicalTaskCompletion({
      dueDateIso: identity.dueDateIso,
      boatKey: identity.boatKey,
      done: input.done,
      updatedBy: input.updatedBy,
      completedBy: completionBy,
      completedAtIso: completionAtIso,
      note,
      preCompleted,
    });
  }

  return fallbackSaved;
}

function normalizeReportDate(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function sanitizeTaskId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.length > 512) {
    return "";
  }
  return trimmed;
}

function sanitizeBoatKey(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed || !/^[A-Z0-9]+$/.test(trimmed) || trimmed.length > 512) {
    return "";
  }
  return trimmed;
}

function sanitizeCanonicalTaskKey(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed || trimmed.length > 1024) {
    return "";
  }
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})-([A-Z0-9]+)$/);
  if (!match) {
    return "";
  }
  return `${match[1]}-${match[2]}`;
}

function sanitizeActor(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, 180);
}

function sanitizeNote(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 800);
}

function sanitizeIsoDateTime(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return "";
  }
  return new Date(parsed).toISOString();
}

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

function normalizeCompletionRecord(input: {
  taskId: string;
  done?: unknown;
  completedBy?: unknown;
  updatedBy?: unknown;
  completedAtIso?: unknown;
  updatedAtIso?: unknown;
  note?: unknown;
  preCompleted?: unknown;
  updatedAt?: unknown;
}): TaskCompletionRecord {
  const taskId = sanitizeTaskId(input.taskId);
  const completedBy =
    sanitizeActor(input.completedBy) || sanitizeActor(input.updatedBy) || "Unknown";
  const completedAtIso =
    sanitizeIsoDateTime(input.completedAtIso) ||
    sanitizeIsoDateTime(input.updatedAtIso) ||
    toIsoFromUnknownTime(input.updatedAt) ||
    new Date().toISOString();

  return {
    taskId,
    done: true,
    completedBy,
    completedAtIso,
    note: sanitizeNote(input.note),
    preCompleted: Boolean(input.preCompleted),
    updatedAtMs: toMillis(input.updatedAt ?? completedAtIso),
  };
}

function normalizeCanonicalCompletionRecord(input: {
  canonicalTaskKey: string;
  dueDateIso: string;
  boatKey: string;
  done?: unknown;
  completedBy?: unknown;
  updatedBy?: unknown;
  completedAtIso?: unknown;
  updatedAtIso?: unknown;
  note?: unknown;
  preCompleted?: unknown;
  updatedAt?: unknown;
}): CanonicalTaskCompletionRecord {
  const dueDateIso = normalizeReportDate(input.dueDateIso);
  const boatKey = sanitizeBoatKey(input.boatKey);
  const canonicalTaskKey =
    sanitizeCanonicalTaskKey(input.canonicalTaskKey) ||
    `${dueDateIso}-${boatKey}`;
  const completedBy =
    sanitizeActor(input.completedBy) || sanitizeActor(input.updatedBy) || "Unknown";
  const completedAtIso =
    sanitizeIsoDateTime(input.completedAtIso) ||
    sanitizeIsoDateTime(input.updatedAtIso) ||
    toIsoFromUnknownTime(input.updatedAt) ||
    new Date().toISOString();

  return {
    canonicalTaskKey,
    dueDateIso,
    boatKey,
    done: true,
    completedBy,
    completedAtIso,
    note: sanitizeNote(input.note),
    preCompleted: Boolean(input.preCompleted),
    updatedAtMs: toMillis(input.updatedAt ?? completedAtIso),
  };
}

function parseTaskIdentity(taskId: string): {
  dueDateIso: string;
  boatKey: string;
  canonicalTaskKey: string;
} | null {
  const normalizedTaskId = sanitizeTaskId(taskId);
  if (!normalizedTaskId) {
    return null;
  }

  const sourceSuffixes = ["-Yesterday", "-Carryover", "-Today", "-Tomorrow", "-Next Week"];
  let base = normalizedTaskId;
  for (const suffix of sourceSuffixes) {
    if (normalizedTaskId.endsWith(suffix)) {
      base = normalizedTaskId.slice(0, -suffix.length);
      break;
    }
  }

  const match = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!match) {
    return null;
  }

  const dueDateIso = normalizeReportDate(match[1] ?? "");
  const boatKey = sanitizeBoatKey(match[2] ?? "");
  if (!dueDateIso || !boatKey) {
    return null;
  }

  return {
    dueDateIso,
    boatKey,
    canonicalTaskKey: `${dueDateIso}-${boatKey}`,
  };
}

async function setTaskCompletionInRealtimeDb(input: {
  reportDateIso: string;
  taskId: string;
  done: boolean;
  updatedBy: string;
  completedBy: string;
  completedAtIso: string;
  note: string;
  preCompleted: boolean;
}): Promise<boolean> {
  const reportDateIso = normalizeReportDate(input.reportDateIso);
  const taskId = sanitizeTaskId(input.taskId);
  if (!reportDateIso || !taskId) {
    return false;
  }

  try {
    const key = encodeTaskIdForRealtimeDb(taskId);
    const ref = getFirebaseAdminRealtimeDb().ref(`${TASK_STATE_RTDB_ROOT}/${reportDateIso}/${key}`);
    if (input.done) {
      await withTimeout(
        ref.set({
          done: true,
          taskId,
          updatedBy: input.updatedBy,
          completedBy: input.completedBy,
          completedAtIso: input.completedAtIso,
          note: input.note,
          preCompleted: input.preCompleted,
          updatedAt: Date.now(),
        }),
        BACKEND_TIMEOUT_MS,
        "RTDB schedule task write timeout",
      );
    } else {
      await withTimeout(
        ref.remove(),
        BACKEND_TIMEOUT_MS,
        "RTDB schedule task delete timeout",
      );
    }
    return true;
  } catch (error) {
    console.warn(
      "[moorings.ms] Could not write shared schedule task state to Realtime Database, using fallback store.",
      error,
    );
    return false;
  }
}

async function setCanonicalTaskCompletion(input: {
  dueDateIso: string;
  boatKey: string;
  done: boolean;
  updatedBy: string;
  completedBy: string;
  completedAtIso: string;
  note: string;
  preCompleted: boolean;
}): Promise<boolean> {
  const dueDateIso = normalizeReportDate(input.dueDateIso);
  const boatKey = sanitizeBoatKey(input.boatKey);
  if (!dueDateIso || !boatKey) {
    return false;
  }

  try {
    const ref = getFirebaseAdminRealtimeDb().ref(
      `${TASK_STATE_CANONICAL_RTDB_ROOT}/${dueDateIso}/${boatKey}`,
    );
    if (input.done) {
      await withTimeout(
        ref.set({
          done: true,
          dueDateIso,
          boatKey,
          canonicalTaskKey: `${dueDateIso}-${boatKey}`,
          updatedBy: input.updatedBy,
          completedBy: input.completedBy,
          completedAtIso: input.completedAtIso,
          note: input.note,
          preCompleted: input.preCompleted,
          updatedAt: Date.now(),
        }),
        BACKEND_TIMEOUT_MS,
        "RTDB canonical task write timeout",
      );
    } else {
      await withTimeout(
        ref.remove(),
        BACKEND_TIMEOUT_MS,
        "RTDB canonical task delete timeout",
      );
    }
    return true;
  } catch (realtimeError) {
    console.warn(
      "[moorings.ms] Could not write canonical schedule task state to Realtime Database, trying Firestore.",
      realtimeError,
    );
  }

  try {
    const docRef = getFirebaseAdminDb()
      .collection(TASK_STATE_CANONICAL_COLLECTION)
      .doc(dueDateIso)
      .collection("tasks")
      .doc(boatKey);
    if (input.done) {
      await withTimeout(
        docRef.set(
          {
            done: true,
            dueDateIso,
            boatKey,
            canonicalTaskKey: `${dueDateIso}-${boatKey}`,
            updatedBy: input.updatedBy,
            completedBy: input.completedBy,
            completedAtIso: input.completedAtIso,
            note: input.note,
            preCompleted: input.preCompleted,
            updatedAtIso: new Date().toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
        BACKEND_TIMEOUT_MS,
        "Firestore canonical task write timeout",
      );
    } else {
      await withTimeout(
        docRef.delete(),
        BACKEND_TIMEOUT_MS,
        "Firestore canonical task delete timeout",
      );
    }
    return true;
  } catch (firestoreError) {
    console.warn(
      "[moorings.ms] Could not write canonical schedule task state to Firestore, using fallback store.",
      firestoreError,
    );
  }

  return writeCanonicalFallbackTaskState({
    dueDateIso,
    boatKey,
    done: input.done,
    completedBy: input.completedBy,
    completedAtIso: input.completedAtIso,
    note: input.note,
    preCompleted: input.preCompleted,
  });
}

function extractRealtimeTaskRecords(raw: unknown): Record<string, TaskCompletionRecord> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const records: Record<string, TaskCompletionRecord> = {};
  for (const [encodedKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "boolean") {
      if (!value) {
        continue;
      }
      const taskId = sanitizeTaskId(decodeTaskIdFromRealtimeKey(encodedKey));
      if (!taskId) {
        continue;
      }
      records[taskId] = normalizeCompletionRecord({ taskId, done: true });
      continue;
    }

    if (!value || typeof value !== "object") {
      continue;
    }

    const row = value as Partial<{
      done: boolean;
      taskId: string;
      completedBy: string;
      updatedBy: string;
      completedAtIso: string;
      updatedAtIso: string;
      note: string;
      preCompleted: boolean;
      updatedAt: unknown;
    }>;

    if (row.done !== true) {
      continue;
    }

    const taskId =
      sanitizeTaskId(row.taskId ?? "") || sanitizeTaskId(decodeTaskIdFromRealtimeKey(encodedKey));
    if (!taskId) {
      continue;
    }

    records[taskId] = normalizeCompletionRecord({
      taskId,
      done: row.done,
      completedBy: row.completedBy,
      updatedBy: row.updatedBy,
      completedAtIso: row.completedAtIso,
      updatedAtIso: row.updatedAtIso,
      note: row.note,
      preCompleted: row.preCompleted,
      updatedAt: row.updatedAt,
    });
  }

  return records;
}

function extractRealtimeCanonicalTaskRecords(
  dueDateIsoRaw: string,
  raw: unknown,
): Record<string, CanonicalTaskCompletionRecord> {
  const dueDateIso = normalizeReportDate(dueDateIsoRaw);
  if (!dueDateIso || !raw || typeof raw !== "object") {
    return {};
  }

  const records: Record<string, CanonicalTaskCompletionRecord> = {};
  for (const [boatKeyRaw, value] of Object.entries(raw as Record<string, unknown>)) {
    const boatKey = sanitizeBoatKey(boatKeyRaw);
    if (!boatKey) {
      continue;
    }
    if (typeof value === "boolean") {
      if (!value) {
        continue;
      }
      const canonicalTaskKey = `${dueDateIso}-${boatKey}`;
      records[canonicalTaskKey] = normalizeCanonicalCompletionRecord({
        canonicalTaskKey,
        dueDateIso,
        boatKey,
        done: true,
      });
      continue;
    }
    if (!value || typeof value !== "object") {
      continue;
    }
    const row = value as Partial<{
      done: boolean;
      completedBy: string;
      updatedBy: string;
      completedAtIso: string;
      updatedAtIso: string;
      note: string;
      preCompleted: boolean;
      updatedAt: unknown;
      canonicalTaskKey: string;
      dueDateIso: string;
      boatKey: string;
    }>;
    if (row.done !== true) {
      continue;
    }
    const resolvedDueDateIso = normalizeReportDate(row.dueDateIso ?? dueDateIso) || dueDateIso;
    const resolvedBoatKey = sanitizeBoatKey(row.boatKey ?? boatKey) || boatKey;
    const canonicalTaskKey =
      sanitizeCanonicalTaskKey(row.canonicalTaskKey ?? "") ||
      `${resolvedDueDateIso}-${resolvedBoatKey}`;
    records[canonicalTaskKey] = normalizeCanonicalCompletionRecord({
      canonicalTaskKey,
      dueDateIso: resolvedDueDateIso,
      boatKey: resolvedBoatKey,
      done: row.done,
      completedBy: row.completedBy,
      updatedBy: row.updatedBy,
      completedAtIso: row.completedAtIso,
      updatedAtIso: row.updatedAtIso,
      note: row.note,
      preCompleted: row.preCompleted,
      updatedAt: row.updatedAt,
    });
  }
  return records;
}

function encodeTaskIdForRealtimeDb(taskId: string): string {
  return Buffer.from(taskId, "utf8").toString("base64url");
}

function decodeTaskIdFromRealtimeKey(value: string): string {
  const key = value.trim();
  if (!key) {
    return "";
  }
  try {
    return Buffer.from(key, "base64url").toString("utf8");
  } catch {
    return "";
  }
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

function readFallbackState(): Record<string, Record<string, TaskCompletionRecord>> {
  try {
    if (!fs.existsSync(FALLBACK_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(FALLBACK_FILE, "utf8");
    const parsed = JSON.parse(raw) as FallbackTaskStatePayload;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const output: Record<string, Record<string, TaskCompletionRecord>> = {};

    for (const [dateKey, value] of Object.entries(parsed)) {
      const normalizedDate = normalizeReportDate(dateKey);
      if (!normalizedDate) {
        continue;
      }

      const records: Record<string, TaskCompletionRecord> = {};

      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry !== "string") {
            continue;
          }
          const taskId = sanitizeTaskId(entry);
          if (!taskId) {
            continue;
          }
          records[taskId] = normalizeCompletionRecord({ taskId, done: true });
        }
        output[normalizedDate] = records;
        continue;
      }

      if (!value || typeof value !== "object") {
        continue;
      }

      for (const [taskKey, taskValue] of Object.entries(value as Record<string, unknown>)) {
        const taskId =
          sanitizeTaskId(taskKey) ||
          sanitizeTaskId(decodeTaskIdFromRealtimeKey(taskKey));
        if (!taskId) {
          continue;
        }

        if (typeof taskValue === "boolean") {
          if (!taskValue) {
            continue;
          }
          records[taskId] = normalizeCompletionRecord({ taskId, done: true });
          continue;
        }

        if (!taskValue || typeof taskValue !== "object") {
          continue;
        }

        const row = taskValue as Partial<{
          done: boolean;
          taskId: string;
          completedBy: string;
          updatedBy: string;
          completedAtIso: string;
          updatedAtIso: string;
          note: string;
          preCompleted: boolean;
          updatedAt: unknown;
        }>;
        if (row.done !== true) {
          continue;
        }

        records[taskId] = normalizeCompletionRecord({
          taskId,
          done: row.done,
          completedBy: row.completedBy,
          updatedBy: row.updatedBy,
          completedAtIso: row.completedAtIso,
          updatedAtIso: row.updatedAtIso,
          note: row.note,
          preCompleted: row.preCompleted,
          updatedAt: row.updatedAt,
        });
      }

      output[normalizedDate] = records;
    }

    return output;
  } catch (error) {
    console.warn("[moorings.ms] Could not read fallback schedule task state.", error);
    return {};
  }
}

function readCanonicalFallbackState(): Record<string, Record<string, CanonicalTaskCompletionRecord>> {
  try {
    if (!fs.existsSync(FALLBACK_CANONICAL_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(FALLBACK_CANONICAL_FILE, "utf8");
    const parsed = JSON.parse(raw) as FallbackCanonicalTaskStatePayload;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const output: Record<string, Record<string, CanonicalTaskCompletionRecord>> = {};
    for (const [dueDateIsoRaw, value] of Object.entries(parsed)) {
      const dueDateIso = normalizeReportDate(dueDateIsoRaw);
      if (!dueDateIso || !value || typeof value !== "object") {
        continue;
      }

      const bucket: Record<string, CanonicalTaskCompletionRecord> = {};
      for (const [boatKeyRaw, rawRecord] of Object.entries(value as Record<string, unknown>)) {
        const boatKey = sanitizeBoatKey(boatKeyRaw);
        if (!boatKey) {
          continue;
        }
        if (typeof rawRecord === "boolean") {
          if (!rawRecord) {
            continue;
          }
          const canonicalTaskKey = `${dueDateIso}-${boatKey}`;
          bucket[canonicalTaskKey] = normalizeCanonicalCompletionRecord({
            canonicalTaskKey,
            dueDateIso,
            boatKey,
            done: true,
          });
          continue;
        }
        if (!rawRecord || typeof rawRecord !== "object") {
          continue;
        }
        const row = rawRecord as Partial<{
          done: boolean;
          completedBy: string;
          updatedBy: string;
          completedAtIso: string;
          updatedAtIso: string;
          note: string;
          preCompleted: boolean;
          updatedAt: unknown;
          canonicalTaskKey: string;
        }>;
        if (row.done !== true) {
          continue;
        }
        const canonicalTaskKey =
          sanitizeCanonicalTaskKey(row.canonicalTaskKey ?? "") ||
          `${dueDateIso}-${boatKey}`;
        bucket[canonicalTaskKey] = normalizeCanonicalCompletionRecord({
          canonicalTaskKey,
          dueDateIso,
          boatKey,
          done: true,
          completedBy: row.completedBy,
          updatedBy: row.updatedBy,
          completedAtIso: row.completedAtIso,
          updatedAtIso: row.updatedAtIso,
          note: row.note,
          preCompleted: row.preCompleted,
          updatedAt: row.updatedAt,
        });
      }

      output[dueDateIso] = bucket;
    }

    return output;
  } catch (error) {
    console.warn("[moorings.ms] Could not read fallback canonical schedule task state.", error);
    return {};
  }
}

function writeFallbackTaskState(input: {
  reportDateIso: string;
  taskId: string;
  done: boolean;
  completedBy: string;
  completedAtIso: string;
  note: string;
  preCompleted: boolean;
}): boolean {
  try {
    const payload = readFallbackState();
    const existing = payload[input.reportDateIso] ?? {};

    if (input.done) {
      existing[input.taskId] = normalizeCompletionRecord({
        taskId: input.taskId,
        done: true,
        completedBy: input.completedBy,
        completedAtIso: input.completedAtIso,
        note: input.note,
        preCompleted: input.preCompleted,
      });
      payload[input.reportDateIso] = existing;
    } else {
      delete existing[input.taskId];
      if (Object.keys(existing).length > 0) {
        payload[input.reportDateIso] = existing;
      } else {
        delete payload[input.reportDateIso];
      }
    }

    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(payload, null, 2), "utf8");
    return true;
  } catch (error) {
    console.warn("[moorings.ms] Could not write fallback schedule task state.", error);
    return false;
  }
}

function writeCanonicalFallbackTaskState(input: {
  dueDateIso: string;
  boatKey: string;
  done: boolean;
  completedBy: string;
  completedAtIso: string;
  note: string;
  preCompleted: boolean;
}): boolean {
  try {
    const payload = readCanonicalFallbackState();
    const existing = payload[input.dueDateIso] ?? {};
    const canonicalTaskKey = `${input.dueDateIso}-${input.boatKey}`;

    if (input.done) {
      existing[canonicalTaskKey] = normalizeCanonicalCompletionRecord({
        canonicalTaskKey,
        dueDateIso: input.dueDateIso,
        boatKey: input.boatKey,
        done: true,
        completedBy: input.completedBy,
        completedAtIso: input.completedAtIso,
        note: input.note,
        preCompleted: input.preCompleted,
      });
      payload[input.dueDateIso] = existing;
    } else {
      delete existing[canonicalTaskKey];
      if (Object.keys(existing).length > 0) {
        payload[input.dueDateIso] = existing;
      } else {
        delete payload[input.dueDateIso];
      }
    }

    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    fs.writeFileSync(FALLBACK_CANONICAL_FILE, JSON.stringify(payload, null, 2), "utf8");
    return true;
  } catch (error) {
    console.warn("[moorings.ms] Could not write fallback canonical schedule task state.", error);
    return false;
  }
}

function parseResetDateToMs(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return Number.NaN;
  }
  const parsed = Date.parse(`${value.trim()}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isCompletionWithinActiveWindow(input: {
  completedAtIso: string;
  updatedAtMs: number;
}): boolean {
  if (!Number.isFinite(COMPLETION_RESET_AT_MS)) {
    return true;
  }
  const completedAtMs = Date.parse(input.completedAtIso);
  if (Number.isFinite(completedAtMs)) {
    return completedAtMs >= COMPLETION_RESET_AT_MS;
  }
  return Number.isFinite(input.updatedAtMs)
    ? input.updatedAtMs >= COMPLETION_RESET_AT_MS
    : true;
}

function filterTaskCompletionRecords(
  records: Record<string, TaskCompletionRecord>,
): Record<string, TaskCompletionRecord> {
  return Object.fromEntries(
    Object.entries(records).filter(([, record]) =>
      isCompletionWithinActiveWindow(record),
    ),
  );
}

function filterCanonicalTaskCompletionRecords(
  records: Record<string, CanonicalTaskCompletionRecord>,
): Record<string, CanonicalTaskCompletionRecord> {
  return Object.fromEntries(
    Object.entries(records).filter(([, record]) =>
      isCompletionWithinActiveWindow(record),
    ),
  );
}

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (value && typeof value === "object") {
    const millis = (value as { millis?: unknown }).millis;
    if (typeof millis === "number" && Number.isFinite(millis)) {
      return millis;
    }
  }
  return Date.now();
}

function toIsoFromUnknownTime(value: unknown): string {
  const millis = toMillis(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : "";
}
