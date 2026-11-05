import { parseAbi } from 'viem'

// Minimal ABIs for the Stance contracts in contracts/src and the Chainlink feed.

export const StanceMarketAbi = parseAbi([
	'struct Range { address series; address vault; uint256 k1; uint256 k2; uint256 expiry; }',
	'function allRanges() view returns (Range[])',
])

export const SpreadSeriesAbi = parseAbi([
	'function settled() view returns (bool)',
	'function settle(uint80 roundId)',
	'error NotExpired()',
	'error AlreadySettled()',
	'error InvalidRound()',
	'error GuardRejected(uint256 price, uint256 guardPrice)',
])

export const AggregatorV3Abi = parseAbi([
	'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
	'function getRoundData(uint80 roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
])

// Multicall3 (same address on every EVM chain, incl. Base Sepolia). Used to batch many view
// calls into one EVM read, because CRE allows only 15 EVM reads per execution
// (PerWorkflow.ChainRead.CallLimit, https://docs.chain.link/cre/service-quotas).
export const Multicall3Abi = parseAbi([
	'struct Call3 { address target; bool allowFailure; bytes callData; }',
	'struct Result { bool success; bytes returnData; }',
	'function aggregate3(Call3[] calls) payable returns (Result[] returnData)',
])
