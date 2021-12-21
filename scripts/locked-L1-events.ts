import Web3 from 'web3'
import cliProgress from 'cli-progress'
import dotenv from 'dotenv'
import BN from 'bn.js'
import fs from 'fs'
dotenv.config()

import IdeaTokenExchangeABI from './abis/ideaTokenExchange.json'
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

const l1Config: Config = {
  web3: new Web3(process.env.RPC_MAINNET_L1!),
  exchangeAddress: '0xBe7e6a7cD3BEBC1776e64E988bd1518AA3Ad29A4',
  factoryAddress: '0x4bC73348B49f8794FB8b4bDee17B1825e5805DBc',
  vaultAddress: '0xE4f2a4Df3722bE05AbcD49AB734D303b2bBBcD65',
  startBlock: 11830875,
  endBlock: 13572493,
  isL1: true,
}

type LockInfo = {
  ideaToken: string,
  user: string,
  lockedAmount: BN,
  lockedUntil: number,
  lockDuration: number,
}


let tokenList: string[] = []
let lockedEventList: LockInfo[] = []

async function main() {
  // const lastBlockCHecked = js read file dict["lastBlockCHecked"]
  // const lockedTokenList = js read fine dict["lockedTokenList"]
  // creat a new dict with new values at respective places and rewrite file w new dict
  
  // run script initaially just to get L1 token addresses on the first day. then remove from here
  await run(l1Config)

  fs.writeFileSync('tokenList.json', JSON.stringify(Array.from(new Set(tokenList)), null, 2))
  fs.writeFileSync('tokenEventList.json', JSON.stringify(lockedEventList, null, 2))
  console.log(
    `\nFound ${
      tokenList.length
    } & ${lockedEventList.length} tokens and lockedEvent.`
  )
}

async function run(config: Config) {
  const { web3, vaultAddress, startBlock, endBlock } = config
  await parseLocks(web3, vaultAddress, startBlock, endBlock)
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
    const tx = lockedEvent.transactionHash
    const txReceipt = await web3.eth.getTransactionReceipt(tx)
    const user = web3.utils.toChecksumAddress(txReceipt.from)
    console.log(lockedEvent)
    tokenList.push(lockedEvent.returnValues['ideaToken'])
    // read store a lock event struct that writes the details of the lock for later use
    lockedEventList.push({ideaToken: lockedEvent.returnValues['ideaToken'], user: lockedEvent.returnValues['user'], 
      lockedAmount : lockedEvent.returnValues['lockedAmount'], lockedUntil: lockedEvent.returnValues['lockedUntil'], lockDuration: lockedEvent.returnValues['lockedDuration']})
    bar.increment()
  }
  bar.stop()
  return tokenList
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
