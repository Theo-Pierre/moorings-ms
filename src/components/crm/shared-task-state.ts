"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AssignmentPlanItem } from "@/lib/operations-data";

type TaskCompletionMeta = {
  taskId: string;
  completedBy: string;
  completedAtIso: string;
  note: string;
  preCompleted: boolean;
  updatedAtMs: number;
};

type TaskCompletionInput = {
  completedBy?: string;
  completedAtIso?: string;
  note?: string;
  preCompleted?: boolean;
};

interface TaskStateResponse {
  doneTaskIds?: string[];
  completions?: Record<string, Partial<TaskCompletionMeta>>;
  canonicalCompletions?: Record<string, Partial<TaskCompletionMeta> & { canonicalTaskKey?: string }>;
}

export function useSharedTaskState(reportDateIso: string, rows: AssignmentPlanItem[]) {
  const rowSnapshots = useMemo(
    () =>
      rows.map((item) => ({
        id: item.id,
        canonicalTaskKey: `${item.dueDate}-${normalizeBoatKey(item.boatName)}`,
      })),
    [rows],
  );
  const validIds = useMemo(() => new Set(rowSnapshots.map((item) => item.id)), [rowSnapshots]);
  const dueDates = useMemo(
    () =>
      [...new Set(rows.map((item) => item.dueDate.trim()).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)))],
    [rows],
  );
  const [taskState, setTaskState] = useState<Record<string, true>>({});
  const [taskMeta, setTaskMeta] = useState<Record<string, TaskCompletionMeta>>({});
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, true>>({});

  const syncFromServer = useCallback(async () => {
    if (!reportDateIso) {
      setTaskState({});
      setTaskMeta({});
      return;
    }

    try {
      const response = await fetch(
        `/api/schedule-task-state?date=${encodeURIComponent(reportDateIso)}&dueDates=${encodeURIComponent(
          dueDates.join(","),
        )}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as TaskStateResponse;
      const ids = Array.isArray(payload.doneTaskIds)
        ? payload.doneTaskIds.filter((entry): entry is string => typeof entry === "string")
        : [];

      const baseState = toTaskState(ids, validIds);
      const normalizedMeta = normalizeTaskMeta(payload.completions, validIds);
      const canonicalMeta = normalizeCanonicalTaskMeta(payload.canonicalCompletions);

      const mergedState = { ...baseState };
      const mergedMeta = { ...normalizedMeta };
      for (const row of rowSnapshots) {
        if (mergedState[row.id]) {
          continue;
        }
        const canonical = canonicalMeta[row.canonicalTaskKey];
        if (!canonical) {
          continue;
        }
        mergedState[row.id] = true;
        mergedMeta[row.id] = canonical;
      }

      setTaskState(mergedState);
      setTaskMeta(mergedMeta);
    } catch {
      // Keep current state on transient network failure.
    }
  }, [dueDates, reportDateIso, rowSnapshots, validIds]);

  useEffect(() => {
    setTaskState((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id, done]) => done && validIds.has(id)),
      ) as Record<string, true>,
    );
    setTaskMeta((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => validIds.has(id)),
      ) as Record<string, TaskCompletionMeta>,
    );
  }, [validIds]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  const setTaskDone = useCallback(
    async (taskId: string, done: boolean, meta?: TaskCompletionInput) => {
      if (!validIds.has(taskId)) {
        return;
      }

      const previousDone = Boolean(taskState[taskId]);
      const previousMeta = taskMeta[taskId];
      const optimisticMeta = done
        ? normalizeSingleMeta(taskId, {
            ...meta,
            completedAtIso: meta?.completedAtIso ?? new Date().toISOString(),
          })
        : null;

      setTaskState((current) => {
        if (done) {
          return {
            ...current,
            [taskId]: true,
          };
        }
        if (!current[taskId]) {
          return current;
        }
        const next = { ...current };
        delete next[taskId];
        return next;
      });

      setTaskMeta((current) => {
        const next = { ...current };
        if (done && optimisticMeta) {
          next[taskId] = optimisticMeta;
        } else {
          delete next[taskId];
        }
        return next;
      });

      setPendingTaskIds((current) => ({
        ...current,
        [taskId]: true,
      }));

      try {
        const response = await fetch("/api/schedule-task-state", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reportDateIso,
            taskId,
            done,
            completedBy: meta?.completedBy,
            completedAtIso: meta?.completedAtIso,
            note: meta?.note,
            preCompleted: meta?.preCompleted,
          }),
        });
        if (!response.ok) {
          throw new Error(`Task state update failed (${response.status}).`);
        }
      } catch {
        setTaskState((current) => {
          if (previousDone) {
            return {
              ...current,
              [taskId]: true,
            };
          }
          const next = { ...current };
          delete next[taskId];
          return next;
        });

        setTaskMeta((current) => {
          const next = { ...current };
          if (previousMeta) {
            next[taskId] = previousMeta;
          } else {
            delete next[taskId];
          }
          return next;
        });
      } finally {
        setPendingTaskIds((current) => {
          const next = { ...current };
          delete next[taskId];
          return next;
        });
        void syncFromServer();
      }
    },
    [reportDateIso, syncFromServer, taskMeta, taskState, validIds],
  );

  const setManyTaskDone = useCallback(
    async (taskIds: string[], meta?: TaskCompletionInput) => {
      for (const taskId of taskIds) {
        await setTaskDone(taskId, true, meta);
      }
    },
    [setTaskDone],
  );

  return {
    taskState,
    taskMeta,
    setTaskDone,
    setManyTaskDone,
    pendingTaskIds,
    refreshTaskState: syncFromServer,
  };
}

function toTaskState(doneIds: string[], validIds: Set<string>): Record<string, true> {
  const state: Record<string, true> = {};
  for (const id of doneIds) {
    if (validIds.has(id)) {
      state[id] = true;
    }
  }
  return state;
}

function normalizeTaskMeta(
  value: Record<string, Partial<TaskCompletionMeta>> | undefined,
  validIds: Set<string>,
): Record<string, TaskCompletionMeta> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const output: Record<string, TaskCompletionMeta> = {};
  for (const [taskId, raw] of Object.entries(value)) {
    if (!validIds.has(taskId)) {
      continue;
    }
    output[taskId] = normalizeSingleMeta(taskId, raw);
  }
  return output;
}

function normalizeCanonicalTaskMeta(
  value:
    | Record<string, Partial<TaskCompletionMeta> & { canonicalTaskKey?: string }>
    | undefined,
): Record<string, TaskCompletionMeta> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const output: Record<string, TaskCompletionMeta> = {};
  for (const [canonicalKey, raw] of Object.entries(value)) {
    const normalizedCanonicalKey = normalizeCanonicalTaskKey(raw?.canonicalTaskKey || canonicalKey);
    if (!normalizedCanonicalKey) {
      continue;
    }
    output[normalizedCanonicalKey] = normalizeSingleMeta(normalizedCanonicalKey, raw);
  }
  return output;
}

function normalizeSingleMeta(
  taskId: string,
  raw: Partial<TaskCompletionMeta> | TaskCompletionInput | undefined,
): TaskCompletionMeta {
  const rawWithUpdated = raw as Partial<TaskCompletionMeta> | undefined;
  const completedBy = typeof raw?.completedBy === "string" && raw.completedBy.trim()
    ? raw.completedBy.trim()
    : "Unknown";

  const completedAtIso = toIsoOrNow(raw?.completedAtIso);

  return {
    taskId,
    completedBy,
    completedAtIso,
    note: typeof raw?.note === "string" ? raw.note.trim().slice(0, 800) : "",
    preCompleted: Boolean(raw?.preCompleted),
    updatedAtMs:
      typeof rawWithUpdated?.updatedAtMs === "number" && Number.isFinite(rawWithUpdated.updatedAtMs)
        ? rawWithUpdated.updatedAtMs
        : Date.parse(completedAtIso) || Date.now(),
  };
}

function toIsoOrNow(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date().toISOString();
}

function normalizeBoatKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}

function normalizeCanonicalTaskKey(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return "";
  }
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})-([A-Z0-9]+)$/);
  if (!match) {
    return "";
  }
  return `${match[1]}-${match[2]}`;
}
