import "server-only";

import type { ClientSession, QueryFilter, Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import {
  ActivityModel,
  type Activity,
  type OfferSnapshot,
} from "../entities/activity.entity";
import {
  EmployeeAssignmentModel,
  type EmployeeAssignment,
} from "../../employee-assignment/entities/employee-assignment.entity";
import { OfferModel, type Offer } from "../../offer/entities/offer.entity";

export interface NewActivityRecord {
  organization_id: Types.ObjectId;
  partner_id: Types.ObjectId;
  employee_id: Types.ObjectId;
  activity_type_id: Types.ObjectId;
  assignment_id: Types.ObjectId;
  city_id: Types.ObjectId;
  offer_id: Types.ObjectId | null;
  offer_snapshot: OfferSnapshot | null;
  title: string;
  description: string | null;
  performed_at: Date;
  status: "COMPLETED";
  cancelled_at: null;
  cancelled_by: null;
  cancellation_reason: null;
  idempotency_key: string;
  creation_request_hash: string;
  created_by: Types.ObjectId;
  updated_by: Types.ObjectId;
  version: number;
}

export function buildAssignmentForInstantFilter(
  employeeId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
  performedAt: Date,
): QueryFilter<EmployeeAssignment> {
  return {
    employee_id: employeeId,
    organization_id: organizationId,
    partner_id: partnerId,
    valid_from: { $lte: performedAt },
    $or: [{ valid_to: null }, { valid_to: { $gt: performedAt } }],
  };
}

export function buildActivityOfferFilter(
  organizationId: Types.ObjectId,
  offerId: Types.ObjectId,
  performedAt: Date,
): QueryFilter<Offer> {
  return {
    _id: offerId,
    organization_id: organizationId,
    deleted_at: null,
    status: { $in: ["PUBLISHED", "ARCHIVED"] },
    published_at: { $type: "date", $lte: performedAt },
    starts_at: { $type: "date", $lte: performedAt },
    ends_at: { $type: "date", $gt: performedAt },
  };
}

export async function listActivityRecords(
  filter: QueryFilter<Activity>,
) {
  await connectToDatabase();

  return ActivityModel.find(filter).sort({ performed_at: -1, _id: -1 });
}

export async function findActivityRecord(
  filter: QueryFilter<Activity>,
  session?: ClientSession,
) {
  await connectToDatabase();

  const query = ActivityModel.findOne(filter);

  return session ? query.session(session) : query;
}

export async function findActivityByIdempotencyKey(
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
  employeeId: Types.ObjectId,
  idempotencyKey: string,
  session?: ClientSession,
) {
  return findActivityRecord(
    {
      organization_id: organizationId,
      partner_id: partnerId,
      employee_id: employeeId,
      idempotency_key: idempotencyKey,
    },
    session,
  );
}

export async function findAssignmentForInstant(
  employeeId: Types.ObjectId,
  organizationId: Types.ObjectId,
  partnerId: Types.ObjectId,
  performedAt: Date,
  session?: ClientSession,
) {
  await connectToDatabase();

  const query = EmployeeAssignmentModel.findOne(
    buildAssignmentForInstantFilter(
      employeeId,
      organizationId,
      partnerId,
      performedAt,
    ),
  ).sort({ valid_from: -1 });

  return session ? query.session(session) : query;
}

export async function findOfferForActivity(
  organizationId: Types.ObjectId,
  offerId: Types.ObjectId,
  performedAt: Date,
  session?: ClientSession,
) {
  await connectToDatabase();

  const query = OfferModel.findOne(
    buildActivityOfferFilter(organizationId, offerId, performedAt),
  );

  return session ? query.session(session) : query;
}

export async function createActivityRecord(
  record: NewActivityRecord,
  session: ClientSession,
) {
  await connectToDatabase();

  const [created] = await ActivityModel.create([record], { session });

  return created;
}

export async function updateActivityRecord(
  filter: QueryFilter<Activity>,
  changes: Record<string, unknown>,
  session: ClientSession,
) {
  await connectToDatabase();

  return ActivityModel.findOneAndUpdate(
    filter,
    {
      $set: changes,
      $inc: { version: 1 },
    },
    { new: true, runValidators: true, session },
  );
}
