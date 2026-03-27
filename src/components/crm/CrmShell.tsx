"use client";

import mooringsLogo from "@/assets/moorings-logo.png";
import sunsailLogo from "@/assets/sunsail-logo.png";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import styles from "./crm.module.css";

interface CrmShellProps {
  appName: string;
  reportDateLabel: string;
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "Overview", icon: "helm" as const },
  { href: "/schedule", label: "Schedule", icon: "sail" as const },
  { href: "/vessels", label: "Vessels", icon: "hull" as const },
  { href: "/riggers", label: "Riggers", icon: "rope" as const },
  { href: "/shipwrights", label: "Shipwrights", icon: "anchor" as const },
  { href: "/reports", label: "Reports", icon: "wave" as const },
];

export function CrmShell({ appName, reportDateLabel, children }: CrmShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = useMemo(
    () => (
      <ul className={styles.sidebarNavList}>
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={active ? `${styles.sidebarLink} ${styles.sidebarLinkActive}` : styles.sidebarLink}
                onClick={() => setMobileOpen(false)}
              >
                <span className={styles.sidebarIcon} aria-hidden="true">
                  <NavIcon icon={item.icon} />
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    ),
    [pathname],
  );

  return (
    <div className={styles.crmFrame}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.sidebarBrand}>
          <Image src={mooringsLogo} width={132} height={72} alt="Moorings" className={styles.brandLogo} priority />
          <div>
            <p className={styles.brandName}>{appName}</p>
            <p className={styles.brandMeta}>Ops date: {reportDateLabel}</p>
          </div>
        </Link>

        <div className={styles.sidebarPartner}>
          <Image src={sunsailLogo} width={36} height={36} alt="Sunsail" className={styles.partnerLogo} />
          <span>Fleet partner</span>
        </div>

        <nav aria-label="CRM navigation" className={styles.sidebarNav}>
          {navContent}
        </nav>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.mobileHeader}>
          <Link href="/" className={styles.mobileBrand}>
            <Image src={mooringsLogo} width={84} height={46} alt="Moorings" className={styles.mobileBrandLogo} priority />
            <div>
              <p className={styles.mobileBrandName}>{appName}</p>
              <p className={styles.mobileBrandMeta}>{reportDateLabel}</p>
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
          </nav>
        ) : null}

        <main className={styles.pageCanvas}>{children}</main>
      </div>
    </div>
  );
}

function NavIcon({ icon }: { icon: "helm" | "sail" | "hull" | "rope" | "anchor" | "wave" }) {
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
