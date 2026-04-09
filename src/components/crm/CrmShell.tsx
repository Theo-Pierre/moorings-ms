"use client";

import mooringsLogo from "@/assets/moorings-logo.png";
import sunsailLogo from "@/assets/sunsail-logo.png";
import { logoutAction } from "@/app/auth/actions";
import type { AuthSession } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { addManualVessel } from "./manual-vessels";
import styles from "./crm.module.css";

interface CrmShellProps {
  appName: string;
  reportDateLabel: string;
  session: AuthSession;
  workerRecommendations: {
    technicians: string[];
    riggers: string[];
    shipwrights: string[];
  };
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

export function CrmShell({ appName, reportDateLabel, session, workerRecommendations, children }: CrmShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [addVesselOpen, setAddVesselOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getStoredSidebarPreference);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("moorings-ms:sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const refresh = () => router.refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

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
            </p>
          </div>

          <div className={styles.desktopActions}>
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
