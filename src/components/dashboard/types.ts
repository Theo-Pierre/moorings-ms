export type SummaryMetricId =
  | "boatsDueToday"
  | "overdueBoats"
  | "availableTechnicians"
  | "spareCapacity";

export type PlannerStatus = "scheduled" | "pending" | "overdue";

export type BoatType = "Cat" | "Mono" | "Power";

export type FleetStatus = "available" | "turnaround" | "overdue";

export type InsightTone = "neutral" | "positive" | "warning" | "critical";

export interface SummaryMetric {
  id: SummaryMetricId;
  value: string;
  iconLabel: string;
}

export interface TechnicianPlan {
  id: string;
  technicianName: string;
  assignedBoat: string;
  status: PlannerStatus;
}

export interface Insight {
  id: string;
  tone: InsightTone;
  messageKey: string;
}

export interface FleetBoat {
  id: string;
  name: string;
  type: BoatType;
  status: FleetStatus;
}
