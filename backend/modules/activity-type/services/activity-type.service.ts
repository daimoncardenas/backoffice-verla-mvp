import "server-only";

import { assertPermission } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import mongoose, { Types, type HydratedDocument } from "mongoose";
import { connectToDatabase } from "../../../config/mongodb";
import { recordHistoryChange } from "../../history-change/services/history.service";
import { ActivityTypeModel, type ActivityType } from "../entities/activity-type.entity";
import {
  createActivityTypeRecord,
  listActiveActivityTypeRecords,
} from "../repository/activity-type.repository";

type ActivityTypeDocument = HydratedDocument<ActivityType>;

export async function listActiveActivityTypes(
  context: AuthContext,
): Promise<ActivityTypeDocument[]> {
  await assertPermission(context, "ACTIVITY_TYPE_LIST");

  return listActiveActivityTypeRecords(context.organization_id);
}

export class ActivityTypeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityTypeValidationError";
  }
}

export class ActivityTypeConflictError extends Error {
  constructor(message = "Activity type already exists") {
    super(message);
    this.name = "ActivityTypeConflictError";
  }
}

export interface CreateActivityTypeInput {
  code: string;
  name: string;
  description: string | null;
  requires_offer: boolean;
}

export async function createActivityType(
  context: AuthContext,
  input: CreateActivityTypeInput,
  requestId: string,
): Promise<ActivityTypeDocument> {
  await assertPermission(context, "ACTIVITY_TYPE_CREATE");

  if (context.account_type !== "ORGANIZATION") {
    throw new ActivityTypeValidationError(
      "Only the organization can create activity types",
    );
  }

  await connectToDatabase();
  const session = await mongoose.startSession();

  try {
    let createdId: Types.ObjectId | null = null;

    await session.withTransaction(async () => {
      try {
        const created = await createActivityTypeRecord(
          {
            organization_id: context.organization_id,
            code: input.code,
            name: input.name,
            description: input.description,
            requires_offer: input.requires_offer,
            is_active: true,
            created_by: context.account_id,
            updated_by: context.account_id,
            version: 0,
          },
          session,
        );

        createdId = created._id;

        await recordHistoryChange(
          session,
          {
            organization_id: context.organization_id,
            partner_id: null,
            actor_user_id: context.account_id,
            request_id: requestId,
          },
          {
            entity_name: "activity_type",
            record_id: created._id,
            action: "CREATE",
            previous_values: null,
            new_values: {
              code: created.code,
              name: created.name,
              description: created.description,
              requires_offer: created.requires_offer,
              is_active: created.is_active,
              version: created.version,
            },
          },
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          (error as { code?: unknown }).code === 11000
        ) {
          throw new ActivityTypeConflictError(
            "Ya existe un tipo de actividad con ese código.",
          );
        }
        throw error;
      }
    });

    if (!createdId) {
      throw new Error("Activity type was not created");
    }

    const created = await ActivityTypeModel.findById(createdId);

    if (!created) {
      throw new Error("Activity type was not created");
    }

    return created;
  } finally {
    await session.endSession();
  }
}
