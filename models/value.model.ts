import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface ValueDocument extends Document {
  address: string;
  value: string;
  valueAsNumber: Number;
  blockTimestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

const ValueSchema = new Schema(
  {
    address: { type: String, index: true },
    value: { type: String },
    valueAsNumber: { type: Number },
    blockTimestamp: { type: Number },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const ValueModel = mongoose.model<ValueDocument>("Value", ValueSchema);
