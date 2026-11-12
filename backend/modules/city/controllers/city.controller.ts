import { Types } from "mongoose";
import { NextResponse } from "next/server";

import { ForbiddenError } from "../../authorization/services/permission.service";
import type { AuthContext } from "../../auth/types/auth.types";
import {
  CityConflictError,
  CityNotFoundError,
  CityValidationError,
} from "../services/city.errors";
import {
  createCity,
  getCity,
  listCities,
} from "../services/city.service";
import type { CreateCityInput } from "../types/city.types";

type CityDocument = Awaited<ReturnType<typeof getCity>>;

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new CityValidationError("Invalid request body");
  }

  return body as Record<string, unknown>;
}

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CityValidationError(`${field} is required`);
  }

  return value.trim();
}

function parseOfficialCode(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new CityValidationError("official_code must be a string or null");
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCityId(value: unknown): Types.ObjectId {
  if (typeof value !== "string" || !Types.ObjectId.isValid(value)) {
    throw new CityValidationError("Invalid city id");
  }

  return new Types.ObjectId(value);
}

function parseCreateInput(body: unknown): CreateCityInput {
  const record = asRecord(body);

  return {
    name: parseRequiredString(record.name, "name"),
    country_code: parseRequiredString(record.country_code, "country_code"),
    region_code: parseRequiredString(record.region_code, "region_code"),
    official_code: parseOfficialCode(record.official_code),
  };
}

function serializeCity(city: CityDocument) {
  return {
    id: city._id.toString(),
    name: city.name,
    normalized_name: city.normalized_name,
    country_code: city.country_code,
    region_code: city.region_code,
    official_code: city.official_code,
    is_active: city.is_active,
    version: city.version,
    created_at: city.created_at.toISOString(),
    updated_at: city.updated_at.toISOString(),
  };
}

export async function handleList(context: AuthContext) {
  const cities = await listCities(context);

  return { cities: cities.map(serializeCity) };
}

export async function handleGet(
  context: AuthContext,
  cityId: string,
) {
  const city = await getCity(context, parseCityId(cityId));

  return { city: serializeCity(city) };
}

export async function handleCreate(
  context: AuthContext,
  body: unknown,
  requestId: string,
) {
  const city = await createCity(context, parseCreateInput(body), requestId);

  return { city: serializeCity(city) };
}

export function cityErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof CityValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof CityNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof CityConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
