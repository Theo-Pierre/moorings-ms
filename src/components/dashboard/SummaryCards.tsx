import type { SummaryMetric } from "./types";
import type { DashboardDictionary } from "@/i18n/dictionaries";

import styles from "./dashboard.module.css";

interface SummaryCardsProps {
  metrics: SummaryMetric[];
  dictionary: DashboardDictionary["summary"];
}

export function SummaryCards({ metrics, dictionary }: SummaryCardsProps) {
  return (
    <section className={styles.summaryGrid} aria-label="Summary metrics">
      {metrics.map((metric) => {
        const copy = dictionary.cards[metric.id];

        return (
          <article key={metric.id} className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
              <h2 className={styles.summaryTitle}>{copy.title}</h2>
              <span className={styles.iconPill} aria-hidden="true">
                {metric.iconLabel}
              </span>
            </div>
            <p className={styles.summaryValue}>{metric.value}</p>
            <p className={styles.summaryDescription}>{copy.description}</p>
          </article>
        );
      })}
    </section>
  );
}
