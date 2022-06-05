import Web3 from 'web3'
import cliProgress from 'cli-progress'
import dotenv from 'dotenv'
import BN from 'bn.js'
import fs from 'fs'
dotenv.config()

import NFTOpinionBaseABI from './abis/nftOpinionBase.json'

type Config = {
  web3: Web3
  nftOpinionBaseAddress: string
  startBlock: number
  isL1: boolean
}

const l2Config: Config = {
    //fix
  web3: new Web3(process.env.RPC_MAINNET_L2!),
  nftOpinionBaseAddress: '0xEbc8Ccbd94541EA335eB5Ed5b4FFDC0E8481b9C7',
  startBlock: 14086326,
  isL1: false,
}

let finalCitationNumber: {[post: number]: number} = {}
let  finalCitedBy: {[post: number]: [number]} = {}

async function main() {
  await run(l2Config)
  console.log(
    `\nFound ${
        Object.keys(finalCitationNumber).length
    } & ${Object.keys(finalCitedBy).length} tokens and lockedEvents.`
  )
}

async function run(config: Config) {
  let { web3, nftOpinionBaseAddress, startBlock } = config
  const endBlock = await web3.eth.getBlockNumber() 
  await parseAllLocks(web3, nftOpinionBaseAddress, startBlock, endBlock)
  fs.writeFileSync("opinionStartBlock.json", endBlock.toString())
}

async function parseLocks(web3: Web3, citedBy: {[post: number]: [number]}, citationNumber: {[post: number]: number}, 
                            nftOpinionBaseAddress: string, startBlock: number, endBlock: number) {
  // Fetch all Locked events
  const opinionBase = new web3.eth.Contract(NFTOpinionBaseABI as any, nftOpinionBaseAddress)
  const opinionEvents = await fetchPastEvents(opinionBase, 'NewOpinion', startBlock, endBlock, true)
  
  // Iterate over events to fetch user addresses
  console.log(`\nParsing ${opinionEvents.length} Locked events`)
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
  bar.start(opinionEvents.length, 0)

  for (const opinionEvent of opinionEvents) {
    const citations = opinionEvent.returnValues['citations']
    for (let i = 0; i < citations.length; i++) {
        if (!(new Set(citedBy[citations[i]]).has(opinionEvent.returnValues['tokenID']))) {
            citedBy[citations[i]].push(opinionEvent.returnValues['tokenID'])
        }
        citationNumber[citations[i]]++
    }
    bar.increment()
  }
  bar.stop()

  return {citationNumber, citedBy}
}

async function parseAllLocks(web3: Web3, nftOpinionBaseAddress: string, 
  startBlock: number, endBlock: number) {
  startBlock = JSON.parse(fs.readFileSync('opinionStartBlock.json','utf8'))
  // Fetch all InvestedState events
  const existingCitedBy = JSON.parse(fs.readFileSync('citedBy.json','utf8'))
  const existingCitationNumber = JSON.parse(fs.readFileSync('citationNumber.json','utf8'))
  let {citationNumber, citedBy} = await parseLocks(web3, existingCitedBy, existingCitationNumber, nftOpinionBaseAddress, startBlock, endBlock)
  finalCitationNumber = citationNumber
  finalCitedBy = citedBy
  fs.writeFileSync('citedBy.json', JSON.stringify(citedBy, null, 2))
  fs.writeFileSync('citationNumber.json', JSON.stringify(citationNumber, null, 2))
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
