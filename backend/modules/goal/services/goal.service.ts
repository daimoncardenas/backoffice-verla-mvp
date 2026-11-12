import "server-only";

import mongoose, {
  Types,
  type ClientSession,
  type HydratedDocument,
} from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { assertPermission } from "../../authorization/services/permission.service";
import {
  recordHistoryChange,
  type AuditContext,
} from "../../history-change/services/history.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { ActivityTypeModel, type ActivityType } from "../../activity-type/entities/activity-type.entity";
import { OfferModel } from "../../offer/entities/offer.entity";
import { GoalModel, type Goal } from "../entities/goal.entity";
import {
  createGoalRecord,
  findGoalRecord,
  listGoalRecords,
  softDeleteGoalRecord,
  updateGoalRecord,
} from "../repository/goal.repository";
import {
  GoalConflictError,
  GoalNotFoundError,
  GoalValidationError,
} from "./goal.errors";
import type { CreateGoalInput, UpdateGoalInput } from "../types/goal.types";

type GoalDocument = HydratedDocument<Goal>;
type ActivityTypeDocument = HydratedDocument<ActivityType>;

function buildAuditContext(
  context: AuthContext,
  requestId: string,
): AuditContext {
  return {
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    actor_user_id: context.account_id,
    request_id: requestId,
    reason: null,
  };
}

function normalizeDescription(
  description: string | null | undefined,
): string | null {
  if (description === undefined || description === null) {
    return null;
  }

  const trimmed = description.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function goalSnapshot(goal: GoalDocument): Record<string, unknown> {
  return {
    code: goal.code,
    name: goal.name,
    description: goal.description,
    activity_type_id: goal.activity_type_id.toString(),
    aggregation: goal.aggregation,
    required_activity_status: goal.required_activity_status,
    offer_id: goal.offer_id?.toString() ?? null,
    is_active: goal.is_active,
  };
}

function normalizeAuditValue(value: unknown): unknown {
  return value instanceof Types.ObjectId ? value.toString() : value;
}

function buildAuditDiff(
  current: GoalDocument,
  changes: Record<string, unknown>,
): {
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
} {
  const snapshot = goalSnapshot(current);
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of Object.keys(changes)) {
    previousValues[key] = snapshot[key];
    newValues[key] = normalizeAuditValue(changes[key]);
  }

  return { previous_values: previousValues, new_values: newValues };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function withTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  await connectToDatabase();
  const session = await mongoose.startSession();

  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function loadGoalActivityType(
  context: AuthContext,
  activityTypeId: Types.ObjectId,
  requireActive: boolean,
): Promise<ActivityTypeDocument> {
  const query: Record<string, unknown> = {
    _id: activityTypeId,
    organization_id: context.organization_id,
  };

  if (requireActive) {
    query.is_active = true;
  }

  const activityType = await ActivityTypeModel.findOne(query);

  if (!activityType) {
    throw new GoalValidationError(
      requireActive
        ? "Activity type not found or inactive"
        : "Activity type not found",
    );
  }

  return activityType;
}

export function canUseOfferFilter(activityType: {
  code: string;
}): boolean {
  return activityType.code === "SALE";
}

async function assertGoalOfferFilter(
  context: AuthContext,
  activityType: ActivityTypeDocument,
  offerId: Types.ObjectId | null,
): Promise<void> {
  if (!offerId) {
    return;
  }

  if (!canUseOfferFilter(activityType)) {
    throw new GoalValidationError(
      "offer_id is only allowed for SALE goals",
    );
  }

  const offer = await OfferModel.findOne({
    _id: offerId,
    organization_id: context.organization_id,
    deleted_at: null,
  });

  if (!offer) {
    throw new GoalValidationError("Offer not found");
  }
}

function assertExpectedVersion(
  currentVersion: number,
  expectedVersion: number,
): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new GoalValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  if (currentVersion !== expectedVersion) {
    throw new GoalConflictError("Version conflict");
  }
}

export async function listGoals(
  context: AuthContext,
): Promise<GoalDocument[]> {
  await assertPermission(context, "GOAL_LIST");

  return listGoalRecords(context.organization_id, context.partner_id);
}

export async function getGoal(
  context: AuthContext,
  goalId: Types.ObjectId,
): Promise<GoalDocument> {
  await assertPermission(context, "GOAL_READ");

  const goal = await findGoalRecord(
    goalId,
    context.organization_id,
    context.partner_id,
  );

  if (!goal) {
    throw new GoalNotFoundError();
  }

  return goal;
}

export async function createGoal(
  context: AuthContext,
  input: CreateGoalInput,
  requestId: string,
): Promise<GoalDocument> {
  await assertPermission(context, "GOAL_CREATE");

  const activityType = await loadGoalActivityType(
    context,
    input.activity_type_id,
    true,
  );

  await assertGoalOfferFilter(context, activityType, input.offer_id);

  const code = input.code.trim();
  const name = input.name.trim();
  const description = normalizeDescription(input.description);
  const auditContext = buildAuditContext(context, requestId);

  try {
    return await withTransaction(async (session) => {
      const goal = await createGoalRecord(
        {
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          code,
          name,
          description,
          activity_type_id: activityType._id,
          aggregation: "COUNT",
          required_activity_status: "COMPLETED",
          offer_id: input.offer_id,
          is_active: true,
          created_by: context.account_id,
          updated_by: context.account_id,
          version: 0,
        },
        session,
      );

      await recordHistoryChange(session, auditContext, {
        entity_name: "goal",
        record_id: goal._id,
        action: "CREATE",
        previous_values: null,
        new_values: goalSnapshot(goal),
      });

      return goal;
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new GoalConflictError("Goal code already exists");
    }
    throw error;
  }
}

export async function updateGoal(
  context: AuthContext,
  goalId: Types.ObjectId,
  input: UpdateGoalInput,
  requestId: string,
): Promise<GoalDocument> {
  await assertPermission(context, "GOAL_UPDATE");

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new GoalValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const current = await findGoalRecord(
    goalId,
    context.organization_id,
    context.partner_id,
  );

  if (!current) {
    throw new GoalNotFoundError();
  }

  assertExpectedVersion(current.version, input.expectedVersion);

  const activityTypeChanged =
    input.activity_type_id !== undefined &&
    !input.activity_type_id.equals(current.activity_type_id);
  const activityType = activityTypeChanged
    ? await loadGoalActivityType(context, input.activity_type_id!, true)
    : await loadGoalActivityType(
        context,
        current.activity_type_id,
        false,
      );

  const offerId =
    input.offer_id !== undefined ? input.offer_id : current.offer_id;

  await assertGoalOfferFilter(context, activityType, offerId);

  const changes: Record<string, unknown> = {};

  if (activityTypeChanged) {
    changes.activity_type_id = input.activity_type_id;
  }

  if (input.offer_id !== undefined) {
    const currentOfferId = current.offer_id?.toString() ?? null;
    const nextOfferId = input.offer_id?.toString() ?? null;

    if (currentOfferId !== nextOfferId) {
      changes.offer_id = input.offer_id;
    }
  }

  if (input.code !== undefined) {
    const code = input.code.trim();

    if (code !== current.code) {
      changes.code = code;
    }
  }

  if (input.name !== undefined) {
    const name = input.name.trim();

    if (name !== current.name) {
      changes.name = name;
    }
  }

  if (input.description !== undefined) {
    const description = normalizeDescription(input.description);

    if (description !== current.description) {
      changes.description = description;
    }
  }

  if (input.is_active !== undefined && input.is_active !== current.is_active) {
    changes.is_active = input.is_active;
  }

  if (Object.keys(changes).length === 0) {
    return current;
  }

  const auditDiff = buildAuditDiff(current, changes);
  const auditContext = buildAuditContext(context, requestId);

  try {
    return await withTransaction(async (session) => {
      const updated = await updateGoalRecord(
        {
          _id: goalId,
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          version: input.expectedVersion,
          deleted_at: null,
        },
        {
          ...changes,
          updated_by: context.account_id,
        },
        session,
      );

      if (!updated) {
        throw new GoalConflictError("Version conflict");
      }

      await recordHistoryChange(session, auditContext, {
        entity_name: "goal",
        record_id: updated._id,
        action: "UPDATE",
        previous_values: auditDiff.previous_values,
        new_values: auditDiff.new_values,
      });

      return updated;
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new GoalConflictError("Goal code already exists");
    }
    throw error;
  }
}

export async function deleteGoal(
  context: AuthContext,
  goalId: Types.ObjectId,
  expectedVersion: number,
  requestId: string,
): Promise<void> {
  await assertPermission(context, "GOAL_DELETE");

  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new GoalValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const current = await findGoalRecord(
    goalId,
    context.organization_id,
    context.partner_id,
  );

  if (!current) {
    throw new GoalNotFoundError();
  }

  assertExpectedVersion(current.version, expectedVersion);

  const auditContext = buildAuditContext(context, requestId);

  await withTransaction(async (session) => {
    const deleted = await softDeleteGoalRecord(
      {
        _id: goalId,
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        version: expectedVersion,
        deleted_at: null,
      },
      context.account_id,
      session,
    );

    if (!deleted) {
      throw new GoalConflictError("Version conflict");
    }

    await recordHistoryChange(session, auditContext, {
      entity_name: "goal",
      record_id: deleted._id,
      action: "DELETE",
      previous_values: goalSnapshot(current),
      new_values: null,
    });
  });
}

export async function goalExistsForAssignment(
  context: AuthContext,
  goalId: Types.ObjectId,
): Promise<GoalDocument | null> {
  await connectToDatabase();

  return GoalModel.findOne({
    _id: goalId,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    is_active: true,
    deleted_at: null,
  });
}
