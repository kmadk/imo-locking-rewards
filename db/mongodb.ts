/* eslint-disable unicorn/no-process-exit */
import { connect } from "mongoose";

import "../models/token.model";
import "../models/payout.model";
import "../models/price.model";
import "../models/token-event.model";
import "../models/value.model";
import "../models/block.model";
import "../models/generic.model";

async function connectMongoDB() {
  const mongoURI: string = process.env.MONGODB_URI || "localhost:2700";

  try {
    await connect(mongoURI);
    console.log("Database connected...");
  } catch (error) {
    console.error("DB connection error", error);
    console.log(error);
    process.exit(1);
  }
}

export { connectMongoDB };
