import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface PriceDocument extends Document {
  token: string;
  price: string;
  blockTimestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

const PriceSchema = new Schema(
  {
    token: { type: String, index: true },
    price: { type: String },
    blockTimestamp: { type: Number },
  },
  {
    timestamps: true,
  }
);

export const PriceModel = mongoose.model<PriceDocument>("Price", PriceSchema);
