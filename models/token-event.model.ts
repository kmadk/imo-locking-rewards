import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TokenEventDocument extends Document {
  ideaToken: string;
  user: string;
  lockedAmount: string;
  lockedAmountAsNumber: number;
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
    lockedAmountAsNumber: { type: Number, index: true },
    lockedUntil: { type: Number, index: true },
    lockDuration: { type: Number },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const TokenEventModel = mongoose.model<TokenEventDocument>(
  "TokenEvent",
  TokenEventSchema
);
