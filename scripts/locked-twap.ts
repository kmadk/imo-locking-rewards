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
import { ITwapModel, Twapocument } from "../models/twap.model";

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

let tokenList: string[] = [];
let lockedEventList: LockInfo[] = [];
let allEvents: LockInfo[] = [];

async function main() {
  // const lastBlockCHecked = js read file dict["lastBlockCHecked"]
  // const lockedTokenList = js read fine dict["lockedTokenList"]
  // creat a new dict with new values at respective places and rewrite file w new dict

  // run script initaially just to get L1 token addresses on the first day. then remove from here
  await connectMongoDB();
  await run(l2Config);
  console.log(
    `\nFound ${tokenList.length} & ${allEvents.length} tokens and lockedEvents.`
  );
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
  for (const lockedEvent of lockedEvents) {
    tokenList.push(lockedEvent.returnValues["ideaToken"]);
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

  return tokenList;
}

function weighLocked(lockDuration: number, amount: string) {
  // if timelocked > 1 month multiply amount by 1.2
  if (lockDuration >= 30 * 60 * 60 * 24) {
    return new BN(amount).mul(new BN("12")).div(new BN("10"));
  }

  return amount;
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

    const lockedAmount = weighLocked(lock.lockDuration, lock.lockedAmount);
    console.log("lockedAmount: " + lockedAmount);

    //fix check this
    const amount = new BN(lockedAmount).div(new BN(10).pow(new BN(18)));
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

  // FIX need to call uniswap or database for price of IMO to get apr (decimal) in dollars
  //fix price or tvl or something must be wrong
  // may need to go about apr in different way const apr = TOTAL_PAYOUT..mul(IMO PRICE).mul(new BN(4)).div(tvl)
  // read uniswap contract fix
  // fix only get rewards if locked during that date
  // if lock has expired, can remove that event from the lockedEventList
  const apr = TOTAL_PAYOUT.mul(new BN(4)).div(tvl);
  console.log("total_payout " + TOTAL_PAYOUT);
  console.log("tvl " + tvl);
  console.log("apr " + apr);
  let payoutDict: { [address: string]: BN } = {};
  for (const address in valueDict) {
    payoutDict[address] = valueDict[address].mul(apr).div(new BN(365));
  }
  return { tvl, apr, valueDict, payoutDict };
}

async function getTwapPrices(priceDict: { [address: string]: BN }) {
  const iterations = 0;
  let twapDict: ITwapModel[] = [];
  if (iterations == 0) {
    Object.keys(priceDict).forEach((key) => {
      twapDict.push({
        token: key,
        value: priceDict[key].toString(),
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
  for (const token of twapDict) {
    // computes new average price
    token.value = new BN(token.value)
      .mul(new BN(iterations))
      .add(priceDict[token.token])
      .div(new BN(iterations + 1))
      .toString();
  }

  // fs.writeFileSync("twap-dict", JSON.stringify(twapDict, null, 2));
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

  const newTokens = await parseLocks(web3, vaultAddress, startBlock, endBlock);

  // IMPORT PREVIOUS TOKENS
  // const existingTokens = fs.readFileSync("tokenListAdjusted.json", "utf8");
  // const tokens = Array.from(
  //   new Set(newTokens.concat(JSON.parse(existingTokens)))
  // );
  // await lockingService.addNewTokens(tokens);

  if (newTokens.length > 0) {
    await lockingService.addNewTokens(newTokens);
  }

  const allTokens = await (
    await lockingService.fetchAllTokens()
  ).map((m) => m.value);

  // fs.writeFileSync("totalTokenList.json", JSON.stringify(tokens, null, 2));

  // IMPORT PREVIOUS EVENTS JSON DATA
  // const pastEvents = fs.readFileSync("tokenEventListAdjusted.json", "utf8");
  // let allEvents = JSON.parse(pastEvents).concat(lockedEventList);
  // await lockingService.saveNewTokenEvents(allEvents);

  if (lockedEventList && lockedEventList.length > 0)
    await lockingService.saveNewTokenEvents(lockedEventList);

  //fs.writeFileSync('totalUnweightedTokenEventList.json', JSON.stringify(allEvents, null, 2))

  const blockTimeStamp = (
    await web3.eth.getBlock(await web3.eth.getBlockNumber())
  )["timestamp"];

  let allEvents = await lockingService.fetchAllLockedTokenEvents(
    Number.parseInt(blockTimeStamp as string)
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

  // STORE TWAP PRICES
  await lockingService.saveTwaps(twapPrices);

  let prices: any[] = [];
  Object.keys(priceDict).forEach((key) => {
    prices.push({
      token: key,
      price: priceDict[key].toString(),
      blockTimestamp: timestamp,
    });
  });

  await lockingService.savePrices(prices);

  let values: any[] = [];
  Object.keys(valueDict).forEach((key) => {
    values.push({
      token: key,
      price: valueDict[key].toString(),
      blockTimestamp: timestamp,
    });
  });

  await lockingService.saveValues(values);

  let payouts: any[] = [];
  Object.keys(payoutDict).forEach((key) => {
    payouts.push({
      token: key,
      price: payoutDict[key].toString(),
      blockTimestamp: timestamp,
    });
  });
  await lockingService.savePayouts(payouts);

  await lockingService.saveNewAprAndTvl({
    apr,
    tvl,
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

main();
