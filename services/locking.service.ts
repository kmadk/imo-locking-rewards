import { BlockModel } from "../models/block.model";
import { GenericModel } from "../models/generic.model";
import { PayoutModel } from "../models/payout.model";
import { PriceModel } from "../models/price.model";
import { TokenEventModel } from "../models/token-event.model";
import { TokenModel } from "../models/token.model";
import { ValueModel } from "../models/value.model";

export const getLatestBlockNumber = () => {
  return BlockModel.findOne({}, {}, { sort: { created_at: -1 } });
};

export const addLatestBlockNumber = (blockNumber: number) => {
  return BlockModel.create({
    block: blockNumber,
  });
};

export const addNewTokens = (tokens: string[]) => {
  const newTokens = tokens.map((token) => ({ value: token }));
  return TokenModel.insertMany(newTokens, {
    ordered: false,
  });
};

export const fetchAllTokens = () => {
  return TokenModel.find({});
};

export const saveNewTokenEvents = (events: any) => {
  return TokenEventModel.insertMany(events, {
    ordered: false,
  });
};

export const fetchAllLockedTokenEvents = () => {
  return TokenEventModel.find({});
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

export const saveNewApyAndTvl = (model: any) => {
  return GenericModel.create(model);
};
