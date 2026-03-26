import type {
  FleetBoat,
  Insight,
  SummaryMetric,
  TechnicianPlan,
} from "@/components/dashboard/types";

// Centralized mock data for the initial UI.
// This is intentionally static and can be replaced later by CSV or API feeds.
export const summaryMetrics: SummaryMetric[] = [
  { id: "boatsDueToday", value: "14", iconLabel: "BT" },
  { id: "overdueBoats", value: "3", iconLabel: "OD" },
  { id: "availableTechnicians", value: "11", iconLabel: "AT" },
  { id: "spareCapacity", value: "26%", iconLabel: "SC" },
];

export const technicianPlans: TechnicianPlan[] = [
  {
    id: "tech-1",
    technicianName: "Mia Carter",
    assignedBoat: "Sea Whisper - Hull Inspection",
    status: "scheduled",
  },
  {
    id: "tech-2",
    technicianName: "Daniel Moyo",
    assignedBoat: "Blue Horizon - Engine Service",
    status: "pending",
  },
  {
    id: "tech-3",
    technicianName: "Alicia Singh",
    assignedBoat: "Ocean Pearl - Rigging Check",
    status: "scheduled",
  },
  {
    id: "tech-4",
    technicianName: "Thabo Ndlovu",
    assignedBoat: "Wind Dancer - Electrical Diagnostics",
    status: "overdue",
  },
  {
    id: "tech-5",
    technicianName: "Noah Bell",
    assignedBoat: "Coral Tide - Turnaround Prep",
    status: "pending",
  },
];

export const systemInsights: Insight[] = [
  { id: "insight-1", tone: "positive", messageKey: "techAvailableTomorrow" },
  { id: "insight-2", tone: "critical", messageKey: "oneBoatOverdue" },
  { id: "insight-3", tone: "warning", messageKey: "maintenanceWindowOpen" },
  { id: "insight-4", tone: "positive", messageKey: "criticalTasksCovered" },
  { id: "insight-5", tone: "neutral", messageKey: "partsArrivalUpdate" },
];

export const fleetBoats: FleetBoat[] = [
  { id: "boat-1", name: "Sea Whisper", type: "Cat", status: "available" },
  { id: "boat-2", name: "Blue Horizon", type: "Mono", status: "turnaround" },
  { id: "boat-3", name: "Ocean Pearl", type: "Cat", status: "available" },
  { id: "boat-4", name: "Wind Dancer", type: "Power", status: "overdue" },
  { id: "boat-5", name: "Coral Tide", type: "Mono", status: "turnaround" },
  { id: "boat-6", name: "Silver Current", type: "Power", status: "available" },
];
