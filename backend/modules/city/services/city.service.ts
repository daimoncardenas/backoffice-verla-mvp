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
import { CityModel, type City } from "../entities/city.entity";
import {
  createCityRecord,
  findCityRecord,
  listCityRecords,
} from "../repository/city.repository";
import {
  CityConflictError,
  CityNotFoundError,
  CityValidationError,
} from "./city.errors";
import type { CreateCityInput } from "../types/city.types";

type CityDocument = HydratedDocument<City>;

export function normalizeCityName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildAuditContext(
  context: AuthContext,
  requestId: string,
): AuditContext {
  return {
    organization_id: context.organization_id,
    partner_id: null,
    actor_user_id: context.account_id,
    request_id: requestId,
    reason: null,
  };
}

function auditSnapshot(city: CityDocument): Record<string, unknown> {
  return {
    name: city.name,
    normalized_name: city.normalized_name,
    country_code: city.country_code,
    region_code: city.region_code,
    official_code: city.official_code,
    is_active: city.is_active,
  };
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

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function assertUniqueCity(
  organizationId: Types.ObjectId,
  countryCode: string,
  regionCode: string,
  normalizedName: string,
  officialCode: string | null,
  session: ClientSession,
): Promise<void> {
  const existingName = await CityModel.exists({
    organization_id: organizationId,
    country_code: countryCode,
    region_code: regionCode,
    normalized_name: normalizedName,
  }).session(session);

  if (existingName) {
    throw new CityConflictError(
      "A city with the same name already exists in this region",
    );
  }

  if (officialCode !== null) {
    const existingOfficialCode = await CityModel.exists({
      organization_id: organizationId,
      country_code: countryCode,
      official_code: officialCode,
    }).session(session);

    if (existingOfficialCode) {
      throw new CityConflictError(
        "A city with the same official code already exists",
      );
    }
  }
}

export async function listCities(
  context: AuthContext,
): Promise<CityDocument[]> {
  await assertPermission(context, "CITY_LIST");

  return listCityRecords(context.organization_id);
}

export async function getCity(
  context: AuthContext,
  cityId: Types.ObjectId,
): Promise<CityDocument> {
  await assertPermission(context, "CITY_READ");

  const city = await findCityRecord(cityId, context.organization_id);

  if (!city) {
    throw new CityNotFoundError();
  }

  return city;
}

export async function createCity(
  context: AuthContext,
  input: CreateCityInput,
  requestId: string,
): Promise<CityDocument> {
  await assertPermission(context, "CITY_CREATE");

  const displayName = input.name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeCityName(displayName);
  const countryCode = input.country_code.trim().toUpperCase();
  const regionCode = input.region_code.trim().toUpperCase();
  const officialCode = input.official_code?.trim() || null;

  if (!displayName || !normalizedName) {
    throw new CityValidationError("name is required");
  }

  if (!countryCode) {
    throw new CityValidationError("country_code is required");
  }

  if (!regionCode) {
    throw new CityValidationError("region_code is required");
  }

  const auditContext = buildAuditContext(context, requestId);

  try {
    return await withTransaction(async (session) => {
      await assertUniqueCity(
        context.organization_id,
        countryCode,
        regionCode,
        normalizedName,
        officialCode,
        session,
      );

      const created = await createCityRecord(
        {
          organization_id: context.organization_id,
          name: displayName,
          normalized_name: normalizedName,
          country_code: countryCode,
          region_code: regionCode,
          official_code: officialCode,
          is_active: true,
          created_by: context.account_id,
          updated_by: context.account_id,
          version: 0,
        },
        session,
      );

      await recordHistoryChange(session, auditContext, {
        entity_name: "city",
        record_id: created._id,
        action: "CREATE",
        previous_values: null,
        new_values: auditSnapshot(created),
      });

      return created;
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new CityConflictError("City already exists");
    }
    throw error;
  }
}
