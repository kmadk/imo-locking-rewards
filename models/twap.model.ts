// eslint-disable-next-line @typescript-eslint/consistent-type-definitions

import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

export interface ITwapModel {
  token: string;
  value: string;
  blockTimestamp: number;
}

export interface Twapocument extends Document {
  token: string;
  value: string;
  blockTimestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

const TwapSchema = new Schema(
  {
    token: { type: String, index: true },
    value: { type: String },
    blockTimestamp: { type: Number },
  },
  {
    timestamps: true,
  }
);

export const TwapModel = mongoose.model<Twapocument>("Twap", TwapSchema);
