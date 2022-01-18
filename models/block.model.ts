import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface BlockDocument extends Document {
  block: number;
  createdAt: Date;
  updatedAt: Date;
}

const BlockSchema = new Schema(
  {
    block: { type: Number, index: true },
  },
  {
    timestamps: true,
  }
);

export const BlockModel = mongoose.model<BlockDocument>("Block", BlockSchema);
