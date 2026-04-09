"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AssignmentPlanItem } from "@/lib/operations-data";

const TASK_STATE_UPDATE_EVENT = "moorings-ms:schedule-task-state-updated";
const POLL_INTERVAL_MS = 2500;

interface TaskStateResponse {
  doneTaskIds: string[];
}

export function useSharedTaskState(reportDateIso: string, rows: AssignmentPlanItem[]) {
  const validIds = useMemo(() => new Set(rows.map((item) => item.id)), [rows]);
  const [taskState, setTaskState] = useState<Record<string, true>>({});
  const [pendingTaskIds, setPendingTaskIds] = useState<Record<string, true>>({});

  const syncFromServer = useCallback(async () => {
    if (!reportDateIso) {
      setTaskState({});
      return;
    }

    try {
      const response = await fetch(
        `/api/schedule-task-state?date=${encodeURIComponent(reportDateIso)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as Partial<TaskStateResponse>;
      const ids = Array.isArray(payload.doneTaskIds)
        ? payload.doneTaskIds.filter((entry): entry is string => typeof entry === "string")
        : [];
      setTaskState(toTaskState(ids, validIds));
    } catch {
      // Keep current state on transient network failure.
    }
  }, [reportDateIso, validIds]);

  useEffect(() => {
    setTaskState((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id, done]) => done && validIds.has(id)),
      ) as Record<string, true>,
    );
  }, [validIds]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const interval = window.setInterval(() => {
      void syncFromServer();
    }, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncFromServer();
      }
    };
    const onFocus = () => {
      void syncFromServer();
    };
    const onUpdated = (event: Event) => {
      const payload =
        event instanceof CustomEvent && event.detail && typeof event.detail === "object"
          ? (event.detail as Partial<{ reportDateIso: string }>)
          : null;
      if (payload?.reportDateIso && payload.reportDateIso !== reportDateIso) {
        return;
      }
      void syncFromServer();
    };

    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener(TASK_STATE_UPDATE_EVENT, onUpdated);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(TASK_STATE_UPDATE_EVENT, onUpdated);
    };
  }, [reportDateIso, syncFromServer]);

  const setTaskDone = useCallback(
    async (taskId: string, done: boolean) => {
      if (!validIds.has(taskId)) {
        return;
      }

      const previousDone = Boolean(taskState[taskId]);
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
          }),
        });
        if (!response.ok) {
          throw new Error(`Task state update failed (${response.status}).`);
        }
        window.dispatchEvent(
          new CustomEvent(TASK_STATE_UPDATE_EVENT, { detail: { reportDateIso } }),
        );
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
      } finally {
        setPendingTaskIds((current) => {
          const next = { ...current };
          delete next[taskId];
          return next;
        });
        void syncFromServer();
      }
    },
    [reportDateIso, syncFromServer, taskState, validIds],
  );

  return {
    taskState,
    setTaskDone,
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
