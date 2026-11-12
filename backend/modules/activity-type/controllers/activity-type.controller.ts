import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import { listActiveActivityTypes } from "../services/activity-type.service";

type ActivityTypeDocument = Awaited<
  ReturnType<typeof listActiveActivityTypes>
>[number];

function serializeActivityType(activityType: ActivityTypeDocument) {
  return {
    id: activityType._id.toString(),
    code: activityType.code,
    name: activityType.name,
    description: activityType.description,
    requires_offer: activityType.requires_offer,
    is_active: activityType.is_active,
  };
}

export async function handleList(context: AuthContext) {
  const activityTypes = await listActiveActivityTypes(context);

  return {
    activity_types: activityTypes.map(serializeActivityType),
  };
}

export function activityTypeErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
