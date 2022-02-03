import Web3 from "web3";
import cliProgress from "cli-progress";
import dotenv from "dotenv";
import BN from "bn.js";
import fs from "fs";
import { connectMongoDB } from "../db/mongodb";
import * as lockingService from "../services/locking.service";

dotenv.config();

import IdeaTokenExchangeABI from "./abis/ideaTokenExchange.json";
import IdeaTokenFactoryABI from "./abis/ideaTokenFactory.json";
import IdeaTokenVaultABI from "./abis/ideaTokenVault.json";
import ERC20ABI from "./abis/erc20.json";
import { TokenEventDocument } from "../models/token-event.model";
import { ITwapModel } from "../models/twap.model";
import { IIterationModel } from "../models/iteration.model";

type Config = {
  web3: Web3;
  exchangeAddress: string;
  factoryAddress: string;
  vaultAddress: string;
  startBlock: number;
  endBlock: number;
  isL1: boolean;
};

const l2Config: Config = {
  web3: new Web3(process.env.RPC_MAINNET_L2!),
  exchangeAddress: "0x15ae05599809AF9D1A04C10beF217bc04060dD81",
  factoryAddress: "0xE490A4517F1e8A1551ECb03aF5eB116C6Bbd450b",
  vaultAddress: "0xeC4E1A014fAf0D966332E62970CD7c6553671d76",
  startBlock: 1746173,
  endBlock: 4423000,
  isL1: false,
};

type LockInfo = {
  ideaToken: string;
  user: string;
  lockedAmount: BN;
  lockedUntil: number;
  lockDuration: number;
};

const TOTAL_PAYOUT = new BN("5000000").mul(new BN("10").pow(new BN("18")));
const BASE_COST = new BN("100000000000000000");
const PRICE_RISE = new BN("10000");
const HATCH_TOKENS = new BN("1000000000000000000000");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const EVENT_MINIMUM_AMOUNT = new BN(3);

let lockedEventList: LockInfo[] = [];
let allEvents: TokenEventDocument[] = [];
let allTokens: string[] = [];
let latestIteration: IIterationModel = { id: undefined, value: 0 };

export async function main() {
  // const lastBlockCHecked = js read file dict["lastBlockCHecked"]
  // const lockedTokenList = js read fine dict["lockedTokenList"]
  // creat a new dict with new values at respective places and rewrite file w new dict

  try {
    // run script initaially just to get L1 token addresses on the first day. then remove from here
    console.log("Job started started at", new Date());
    await connectMongoDB();
    await run(l2Config);
    console.log(
      `\nFound ${allTokens.length} & ${allEvents.length} tokens and lockedEvents.`
    );
    console.log("Job finishing at", new Date());
  } catch (error) {
    console.log("Web job terminated due to error", error);
  } finally {
    process.exit(0);
  }
}

async function run(config: Config) {
  let { web3, exchangeAddress, vaultAddress, startBlock } = config;

  //fix startblock comes from file
  if (false) {
    startBlock = parseInt(fs.readFileSync("startBlock.json", "utf8"), 10);
  } else {
    var latestStartBlock = await lockingService.getLatestBlockNumber();
    if (latestStartBlock) {
      startBlock = latestStartBlock.block;
    } else {
      startBlock = parseInt(fs.readFileSync("startBlock.json", "utf8"), 10);
    }
  }

  const endBlock = await web3.eth.getBlockNumber();

  await dailyPrices(web3, exchangeAddress, vaultAddress, startBlock, endBlock);
  // fs.writeFileSync("startBlock.json", endBlock.toString());
  await lockingService.addLatestBlockNumber(endBlock); // REPLACED WITH FILE SAVING
}

async function parseLocks(
  web3: Web3,
  vaultAddress: string,
  startBlock: number,
  endBlock: number
) {
  // Fetch all Locked events
  const vault = new web3.eth.Contract(IdeaTokenVaultABI as any, vaultAddress);
  const lockedEvents = await fetchPastEvents(
    vault,
    "Locked",
    startBlock,
    endBlock,
    true
  );

  // Iterate over events to fetch user addresses
  console.log(`\nParsing ${lockedEvents.length} Locked events`);
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  bar.start(lockedEvents.length, 0);

  let newTokens: string[] = [];
  for (const lockedEvent of lockedEvents) {
    newTokens.push(lockedEvent.returnValues["ideaToken"]);
    // read store a lock event struct that writes the details of the lock for later use
    lockedEventList.push({
      ideaToken: lockedEvent.returnValues["ideaToken"],
      user: lockedEvent.returnValues["owner"],
      lockedAmount: lockedEvent.returnValues["lockedAmount"],
      lockedUntil: lockedEvent.returnValues["lockedUntil"],
      lockDuration: lockedEvent.returnValues["lockedDuration"],
    });
    bar.increment();
  }
  bar.stop();

  return { newTokens, lockedEventList };
}

function weighLocked(lockedEventList: LockInfo[]) {
  // if timelocked > 1 month multiply amount by 1.2
  for (const lock of lockedEventList) {
    if (lock.lockDuration >= 30 * 60 * 60 * 24) {
      lock.lockedAmount = new BN(lock.lockedAmount)
        .mul(new BN("12"))
        .div(new BN("10"));
    }
  }
  return lockedEventList;
}

function parseLockedValue(
  lockedEventList: TokenEventDocument[],
  priceDict: ITwapModel[]
) {
  let valueDict: { [address: string]: BN } = {};
  let tvl = new BN(0);

  for (const lock of lockedEventList) {
    const address = lock.user;
    const token = lock.ideaToken;
    let price = new BN(0);

    var twapPrice = priceDict.find((x) => x.token === token);

    if (twapPrice) {
      price = new BN(twapPrice.value);
    }
    console.log("lockedAmount: " + parseInt(lock.lockedAmount.toString(), 16));
    console.log("lockedAddress: " + lock.ideaToken);
    //fix check this
    const amount = new BN(lock.lockedAmount, 16).div(
      new BN(10).pow(new BN(18))
    );
    console.log("price: " + price);
    console.log("amount: " + amount);
    const value = price.mul(amount);
    tvl = tvl.add(value);
    if (!valueDict[address]) {
      valueDict[address] = value;
    } else {
      valueDict[address] = valueDict[address].add(value);
    }
  }
  // FIX need to call sushiswap or database for price of IMO to get apr (decimal) in dollars
  // fix may need to go about apr in different way const apr = TOTAL_PAYOUT..mul(IMO PRICE).mul(new BN(4)).div(tvl)
  const apr = TOTAL_PAYOUT.mul(new BN(4)).div(tvl).mul(new BN(100));
  console.log("total_payout " + TOTAL_PAYOUT);
  console.log("tvl " + tvl);
  console.log("apr " + apr);
  let payoutDict: { [address: string]: BN } = {};
  for (const address in valueDict) {
    // fix this depends on timescale
    payoutDict[address] = valueDict[address]
      .mul(apr)
      .div(new BN(365))
      .div(new BN(24))
      .div(new BN(100));
  }
  return { tvl, apr, valueDict, payoutDict };
}

async function getTwapPrices(priceDict: { [address: string]: BN }) {
  latestIteration =
    (await lockingService.getLatestIteration()) as IIterationModel;
  let twapDict: ITwapModel[] = [];
  if (latestIteration.value == 0) {
    Object.keys(priceDict).forEach((key) => {
      twapDict.push({
        token: key,
        value: priceDict[key].toString("hex"),
        blockTimestamp: 0,
      });
    });
  } else {
    twapDict = (await lockingService.getTwaps()).map((m) => {
      return {
        token: m.token,
        value: m.value,
        blockTimestamp: m.blockTimestamp,
      };
    });
    // twapDict = JSON.parse(fs.readFileSync("twap-dict.json", "utf8"));
  }

  for (const token of Object.keys(priceDict)) {
    const twapValue = twapDict.find((x) => x.token === token);

    if (!twapValue) {
      twapDict.push({
        token: token,
        value: priceDict[token].toString("hex"),
        blockTimestamp: 0,
      });
    } else {
      // computes new average price
      twapValue.value = new BN(twapValue.value, 16)
        .mul(new BN(latestIteration.value))
        .add(priceDict[token])
        .div(new BN(latestIteration.value + 1))
        .toString();
    }
  }
  // fs.writeFileSync("twap-dict.json", JSON.stringify(twapDict, null, 2));
  latestIteration.value++;
  // fs.writeFileSync("iterations.json", iterations.toString());
  return twapDict;
}

function getPrice(supply: BN) {
  if (supply.lte(HATCH_TOKENS)) {
    return BASE_COST;
  }
  const price = supply.sub(HATCH_TOKENS).div(PRICE_RISE).add(BASE_COST);
  return price;
}

async function dailyPrices(
  web3: Web3,
  exchangeAddress: string,
  vaultAddress: string,
  startBlock: number,
  endBlock: number
) {
  // Fetch all InvestedState events
  const exchange = new web3.eth.Contract(
    IdeaTokenExchangeABI as any,
    exchangeAddress
  );

  const parsedLocks = await parseLocks(
    web3,
    vaultAddress,
    startBlock,
    endBlock
  );

  // IMPORT PREVIOUS TOKENS
  // const existingTokens = fs.readFileSync("tokenListAdjusted.json", "utf8");
  // const tokens = Array.from(
  //   new Set(newTokens.concat(JSON.parse(existingTokens)))
  // );
  // await lockingService.addNewTokens(tokens);

  if (parsedLocks.newTokens.length > 0) {
    await lockingService.addNewTokens(parsedLocks.newTokens);
  }

  allTokens = await (await lockingService.fetchAllTokens()).map((m) => m.value);

  // fs.writeFileSync("totalTokenList.json", JSON.stringify(tokens, null, 2));

  // IMPORT PREVIOUS EVENTS JSON DATA
  // const pastEvents = fs.readFileSync("tokenEventListAdjusted.json", "utf8");
  // let allEvents = JSON.parse(pastEvents).concat(lockedEventList);
  // await lockingService.saveNewTokenEvents(allEvents);

  lockedEventList = weighLocked(lockedEventList);

  if (lockedEventList && lockedEventList.length > 0) {
    const newEventList = lockedEventList.map((i) => {
      return {
        ideaToken: i.ideaToken,
        user: i.user,
        lockedAmount: i.lockedAmount.toString("hex"),
        lockedAmountAsNumber: Number.parseInt(i.lockedAmount.toString()),
        lockedUntil: i.lockedUntil,
        lockDuration: i.lockDuration,
      };
    });
    await lockingService.saveNewTokenEvents(newEventList);
  }
  //fs.writeFileSync('totalUnweightedTokenEventList.json', JSON.stringify(allEvents, null, 2))

  const blockTimeStamp = (
    await web3.eth.getBlock(await web3.eth.getBlockNumber())
  )["timestamp"];

  allEvents = await lockingService.fetchAllLockedTokenEvents(
    Number.parseInt(blockTimeStamp as string),
    Number.parseInt(EVENT_MINIMUM_AMOUNT.toString(), 16)
  );

  // fs.writeFileSync(
  //   "totalTokenEventList.json",
  //   JSON.stringify(allEvents, null, 2)
  // );

  console.log(`\nParsing ${allTokens.length} Token list`);

  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

  bar.start(allTokens.length, 0);

  let priceDict: { [address: string]: BN } = {};

  for (const token of allTokens) {
    //fix end of pricedict
    const callableToken = new web3.eth.Contract(ERC20ABI as any, token);
    console.log("\ntoken: " + token);
    const supply = await callableToken.methods.totalSupply().call();
    console.log("supply: " + supply);
    //fix token addresses if from L1
    priceDict[token] = getPrice(new BN(supply));
    console.log("price: " + priceDict[token]);
    bar.increment();
  }

  const twapPrices = await getTwapPrices(priceDict);

  const { tvl, apr, valueDict, payoutDict } = parseLockedValue(
    allEvents,
    twapPrices
  );

  const timestamp = (await web3.eth.getBlock(endBlock)).timestamp;

  await lockingService.updateIterationValue(
    latestIteration.id,
    latestIteration.value
  );

  // STORE TWAP PRICES
  twapPrices
    .filter((x) => x.blockTimestamp === 0)
    .forEach((m) => {
      m.blockTimestamp = timestamp as number;
    });
  await lockingService.saveTwaps(twapPrices);

  let prices: any[] = [];
  Object.keys(priceDict).forEach((key) => {
    prices.push({
      token: key,
      value: priceDict[key].toString("hex"),
      valueAsNumber: Number.parseInt(priceDict[key].toString(), 16),
      blockTimestamp: timestamp,
    });
  });

  await lockingService.savePrices(prices);

  let values: any[] = [];
  Object.keys(valueDict).forEach((key) => {
    values.push({
      address: key,
      value: valueDict[key].toString("hex"),
      valueAsNumber: Number.parseInt(valueDict[key].toString(), 16),
      blockTimestamp: timestamp,
    });
  });

  await lockingService.saveValues(values);

  let payouts: any[] = [];
  Object.keys(payoutDict).forEach((key) => {
    payouts.push({
      address: key,
      value: payoutDict[key].toString("hex"),
      valueAsNumber: Number.parseInt(payoutDict[key].toString(), 16),
      blockTimestamp: timestamp,
    });
  });
  await lockingService.savePayouts(payouts);

  await lockingService.saveApr({
    value: apr.toString(),
    valueAsHex: apr.toString("hex"),
    blockTimestamp: timestamp,
  });

  await lockingService.saveTvl({
    value: tvl.toString(),
    valueAsHex: tvl.toString("hex"),
    blockTimestamp: timestamp,
  });

  // fs.writeFileSync(
  //   "priceDict-" + timestamp + ".json",
  //   JSON.stringify(priceDict, null, 2)
  // );

  // fs.writeFileSync(
  //   "valueDict-" + timestamp + ".json",
  //   JSON.stringify(valueDict, null, 2)
  // );

  // fs.writeFileSync(
  //   "payoutDict-" + timestamp + ".json",
  //   JSON.stringify(payoutDict, null, 2)
  // );

  // fs.writeFileSync("tvl-" + timestamp + ".json", JSON.stringify(tvl, null, 2));

  // fs.writeFileSync("apr-" + timestamp + ".json", JSON.stringify(apr, null, 2));

  bar.stop();
}

async function fetchPastEvents(
  contract: any,
  eventName: string,
  startBlock: number,
  endBlock: number,
  withDisplay: boolean
): Promise<any[]> {
  withDisplay &&
    console.log(
      `\nFetching ${eventName} events from ${startBlock} to ${endBlock}`
    );

  const originalStepSize = 100_000;
  let stepSize = originalStepSize;
  let currentBlock = startBlock;
  let allEvents: any[] = [];

  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  withDisplay && bar.start(endBlock - startBlock + 1, 0);

  while (currentBlock <= endBlock) {
    let iterationEndBlock = currentBlock + stepSize;
    if (iterationEndBlock > endBlock) {
      iterationEndBlock = endBlock;
    }

    let events;
    try {
      events = await contract.getPastEvents(eventName, {
        fromBlock: currentBlock,
        toBlock: iterationEndBlock,
      });
    } catch (ex) {
      // There are too many events in this range to fetch in one go.
      // Decrease the step size and try again.
      stepSize = Math.floor(stepSize / 2);
      continue;
    }

    withDisplay && bar.increment(iterationEndBlock - currentBlock);
    allEvents = allEvents.concat(events);
    currentBlock = iterationEndBlock + 1;
    stepSize = originalStepSize;
  }

  withDisplay && bar.update(endBlock - startBlock + 1);
  withDisplay && bar.stop();
  withDisplay && console.log(`Fetched ${allEvents.length} ${eventName} events`);
  return allEvents;
}

// main();
