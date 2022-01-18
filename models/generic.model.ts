import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface GenericDocument extends Document {
  apy: string;
  tvl: string;
  blockTimestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

const GenericSchema = new Schema(
  {
    apy: { type: String, index: true },
    tvl: { type: String, index: true },
    blockTimestamp: { type: Number },
  },
  {
    timestamps: true,
  }
);

export const GenericModel = mongoose.model<GenericDocument>(
  "Generic",
  GenericSchema
);
