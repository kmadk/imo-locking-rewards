import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface PayoutDocument extends Document {
  address: string;
  value: string;
  blockTimestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

const PayoutSchema = new Schema(
  {
    address: { type: String, index: true },
    value: { type: String },
    blockTimestamp: { type: Number },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const PayoutModel = mongoose.model<PayoutDocument>(
  "Payout",
  PayoutSchema
);
