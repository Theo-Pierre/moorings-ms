"use client";

import {
  type VesselOverrideRecord,
  restoreVesselOverrideSnapshot,
} from "./manual-vessels";

type TaskCompletionUndoMeta = {
  completedBy: string;
  completedAtIso: string;
  note: string;
  preCompleted: boolean;
};

export type UndoAction =
  | {
      type: "vessel-override";
      boatKey: string;
      previous: VesselOverrideRecord | null;
      next: VesselOverrideRecord | null;
      createdAtIso: string;
    }
  | {
      type: "planning-date";
      previousDateIso: string | null;
      nextDateIso: string | null;
      createdAtIso: string;
    }
  | {
      type: "task-completion";
      reportDateIso: string;
      taskId: string;
      previousDone: boolean;
      previousMeta: TaskCompletionUndoMeta | null;
      nextDone: boolean;
      nextMeta: TaskCompletionUndoMeta | null;
      createdAtIso: string;
    };

const UNDO_STORAGE_KEY = "moorings-ms:undo-stack";
const MAX_UNDO = 25;
const UNDO_UPDATE_EVENT = "moorings-ms:undo-stack-updated";

export function pushUndoAction(action: UndoAction): void {
  if (typeof window === "undefined") {
    return;
  }
  const stack = readUndoStack();
  stack.push(action);
  const bounded = stack.slice(Math.max(0, stack.length - MAX_UNDO));
  window.sessionStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(bounded));
  window.dispatchEvent(new Event(UNDO_UPDATE_EVENT));
}

export function peekUndoAction(): UndoAction | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stack = readUndoStack();
  return stack.at(-1) ?? null;
}

export function popUndoAction(): UndoAction | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stack = readUndoStack();
  const action = stack.pop() ?? null;
  window.sessionStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(stack));
  window.dispatchEvent(new Event(UNDO_UPDATE_EVENT));
  return action;
}

export function hasUndoActions(): boolean {
  return Boolean(peekUndoAction());
}

export function getUndoUpdateEventName(): string {
  return UNDO_UPDATE_EVENT;
}

export function applyUndoAction(action: UndoAction): void {
  if (action.type === "vessel-override") {
    restoreVesselOverrideSnapshot(action.boatKey, action.previous);
  }
}

function readUndoStack(): UndoAction[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.sessionStorage.getItem(UNDO_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((value) => sanitizeUndoAction(value))
      .filter((value): value is UndoAction => value !== null);
  } catch {
    return [];
  }
}

function sanitizeUndoAction(value: unknown): UndoAction | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<UndoAction>;
  if (row.type === "vessel-override") {
    const typedRow = value as Partial<Extract<UndoAction, { type: "vessel-override" }>>;
    if (typeof typedRow.boatKey !== "string" || !typedRow.boatKey.trim()) {
      return null;
    }
    return {
      type: "vessel-override",
      boatKey: typedRow.boatKey.trim(),
      previous: sanitizeVesselOverride(typedRow.previous),
      next: sanitizeVesselOverride(typedRow.next),
      createdAtIso:
        typeof typedRow.createdAtIso === "string" ? typedRow.createdAtIso : new Date().toISOString(),
    };
  }
  if (row.type === "planning-date") {
    const typedRow = value as Partial<Extract<UndoAction, { type: "planning-date" }>>;
    return {
      type: "planning-date",
      previousDateIso: normalizeOptionalDateIso(typedRow.previousDateIso),
      nextDateIso: normalizeOptionalDateIso(typedRow.nextDateIso),
      createdAtIso:
        typeof typedRow.createdAtIso === "string" ? typedRow.createdAtIso : new Date().toISOString(),
    };
  }
  if (row.type === "task-completion") {
    const typedRow = value as Partial<Extract<UndoAction, { type: "task-completion" }>>;
    const reportDateIso = normalizeOptionalDateIso(typedRow.reportDateIso);
    const taskId = typeof typedRow.taskId === "string" ? typedRow.taskId.trim() : "";
    if (!reportDateIso || !taskId) {
      return null;
    }
    return {
      type: "task-completion",
      reportDateIso,
      taskId,
      previousDone: Boolean(typedRow.previousDone),
      previousMeta: sanitizeTaskCompletionMeta(typedRow.previousMeta),
      nextDone: Boolean(typedRow.nextDone),
      nextMeta: sanitizeTaskCompletionMeta(typedRow.nextMeta),
      createdAtIso:
        typeof typedRow.createdAtIso === "string" ? typedRow.createdAtIso : new Date().toISOString(),
    };
  }
  return null;
}

function sanitizeVesselOverride(value: unknown): VesselOverrideRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<VesselOverrideRecord>;
  if (typeof row.boatKey !== "string" || !row.boatKey.trim()) {
    return null;
  }

  return {
    boatKey: row.boatKey.trim().toUpperCase(),
    boatName: typeof row.boatName === "string" ? row.boatName : undefined,
    stat: typeof row.stat === "string" ? row.stat : undefined,
    dueDate: normalizeOptionalDateIso(row.dueDate) ?? undefined,
    completionPct: typeof row.completionPct === "number" ? row.completionPct : undefined,
    assignedTechnician:
      typeof row.assignedTechnician === "string" ? row.assignedTechnician : undefined,
    assignedRigger: typeof row.assignedRigger === "string" ? row.assignedRigger : undefined,
    assignedShipwright:
      typeof row.assignedShipwright === "string" ? row.assignedShipwright : undefined,
    note: typeof row.note === "string" ? row.note : undefined,
    deleted: Boolean(row.deleted),
    updatedAtIso: typeof row.updatedAtIso === "string" ? row.updatedAtIso : new Date().toISOString(),
  };
}

function normalizeOptionalDateIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function sanitizeTaskCompletionMeta(value: unknown): TaskCompletionUndoMeta | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<TaskCompletionUndoMeta>;
  const completedBy = typeof row.completedBy === "string" ? row.completedBy.trim() : "";
  const completedAtIso = typeof row.completedAtIso === "string" ? row.completedAtIso.trim() : "";
  if (!completedBy || !completedAtIso) {
    return null;
  }

  return {
    completedBy,
    completedAtIso,
    note: typeof row.note === "string" ? row.note : "",
    preCompleted: Boolean(row.preCompleted),
  };
}
