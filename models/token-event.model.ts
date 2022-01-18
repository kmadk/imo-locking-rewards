import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TokenEventDocument extends Document {
  ideaToken: string;
  user: string;
  lockedAmount: string;
  lockedUntil: number;
  lockDuration: number;
  createdAt: Date;
  updatedAt: Date;
}

const TokenEventSchema = new Schema(
  {
    ideaToken: { type: String, index: true },
    user: { type: String, index: true },
    lockedAmount: { type: String },
    lockedUntil: { type: Number },
    lockDuration: { type: Number },
  },
  {
    timestamps: true,
  }
);

export const TokenEventModel = mongoose.model<TokenEventDocument>(
  "TokenEvent",
  TokenEventSchema
);
