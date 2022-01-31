import type { Document } from "mongoose";
import mongoose, { Schema } from "mongoose";

export interface IIterationModel {
  id: string | undefined;
  value: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface IterationDocument extends Document {
  value: number;
}

const IterationSchema = new Schema(
  {
    value: { type: Number },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const IterationModel = mongoose.model<IterationDocument>(
  "Iteration",
  IterationSchema
);
