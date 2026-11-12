import "server-only";

import { assertPermission } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import type { HydratedDocument } from "mongoose";
import type { ActivityType } from "../entities/activity-type.entity";
import { listActiveActivityTypeRecords } from "../repository/activity-type.repository";

type ActivityTypeDocument = HydratedDocument<ActivityType>;

export async function listActiveActivityTypes(
  context: AuthContext,
): Promise<ActivityTypeDocument[]> {
  await assertPermission(context, "ACTIVITY_TYPE_LIST");

  return listActiveActivityTypeRecords(context.organization_id);
}
