import styles from "./dashboard.module.css";

interface NavbarProps {
  title: string;
  subtitle: string;
  localeReady: string;
}

export function Navbar({ title, subtitle, localeReady }: NavbarProps) {
  return (
    <header className={styles.topNav}>
      <div className={styles.navInner}>
        <div className={styles.navLeft}>
          <div className={styles.logoMark} aria-hidden="true">
            <span className={styles.logoCore} />
          </div>
          <div className={styles.navTextGroup}>
            <p className={styles.navTitle}>{title}</p>
            <p className={styles.navSubtitle}>{subtitle}</p>
          </div>
        </div>

        <div className={styles.navRight}>
          <span className={styles.localeBadge}>{localeReady}</span>
          <div className={styles.avatar} aria-label="Profile placeholder">
            OP
          </div>
        </div>
      </div>
    </header>
  );
}
