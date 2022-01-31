import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface AprDocument extends Document {
  value: string;
  blockTimestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

const AprSchema = new Schema(
  {
    value: { type: String, index: true },
    blockTimestamp: { type: Number },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const AprModel = mongoose.model<AprDocument>("Apr", AprSchema);
