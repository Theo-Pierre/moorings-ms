import type { DashboardDictionary } from "@/i18n/dictionaries";

import type { Insight } from "./types";
import styles from "./dashboard.module.css";

interface InsightsProps {
  insights: Insight[];
  dictionary: DashboardDictionary["insights"];
}

const toneClassMap = {
  neutral: "toneNeutral",
  positive: "tonePositive",
  warning: "toneWarning",
  critical: "toneCritical",
} as const;

export function Insights({ insights, dictionary }: InsightsProps) {
  return (
    <section className={styles.panelCard}>
      <header className={styles.panelHeader}>
        <h2 className={styles.sectionTitle}>{dictionary.title}</h2>
      </header>

      <div className={styles.insightList}>
        {insights.map((item) => (
          <article
            key={item.id}
            className={`${styles.insightCard} ${styles[toneClassMap[item.tone]]}`}
          >
            <p className={styles.insightMessage}>
              {dictionary.messages[item.messageKey] ?? item.messageKey}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
