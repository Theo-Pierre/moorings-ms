import type { DashboardDictionary } from "@/i18n/dictionaries";

import type { FleetBoat } from "./types";
import styles from "./dashboard.module.css";

interface FleetTableProps {
  boats: FleetBoat[];
  dictionary: DashboardDictionary["fleet"];
}

const fleetStatusClassMap = {
  available: "badgeAvailable",
  turnaround: "badgeTurnaround",
  overdue: "badgeOverdue",
} as const;

export function FleetTable({ boats, dictionary }: FleetTableProps) {
  return (
    <section className={styles.panelCard}>
      <header className={styles.panelHeader}>
        <h2 className={styles.sectionTitle}>{dictionary.title}</h2>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.fleetTable}>
          <thead>
            <tr>
              <th>{dictionary.columns.boatName}</th>
              <th>{dictionary.columns.type}</th>
              <th>{dictionary.columns.status}</th>
            </tr>
          </thead>
          <tbody>
            {boats.map((boat) => (
              <tr key={boat.id}>
                <td>{boat.name}</td>
                <td>{boat.type}</td>
                <td>
                  <span
                    className={`${styles.statusBadge} ${styles[fleetStatusClassMap[boat.status]]}`}
                  >
                    {dictionary.status[boat.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
