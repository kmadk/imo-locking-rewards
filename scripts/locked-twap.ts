import Web3 from 'web3'
import cliProgress from 'cli-progress'
import dotenv from 'dotenv'
import BN from 'bn.js'
import fs from 'fs'
dotenv.config()

import IdeaTokenExchangeABI from './abis/ideaTokenExchange.json'
import IdeaTokenFactoryABI from './abis/ideaTokenFactory.json'
import IdeaTokenVaultABI from './abis/ideaTokenVault.json'
import ERC20ABI from './abis/erc20.json'

type Config = {
  web3: Web3
  exchangeAddress: string
  factoryAddress: string
  vaultAddress: string
  startBlock: number
  endBlock: number
  isL1: boolean
}

const l2Config: Config = {
  web3: new Web3(process.env.RPC_MAINNET_L2!),
  exchangeAddress: '0x15ae05599809AF9D1A04C10beF217bc04060dD81',
  factoryAddress: '0xE490A4517F1e8A1551ECb03aF5eB116C6Bbd450b',
  vaultAddress: '0xeC4E1A014fAf0D966332E62970CD7c6553671d76',
  startBlock: 1746173,
  endBlock: 2895118,
  isL1: false,
}

type LockInfo = {
  ideaToken: string,
  user: string,
  lockedAmount: BN,
  lockedUntil: number,
  lockDuration: number,
}


const TOTAL_PAYOUT = new BN('10000000').mul(new BN('10').pow(new BN('18')))
const BASE_COST = new BN('100000000000000000')
const PRICE_RISE = new BN('100000000000000')
const HATCH_TOKENS = new BN('1000000000000000000000')
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

//fix startblock comes from file
let lastBlockChecked = l2Config.startBlock
let tokenList: string[] = []
let lockedEventList: LockInfo[] = []
// locked event list comes from file

async function main() {
  // const lastBlockCHecked = js read file dict["lastBlockCHecked"]
  // const lockedTokenList = js read fine dict["lockedTokenList"]
  // creat a new dict with new values at respective places and rewrite file w new dict

  // run script initaially just to get L1 token addresses on the first day. then remove from here
  await run(l2Config)

  console.log(
    `\nFound ${
      tokenList.length
    } & ${lockedEventList.length} tokens and lockedEvent.`
  )
}

async function run(config: Config) {
  let { web3, exchangeAddress,  vaultAddress, startBlock, endBlock } = config
  // FIX pull lastchecked block from DB
  if (lastBlockChecked > endBlock) {
    startBlock = lastBlockChecked
    endBlock = await web3.eth.getBlockNumber()
  }
  await dailyPrices(web3, exchangeAddress, vaultAddress, startBlock, endBlock)
}

async function parseLocks(web3: Web3, vaultAddress: string, startBlock: number, endBlock: number) {
  // Fetch all Locked events
  const vault = new web3.eth.Contract(IdeaTokenVaultABI as any, vaultAddress)
  const lockedEvents = await fetchPastEvents(vault, 'Locked', startBlock, endBlock, true)
  
  // Iterate over events to fetch user addresses
  console.log(`\nParsing ${lockedEvents.length} Locked events`)
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
  bar.start(lockedEvents.length, 0)
  for (const lockedEvent of lockedEvents) {
    tokenList.push(lockedEvent.returnValues['ideaToken'])
    // read store a lock event struct that writes the details of the lock for later use
    lockedEventList.push({ideaToken: lockedEvent.returnValues['ideaToken'], user: lockedEvent.returnValues['owner'], 
      lockedAmount : lockedEvent.returnValues['lockedAmount'], lockedUntil: lockedEvent.returnValues['lockedUntil'], lockDuration: lockedEvent.returnValues['lockedDuration']})
    bar.increment()
  }
  bar.stop()

  return tokenList
}

function weighLocked(lockedEventList: LockInfo[]) {
  // if timelocked > 1 month multiply amount by 1.2
  for (const lock of lockedEventList) {
    if (lock.lockDuration > 30 * 60 * 60 * 24) {
      lock.lockedAmount = new BN(lock.lockedAmount).mul(new BN('1.2'))
    }
  }
  return lockedEventList
}

function parseLockedValue(lockedEventList: LockInfo[], priceDict: { [address: string]: BN }) {
  let valueDict: { [address: string]: BN } = {}
  let tvl = new BN(0)
  for (const lock of lockedEventList) {
    const address = lock.user
    const token = lock.ideaToken
    const price = priceDict[token]
    const amount = new BN(lock.lockedAmount)
    console.log("price" + price)
    console.log("amount" + amount)
    const value = price.mul(amount)
    tvl = tvl.add(value)
    if (!valueDict[address]) {
      valueDict[address] = value
    } else {
      valueDict[address] = valueDict[address].add(value)
    }
  }
  // FIX need to call database for price of IMO to get apy (decimal) in dollars
  // may need to go about apy in different way const apy = TOTAL_PAYOUT..mul(IMO PRICE).mul(new BN(4)).div(tvl)
  const apy = TOTAL_PAYOUT.mul(new BN(4)).div(tvl)
  let payoutDict: { [address: string]: BN } = {}
  for (const address in valueDict) {
    payoutDict[address] = valueDict[address].mul(apy).div(new BN(365))
  }
  return {tvl, apy, valueDict, payoutDict}
}

function getTwapPrices(priceDict: { [address: string]: BN }) {
  const iterations = 0
  let twapDict
  if (iterations == 0) {
    twapDict = priceDict
  } else {
    twapDict = JSON.parse(fs.readFileSync('twap-dict.json', 'utf8'))
  }
  for (const token of Object.keys(twapDict)) {
    // computes new average price
    twapDict[token] = twapDict[token].mul(new BN(iterations)).add(priceDict[token]).div(new BN(iterations + 1))
  }
  fs.writeFileSync('twap-dict', JSON.stringify(twapDict, null, 2))
  return twapDict
}

function getPrice(supply: BN) {
  if (supply.lte(HATCH_TOKENS)) {
    return BASE_COST
  }
  const price = PRICE_RISE.mul(supply.sub(HATCH_TOKENS)).add(BASE_COST)
  return price
}

async function dailyPrices(web3: Web3, exchangeAddress: string,  vaultAddress: string, startBlock: number, endBlock: number) {
  // Fetch all InvestedState events
  const exchange = new web3.eth.Contract(IdeaTokenExchangeABI as any, exchangeAddress)
  //Fix writing to json or ts
  const existingTokens = fs.readFileSync('tokenList.json','utf8');
  const newTokens = await parseLocks(web3, vaultAddress, startBlock, endBlock)
  const tokens = Array.from(new Set(newTokens.concat(JSON.parse(existingTokens))))
  // fix write
  fs.writeFileSync('TotalTokenList.json', JSON.stringify(tokens, null, 2))

  const pastEvents = fs.readFileSync('tokenEventList.json','utf8');
  // fix why is user not being written
  let allEvents = JSON.parse(pastEvents).concat(lockedEventList)
  allEvents = weighLocked(allEvents)
  // fix write
  fs.writeFileSync('totalTokenEventList.json', JSON.stringify(allEvents, null, 2))
  // fix migration of addresses from l1 to l2
  console.log(`\nParsing ${tokens.length} Token list`)
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
  bar.start(tokens.length, 0)
  let priceDict: { [address: string]: BN } = {}
  for (const token of tokens) {
    //fix end of pricedict
    const callableToken = new web3.eth.Contract(ERC20ABI as any, token)
    console.log("\ntoken: " + token)
    const supply = await callableToken.methods.totalSupply().call()
    console.log("supply: " + supply)
    //fix token addresses if from L1
    priceDict[token] = getPrice(new BN(supply))
    console.log("price: " + priceDict[token])
    bar.increment()
  }

  const twapPrices = getTwapPrices(priceDict)
  const { tvl, apy, valueDict, payoutDict } = parseLockedValue(allEvents, twapPrices)
  const timestamp = (await web3.eth.getBlock(endBlock)).timestamp
  fs.writeFileSync('priceDict-' + timestamp + '.json', JSON.stringify(priceDict, null, 2))
  fs.writeFileSync('valueDict-' + timestamp + '.json', JSON.stringify(valueDict, null, 2))
  fs.writeFileSync('payoutDict-' + timestamp + '.json', JSON.stringify(payoutDict, null, 2))
  fs.writeFileSync('tvl-' + timestamp + '.json', JSON.stringify(tvl, null, 2))
  fs.writeFileSync('apy-' + timestamp + '.json', JSON.stringify(apy, null, 2))
  //fix last block
  // write priceDict to file for that date
  bar.stop()
  //write new file with new tokens and endblock
}

async function fetchPastEvents(
  contract: any,
  eventName: string,
  startBlock: number,
  endBlock: number,
  withDisplay: boolean
): Promise<any[]> {
  withDisplay && console.log(`\nFetching ${eventName} events from ${startBlock} to ${endBlock}`)

  const originalStepSize = 100_000
  let stepSize = originalStepSize
  let currentBlock = startBlock
  let allEvents: any[] = []

  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
  withDisplay && bar.start(endBlock - startBlock + 1, 0)

  while (currentBlock <= endBlock) {
    let iterationEndBlock = currentBlock + stepSize
    if (iterationEndBlock > endBlock) {
      iterationEndBlock = endBlock
    }

    let events
    try {
      events = await contract.getPastEvents(eventName, { fromBlock: currentBlock, toBlock: iterationEndBlock })
    } catch (ex) {
      // There are too many events in this range to fetch in one go.
      // Decrease the step size and try again.
      stepSize = Math.floor(stepSize / 2)
      continue
    }

    withDisplay && bar.increment(iterationEndBlock - currentBlock)
    allEvents = allEvents.concat(events)
    currentBlock = iterationEndBlock + 1
    stepSize = originalStepSize
  }

  withDisplay && bar.update(endBlock - startBlock + 1)
  withDisplay && bar.stop()
  withDisplay && console.log(`Fetched ${allEvents.length} ${eventName} events`)
  return allEvents
}

main()
