import "server-only";

import type { ClientSession, Types } from "mongoose";

import { connectToDatabase } from "../../../config/mongodb";
import { CityModel } from "../entities/city.entity";

export interface NewCityRecord {
  organization_id: Types.ObjectId;
  name: string;
  normalized_name: string;
  country_code: string;
  region_code: string;
  official_code: string | null;
  is_active: boolean;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

export async function listCityRecords(organizationId: Types.ObjectId) {
  await connectToDatabase();

  return CityModel.find({
    organization_id: organizationId,
    deleted_at: null,
  }).sort({ normalized_name: 1 });
}

export async function findCityRecord(
  cityId: Types.ObjectId,
  organizationId: Types.ObjectId,
) {
  await connectToDatabase();

  return CityModel.findOne({
    _id: cityId,
    organization_id: organizationId,
    deleted_at: null,
  });
}

export async function createCityRecord(
  record: NewCityRecord,
  session: ClientSession,
) {
  await connectToDatabase();

  const [created] = await CityModel.create([record], { session });

  return created;
}
