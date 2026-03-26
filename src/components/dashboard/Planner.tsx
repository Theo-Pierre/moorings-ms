import type { DashboardDictionary } from "@/i18n/dictionaries";

import type { TechnicianPlan } from "./types";
import styles from "./dashboard.module.css";

interface PlannerProps {
  plans: TechnicianPlan[];
  dictionary: DashboardDictionary["planner"];
}

const statusClassMap = {
  scheduled: "badgeScheduled",
  pending: "badgePending",
  overdue: "badgeOverdue",
} as const;

export function Planner({ plans, dictionary }: PlannerProps) {
  return (
    <section className={styles.panelCard}>
      <header className={styles.panelHeader}>
        <h2 className={styles.sectionTitle}>{dictionary.title}</h2>
      </header>

      <div className={styles.plannerList}>
        {plans.map((plan) => (
          <article key={plan.id} className={styles.plannerRow}>
            <div className={styles.plannerRowDetails}>
              <p className={styles.rowEyebrow}>{dictionary.rowLabel}</p>
              <p className={styles.technicianName}>{plan.technicianName}</p>
              <p className={styles.assignedBoatText}>
                {dictionary.assignedBoatLabel}: {plan.assignedBoat}
              </p>
            </div>

            <span
              className={`${styles.statusBadge} ${styles[statusClassMap[plan.status]]}`}
            >
              {dictionary.status[plan.status]}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
