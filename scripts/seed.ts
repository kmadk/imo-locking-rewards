import { connectMongoDB } from "../db/mongodb";
import * as lockingService from "../services/locking.service";
import fs from "fs";
import { config } from "dotenv";
import Web3 from "web3";
import { ITwapModel } from "../models/twap.model";

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

async function main() {
  await connectMongoDB();

  console.log("Importing start block from startBlock.json");
  const startBlock = parseInt(fs.readFileSync("startBlock.json", "utf8"), 10);
  await lockingService.addLatestBlockNumber(startBlock);
  console.log("Imported start block");

  console.log("Importing total token list from totalTokenList.json");
  const existingTokens = fs.readFileSync("totalTokenList.json", "utf8");
  const tokens: string[] = Array.from(new Set(JSON.parse(existingTokens)));
  await lockingService.addNewTokens(tokens);
  console.log("Imported total token list");

  console.log("Importing total token event list from totalTokenEventList.json");
  const eventsFS = fs.readFileSync("totalTokenEventList.json", "utf8");
  const pastEvents: any[] = JSON.parse(eventsFS);
  await lockingService.saveNewTokenEvents(pastEvents);
  console.log("Imported total token event list");

  console.log("Importing twap prices twapDict.json");
  const twapDict = JSON.parse(fs.readFileSync("twap-dict.json", "utf8"));

  const blockTimeStamp = (
    await l2Config.web3.eth.getBlock(await l2Config.web3.eth.getBlockNumber())
  )["timestamp"];

  let twapPrices: ITwapModel[] = [];

  Object.keys(twapDict).forEach((key: string) => {
    twapPrices.push({
      token: key,
      value: twapDict[key].toString(),
      blockTimestamp: blockTimeStamp as number,
    });
  });

  await lockingService.saveTwaps(twapPrices);
  console.log("Imported twap prices");

  console.log("Import iteration value from iterations.json");
  const iterations = parseInt(fs.readFileSync("iterations.json", "utf8"), 10);
  await lockingService.addIterationValue(iterations);
  console.log("Imported iteration value");
  process.exit();
}

main();
