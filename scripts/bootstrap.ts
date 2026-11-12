import {
  BootstrapConfigError,
  OPTIONAL_ENVIRONMENT,
  REQUIRED_ENVIRONMENT,
  loadDefinitions,
} from "./bootstrap/definitions";
import type { BootstrapDefinitions } from "./bootstrap/definitions";
import { runBootstrapFlow } from "./bootstrap/flow";
import type { BootstrapPlan } from "./bootstrap/planner";

/**
 * Explicit initial-configuration bootstrap for principal/.
 *
 * This file is never imported by the application. Run it manually with:
 *
 *   NODE_OPTIONS="--conditions=react-server" \
 *     npx --yes tsx --env-file=.env scripts/bootstrap.ts --dry-run
 *
 * Remove --dry-run to apply. Dry-run reads only: it performs no writes and
 * creates no collections or indexes (autoCreate and autoIndex are disabled
 * before any model or connection is initialized). Initial identity lives in
 * scripts/bootstrap/seed.ts; only the two initial passwords come from the
 * environment and are required for the apply run, not for --dry-run.
 */

function printPlan(plan: BootstrapPlan, dryRun: boolean): void {
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        create_count: plan.create_count,
        skip_count: plan.skip_count,
        conflict_count: plan.conflicts.length,
        sections: plan.sections.map((section) => ({
          entity: section.entity,
          create: section.create,
          skip: section.skip,
          conflict: section.conflict,
        })),
        conflicts: plan.conflicts,
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  let definitions: BootstrapDefinitions;

  try {
    definitions = loadDefinitions(process.env, {
      require_passwords: !dryRun,
    });
  } catch (error) {
    if (error instanceof BootstrapConfigError) {
      console.error(
        JSON.stringify(
          {
            error: "configuration",
            message: error.message,
            missing: error.missing,
            required_variables: REQUIRED_ENVIRONMENT,
            optional_variables: OPTIONAL_ENVIRONMENT,
            seed_config: "scripts/bootstrap/seed.ts",
          },
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    throw error;
  }

  const mongoose = (await import("mongoose")).default;

  // Must be set before models and the connection are initialized.
  mongoose.set("autoIndex", false);
  mongoose.set("autoCreate", false);

  const [{ connectToDatabase }, { readExistingState, applyBootstrap }, { planBootstrap }] =
    await Promise.all([
      import("../backend/config/mongodb"),
      import("./bootstrap/runner"),
      import("./bootstrap/planner"),
    ]);

  await connectToDatabase();

  try {
    const result = await runBootstrapFlow(definitions, dryRun, {
      readExistingState,
      planBootstrap,
      applyBootstrap,
      writePlan: printPlan,
      writeMessage: (message) => console.error(message),
    });

    if (result.status === "conflict") {
      process.exitCode = 1;
      return;
    }

    if (result.status === "applied") {
      console.log(
        JSON.stringify(
          {
            applied: true,
            created: result.created,
            request_id: result.request_id,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
