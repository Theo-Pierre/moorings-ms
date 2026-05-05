"use client";

import mooringsLogo from "@/assets/moorings-logo.png";
import sunsailLogo from "@/assets/sunsail-logo.png";
import { logoutAction } from "@/app/auth/actions";
import type { AuthSession } from "@/lib/auth";
import type { DailyApprovalData, WorkforceRoleKey } from "@/lib/operations-data";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  addManualVessel,
  getVesselOverrideSnapshot,
  upsertVesselOverride,
} from "./manual-vessels";
import {
  applyUndoAction,
  getUndoUpdateEventName,
  hasUndoActions,
  peekUndoAction,
  popUndoAction,
  pushUndoAction,
} from "./undo-stack";
import styles from "./crm.module.css";

interface CrmShellProps {
  appName: string;
  reportDateIso: string;
  reportDateLabel: string;
  planningDateOverride: {
    active: boolean;
    dateIso: string | null;
    dateLabel: string | null;
    updatedBy: string | null;
  };
  session: AuthSession;
  workerRecommendations: {
    technicians: string[];
    riggers: string[];
    shipwrights: string[];
  };
  dailyApproval: DailyApprovalData;
  children: React.ReactNode;
}

const baseNavItems = [
  { href: "/", label: "Overview", icon: "helm" as const },
  { href: "/schedule", label: "Schedule", icon: "sail" as const },
  { href: "/vessels", label: "Vessels", icon: "hull" as const },
  { href: "/technicians", label: "Technicians", icon: "tool" as const },
  { href: "/riggers", label: "Riggers", icon: "rope" as const },
  { href: "/shipwrights", label: "Shipwrights", icon: "anchor" as const },
  { href: "/reports", label: "Reports", icon: "wave" as const },
];

export function CrmShell({
  appName,
  reportDateIso,
  reportDateLabel,
  planningDateOverride,
  session,
  workerRecommendations,
  dailyApproval,
  children,
}: CrmShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [addVesselOpen, setAddVesselOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getStoredSidebarPreference);
  const [planningDateInput, setPlanningDateInput] = useState(
    planningDateOverride.dateIso ?? reportDateIso,
  );
  const [planningDateSaving, setPlanningDateSaving] = useState(false);
  const [planningDateMessage, setPlanningDateMessage] = useState("");
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [approvalSelections, setApprovalSelections] = useState<Record<string, string[]>>({});
  const canSetPlanningDate = session.role === "super-admin";
  const canUndo = session.role !== "viewer";
  const canApproveScheduling = session.role === "super-admin" || session.role === "admin";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("moorings-ms:sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    setPlanningDateInput(planningDateOverride.dateIso ?? reportDateIso);
  }, [planningDateOverride.dateIso, reportDateIso]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const syncUndoAvailability = () => setUndoAvailable(hasUndoActions());
    syncUndoAvailability();
    const undoEvent = getUndoUpdateEventName();
    window.addEventListener(undoEvent, syncUndoAvailability);
    return () => {
      window.removeEventListener(undoEvent, syncUndoAvailability);
    };
  }, []);

  useEffect(() => {
    if (!canApproveScheduling || typeof window === "undefined") {
      setApprovalRequired(false);
      return;
    }
    const key = approvalStorageKey({
      dateIso: dailyApproval.dateIso,
      email: session.email,
    });
    const approved = window.localStorage.getItem(key) === "approved";
    setApprovalRequired(!approved);
    if (!approved) {
      setApprovalOpen(true);
    }
  }, [canApproveScheduling, dailyApproval.dateIso, session.email]);

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const shortage of dailyApproval.shortages) {
      next[shortage.roleKey] = shortage.candidateWorkers.slice(0, shortage.neededWorkers);
    }
    setApprovalSelections(next);
  }, [dailyApproval.shortages]);

  const navItems = useMemo(() => {
    if (session.role === "super-admin") {
      return [...baseNavItems, { href: "/team-control", label: "Team Control", icon: "crew" as const }];
    }
    return baseNavItems;
  }, [session.role]);

  const navContent = useMemo(
    () => (
      <ul className={styles.sidebarNavList}>
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch
                className={active ? `${styles.sidebarLink} ${styles.sidebarLinkActive}` : styles.sidebarLink}
                onClick={() => setMobileOpen(false)}
              >
                <span className={styles.sidebarIcon} aria-hidden="true">
                  <NavIcon icon={item.icon} />
                </span>
                <span className={styles.sidebarLinkLabel}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    ),
    [navItems, pathname],
  );

  const canAddVessel = session.role === "admin" || session.role === "super-admin";

  async function savePlanningDateOverride(
    nextDateIso: string | null,
    options?: { recordUndo?: boolean; previousDateIso?: string | null },
  ) {
    if (!canSetPlanningDate || planningDateSaving) {
      return;
    }
    const shouldRecordUndo = options?.recordUndo !== false;
    const previousDateIso = options?.previousDateIso ?? (planningDateOverride.dateIso ?? null);
    setPlanningDateSaving(true);
    setPlanningDateMessage("");
    try {
      const response = await fetch("/api/planning-date", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateIso: nextDateIso,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setPlanningDateMessage(payload?.error || "Could not save planning date.");
        return;
      }

      setPlanningDateMessage(
        nextDateIso
          ? `As-of date set to ${nextDateIso}.`
          : "As-of date override cleared. Back to live day.",
      );
      if (shouldRecordUndo && previousDateIso !== nextDateIso) {
        pushUndoAction({
          type: "planning-date",
          previousDateIso,
          nextDateIso,
          createdAtIso: new Date().toISOString(),
        });
      }
      if (typeof window !== "undefined") {
        window.location.reload();
        return;
      }
      router.refresh();
    } catch {
      setPlanningDateMessage("Could not save planning date.");
    } finally {
      setPlanningDateSaving(false);
    }
  }

  async function handleUndo() {
    if (undoBusy) {
      return;
    }
    const action = peekUndoAction();
    if (!action) {
      setPlanningDateMessage("No undo actions available in this session.");
      setUndoAvailable(false);
      return;
    }

    if (action.type === "planning-date") {
      popUndoAction();
      setUndoBusy(true);
      try {
        await savePlanningDateOverride(action.previousDateIso, {
          recordUndo: false,
          previousDateIso: action.nextDateIso,
        });
      } finally {
        setUndoBusy(false);
      }
      return;
    }

    if (action.type === "task-completion") {
      setUndoBusy(true);
      try {
        const response = await fetch("/api/schedule-task-state", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reportDateIso: action.reportDateIso,
            taskId: action.taskId,
            done: action.previousDone,
            completedBy: action.previousMeta?.completedBy,
            completedAtIso: action.previousMeta?.completedAtIso,
            note: action.previousMeta?.note,
            preCompleted: action.previousMeta?.preCompleted,
          }),
        });
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Could not undo task update.");
        }
        popUndoAction();
        setPlanningDateMessage("Last task update was undone.");
        router.refresh();
      } catch (error) {
        setPlanningDateMessage(
          error instanceof Error ? error.message : "Could not undo task update.",
        );
      } finally {
        setUndoBusy(false);
      }
      return;
    }

    popUndoAction();
    applyUndoAction(action);
    setPlanningDateMessage("Last vessel change was undone.");
    router.refresh();
    setUndoAvailable(hasUndoActions());
  }

  async function saveSchedulingApproval() {
    if (!canApproveScheduling || approvalBusy) {
      return;
    }
    setApprovalBusy(true);
    setApprovalMessage(null);
    try {
      for (const shortage of dailyApproval.shortages) {
        const selectedWorkers = approvalSelections[shortage.roleKey] ?? [];
        const response = await fetch("/api/daily-callins", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dateIso: dailyApproval.dateIso,
            role: shortage.roleKey,
            workerLabels: selectedWorkers,
          }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Could not save call-in approvals.");
        }
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          approvalStorageKey({
            dateIso: dailyApproval.dateIso,
            email: session.email,
          }),
          "approved",
        );
      }
      setApprovalRequired(false);
      setApprovalOpen(false);
      setApprovalMessage("Scheduling approved and workforce call-ins applied.");
      router.refresh();
    } catch (error) {
      setApprovalMessage(error instanceof Error ? error.message : "Could not save approval.");
    } finally {
      setApprovalBusy(false);
    }
  }

  function applyApprovalAssignmentOverride(inputOverride: {
    vessel: string;
    technician: string;
    rigger: string;
    shipwright: string;
  }): boolean {
    const previous = getVesselOverrideSnapshot(inputOverride.vessel);
    const next = upsertVesselOverride({
      boatKey: inputOverride.vessel,
      assignedTechnician: inputOverride.technician,
      assignedRigger: inputOverride.rigger,
      assignedShipwright: inputOverride.shipwright,
    });

    if (!next) {
      setApprovalMessage(`Could not update ${inputOverride.vessel}.`);
      return false;
    }

    pushUndoAction({
      type: "vessel-override",
      boatKey: inputOverride.vessel,
      previous,
      next,
      createdAtIso: new Date().toISOString(),
    });
    setApprovalMessage(`Updated assignments for ${inputOverride.vessel}.`);
    return true;
  }

  return (
    <div className={sidebarCollapsed ? `${styles.crmFrame} ${styles.crmFrameCollapsed}` : styles.crmFrame}>
      <aside className={sidebarCollapsed ? `${styles.sidebar} ${styles.sidebarCollapsed}` : styles.sidebar}>
        <Link href="/" prefetch className={styles.sidebarBrand}>
          <Image src={mooringsLogo} width={132} height={72} alt="Moorings" className={styles.brandLogo} priority />
          <div className={styles.sidebarBrandText}>
            <p className={styles.brandName}>{appName}</p>
            <p className={styles.brandMeta}>Ops date: {reportDateLabel}</p>
          </div>
        </Link>

        <div className={styles.sidebarPartner}>
          <div className={styles.sidebarPartnerIdentity}>
            <Image src={sunsailLogo} width={36} height={36} alt="Sunsail" className={styles.partnerLogo} />
            <span className={styles.sidebarPartnerLabel}>Fleet partner</span>
          </div>
          <button
            type="button"
            className={styles.sidebarCollapseButton}
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>

        <nav aria-label="CRM navigation" className={styles.sidebarNav}>
          {navContent}
        </nav>

        <div className={styles.sidebarAuthCard}>
          <p className={styles.authName}>{session.name}</p>
          <p className={styles.authMeta}>{session.email}</p>
          <span className={styles.authRoleBadge}>{roleLabel(session.role)}</span>
          <form action={logoutAction}>
            <button type="submit" className={styles.authLogoutButton}>
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.desktopHeader}>
          <div>
            <p className={styles.desktopTitle}>
              Hello, {session.name}
            </p>
            <p className={styles.desktopSubtitle}>
              {roleLabel(session.role)} workspace | Ops date: {reportDateLabel}
              {planningDateOverride.active && planningDateOverride.dateLabel
                ? ` | As-of override: ${planningDateOverride.dateLabel}`
                : ""}
            </p>
          </div>

          <div className={styles.desktopActions}>
            {canUndo ? (
              <button
                type="button"
                className={styles.desktopActionSecondary}
                disabled={!undoAvailable || undoBusy || planningDateSaving}
                onClick={() => {
                  void handleUndo();
                }}
              >
                {undoBusy ? "Undoing..." : "Undo"}
              </button>
            ) : null}
            {canApproveScheduling ? (
              <button
                type="button"
                className={
                  approvalRequired
                    ? `${styles.desktopActionSecondary} ${styles.approvalNoticeButton}`
                    : styles.desktopActionSecondary
                }
                onClick={() => setApprovalOpen(true)}
              >
                {approvalRequired ? "Scheduling Approval Required" : "Review Scheduling Approval"}
              </button>
            ) : null}
            {canSetPlanningDate ? (
              <div className={styles.planningDateControls}>
                <label className={styles.planningDateLabel}>
                  <span>As-of Date</span>
                  <input
                    type="date"
                    className={styles.planningDateInput}
                    value={planningDateInput}
                    onChange={(event) => setPlanningDateInput(event.target.value)}
                    disabled={planningDateSaving}
                  />
                </label>
                <button
                  type="button"
                  className={styles.desktopActionSecondary}
                  disabled={!planningDateInput || planningDateSaving}
                  onClick={() => {
                    void savePlanningDateOverride(planningDateInput, {
                      previousDateIso: planningDateOverride.dateIso ?? null,
                    });
                  }}
                >
                  {planningDateSaving ? "Saving..." : "Apply"}
                </button>
                <button
                  type="button"
                  className={styles.desktopActionSecondary}
                  disabled={planningDateSaving}
                  onClick={() => {
                    void savePlanningDateOverride(null, {
                      previousDateIso: planningDateOverride.dateIso ?? null,
                    });
                  }}
                >
                  Clear
                </button>
              </div>
            ) : null}
            {canAddVessel ? (
              <button
                type="button"
                className={styles.desktopActionPrimary}
                onClick={() => setAddVesselOpen(true)}
              >
                + Add Vessel
              </button>
            ) : (
              <span className={styles.desktopRoleHint}>
                Viewer access: only Admin and Super Admin can add vessels.
              </span>
            )}
          </div>
        </header>
        {planningDateMessage ? <p className={styles.planningDateNote}>{planningDateMessage}</p> : null}
        {approvalMessage ? <p className={styles.planningDateNote}>{approvalMessage}</p> : null}

        <header className={styles.mobileHeader}>
          <Link href="/" prefetch className={styles.mobileBrand}>
            <Image src={mooringsLogo} width={84} height={46} alt="Moorings" className={styles.mobileBrandLogo} priority />
            <div>
              <p className={styles.mobileBrandName}>{appName}</p>
              <p className={styles.mobileBrandMeta}>{reportDateLabel}</p>
              <p className={styles.mobileBrandHello}>Hello, {session.name}</p>
            </div>
          </Link>

          <button
            type="button"
            className={styles.mobileMenuButton}
            onClick={() => setMobileOpen((current) => !current)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-crm-nav"
          >
            <SailGlyph />
            <span>{mobileOpen ? "Close Menu" : "Open Menu"}</span>
          </button>
        </header>

        {mobileOpen ? (
          <button
            type="button"
            className={styles.mobileBackdrop}
            aria-label="Close mobile navigation"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        {mobileOpen ? (
          <nav id="mobile-crm-nav" className={styles.mobileDropdown} aria-label="Mobile CRM navigation">
            {navContent}
            <div className={styles.mobileAuthBlock}>
              <p className={styles.authName}>{session.name}</p>
              <p className={styles.authMeta}>{session.email}</p>
              <span className={styles.authRoleBadge}>{roleLabel(session.role)}</span>
              <form action={logoutAction}>
                <button type="submit" className={styles.authLogoutButton}>
                  Sign Out
                </button>
              </form>
            </div>
          </nav>
        ) : null}

        <main className={styles.pageCanvas}>{children}</main>
      </div>

      {addVesselOpen ? (
        <AddVesselDialog
          workerRecommendations={workerRecommendations}
          onClose={() => setAddVesselOpen(false)}
          onCreated={() => setAddVesselOpen(false)}
        />
      ) : null}
      {approvalOpen && canApproveScheduling ? (
        <DailySchedulingApprovalDialog
          key={`approval-${dailyApproval.dateIso}-${dailyApproval.assignments.length}`}
          dailyApproval={dailyApproval}
          workerRecommendations={workerRecommendations}
          selections={approvalSelections}
          onChangeSelection={(roleKey, labels) =>
            setApprovalSelections((current) => ({
              ...current,
              [roleKey]: labels,
            }))
          }
          onApplyAssignmentOverride={applyApprovalAssignmentOverride}
          onApprove={() => {
            void saveSchedulingApproval();
          }}
          onDecline={() => {
            setApprovalOpen(false);
            setApprovalMessage("Scheduling approval pending. Edit allocations in Schedule and approve when ready.");
            void router.push("/schedule");
          }}
          onClose={() => setApprovalOpen(false)}
          busy={approvalBusy}
        />
      ) : null}
    </div>
  );
}

function getStoredSidebarPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem("moorings-ms:sidebar-collapsed") === "1";
}

function NavIcon({ icon }: { icon: "helm" | "sail" | "hull" | "tool" | "crew" | "rope" | "anchor" | "wave" }) {
  switch (icon) {
    case "helm":
      return (
        <svg viewBox="0 0 24 24" className={styles.iconSvg}>
          <circle cx="12" cy="12" r="2.6" />
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
          <path d="M4.8 4.8l3 3" />
          <path d="M16.2 16.2l3 3" />
          <path d="M19.2 4.8l-3 3" />
          <path d="M7.8 16.2l-3 3" />
        </svg>
      );
    case "sail":
      return <SailGlyph />;
    case "hull":
      return (
        <svg viewBox="0 0 24 24" className={styles.iconSvg}>
          <path d="M3 15h18" />
          <path d="M5 15l2 4h10l2-4" />
          <path d="M11 5l4 10H7z" />
        </svg>
      );
    case "tool":
      return (
        <svg viewBox="0 0 24 24" className={styles.iconSvg}>
          <path d="M4 20l7.4-7.4" />
          <path d="M13.6 10.4L20 4" />
          <path d="M14.8 3.7a3 3 0 0 0 4.2 4.2l-1.4 1.4a4.8 4.8 0 0 1-6.8-6.8z" />
          <path d="M3.2 20.8a2.1 2.1 0 1 0 3-3l-1.5-1.5a2.1 2.1 0 1 0-3 3z" />
        </svg>
      );
    case "crew":
      return (
        <svg viewBox="0 0 24 24" className={styles.iconSvg}>
          <circle cx="8" cy="8" r="2.3" />
          <circle cx="16" cy="8" r="2.3" />
          <path d="M3.5 18a4.5 4.5 0 0 1 9 0" />
          <path d="M11.5 18a4.5 4.5 0 0 1 9 0" />
        </svg>
      );
    case "rope":
      return (
        <svg viewBox="0 0 24 24" className={styles.iconSvg}>
          <path d="M12 3a5 5 0 1 1 0 10h-1a3 3 0 1 0 0 6h6" />
          <circle cx="18" cy="19" r="2" />
        </svg>
      );
    case "anchor":
      return (
        <svg viewBox="0 0 24 24" className={styles.iconSvg}>
          <circle cx="12" cy="5" r="2.1" />
          <path d="M12 7.4v9.2" />
          <path d="M8 12c0 4.3 1.8 6.8 4 6.8s4-2.5 4-6.8" />
          <path d="M6 12H3" />
          <path d="M21 12h-3" />
        </svg>
      );
    case "wave":
      return (
        <svg viewBox="0 0 24 24" className={styles.iconSvg}>
          <path d="M2 10c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2 2.2-2 4.4-2" />
          <path d="M2 15c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2 2.2-2 4.4-2" />
        </svg>
      );
    default:
      return null;
  }
}

function SailGlyph() {
  return (
    <svg viewBox="0 0 24 24" className={styles.iconSvg} aria-hidden="true">
      <path d="M12 2v18" />
      <path d="M12 3l7 8h-7z" />
      <path d="M12 8l-6 7h6z" />
      <path d="M3 20h18" />
    </svg>
  );
}

function roleLabel(role: AuthSession["role"]): string {
  if (role === "super-admin") {
    return "Super Admin";
  }
  if (role === "admin") {
    return "Admin";
  }
  return "Viewer";
}

function approvalStorageKey(input: { dateIso: string; email: string }): string {
  return `moorings-ms:scheduling-approval:${input.dateIso}:${input.email.toLowerCase()}`;
}

function normalizeWorkerOption(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUnassignedLabel(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) {
    return "Unassigned";
  }
  const normalized = normalizeWorkerOption(cleaned);
  if (
    normalized === "unassigned" ||
    normalized === "pending assignment" ||
    normalized === "pending"
  ) {
    return "Unassigned";
  }
  return cleaned;
}

function uniqueWorkerOptions(values: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of values) {
    const label = normalizeUnassignedLabel(raw);
    const key = normalizeWorkerOption(label);
    if (!key) {
      continue;
    }
    if (!byKey.has(key)) {
      byKey.set(key, label);
    }
  }

  const labels = [...byKey.values()];
  const hasUnassigned = labels.some((label) => normalizeWorkerOption(label) === "unassigned");
  const others = labels
    .filter((label) => normalizeWorkerOption(label) !== "unassigned")
    .sort((left, right) => left.localeCompare(right));

  return hasUnassigned ? ["Unassigned", ...others] : others;
}

function DailySchedulingApprovalDialog(input: {
  dailyApproval: DailyApprovalData;
  workerRecommendations: {
    technicians: string[];
    riggers: string[];
    shipwrights: string[];
  };
  selections: Record<string, string[]>;
  onChangeSelection: (roleKey: WorkforceRoleKey, labels: string[]) => void;
  onApplyAssignmentOverride: (input: {
    vessel: string;
    technician: string;
    rigger: string;
    shipwright: string;
  }) => boolean;
  onApprove: () => void;
  onDecline: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"summary" | "workforce">("summary");
  const [editableAssignments, setEditableAssignments] = useState(() => input.dailyApproval.assignments);
  const [expandedAssignmentKey, setExpandedAssignmentKey] = useState<string | null>(null);
  const [draftAssignments, setDraftAssignments] = useState<
    Record<
      string,
      {
        technician: string;
        rigger: string;
        shipwright: string;
      }
    >
  >({});
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);

  function toggleWorker(roleKey: WorkforceRoleKey, workerLabel: string) {
    const current = input.selections[roleKey] ?? [];
    const exists = current.includes(workerLabel);
    const next = exists
      ? current.filter((label) => label !== workerLabel)
      : [...current, workerLabel];
    input.onChangeSelection(roleKey, next);
  }

  function getAssignmentKey(vessel: string, index: number): string {
    return `${index}:${vessel}`;
  }

  function getDraftForAssignment(
    assignment: DailyApprovalData["assignments"][number],
    key: string,
  ): {
    technician: string;
    rigger: string;
    shipwright: string;
  } {
    return (
      draftAssignments[key] ?? {
        technician: assignment.technician,
        rigger: assignment.rigger,
        shipwright: assignment.shipwright,
      }
    );
  }

  function updateDraftAssignment(
    key: string,
    role: "technician" | "rigger" | "shipwright",
    value: string,
  ) {
    setDraftAssignments((current) => {
      const base = current[key] ?? {
        technician: "",
        rigger: "",
        shipwright: "",
      };
      return {
        ...current,
        [key]: {
          ...base,
          [role]: value,
        },
      };
    });
  }

  function roleOptions(
    role: "technician" | "rigger" | "shipwright",
    fallbackLabel: string,
  ): string[] {
    const fromAssignments =
      role === "technician"
        ? editableAssignments.map((item) => item.technician)
        : role === "rigger"
          ? editableAssignments.map((item) => item.rigger)
          : editableAssignments.map((item) => item.shipwright);
    const fromRecommendations =
      role === "technician"
        ? input.workerRecommendations.technicians
        : role === "rigger"
          ? input.workerRecommendations.riggers
          : input.workerRecommendations.shipwrights;

    return uniqueWorkerOptions([...fromAssignments, ...fromRecommendations, fallbackLabel]);
  }

  function roleSuggestion(
    role: "technician" | "rigger" | "shipwright",
    currentLabel: string,
  ): string {
    const candidates =
      role === "technician"
        ? uniqueWorkerOptions(input.workerRecommendations.technicians)
        : role === "rigger"
          ? uniqueWorkerOptions(input.workerRecommendations.riggers)
          : uniqueWorkerOptions(input.workerRecommendations.shipwrights);
    if (candidates.length === 0) {
      return normalizeUnassignedLabel(currentLabel);
    }

    const usage = new Map<string, number>();
    for (const assignment of editableAssignments) {
      const label = normalizeWorkerOption(
        role === "technician"
          ? assignment.technician
          : role === "rigger"
            ? assignment.rigger
            : assignment.shipwright,
      );
      if (!label) {
        continue;
      }
      usage.set(label, (usage.get(label) ?? 0) + 1);
    }

    const normalizedCurrent = normalizeWorkerOption(currentLabel);
    let best = candidates[0];
    let bestLoad = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const normalized = normalizeWorkerOption(candidate);
      const load = usage.get(normalized) ?? 0;
      if (load < bestLoad) {
        best = candidate;
        bestLoad = load;
        continue;
      }
      if (load === bestLoad && normalized === normalizedCurrent) {
        best = candidate;
      }
    }
    return best;
  }

  function applyAssignmentOverride(
    assignment: DailyApprovalData["assignments"][number],
    index: number,
  ) {
    const key = getAssignmentKey(assignment.vessel, index);
    const draft = getDraftForAssignment(assignment, key);
    const payload = {
      vessel: assignment.vessel,
      technician: normalizeUnassignedLabel(draft.technician),
      rigger: normalizeUnassignedLabel(draft.rigger),
      shipwright: normalizeUnassignedLabel(draft.shipwright),
    };

    const saved = input.onApplyAssignmentOverride(payload);
    if (!saved) {
      setAssignmentMessage(`Could not save ${assignment.vessel}.`);
      return;
    }

    setEditableAssignments((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...payload } : row)),
    );
    setAssignmentMessage(`Saved ${assignment.vessel}.`);
  }

  return (
    <div className={styles.overlayRoot} role="dialog" aria-modal="true" aria-label="Daily scheduling approval">
      <button
        type="button"
        className={styles.overlayScrim}
        onClick={input.onClose}
        aria-label="Close scheduling approval"
      />
      <section className={styles.overlayPanel}>
        <header className={styles.overlayHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Scheduling Approval Required</h2>
            <p className={styles.sectionHint}>
              {input.dailyApproval.dateLabel}: {input.dailyApproval.demandBoats} vessels planned.
              Review assignments and approve workforce call-ins before execution.
            </p>
          </div>
          <button type="button" className={styles.overlayCloseButton} onClick={input.onClose}>
            Close
          </button>
        </header>

        <div className={styles.tabGroup}>
          <button
            type="button"
            className={tab === "summary" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
            onClick={() => setTab("summary")}
          >
            Summary
          </button>
          <button
            type="button"
            className={tab === "workforce" ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
            onClick={() => setTab("workforce")}
          >
            Workforce Suggestions
          </button>
        </div>

        {tab === "summary" ? (
          <div className={styles.stackList}>
            <article className={styles.miniRow}>
              <p className={styles.rowMain}>
                {editableAssignments.length} active vessel assignments ready for dispatch.
              </p>
              <p className={styles.rowMeta}>
                Click Workforce Suggestions to approve who should be called in where shortages exist.
              </p>
            </article>
            {assignmentMessage ? <p className={styles.rowMeta}>{assignmentMessage}</p> : null}
            {editableAssignments.slice(0, 12).map((item, index) => {
              const key = getAssignmentKey(item.vessel, index);
              const draft = getDraftForAssignment(item, key);
              const expanded = expandedAssignmentKey === key;
              const techSuggestion = roleSuggestion("technician", draft.technician);
              const riggerSuggestion = roleSuggestion("rigger", draft.rigger);
              const shipwrightSuggestion = roleSuggestion("shipwright", draft.shipwright);
              const technicianOptions = roleOptions("technician", draft.technician);
              const riggerOptions = roleOptions("rigger", draft.rigger);
              const shipwrightOptions = roleOptions("shipwright", draft.shipwright);

              return (
                <article key={`approval-assignment-${item.vessel}-${index}`} className={styles.stackListCompact}>
                  <div className={styles.miniRow}>
                    <div className={styles.teamMemberMain}>
                      <p className={styles.rowMain}>{item.vessel}</p>
                      <p className={styles.rowMeta}>
                        Tech: {draft.technician} | Rigger: {draft.rigger} | Shipwright: {draft.shipwright}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={() =>
                        setExpandedAssignmentKey((current) => (current === key ? null : key))
                      }
                    >
                      {expanded ? "Close" : "Edit"}
                    </button>
                  </div>

                  {expanded ? (
                    <div className={styles.teamInlineForm}>
                      <label className={styles.overlayField}>
                        <span>Technician</span>
                        <select
                          className={styles.overlayInput}
                          value={draft.technician}
                          onChange={(event) =>
                            updateDraftAssignment(key, "technician", event.target.value)
                          }
                        >
                          {technicianOptions.map((option) => (
                            <option key={`approval-tech-${item.vessel}-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.overlayField}>
                        <span>Rigger</span>
                        <select
                          className={styles.overlayInput}
                          value={draft.rigger}
                          onChange={(event) =>
                            updateDraftAssignment(key, "rigger", event.target.value)
                          }
                        >
                          {riggerOptions.map((option) => (
                            <option key={`approval-rigger-${item.vessel}-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.overlayField}>
                        <span>Shipwright</span>
                        <select
                          className={styles.overlayInput}
                          value={draft.shipwright}
                          onChange={(event) =>
                            updateDraftAssignment(key, "shipwright", event.target.value)
                          }
                        >
                          {shipwrightOptions.map((option) => (
                            <option key={`approval-shipwright-${item.vessel}-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={styles.overlayField}>
                        <span>Suggestions</span>
                        <div className={styles.teamDayPills}>
                          <button
                            type="button"
                            className={styles.dayPill}
                            onClick={() =>
                              updateDraftAssignment(key, "technician", techSuggestion)
                            }
                          >
                            Tech: {techSuggestion}
                          </button>
                          <button
                            type="button"
                            className={styles.dayPill}
                            onClick={() =>
                              updateDraftAssignment(key, "rigger", riggerSuggestion)
                            }
                          >
                            Rigger: {riggerSuggestion}
                          </button>
                          <button
                            type="button"
                            className={styles.dayPill}
                            onClick={() =>
                              updateDraftAssignment(key, "shipwright", shipwrightSuggestion)
                            }
                          >
                            Shipwright: {shipwrightSuggestion}
                          </button>
                        </div>
                      </div>
                      <div className={styles.overlayActions}>
                        <button
                          type="button"
                          className={styles.ghostButton}
                          onClick={() => {
                            updateDraftAssignment(key, "technician", techSuggestion);
                            updateDraftAssignment(key, "rigger", riggerSuggestion);
                            updateDraftAssignment(key, "shipwright", shipwrightSuggestion);
                          }}
                        >
                          Use Suggestions
                        </button>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => applyAssignmentOverride(item, index)}
                        >
                          Apply ✓
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.stackList}>
            {input.dailyApproval.shortages.length > 0 ? (
              input.dailyApproval.shortages.map((shortage) => (
                <article key={`approval-shortage-${shortage.roleKey}`} className={styles.miniRow}>
                  <p className={styles.rowMain}>
                    Need {shortage.neededWorkers} {shortage.roleLabel.toLowerCase()}
                    {shortage.neededWorkers === 1 ? "" : "s"} for today.
                  </p>
                  <p className={styles.rowMeta}>
                    Select who to call in. All team members are eligible, with off-duty members listed first.
                  </p>
                  <div className={styles.teamDayPills}>
                    {shortage.candidateWorkers.map((workerLabel) => {
                      const selected = (input.selections[shortage.roleKey] ?? []).includes(workerLabel);
                      return (
                        <button
                          key={`approval-worker-${shortage.roleKey}-${workerLabel}`}
                          type="button"
                          className={
                            selected
                              ? `${styles.dayPill} ${styles.dayPillActive}`
                              : styles.dayPill
                          }
                          onClick={() => toggleWorker(shortage.roleKey, workerLabel)}
                        >
                          {workerLabel}
                        </button>
                      );
                    })}
                  </div>
                  <p className={styles.rowMeta}>
                    Selected: {(input.selections[shortage.roleKey] ?? []).length} / {shortage.neededWorkers}
                  </p>
                </article>
              ))
            ) : (
              <article className={styles.miniRow}>
                <p className={styles.rowMain}>No shortages detected for today.</p>
                <p className={styles.rowMeta}>You can approve the plan as-is.</p>
              </article>
            )}
          </div>
        )}

        <div className={styles.overlayActions}>
          <button type="button" className={styles.ghostButton} onClick={input.onDecline} disabled={input.busy}>
            Decline And Edit Schedule
          </button>
          <button type="button" className={styles.primaryButton} onClick={input.onApprove} disabled={input.busy}>
            {input.busy ? "Saving Approval..." : "Approve Scheduling"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AddVesselDialog(input: {
  onClose: () => void;
  onCreated: () => void;
  workerRecommendations: {
    technicians: string[];
    riggers: string[];
    shipwrights: string[];
  };
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const form = new FormData(event.currentTarget);
      const boatName = String(form.get("boatName") ?? "").trim();
      const stat = String(form.get("stat") ?? "NOON").trim();
      const source = String(form.get("source") ?? "Carryover") as "Carryover" | "Today" | "Tomorrow";
      const dueDate = String(form.get("dueDate") ?? "").trim();
      const timeWindow = String(form.get("timeWindow") ?? "").trim();
      const priority = String(form.get("priority") ?? "Medium") as "Critical" | "High" | "Medium";
      const completionPct = Number(form.get("completionPct") ?? 0);
      const charterPriorityFlagRaw = String(form.get("charterPriorityFlag") ?? "");
      const charterPriorityFlag = charterPriorityFlagRaw === "O" || charterPriorityFlagRaw === "OB"
        ? charterPriorityFlagRaw
        : null;
      const charterer = String(form.get("charterer") ?? "").trim();
      const technicianLabelRaw = String(form.get("technicianLabel") ?? "").trim();
      const riggerLabelRaw = String(form.get("riggerLabel") ?? "").trim();
      const shipwrightLabelRaw = String(form.get("shipwrightLabel") ?? "").trim();
      const technicianLabel = technicianLabelRaw || input.workerRecommendations.technicians[0] || "";
      const riggerLabel = riggerLabelRaw || input.workerRecommendations.riggers[0] || "";
      const shipwrightLabel = shipwrightLabelRaw || input.workerRecommendations.shipwrights[0] || "";
      const rationale = String(form.get("rationale") ?? "").trim();

      if (!boatName) {
        throw new Error("Vessel name is required.");
      }
      if (!dueDate) {
        throw new Error("Due date is required.");
      }

      addManualVessel({
        boatName,
        stat,
        source,
        dueDate,
        timeWindow,
        priority,
        completionPct: Number.isFinite(completionPct) ? completionPct : 0,
        charterPriorityFlag,
        charterer,
        technicianLabel,
        riggerLabel,
        shipwrightLabel,
        rationale,
      });

      input.onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add vessel.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlayRoot} role="dialog" aria-modal="true" aria-label="Add vessel">
      <button type="button" className={styles.overlayScrim} onClick={input.onClose} aria-label="Close add vessel form" />
      <section className={styles.overlayPanel}>
        <header className={styles.overlayHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Add Vessel</h2>
            <p className={styles.sectionHint}>
              Add vessel details for planning, assignment, and quality views.
            </p>
          </div>
          <button type="button" className={styles.overlayCloseButton} onClick={input.onClose}>
            Close
          </button>
        </header>

        {error ? <p className={styles.overlayError}>{error}</p> : null}

        <form className={styles.overlayForm} onSubmit={onSubmit}>
          <label className={styles.overlayField}>
            <span>Vessel Name</span>
            <input name="boatName" className={styles.overlayInput} required />
          </label>

          <label className={styles.overlayField}>
            <span>Stat</span>
            <input name="stat" className={styles.overlayInput} placeholder="NOON / SA-ES" defaultValue="NOON" />
          </label>

          <label className={styles.overlayField}>
            <span>Source</span>
            <select name="source" className={styles.overlayInput} defaultValue="Carryover">
              <option value="Carryover">Carryover</option>
              <option value="Today">Today</option>
              <option value="Tomorrow">Tomorrow</option>
            </select>
          </label>

          <label className={styles.overlayField}>
            <span>Due Date</span>
            <input name="dueDate" type="date" className={styles.overlayInput} required />
          </label>

          <label className={styles.overlayField}>
            <span>Time Window</span>
            <input name="timeWindow" className={styles.overlayInput} placeholder="08:00 - 10:00" defaultValue="08:00 - 10:00" />
          </label>

          <label className={styles.overlayField}>
            <span>Priority</span>
            <select name="priority" className={styles.overlayInput} defaultValue="Medium">
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
            </select>
          </label>

          <label className={styles.overlayField}>
            <span>Completion %</span>
            <input name="completionPct" type="number" min={0} max={100} className={styles.overlayInput} defaultValue={0} />
          </label>

          <label className={styles.overlayField}>
            <span>Charter Priority</span>
            <select name="charterPriorityFlag" className={styles.overlayInput} defaultValue="">
              <option value="">None</option>
              <option value="O">Owner (O)</option>
              <option value="OB">Owner Berth (OB)</option>
            </select>
          </label>

          <label className={styles.overlayField}>
            <span>Charterer</span>
            <input name="charterer" className={styles.overlayInput} placeholder="Owner / Charter name" />
          </label>

          <label className={styles.overlayField}>
            <span>Assigned Technician</span>
            <input name="technicianLabel" className={styles.overlayInput} list="technician-suggestions" />
            <datalist id="technician-suggestions">
              {input.workerRecommendations.technicians.map((worker) => (
                <option key={`tech-${worker}`} value={worker} />
              ))}
            </datalist>
          </label>

          <label className={styles.overlayField}>
            <span>Assigned Rigger</span>
            <input name="riggerLabel" className={styles.overlayInput} list="rigger-suggestions" />
            <datalist id="rigger-suggestions">
              {input.workerRecommendations.riggers.map((worker) => (
                <option key={`rigger-${worker}`} value={worker} />
              ))}
            </datalist>
          </label>

          <label className={styles.overlayField}>
            <span>Assigned Shipwright</span>
            <input name="shipwrightLabel" className={styles.overlayInput} list="shipwright-suggestions" />
            <datalist id="shipwright-suggestions">
              {input.workerRecommendations.shipwrights.map((worker) => (
                <option key={`shipwright-${worker}`} value={worker} />
              ))}
            </datalist>
          </label>

          <label className={`${styles.overlayField} ${styles.overlayFieldWide}`}>
            <span>Rationale</span>
            <textarea name="rationale" className={styles.overlayTextarea} rows={3} />
          </label>

          <div className={styles.overlayActions}>
            <button type="button" className={styles.ghostButton} onClick={input.onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.primaryButton} disabled={saving}>
              {saving ? "Saving..." : "Save Vessel"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
