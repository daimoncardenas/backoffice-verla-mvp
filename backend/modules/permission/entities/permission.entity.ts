import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";

export interface Permission {
  organization_id: Types.ObjectId;
  code: string;
  resource: string;
  action: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: Types.ObjectId | null;
  updated_by: Types.ObjectId | null;
  version: number;
}

const permissionSchema = new Schema<Permission>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    code: { type: String, required: true, trim: true },
    resource: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    is_active: { type: Boolean, default: true, required: true },
    created_by: { type: Schema.Types.ObjectId, ref: "UserAccount", default: null },
    updated_by: { type: Schema.Types.ObjectId, ref: "UserAccount", default: null },
    version: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "version must be a non-negative integer",
      },
    },
  },
  {
    collection: "permission",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: "version",
  },
);

permissionSchema.index(
  { organization_id: 1, code: 1 },
  { unique: true },
);

export const PermissionModel: Model<Permission> =
  (models.Permission as Model<Permission> | undefined) ??
  model<Permission>("Permission", permissionSchema);
