import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface TokenDocument extends Document {
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

const TokenSchema = new Schema(
  {
    value: { type: String, index: true },
  },
  {
    timestamps: true,
  }
);

export const TokenModel = mongoose.model<TokenDocument>("Token", TokenSchema);
