import type { BootstrapDefinitions } from "./definitions";
import type { BootstrapPlan, ExistingState } from "./planner";

/**
 * Pure orchestration of a bootstrap run. The entry point injects the real
 * database reader/writer; tests inject spies, which is how the dry-run
 * guarantee (no apply/write call) is verified without MongoDB.
 */

export type BootstrapFlowStatus =
  | "conflict"
  | "dry-run"
  | "already-initialized"
  | "applied";

export interface BootstrapFlowDependencies {
  readExistingState: (
    definitions: BootstrapDefinitions,
  ) => Promise<ExistingState>;
  planBootstrap: (
    definitions: BootstrapDefinitions,
    existing: ExistingState,
  ) => BootstrapPlan;
  applyBootstrap: (
    definitions: BootstrapDefinitions,
    existing: ExistingState,
  ) => Promise<{ created: number; request_id: string }>;
  writePlan: (plan: BootstrapPlan, dryRun: boolean) => void;
  writeMessage: (message: string) => void;
}

export interface BootstrapFlowResult {
  status: BootstrapFlowStatus;
  created: number;
  request_id: string | null;
}

export async function runBootstrapFlow(
  definitions: BootstrapDefinitions,
  dryRun: boolean,
  dependencies: BootstrapFlowDependencies,
): Promise<BootstrapFlowResult> {
  const existing = await dependencies.readExistingState(definitions);
  const plan = dependencies.planBootstrap(definitions, existing);

  dependencies.writePlan(plan, dryRun);

  if (plan.conflicts.length > 0) {
    dependencies.writeMessage(
      "Bootstrap stopped: existing data conflicts with the documented initial configuration.",
    );
    return { status: "conflict", created: 0, request_id: null };
  }

  if (dryRun) {
    dependencies.writeMessage(
      "Dry-run complete: no writes, no collection or index creation.",
    );
    return { status: "dry-run", created: 0, request_id: null };
  }

  if (plan.create_count === 0) {
    dependencies.writeMessage(
      "Bootstrap complete: initial configuration already present.",
    );
    return { status: "already-initialized", created: 0, request_id: null };
  }

  const result = await dependencies.applyBootstrap(definitions, existing);

  return {
    status: "applied",
    created: result.created,
    request_id: result.request_id,
  };
}
