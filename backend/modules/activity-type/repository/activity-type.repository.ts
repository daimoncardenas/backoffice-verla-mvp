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
