import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TvlDocument extends Document {
  value: string;
  valueAsHex: string;
  blockTimestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

const TvlSchema = new Schema(
  {
    value: { type: String, index: true },
    valueAsHex: { type: String },
    blockTimestamp: { type: Number, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const TvlModel = mongoose.model<TvlDocument>("Tvl", TvlSchema);
