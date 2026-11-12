import type { DeclaredIndex, ActualIndex } from "./indexes/plan";
import { buildProvisionPlan } from "./indexes/plan";

/**
 * Explicit index provisioning for principal/.
 *
 * Default is dry-run. `--apply` creates only missing collections and indexes.
 * Existing indexes are never dropped or recreated; an index with the same key
 * but different options stops the run before any write.
 *
 * Index provisioning is not atomic. A failure partway through leaves the
 * collections and indexes created up to that point in place. Re-running the
 * command is safe and reports only what remains missing.
 *
 * Run:
 *   NODE_OPTIONS="--conditions=react-server" \
 *     npx --yes tsx --env-file=.env scripts/provision-indexes.ts
 *   NODE_OPTIONS="--conditions=react-server" \
 *     npx --yes tsx --env-file=.env scripts/provision-indexes.ts --apply
 */

function displayIndex(index: DeclaredIndex | ActualIndex) {
  return {
    key: Object.fromEntries(index.key),
    unique: index.unique,
    partial: index.partial,
    ttl: index.ttl,
    name: index.name,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "apply" : "dry-run";

  const mongoose = (await import("mongoose")).default;

  // Must be set before models and the connection are initialized.
  mongoose.set("autoIndex", false);
  mongoose.set("autoCreate", false);

  const { connectToDatabase } = await import("../backend/config/mongodb");
  const {
    applyProvisionPlan,
    checkPlannedDuplicates,
    IndexProvisioningError,
    loadDeclaredIndexes,
    readActualIndexes,
    readExistingCollections,
  } = await import("./indexes/runtime");

  const declarations = await loadDeclaredIndexes();

  await connectToDatabase();

  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("MongoDB connection has no database handle");
  }

  try {
    const existingCollections = await readExistingCollections(db);
    const entries: Array<{
      collection: string;
      declared: DeclaredIndex[];
      actual: ActualIndex[] | null;
    }> = [];

    for (const [collection, declared] of declarations) {
      entries.push({
        collection,
        declared,
        actual: await readActualIndexes(db, collection, existingCollections),
      });
    }

    const plan = buildProvisionPlan(entries);
    const duplicates = await checkPlannedDuplicates(db, plan);
    const duplicateConflicts = duplicates.filter(
      (entry) => entry.duplicate_groups > 0,
    );

    console.log(
      JSON.stringify(
        {
          mode,
          non_atomic:
            "Index provisioning is not a transaction; a failure may leave earlier collections or indexes created.",
          summary: {
            collections_missing: plan.create_collection_count,
            indexes_to_create: plan.create_index_count,
            indexes_present: plan.present_count,
            incompatible: plan.incompatible_count,
            extra_preserved: plan.extra_count,
            duplicate_conflicts: duplicateConflicts.length,
          },
          collections: plan.collections.map((entry) => ({
            collection: entry.collection,
            status: entry.status,
            collection_exists: entry.collection_exists,
            create_collection: entry.create_collection,
            create_indexes: entry.create_indexes.map(displayIndex),
            present: entry.present.length,
            incompatible: entry.incompatible.map((conflict) => ({
              declared: displayIndex(conflict.declared),
              actual: displayIndex(conflict.actual),
              differences: conflict.differences,
            })),
            extra: entry.extra.map(displayIndex),
          })),
          duplicates: duplicates.map((entry) => ({
            collection: entry.collection,
            key: Object.fromEntries(entry.index.key),
            unique: entry.index.unique,
            partial: entry.index.partial,
            duplicate_groups: entry.duplicate_groups,
            samples: entry.samples,
          })),
        },
        null,
        2,
      ),
    );

    if (plan.blocked || duplicateConflicts.length > 0) {
      console.error(
        "Provisioning stopped: incompatible indexes or duplicate values must be resolved before any write.",
      );
      process.exitCode = 1;
      return;
    }

    if (!apply) {
      console.error(
        "Dry-run complete: no collections or indexes were created.",
      );
      return;
    }

    if (plan.create_collection_count === 0 && plan.create_index_count === 0) {
      console.error("Provisioning complete: no changes required.");
      return;
    }

    const applied = await applyProvisionPlan(db, plan);

    console.log(
      JSON.stringify(
        {
          applied: true,
          collections_created: applied.collections,
          indexes_created: applied.indexes,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error instanceof IndexProvisioningError) {
      console.error(
        JSON.stringify(
          {
            error: "provisioning_failed",
            message: error.message,
            created_before_failure: error.applied,
            non_atomic:
              "Earlier collections or indexes may remain created. Re-run the dry-run to inspect the current state.",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
