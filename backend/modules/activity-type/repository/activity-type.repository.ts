import "server-only";

import type { Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { ActivityTypeModel } from "../entities/activity-type.entity";

export async function listActiveActivityTypeRecords(
  organizationId: Types.ObjectId,
) {
  await connectToDatabase();

  return ActivityTypeModel.find({
    organization_id: organizationId,
    is_active: true,
  }).sort({ code: 1 });
}

export async function createActivityTypeRecord(
  record: {
    organization_id: Types.ObjectId;
    code: string;
    name: string;
    description: string | null;
    requires_offer: boolean;
    is_active: boolean;
    created_by: Types.ObjectId;
    updated_by: Types.ObjectId;
    version: number;
  },
  session: import("mongoose").ClientSession,
) {
  await connectToDatabase();
  const [created] = await ActivityTypeModel.create([record], { session });
  return created;
}
