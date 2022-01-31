import { BlockModel } from "../models/block.model";
import { AprModel } from "../models/apr.model";
import { PayoutModel } from "../models/payout.model";
import { PriceModel } from "../models/price.model";
import { TokenEventModel } from "../models/token-event.model";
import { TokenModel } from "../models/token.model";
import { ITwapModel, TwapModel } from "../models/twap.model";
import { ValueModel } from "../models/value.model";
import { TvlModel } from "../models/tvl.model";
import { IterationModel } from "../models/iteration.model";

export const getLatestBlockNumber = () => {
  return BlockModel.findOne({}, {}, { sort: { createdAt: -1 } });
};

export const addLatestBlockNumber = (blockNumber: number) => {
  return BlockModel.create({
    block: blockNumber,
  });
};

export const addNewTokens = (tokens: string[]) => {
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  const newTokens = tokens.map((token) =>
    TokenModel.findOneAndUpdate({ value: token }, { value: token }, options)
  );
  return Promise.all(newTokens);
};

export const fetchAllTokens = () => {
  return TokenModel.find({});
};

export const saveNewTokenEvents = (events: any) => {
  events.forEach((element: any) => {
    element.lockedAmountAsNumber = parseInt(element.lockedAmount, 16);
  });
  return TokenEventModel.insertMany(events, {
    ordered: false,
  });
};

export const fetchAllLockedTokenEvents = (
  blockTimeStamp: number,
  amount: number
) => {
  return TokenEventModel.find({
    lockedUntil: { $gte: blockTimeStamp },
    lockedAmountAsNumber: { $gt: amount },
  });
};

export const savePrices = (model: any) => {
  return PriceModel.insertMany(model, {
    ordered: false,
  });
};

export const savePayouts = (model: any) => {
  return PayoutModel.insertMany(model, {
    ordered: false,
  });
};

export const saveValues = (model: any) => {
  return ValueModel.insertMany(model, {
    ordered: false,
  });
};

export const saveTvl = (model: any) => {
  return TvlModel.create(model);
};

export const saveApr = (model: any) => {
  return AprModel.create(model);
};

export const saveTwaps = (model: ITwapModel[]) => {
  return TwapModel.insertMany(model, {
    ordered: false,
  });
};

export const getTwaps = () => {
  return TwapModel.find();
};

export const getLatestIteration = () => {
  return IterationModel.findOne({}, {}, { sort: { created_at: -1 } });
};

export const updateIterationValue = (id: string | undefined, value: number) => {
  if (id === undefined) {
    return IterationModel.create({ value });
  }

  return IterationModel.findByIdAndUpdate(id, {
    value: value,
  });
};

export const addIterationValue = (value: number) => {
  return IterationModel.create({
    value: value,
  });
};
