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
  lockedAmount: string,
  lockedUntil: number,
  lockDuration: number,
}
//have inputs of specific start and end so can be used for months agnostically

const TOTAL_PAYOUT = new BN('5000000').mul(new BN('10').pow(new BN('18')))
const BASE_COST = new BN('100000000000000000')
const PRICE_RISE = new BN('10000')
const HATCH_TOKENS = new BN('1000000000000000000000')

const rewardStartBlock = 5290000

let allTokens: string[] = []
let allEvents: LockInfo[] = []

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
  const endBlock = await web3.eth.getBlockNumber() 
  await parseAllLocks(web3, exchangeAddress, vaultAddress, startBlock, endBlock, rewardStartBlock)
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
      lock.lockedAmount = (new BN(lock.lockedAmount).mul(new BN('12')).div(new BN('10'))).toString()
    }
  }
  return lockedEventList
}

function getPrice(supply: BN) {
  if (supply.lte(HATCH_TOKENS)) {
    return BASE_COST
  }
  const price = (supply.sub(HATCH_TOKENS)).div(PRICE_RISE).add(BASE_COST)
  return price
}

async function calculateRewards(web3: Web3, allEventList: LockInfo[], priceDict: { [address: string]: BN }, rewardStartBlock: number) {
  let payoutDict: { [address: string]: string } = {}
  const unixHour = 3600
  const unixMonth = unixHour * 24 * 30
  let rewardStartTimestamp = +(await web3.eth.getBlock(rewardStartBlock)).timestamp
  let k = 0
  let j = 0
  let l = 0;
  for (let i = rewardStartTimestamp; i < rewardStartTimestamp + unixMonth; i += unixHour) {
    let valueDict: { [address: string]: BN } = {}
    j++
    let tvl = new BN(0)
    for (const lock of allEventList) {
      const lockExpiration = lock.lockedUntil
      const lockDuration = lock.lockDuration
      const lockedAmount = lock.lockedAmount
      const address = lock.user
      const token = lock.ideaToken
      const price = priceDict[token]
      const amount = new BN(lockedAmount).div(new BN(10).pow(new BN(18)))
      console.log("lockedAmount: " + new BN(lockedAmount).toString())
      console.log("amount: " + amount)
      let value
      if (lockExpiration < i || lockExpiration - lockDuration > i) {
        l++
        continue
      }
      // if really high price divide price by 2 for more accurate numbers
      if (amount.gt(new BN('19900'))) {
        value = price.mul(amount).div(new BN(2))
        console.log("350000000!!!!!!!!!!")
        console.log(`address ${address} has ${value.toString()} value  of tokens priced ${price.toString()}`)
        console.log(`token ${token} has ${amount.toString()}`)
        console.log(`token ${token} has ${new BN(lockedAmount).toString()}`)
        k++
      } else if (amount.gt(new BN('5000'))) {
        value = price.mul(amount).mul(new BN(3)).div(new BN(4))
        console.log(`address ${address} has ${value.toString()} value  of tokens priced ${price.toString()}`)
        console.log(`token ${token} has ${amount.toString()}`)
        console.log(`token ${token} has ${new BN(lockedAmount).toString()}`)
      } else {
        value = price.mul(amount)
      }
      if (!valueDict[address]) {
        valueDict[address] = value
      } else {
        valueDict[address] = valueDict[address].add(value)
      }
      tvl = tvl.add(value)
    }
    console.log("tvl " + tvl)
    const apy = TOTAL_PAYOUT.mul(new BN(4)).div(tvl).mul(new BN(100)).mul(new BN(12)).div(new BN(100))
    console.log("apy " + apy)
    for (const address in valueDict) {
      if (!payoutDict[address]) {
        payoutDict[address] = (valueDict[address].mul(TOTAL_PAYOUT).mul(new BN(4)).div(new BN(365)).div(tvl).div(new BN(24))).toString()
      } else {
        // fix this depends on timescale
        payoutDict[address] = (new BN(payoutDict[address]).add(valueDict[address].mul(TOTAL_PAYOUT).mul(new BN(4)).div(new BN(365)).div(tvl).div(new BN(24)))).toString()
      }
    }
  }
  let totalRewards = 0
  for (const address in payoutDict) {
    totalRewards += +payoutDict[address]
  }
  console.log("k: " + k)
  console.log("j: " + j)
  console.log("l: " + l)
  console.log("totalRewards: " + totalRewards)
  fs.writeFileSync("rewardsDict.json", JSON.stringify(payoutDict, null, 2))
  // fix change start reward time to later
  //fix debug through amount error (non hex integrer locked amounts are getting blown up)
  // turn every one to hex? Is this the case with locked twap events?
  // iterate from rewardStartBlock to rewardEndBlock on intervals of 1 hour and calculate rewards based on what
  //locked listings are present at that time and the overall pool size. 
  //Sum up all the rewards for each listing and then each address can log the files and calculate

  // if over certain amount for a listing cut its value in half
}

async function parseAllLocks(web3: Web3, exchangeAddress: string,  vaultAddress: string, 
  startBlock: number, endBlock: number, rewardStartBlock: number) {
  // Fetch all InvestedState events
  const existingTokens = JSON.parse(fs.readFileSync('tokenListAdjusted.json','utf8'))
  let {newTokens, lockedEventList} = await parseLocks(web3, vaultAddress, startBlock, endBlock)
  allTokens = Array.from(new Set(newTokens.concat(existingTokens)))
  fs.writeFileSync('totalTokenList.json', JSON.stringify(allTokens, null, 2))
  const pastEvents = JSON.parse(fs.readFileSync('tokenEventListAdjusted.json','utf8'))
  for (const event of pastEvents) {
    event.lockedAmount = new BN(event.lockedAmount, 16).toString()
  }
  lockedEventList = weighLocked(lockedEventList)
  allEvents = Array.from(new Set(pastEvents.concat(lockedEventList)))
  /*allEvents = allEvents.filter(function(lock: LockInfo) {
    let amount = new BN(lock.lockedAmount, 16).div(new BN(10).pow(new BN(18)))
    return lock['lockedUntil'] >= timestamp && amount.gt(new BN(3))
  });
  */
  for (const lock of allEvents) {
    lock.lockedAmount = lock.lockedAmount.toString()
  }
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

  calculateRewards(web3, allEvents, priceDict, rewardStartBlock)
  
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
