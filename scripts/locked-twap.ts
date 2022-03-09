import Web3 from 'web3'
import cliProgress from 'cli-progress'
import dotenv from 'dotenv'
import BN from 'bn.js'
import fs from 'fs'
dotenv.config()

import IdeaTokenExchangeABI from './abis/ideaTokenExchange.json'
import IdeaTokenFactoryABI from './abis/ideaTokenFactory.json'
import SushiPoolABI from './abis/sushiPool.json'
import IdeaTokenVaultABI from './abis/ideaTokenVault.json'
import ERC20ABI from './abis/erc20.json'

type Config = {
  web3: Web3
  exchangeAddress: string
  factoryAddress: string
  ethImoPool: string
  ethUsdcPool: string
  ethImoStaking:string
  ethImoLPToken: string
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
  ethImoPool: '0x9eAE34FAa17CaF99D2109f513edc5A6E3A7435B5',
  ethUsdcPool: '0x905dfCD5649217c42684f23958568e533C711Aa3',
  ethImoStaking: '0xb0448763523E129Bfc2Cd20ceeFAcC16c620F726',
  ethImoLPToken: '0x9eAE34FAa17CaF99D2109f513edc5A6E3A7435B5',
  startBlock: 1746173,
  endBlock: 4423000,
  isL1: false,
}

type LockInfo = {
  ideaToken: string,
  user: string,
  lockedAmount: BN,
  lockedUntil: number,
  lockDuration: number,
}


const TOTAL_PAYOUT = new BN('5000000').mul(new BN('10').pow(new BN('18')))
const BASE_COST = new BN('100000000000000000')
const PRICE_RISE = new BN('10000')
const HATCH_TOKENS = new BN('1000000000000000000000')

let allTokens: string[] = []
let allEvents: LockInfo[] = []
let iterations = 0

async function main() {
  await run(l2Config)
  console.log(
    `\nFound ${
      allTokens.length
    } & ${allEvents.length} tokens and lockedEvents.`
  )
}

async function run(config: Config) {
  let { web3, exchangeAddress,  vaultAddress, startBlock } = config

  startBlock = parseInt(fs.readFileSync("startBlock.json", 'utf8'), 10)

  const endBlock = await web3.eth.getBlockNumber() 
  await dailyPrices(web3, exchangeAddress, vaultAddress, startBlock, endBlock)
  fs.writeFileSync("startBlock.json", endBlock.toString())
}

async function parseLocks(web3: Web3, vaultAddress: string, startBlock: number, endBlock: number) {
  let lockedEventList: LockInfo[] = []
  // Fetch all Locked events
  const vault = new web3.eth.Contract(IdeaTokenVaultABI as any, vaultAddress)
  const lockedEvents = await fetchPastEvents(vault, 'Locked', startBlock, endBlock, true)
  
  // Iterate over events to fetch user addresses
  console.log(`\nParsing ${lockedEvents.length} Locked events`)
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
  bar.start(lockedEvents.length, 0)

  let newTokens: string[] = []
  for (const lockedEvent of lockedEvents) {
    newTokens.push(lockedEvent.returnValues['ideaToken'])
    // read store a lock event struct that writes the details of the lock for later use
    lockedEventList.push({ideaToken: lockedEvent.returnValues['ideaToken'], user: lockedEvent.returnValues['owner'], 
      lockedAmount : lockedEvent.returnValues['lockedAmount'], lockedUntil: lockedEvent.returnValues['lockedUntil'], lockDuration: lockedEvent.returnValues['lockedDuration']})
    bar.increment()
  }
  bar.stop()

  return {newTokens, lockedEventList}
}

function weighLocked(lockedEventList: LockInfo[]) {
  // if timelocked > 1 month multiply amount by 1.2
  for (const lock of lockedEventList) {
    if (lock.lockDuration > 2629800) {
      lock.lockedAmount = new BN(lock.lockedAmount).mul(new BN('12')).div(new BN('10'))
    }
  }
  return lockedEventList
}

async function parseLockedValue(allEventList: LockInfo[], priceDict: { [address: string]: BN }) {
  let valueDict: { [address: string]: BN } = {}
  let tvl = new BN(0)
  for (const lock of allEventList) {
    const address = lock.user
    const token = lock.ideaToken
    const price = priceDict[token]
    const amount = new BN(lock.lockedAmount, 16).div(new BN(10).pow(new BN(18)))
    // if really high price divide price by 2 for more accurate numbers
    if (amount.gt(new BN('35000'))) {
      console.log("PRICE HIGH")
      console.log("lockedAmount: " + new BN(lock.lockedAmount, 16))
      console.log("lockedAddress: " + lock.ideaToken)

      console.log("price: " + price)
      console.log("amount: " + amount)
      const value = price.mul(amount).div(new BN(2))
      tvl = tvl.add(value)
      console.log("total value: " + tvl)
      if (!valueDict[address]) {
        valueDict[address] = value
      } else {

        valueDict[address] = valueDict[address].add(value)
      }
    } else {
      console.log("lockedAmount: " + new BN(lock.lockedAmount, 16))
      console.log("lockedAddress: " + lock.ideaToken)
      console.log("price: " + price)
      console.log("amount: " + amount)
      const value = price.mul(amount)
      tvl = tvl.add(value)
      console.log("total value: " + tvl)
      if (!valueDict[address]) {
        valueDict[address] = value
      } else {
        valueDict[address] = valueDict[address].add(value)
      }
    }
  }

  const ethUsdcPool = new l2Config.web3.eth.Contract(SushiPoolABI as any, l2Config.ethUsdcPool)
  const ethUsdcReserves = await ethUsdcPool.methods.getReserves().call()
  const ethReserves = ethUsdcReserves["_reserve0"]
  const usdcReserves = ethUsdcReserves["_reserve1"]
  const ethPrice = new BN(usdcReserves).mul(new BN(10).pow(new BN(12))).div(new BN(ethReserves))
  console.log("ethPrice: " + ethPrice)
  const ethImoPool = new l2Config.web3.eth.Contract(SushiPoolABI as any, l2Config.ethImoPool)
  const ethImoReserves = await ethImoPool.methods.getReserves().call()
  const ImoReserves = ethImoReserves["_reserve1"]
  const ethInImoPool = ethImoReserves["_reserve0"]
  const imoPrice = new BN(ethInImoPool).mul(ethPrice).mul(new BN(1000)).div(new BN(ImoReserves))
  console.log("imoPrice: " + imoPrice)
  const LPContract = new l2Config.web3.eth.Contract(ERC20ABI as any, l2Config.ethImoLPToken)
  const totalLPStaked = await LPContract.methods.balanceOf(l2Config.ethImoStaking).call()
  const totalLPStakedInUSD = new BN(totalLPStaked).mul(new BN(43)).div(new BN(10).pow(new BN(18)))
  console.log("totalLPStakedInUSD" + totalLPStakedInUSD)
  const LPapr = TOTAL_PAYOUT.mul(imoPrice).div(new BN(1000)).mul(new BN(100)).div(totalLPStakedInUSD).div(new BN(10).pow(new BN(18)))
  fs.writeFileSync("LPapr.json", LPapr.toString())

  // GET LP APR
  //const apy = TOTAL_PAYOUT.mul(new BN(4)).div(tvl).mul(new BN(100)).mul(new BN(85)).div(new BN(100))
  const apy = TOTAL_PAYOUT.mul(new BN(4)).div(tvl).mul(new BN(100)).mul(imoPrice).div(new BN(1000))
  console.log("total_payout " + TOTAL_PAYOUT)
  console.log("tvl " + tvl)
  console.log("apy " + apy)
  let payoutDict: { [address: string]: BN } = {}
  for (const address in valueDict) {
    // fix this depends on timescale
    payoutDict[address] = valueDict[address].mul(TOTAL_PAYOUT).mul(new BN(4)).div(new BN(365)).div(tvl).div(new BN(24))
  }
  return {tvl, apy, valueDict, payoutDict}
}
function getTwapPrices(priceDict: { [address: string]: BN }) {
  let twapDict
  iterations = parseInt(fs.readFileSync('iterations.json', 'utf8'))
  if (iterations == 0) {
    twapDict = priceDict
  } else {
    twapDict = JSON.parse(fs.readFileSync('twap-dict.json', 'utf8'))
  }
  for (const token of Object.keys(priceDict)) {
    if (!twapDict[token]) {
      twapDict[token] = priceDict[token]
    } else {
    // computes new average price
    twapDict[token] = (new BN(twapDict[token], 16).mul(new BN(iterations)).add(priceDict[token])).div(new BN(iterations + 1))
    }
  }
  fs.writeFileSync('twap-dict.json', JSON.stringify(twapDict, null, 2))
  iterations++
  fs.writeFileSync('iterations.json', iterations.toString())
  return twapDict
}

function getPrice(supply: BN) {
  if (supply.lte(HATCH_TOKENS)) {
    return BASE_COST
  }
  const price = (supply.sub(HATCH_TOKENS)).div(PRICE_RISE).add(BASE_COST)
  return price
}

async function dailyPrices(web3: Web3, exchangeAddress: string,  vaultAddress: string, startBlock: number, endBlock: number) {
  // Fetch all InvestedState events
  const exchange = new web3.eth.Contract(IdeaTokenExchangeABI as any, exchangeAddress)
  const existingTokens = JSON.parse(fs.readFileSync('totalTokenList.json','utf8'))
  let {newTokens, lockedEventList} = await parseLocks(web3, vaultAddress, startBlock, endBlock)
  allTokens = Array.from(new Set(newTokens.concat(existingTokens)))
  fs.writeFileSync('totalTokenList.json', JSON.stringify(allTokens, null, 2))
  const pastEvents = JSON.parse(fs.readFileSync('totalTokenEventList.json','utf8'))
  lockedEventList = weighLocked(lockedEventList)
  allEvents = Array.from(new Set(pastEvents.concat(lockedEventList)))
  const timestamp = (await web3.eth.getBlock(endBlock)).timestamp
  allEvents = allEvents.filter(function(lock: LockInfo) {
    let amount = new BN(lock.lockedAmount, 16).div(new BN(10).pow(new BN(18)))
    return lock['lockedUntil'] >= timestamp && amount.gt(new BN(3))
  });
  fs.writeFileSync('totalTokenEventList.json', JSON.stringify(allEvents, null, 2))
  console.log(`\nParsing ${allTokens.length} Token list`)
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
  bar.start(allTokens.length, 0)
  let priceDict: { [address: string]: BN } = {}
  for (const token of allTokens) {
    const callableToken = new web3.eth.Contract(ERC20ABI as any, token)
    const supply = await callableToken.methods.totalSupply().call()
    priceDict[token] = getPrice(new BN(supply))
    bar.increment()
  }

  const twapPrices = getTwapPrices(priceDict)
  const { tvl, apy, valueDict, payoutDict } = await parseLockedValue(allEvents, twapPrices)
  fs.writeFileSync('priceDict-' + timestamp + '.json', JSON.stringify(priceDict, null, 2))
  fs.writeFileSync('valueDict-' + timestamp + '.json', JSON.stringify(valueDict, null, 2))
  fs.writeFileSync('payoutDict-' + timestamp + '.json', JSON.stringify(payoutDict, null, 2))
  fs.writeFileSync('tvl-' + timestamp + '.json', JSON.stringify(tvl, null, 2))
  fs.writeFileSync('apy-' + timestamp + '.json', JSON.stringify(apy, null, 2))
  
  bar.stop()
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
