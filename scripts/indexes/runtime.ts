import type { Db, IndexDescription } from "mongodb";
import type { Model } from "mongoose";

import type { ActualIndex, DeclaredIndex, ProvisionPlan } from "./plan";
import { keyPairs } from "./plan";
import { findDuplicateGroups, type DuplicateResult } from "./duplicates";

const MODEL_MODULES: Array<{
  collection: string;
  path: string;
  exportName: string;
}> = [
  {
    collection: "organization",
    path: "../../backend/modules/organization/entities/organization.entity",
    exportName: "OrganizationModel",
  },
  {
    collection: "permission",
    path: "../../backend/modules/permission/entities/permission.entity",
    exportName: "PermissionModel",
  },
  {
    collection: "city",
    path: "../../backend/modules/city/entities/city.entity",
    exportName: "CityModel",
  },
  {
    collection: "activity_type",
    path: "../../backend/modules/activity-type/entities/activity-type.entity",
    exportName: "ActivityTypeModel",
  },
  {
    collection: "partner",
    path: "../../backend/modules/partner/entities/partner.entity",
    exportName: "PartnerModel",
  },
  {
    collection: "employee_type",
    path: "../../backend/modules/employee-type/entities/employee-type.entity",
    exportName: "EmployeeTypeModel",
  },
  {
    collection: "employee",
    path: "../../backend/modules/employee/entities/employee.entity",
    exportName: "EmployeeModel",
  },
  {
    collection: "employee_assignment",
    path: "../../backend/modules/employee-assignment/entities/employee-assignment.entity",
    exportName: "EmployeeAssignmentModel",
  },
  {
    collection: "activity",
    path: "../../backend/modules/activity/entities/activity.entity",
    exportName: "ActivityModel",
  },
  {
    collection: "goal",
    path: "../../backend/modules/goal/entities/goal.entity",
    exportName: "GoalModel",
  },
  {
    collection: "employee_goal",
    path: "../../backend/modules/employee-goal/entities/employee-goal.entity",
    exportName: "EmployeeGoalModel",
  },
  {
    collection: "offer",
    path: "../../backend/modules/offer/entities/offer.entity",
    exportName: "OfferModel",
  },
  {
    collection: "user_account",
    path: "../../backend/modules/user-account/entities/user-account.entity",
    exportName: "UserAccountModel",
  },
  {
    collection: "history_changes",
    path: "../../backend/modules/history-change/entities/history-change.entity",
    exportName: "HistoryChangeModel",
  },
  {
    collection: "ai_search_settings",
    path: "../../backend/modules/ai-search-settings/entities/ai-search-settings.entity",
    exportName: "AiSearchSettingsModel",
  },
  {
    collection: "ai_run",
    path: "../../backend/modules/ai-run/entities/ai-run.entity",
    exportName: "AiRunModel",
  },
  {
    collection: "offer_chat_message",
    path: "../../backend/modules/offer-chat-message/entities/offer-chat-message.entity",
    exportName: "OfferChatMessageModel",
  },
];

export async function loadDeclaredIndexes(): Promise<
  Map<string, DeclaredIndex[]>
> {
  const declarations = new Map<string, DeclaredIndex[]>();

  for (const entry of MODEL_MODULES) {
    const module = (await import(entry.path)) as Record<string, unknown>;
    const model = module[entry.exportName] as Model<unknown> | undefined;

    if (!model) {
      throw new Error(`Model export not found: ${entry.exportName}`);
    }

    declarations.set(
      entry.collection,
      model.schema.indexes().map(([key, options]) => ({
        key: keyPairs(key),
        unique: options.unique === true,
        partial:
          (options.partialFilterExpression as
            | Record<string, unknown>
            | undefined) ?? null,
        ttl:
          typeof options.expireAfterSeconds === "number"
            ? options.expireAfterSeconds
            : null,
        name: typeof options.name === "string" ? options.name : null,
      })),
    );
  }

  return declarations;
}

export async function readExistingCollections(
  db: Db,
): Promise<Set<string>> {
  const collections = await db
    .listCollections({}, { nameOnly: true })
    .toArray();

  return new Set(collections.map((collection) => collection.name));
}

export async function readActualIndexes(
  db: Db,
  collection: string,
  existingCollections: ReadonlySet<string>,
): Promise<ActualIndex[] | null> {
  if (!existingCollections.has(collection)) {
    return null;
  }

  const indexes = await db.collection(collection).indexes();

  return indexes
    .filter((index) => index.name !== "_id_")
    .map((index: IndexDescription) => ({
      key: keyPairs(index.key as Record<string, unknown>),
      unique: index.unique === true,
      partial:
        (index.partialFilterExpression as
          | Record<string, unknown>
          | undefined) ?? null,
      ttl:
        typeof index.expireAfterSeconds === "number"
          ? index.expireAfterSeconds
          : null,
      name: index.name ?? "<unnamed>",
    }));
}

export async function checkPlannedDuplicates(
  db: Db,
  plan: ProvisionPlan,
): Promise<DuplicateResult[]> {
  const results: DuplicateResult[] = [];

  for (const collectionPlan of plan.collections) {
    if (!collectionPlan.collection_exists) {
      continue;
    }

    for (const index of collectionPlan.create_indexes) {
      if (!index.unique) {
        continue;
      }

      results.push(
        await findDuplicateGroups(
          collectionPlan.collection,
          db.collection(collectionPlan.collection),
          index,
        ),
      );
    }
  }

  return results;
}

export interface AppliedChanges {
  collections: string[];
  indexes: Array<{ collection: string; name: string }>;
}

export class IndexProvisioningError extends Error {
  constructor(
    readonly original_error: unknown,
    readonly applied: AppliedChanges,
  ) {
    super(
      original_error instanceof Error
        ? original_error.message
        : String(original_error),
    );
    this.name = "IndexProvisioningError";
  }
}

/**
 * Index provisioning is not a transaction. A failure partway through leaves the
 * collections and indexes created up to that point in place. Re-running is safe:
 * the planner only reports what is still missing.
 */
export async function applyProvisionPlan(
  db: Db,
  plan: ProvisionPlan,
): Promise<AppliedChanges> {
  const applied: AppliedChanges = { collections: [], indexes: [] };

  try {
    for (const collectionPlan of plan.collections) {
      if (collectionPlan.create_collection) {
        await db.createCollection(collectionPlan.collection);
        applied.collections.push(collectionPlan.collection);
      }

      const collection = db.collection(collectionPlan.collection);

      for (const index of collectionPlan.create_indexes) {
        const options: Record<string, unknown> = {};

        if (index.unique) {
          options.unique = true;
        }
        if (index.partial) {
          options.partialFilterExpression = index.partial;
        }
        if (index.ttl !== null) {
          options.expireAfterSeconds = index.ttl;
        }

        const name = await collection.createIndex(
          Object.fromEntries(index.key),
          options,
        );
        applied.indexes.push({ collection: collectionPlan.collection, name });
      }
    }
  } catch (error) {
    throw new IndexProvisioningError(error, applied);
  }

  return applied;
}
