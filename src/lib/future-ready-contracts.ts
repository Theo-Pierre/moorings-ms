export type UserRole = "admin" | "super_admin";

export interface AuthUserContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}

export interface CsvImportRecord {
  source: "sailsense-export" | "manual-upload";
  receivedAtIso: string;
  fileName: string;
}

export interface BackendClientConfig {
  baseUrl: string;
  requestTimeoutMs: number;
}

export interface PlanningWorkflowRequest {
  tenantId: string;
  planningDateIso: string;
  trigger: "daily-feedback" | "manual-run";
}

// These contracts are placeholders for future implementation:
// - Supabase authentication and role-based access
// - CSV/API ingestion pipelines
// - NestJS backend API client layer
// - Temporal planning workflow calls
