import "server-only";

import { createHash } from "node:crypto";

import mongoose, {
  Types,
  type ClientSession,
  type HydratedDocument,
} from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { assertPermission } from "../../authorization/services/permission.service";
import { canAccessEmployee } from "../../authorization/services/scope.service";
import {
  recordHistoryChange,
  type AuditContext,
} from "../../history-change/services/history.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { CityModel } from "../../city/entities/city.entity";
import { EmployeeModel, type Employee } from "../../employee/entities/employee.entity";
import {
  ActivityTypeModel,
  type ActivityType,
} from "../../activity-type/entities/activity-type.entity";
import {
  type Activity,
  type OfferSnapshot,
} from "../entities/activity.entity";
import {
  createActivityRecord,
  findActivityByIdempotencyKey,
  findActivityRecord,
  findAssignmentForInstant,
  findOfferForActivity,
  listActivityRecords,
  updateActivityRecord,
} from "../repository/activity.repository";
import {
  ActivityAccessError,
  ActivityConflictError,
  ActivityNotFoundError,
  ActivityValidationError,
} from "./activity.errors";
import type {
  CancelActivityInput,
  CreateActivityInput,
  UpdateActivityInput,
} from "../types/activity.types";

type ActivityDocument = HydratedDocument<Activity>;
type EmployeeDocument = HydratedDocument<Employee>;
type ActivityTypeDocument = HydratedDocument<ActivityType>;

const IMMUTABLE_ACTIVITY_FIELDS = [
  "organization_id",
  "partner_id",
  "employee_id",
  "activity_type_id",
  "assignment_id",
  "offer_snapshot",
  "status",
  "idempotency_key",
  "creation_request_hash",
  "cancelled_at",
  "cancelled_by",
  "cancellation_reason",
] as const;

function buildAuditContext(
  context: AuthContext,
  requestId: string,
  reason: string | null = null,
): AuditContext {
  return {
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    actor_user_id: context.account_id,
    request_id: requestId,
    reason,
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

function normalizeOfferSnapshot(
  offer: {
    title: string;
    starts_at: Date | null;
    ends_at: Date | null;
  },
): OfferSnapshot {
  if (!offer.starts_at || !offer.ends_at) {
    throw new ActivityValidationError(
      "Offer must have starts_at and ends_at",
    );
  }

  return {
    title: offer.title,
    starts_at: offer.starts_at,
    ends_at: offer.ends_at,
  };
}

function activitySnapshot(
  activity: ActivityDocument,
): Record<string, unknown> {
  return {
    employee_id: activity.employee_id.toString(),
    activity_type_id: activity.activity_type_id.toString(),
    assignment_id: activity.assignment_id.toString(),
    city_id: activity.city_id.toString(),
    offer_id: activity.offer_id?.toString() ?? null,
    offer_snapshot: activity.offer_snapshot
      ? {
          title: activity.offer_snapshot.title,
          starts_at: activity.offer_snapshot.starts_at,
          ends_at: activity.offer_snapshot.ends_at,
        }
      : null,
    title: activity.title,
    description: activity.description,
    performed_at: activity.performed_at,
    status: activity.status,
    cancelled_at: activity.cancelled_at,
    cancelled_by: activity.cancelled_by?.toString() ?? null,
    cancellation_reason: activity.cancellation_reason,
  };
}

function normalizeAuditValue(value: unknown): unknown {
  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeAuditValue(item));
  }

  if (
    value !== null &&
    typeof value === "object" &&
    "title" in value &&
    "starts_at" in value &&
    "ends_at" in value
  ) {
    const snapshot = value as OfferSnapshot;
    return {
      title: snapshot.title,
      starts_at: snapshot.starts_at,
      ends_at: snapshot.ends_at,
    };
  }

  return value;
}

function buildActivityAuditDiff(
  current: ActivityDocument,
  changes: Record<string, unknown>,
): {
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
} {
  const snapshot = activitySnapshot(current);
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of Object.keys(changes)) {
    previousValues[key] = snapshot[key];
    newValues[key] = normalizeAuditValue(changes[key]);
  }

  return { previous_values: previousValues, new_values: newValues };
}

function sameInstant(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime();
}

function sameOfferSnapshot(
  left: OfferSnapshot | null,
  right: OfferSnapshot | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.title === right.title &&
    sameInstant(left.starts_at, right.starts_at) &&
    sameInstant(left.ends_at, right.ends_at)
  );
}

export function computeCreationRequestHash(input: {
  employee_id: Types.ObjectId;
  activity_type_id: Types.ObjectId;
  city_id: Types.ObjectId;
  offer_id: Types.ObjectId | null;
  title: string;
  description: string | null;
  performed_at: Date;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        employee_id: input.employee_id.toString(),
        activity_type_id: input.activity_type_id.toString(),
        city_id: input.city_id.toString(),
        offer_id: input.offer_id?.toString() ?? null,
        title: input.title,
        description: input.description,
        performed_at: input.performed_at.toISOString(),
      }),
    )
    .digest("hex");
}

export function activityRequiresOffer(activityType: {
  code: string;
  requires_offer: boolean;
}): boolean {
  return activityType.code === "SALE" || activityType.requires_offer;
}

export function isEmployeeEligibleForNewActivity(employee: {
  status: string;
  deleted_at: Date | null;
}): boolean {
  return employee.deleted_at === null && employee.status === "ACTIVE";
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

export function buildActivityHistoryEmployeeFilter(
  context: AuthContext,
  employeeId: Types.ObjectId,
): Record<string, unknown> {
  return {
    _id: employeeId,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
  };
}

async function findEmployee(
  context: AuthContext,
  employeeId: Types.ObjectId,
): Promise<EmployeeDocument | null> {
  return EmployeeModel.findOne(
    buildActivityHistoryEmployeeFilter(context, employeeId),
  );
}

async function findEmployeeById(
  context: AuthContext,
  employeeId: Types.ObjectId,
): Promise<EmployeeDocument> {
  const employee = await findEmployee(context, employeeId);

  if (!employee) {
    throw new ActivityValidationError("Employee not found");
  }

  return employee;
}

async function loadAccessibleEmployeeIds(
  context: AuthContext,
): Promise<Types.ObjectId[] | null> {
  if (context.account_type === "PARTNER") {
    return null;
  }

  if (!context.employee_id) {
    return [];
  }

  const employees = await EmployeeModel.find({
    organization_id: context.organization_id,
    partner_id: context.partner_id,
    $or: [
      { _id: context.employee_id },
      { supervisor_id: context.employee_id },
    ],
  })
    .select("_id")
    .lean();

  return employees.map((employee) => employee._id);
}

async function loadScopedActivity(
  context: AuthContext,
  activityId: Types.ObjectId,
): Promise<{ activity: ActivityDocument; employee: EmployeeDocument }> {
  const activity = await findActivityRecord({
    _id: activityId,
    organization_id: context.organization_id,
    partner_id: context.partner_id,
  });

  if (!activity) {
    throw new ActivityNotFoundError();
  }

  const employee = await findEmployee(context, activity.employee_id);

  if (!employee || !canAccessEmployee(context, employee)) {
    throw new ActivityNotFoundError();
  }

  return { activity, employee };
}

async function loadActiveActivityType(
  context: AuthContext,
  activityTypeId: Types.ObjectId,
): Promise<ActivityTypeDocument> {
  const activityType = await ActivityTypeModel.findOne({
    _id: activityTypeId,
    organization_id: context.organization_id,
    is_active: true,
  });

  if (!activityType) {
    throw new ActivityValidationError(
      "Activity type not found or inactive",
    );
  }

  return activityType;
}

async function loadActivityType(
  context: AuthContext,
  activityTypeId: Types.ObjectId,
): Promise<ActivityTypeDocument> {
  const activityType = await ActivityTypeModel.findOne({
    _id: activityTypeId,
    organization_id: context.organization_id,
  });

  if (!activityType) {
    throw new ActivityValidationError("Activity type not found");
  }

  return activityType;
}

async function assertEmployeeCity(
  context: AuthContext,
  employee: EmployeeDocument,
  cityId: Types.ObjectId,
): Promise<void> {
  const city = await CityModel.findOne({
    _id: cityId,
    organization_id: context.organization_id,
    is_active: true,
    deleted_at: null,
  });

  if (!city) {
    throw new ActivityValidationError("City not found or inactive");
  }

  if (!employee.city_ids.some((id) => id.equals(cityId))) {
    throw new ActivityValidationError(
      "City is not assigned to the employee",
    );
  }
}

async function resolveAssignment(
  context: AuthContext,
  employeeId: Types.ObjectId,
  performedAt: Date,
  session?: ClientSession,
) {
  const assignment = await findAssignmentForInstant(
    employeeId,
    context.organization_id,
    context.partner_id,
    performedAt,
    session,
  );

  if (!assignment) {
    throw new ActivityValidationError(
      "No assignment covers performed_at",
    );
  }

  return assignment;
}

async function resolveOfferSnapshot(
  context: AuthContext,
  activityType: ActivityTypeDocument,
  performedAt: Date,
  offerId: Types.ObjectId | null,
  session?: ClientSession,
): Promise<OfferSnapshot | null> {
  if (!activityRequiresOffer(activityType)) {
    if (offerId) {
      throw new ActivityValidationError(
        "offer_id is only allowed for activity types that require an offer",
      );
    }

    return null;
  }

  if (!offerId) {
    throw new ActivityValidationError(
      "offer_id is required for this activity type",
    );
  }

  const offer = await findOfferForActivity(
    context.organization_id,
    offerId,
    performedAt,
    session,
  );

  if (!offer) {
    throw new ActivityValidationError(
      "Offer is not published and valid at performed_at",
    );
  }

  return normalizeOfferSnapshot(offer);
}

export function assertIdempotencyMatch(
  existing: ActivityDocument,
  requestHash: string,
): void {
  if (existing.creation_request_hash !== requestHash) {
    throw new ActivityConflictError(
      "Idempotency key was already used with another payload",
    );
  }
}

export function assertExpectedVersion(
  currentVersion: number,
  expectedVersion: number,
): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new ActivityValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  if (currentVersion !== expectedVersion) {
    throw new ActivityConflictError("Version conflict");
  }
}

export function buildCancellationChanges(
  actorId: Types.ObjectId,
  reason: string,
  cancelledAt: Date,
): Record<string, unknown> {
  return {
    status: "CANCELLED",
    cancelled_at: cancelledAt,
    cancelled_by: actorId,
    cancellation_reason: reason,
    updated_by: actorId,
  };
}

export async function listActivities(
  context: AuthContext,
): Promise<ActivityDocument[]> {
  await assertPermission(context, "ACTIVITY_LIST");

  const filter: Record<string, unknown> = {
    organization_id: context.organization_id,
    partner_id: context.partner_id,
  };
  const employeeIds = await loadAccessibleEmployeeIds(context);

  if (employeeIds !== null) {
    filter.employee_id = { $in: employeeIds };
  }

  return listActivityRecords(filter);
}

export async function getActivity(
  context: AuthContext,
  activityId: Types.ObjectId,
): Promise<ActivityDocument> {
  await assertPermission(context, "ACTIVITY_READ");

  const { activity } = await loadScopedActivity(context, activityId);
  return activity;
}

export async function createActivity(
  context: AuthContext,
  input: CreateActivityInput,
  requestId: string,
): Promise<{ activity: ActivityDocument; created: boolean }> {
  await assertPermission(context, "ACTIVITY_CREATE");

  const targetEmployeeId = input.employee_id ?? context.employee_id;

  if (!targetEmployeeId) {
    throw new ActivityValidationError("employee_id is required");
  }

  const employee = await findEmployeeById(context, targetEmployeeId);

  if (!canAccessEmployee(context, employee)) {
    throw new ActivityAccessError(
      "Employee is outside your data scope",
    );
  }

  const idempotencyKey = input.idempotency_key.trim();

  if (!idempotencyKey) {
    throw new ActivityValidationError("idempotency_key is required");
  }

  const title = input.title.trim();
  const description = normalizeDescription(input.description);
  const requestHash = computeCreationRequestHash({
    employee_id: employee._id,
    activity_type_id: input.activity_type_id,
    city_id: input.city_id,
    offer_id: input.offer_id,
    title,
    description,
    performed_at: input.performed_at,
  });

  const existing = await findActivityByIdempotencyKey(
    context.organization_id,
    context.partner_id,
    employee._id,
    idempotencyKey,
  );

  if (existing) {
    assertIdempotencyMatch(existing, requestHash);
    return { activity: existing, created: false };
  }

  if (!isEmployeeEligibleForNewActivity(employee)) {
    throw new ActivityValidationError(
      "Employee must be ACTIVE and not deleted to register activities",
    );
  }

  const activityType = await loadActiveActivityType(
    context,
    input.activity_type_id,
  );

  await assertEmployeeCity(context, employee, input.city_id);

  const assignment = await resolveAssignment(
    context,
    employee._id,
    input.performed_at,
  );
  const offerSnapshot = await resolveOfferSnapshot(
    context,
    activityType,
    input.performed_at,
    input.offer_id,
  );

  try {
    return await withTransaction(async (session) => {
      const existingInTransaction = await findActivityByIdempotencyKey(
        context.organization_id,
        context.partner_id,
        employee._id,
        idempotencyKey,
        session,
      );

      if (existingInTransaction) {
        assertIdempotencyMatch(
          existingInTransaction,
          requestHash,
        );
        return { activity: existingInTransaction, created: false };
      }

      const activity = await createActivityRecord(
        {
          organization_id: context.organization_id,
          partner_id: context.partner_id,
          employee_id: employee._id,
          activity_type_id: activityType._id,
          assignment_id: assignment._id,
          city_id: input.city_id,
          offer_id: input.offer_id,
          offer_snapshot: offerSnapshot,
          title,
          description,
          performed_at: input.performed_at,
          status: "COMPLETED",
          cancelled_at: null,
          cancelled_by: null,
          cancellation_reason: null,
          idempotency_key: idempotencyKey,
          creation_request_hash: requestHash,
          created_by: context.account_id,
          updated_by: context.account_id,
          version: 0,
        },
        session,
      );

      await recordHistoryChange(
        session,
        buildAuditContext(context, requestId),
        {
          entity_name: "activity",
          record_id: activity._id,
          action: "CREATE",
          previous_values: null,
          new_values: activitySnapshot(activity),
        },
      );

      return { activity, created: true };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const concurrent = await findActivityByIdempotencyKey(
        context.organization_id,
        context.partner_id,
        employee._id,
        idempotencyKey,
      );

      if (concurrent) {
        assertIdempotencyMatch(concurrent, requestHash);
        return { activity: concurrent, created: false };
      }
    }

    throw error;
  }
}

export async function updateActivity(
  context: AuthContext,
  activityId: Types.ObjectId,
  input: UpdateActivityInput,
  requestId: string,
): Promise<ActivityDocument> {
  await assertPermission(context, "ACTIVITY_UPDATE");

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new ActivityValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const { activity, employee } = await loadScopedActivity(
    context,
    activityId,
  );

  assertExpectedVersion(activity.version, input.expectedVersion);

  if (activity.status === "CANCELLED") {
    throw new ActivityConflictError(
      "Cancelled activities cannot be modified",
    );
  }
  const activityType = await loadActivityType(
    context,
    activity.activity_type_id,
  );
  const performedAt = input.performed_at ?? activity.performed_at;
  const performedAtChanged = !sameInstant(
    performedAt,
    activity.performed_at,
  );
  const changes: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const title = input.title.trim();

    if (title !== activity.title) {
      changes.title = title;
    }
  }

  if (input.description !== undefined) {
    const description = normalizeDescription(input.description);

    if (description !== activity.description) {
      changes.description = description;
    }
  }

  if (input.city_id !== undefined) {
    await assertEmployeeCity(context, employee, input.city_id);

    if (!input.city_id.equals(activity.city_id)) {
      changes.city_id = input.city_id;
    }
  }

  const offerId =
    input.offer_id !== undefined ? input.offer_id : activity.offer_id;
  const offerChanged =
    input.offer_id !== undefined &&
    !(
      (input.offer_id === null && activity.offer_id === null) ||
      (input.offer_id !== null &&
        activity.offer_id?.equals(input.offer_id))
    );

  if (activityRequiresOffer(activityType)) {
    if (!offerId) {
      throw new ActivityValidationError(
        "offer_id is required for this activity type",
      );
    }

    if (performedAtChanged || input.offer_id !== undefined) {
      const snapshot = await resolveOfferSnapshot(
        context,
        activityType,
        performedAt,
        offerId,
      );

      if (!sameOfferSnapshot(activity.offer_snapshot, snapshot)) {
        changes.offer_snapshot = snapshot;
      }
    }

    if (offerChanged) {
      changes.offer_id = offerId;
    }
  } else if (offerId !== null) {
    throw new ActivityValidationError(
      "offer_id is only allowed for activity types that require an offer",
    );
  }

  if (performedAtChanged) {
    const assignment = await resolveAssignment(
      context,
      employee._id,
      performedAt,
    );

    if (!assignment._id.equals(activity.assignment_id)) {
      changes.assignment_id = assignment._id;
    }

    changes.performed_at = performedAt;
  }

  if (Object.keys(changes).length === 0) {
    return activity;
  }

  const auditDiff = buildActivityAuditDiff(activity, changes);

  return withTransaction(async (session) => {
    const updated = await updateActivityRecord(
      {
        _id: activityId,
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        version: input.expectedVersion,
        status: "COMPLETED",
      },
      {
        ...changes,
        updated_by: context.account_id,
      },
      session,
    );

    if (!updated) {
      throw new ActivityConflictError("Version conflict");
    }

    await recordHistoryChange(
      session,
      buildAuditContext(context, requestId),
      {
        entity_name: "activity",
        record_id: updated._id,
        action: "UPDATE",
        previous_values: auditDiff.previous_values,
        new_values: auditDiff.new_values,
      },
    );

    return updated;
  });
}

export async function cancelActivity(
  context: AuthContext,
  activityId: Types.ObjectId,
  input: CancelActivityInput,
  requestId: string,
): Promise<ActivityDocument> {
  await assertPermission(context, "ACTIVITY_DELETE");

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new ActivityValidationError(
      "expectedVersion must be a non-negative integer",
    );
  }

  const reason = input.reason.trim();

  if (!reason) {
    throw new ActivityValidationError(
      "cancellation reason is required",
    );
  }

  const { activity } = await loadScopedActivity(context, activityId);

  assertExpectedVersion(activity.version, input.expectedVersion);

  if (activity.status === "CANCELLED") {
    throw new ActivityConflictError("Activity is already cancelled");
  }

  const cancelledAt = new Date();

  return withTransaction(async (session) => {
    const updated = await updateActivityRecord(
      {
        _id: activityId,
        organization_id: context.organization_id,
        partner_id: context.partner_id,
        version: input.expectedVersion,
        status: "COMPLETED",
      },
      {
        ...buildCancellationChanges(
          context.account_id,
          reason,
          cancelledAt,
        ),
      },
      session,
    );

    if (!updated) {
      throw new ActivityConflictError("Version conflict");
    }

    await recordHistoryChange(
      session,
      buildAuditContext(context, requestId, reason),
      {
        entity_name: "activity",
        record_id: updated._id,
        action: "DELETE",
        previous_values: activitySnapshot(activity),
        new_values: null,
      },
    );

    return updated;
  });
}

export function assertNoImmutableActivityFields(
  record: Record<string, unknown>,
): void {
  for (const field of IMMUTABLE_ACTIVITY_FIELDS) {
    if (field in record) {
      throw new ActivityValidationError(`${field} is not editable`);
    }
  }
}
