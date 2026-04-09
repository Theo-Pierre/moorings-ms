import "server-only";

import fs from "node:fs";
import path from "node:path";

import { FieldValue } from "firebase-admin/firestore";

import { getFirebaseAdminDb, getFirebaseAdminRealtimeDb } from "./firebase/admin";

const TASK_STATE_COLLECTION =
  process.env.MOORINGS_SCHEDULE_TASK_STATE_COLLECTION?.trim() || "schedule_task_state";
const TASK_STATE_RTDB_ROOT =
  process.env.MOORINGS_SCHEDULE_TASK_STATE_RTDB_ROOT?.trim() || "schedule_task_state";
const FALLBACK_DIR = path.join("/tmp", "moorings-ms");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "schedule-task-state.json");

interface FallbackTaskStatePayload {
  [reportDateIso: string]: string[];
}

const BACKEND_TIMEOUT_MS = clampMs(
  Number(process.env.MOORINGS_BACKEND_TIMEOUT_MS || "2500"),
  500,
  10000,
);

export async function listCompletedTaskIds(reportDateIsoRaw: string): Promise<string[]> {
  const reportDateIso = normalizeReportDate(reportDateIsoRaw);
  if (!reportDateIso) {
    return [];
  }

  const fallback = readFallbackState()[reportDateIso] ?? [];

  try {
    const rtdb = getFirebaseAdminRealtimeDb();
    const snapshot = await withTimeout(
      rtdb.ref(`${TASK_STATE_RTDB_ROOT}/${reportDateIso}`).get(),
      BACKEND_TIMEOUT_MS,
      "RTDB schedule task read timeout",
    );
    return uniqueIds(extractRealtimeTaskIds(snapshot.val()));
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

    const doneIds = snapshot.docs
      .map((doc) => sanitizeTaskId(doc.id))
      .filter((id): id is string => Boolean(id));

    return uniqueIds(doneIds);
  } catch (firestoreError) {
    console.warn(
      "[moorings.ms] Could not read shared schedule task state from Firestore, using fallback store.",
      firestoreError,
    );
  }

  return uniqueIds(fallback);
}

export async function setTaskCompletion(input: {
  reportDateIso: string;
  taskId: string;
  done: boolean;
  updatedBy: string;
}): Promise<boolean> {
  const reportDateIso = normalizeReportDate(input.reportDateIso);
  const taskId = sanitizeTaskId(input.taskId);
  if (!reportDateIso || !taskId) {
    return false;
  }

  const realtimeSaved = await setTaskCompletionInRealtimeDb({
    reportDateIso,
    taskId,
    done: input.done,
    updatedBy: input.updatedBy,
  });
  if (realtimeSaved) {
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

    return true;
  } catch (firestoreError) {
    console.warn(
      "[moorings.ms] Could not write shared schedule task state to Firestore, using fallback store.",
      firestoreError,
    );
  }

  return writeFallbackTaskState({
    reportDateIso,
    taskId,
    done: input.done,
  });
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

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.map((entry) => entry.trim()).filter(Boolean))];
}

async function setTaskCompletionInRealtimeDb(input: {
  reportDateIso: string;
  taskId: string;
  done: boolean;
  updatedBy: string;
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

function extractRealtimeTaskIds(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const ids: string[] = [];
  for (const [encodedKey, value] of Object.entries(raw as Record<string, unknown>)) {
    let done = false;
    let taskId = "";

    if (typeof value === "boolean") {
      done = value;
    } else if (value && typeof value === "object") {
      const row = value as Partial<{ done: boolean; taskId: string }>;
      done = row.done === true;
      if (typeof row.taskId === "string") {
        taskId = sanitizeTaskId(row.taskId) || "";
      }
    }

    if (!done) {
      continue;
    }

    if (!taskId) {
      taskId = decodeTaskIdFromRealtimeKey(encodedKey);
    }
    const normalized = sanitizeTaskId(taskId);
    if (normalized) {
      ids.push(normalized);
    }
  }

  return ids;
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

function readFallbackState(): FallbackTaskStatePayload {
  try {
    if (!fs.existsSync(FALLBACK_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(FALLBACK_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const output: FallbackTaskStatePayload = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const normalizedDate = normalizeReportDate(key);
      if (!normalizedDate || !Array.isArray(value)) {
        continue;
      }
      output[normalizedDate] = uniqueIds(
        value
          .map((entry) => (typeof entry === "string" ? sanitizeTaskId(entry) : ""))
          .filter(Boolean),
      );
    }
    return output;
  } catch (error) {
    console.warn("[moorings.ms] Could not read fallback schedule task state.", error);
    return {};
  }
}

function writeFallbackTaskState(input: {
  reportDateIso: string;
  taskId: string;
  done: boolean;
}): boolean {
  try {
    const payload = readFallbackState();
    const existing = payload[input.reportDateIso] ?? [];
    const nextSet = new Set(existing);
    if (input.done) {
      nextSet.add(input.taskId);
    } else {
      nextSet.delete(input.taskId);
    }

    if (nextSet.size > 0) {
      payload[input.reportDateIso] = [...nextSet];
    } else {
      delete payload[input.reportDateIso];
    }

    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(payload, null, 2), "utf8");
    return true;
  } catch (error) {
    console.warn("[moorings.ms] Could not write fallback schedule task state.", error);
    return false;
  }
}
