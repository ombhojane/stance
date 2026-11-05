# Uniswap developer feedback: Stance

> **Draft — review before submitting.** Written from what is in the repo (`contracts/src/UniswapV3TwapGuard.sol`, `contracts/test/fork/BaseFork.t.sol`, `contracts/script/Deploy.s.sol`). Edit freely.
>
> Uniswap Developer Feedback Form: <!-- TODO: paste confirmation / link once submitted --> https://developers.uniswap.org/hackathon-feedback

## What we built with Uniswap

Stance sells cash-settled ETH spreads that settle from Chainlink ETH/USD. We used Uniswap as a **second opinion on the settlement price**. `UniswapV3TwapGuard` reads a 30-minute TWAP from a WETH/USDC v3 pool through `observe()`. If Chainlink and the TWAP differ by more than 1.5%, `SpreadSeries.settle` reverts with `GuardRejected`, so one bad print can't settle a range.

- On a **Base mainnet fork**, against the WETH/USDC 0.05% pool (`0xd0b53D92…F224`), the guard runs enforced. Chainlink and the 30-minute TWAP agreed within 0.4%, and a price 10% off Chainlink was refused (`test_twapAgreesWithChainlink_andRejectsOutliers`).
- On **Base Sepolia** we deployed it in monitor-only mode (`enforce = false`), for the reason in point 3 below.

## What went well

- `observe([window, 0])` is a single view call, and the tick-cumulative math is simple once you understand it. The whole guard is about 50 lines.
- The mainnet pool had plenty of history: observation cardinality was 6,700, so a 30-minute window was never in danger of reading past the oldest observation.
- Pool state was easy to inspect with `cast` (`slot0`, `token0`, `token1`, `liquidity`), which helped us debug quickly.

## Friction we hit

1. **v4 has no built-in oracle, so we used v3.** The oracle we needed lives in v3 pools; in v4 it would be a hook. We could not find a documented, deployed v4 oracle hook on Base with a liquid WETH/USDC pool, so we built on a v3 pool's `observe()`. For a new project in 2026 it felt odd to build on v3 for the one feature v4 doesn't provide. We were never sure what the recommended v4 path for a manipulation-resistant price is.

2. **Tick → price is easy to get wrong without an official 0.8 `OracleLibrary`.** We are on Solidity 0.8.30, and the published v3-periphery `OracleLibrary`/`TickMath` target older compilers. Rather than vendor and patch them, we wrote our own conversion: `1.0001^tick` computed as `expWad(tick · ln 1.0001)` with Solady. Things we had to get right by hand:
   - **Token order differs by pool.** On the Base mainnet 0.05% pool WETH is `token0`. On the Base Sepolia pool we used, USDC is `token0`. The guard has to invert the price in one case and not the other (`wethIsToken0`).
   - **Decimals.** The raw ratio is token1-per-token0 in base units, so we scale by `10^wethDecimals / 10^usdcDecimals`. We pass both decimals into the constructor by hand. Getting this wrong is off by 10^12, not by a little.
   - **Rounding of the average tick.** We divide the tick-cumulative delta with Solidity's `/`, which truncates toward zero. We later noticed that the official `consult` rounds negative ticks down (toward negative infinity). The mainnet pool's tick is negative (around −199,000), so our TWAP can be off by one tick (0.01%). That doesn't matter at a 1.5% tolerance, but it's exactly the kind of subtle difference an official 0.8 library would remove.

3. **Testnet pools are thin and mispriced.** The Base Sepolia WETH/USDC 0.3% pool (`0x46880b40…F4Ad`) has very little liquidity. Its 30-minute TWAP read about **$1,786 while Chainlink said about $2,262**, roughly 21% apart. An enforced guard would have blocked every settlement in our live demo, so on testnet we shipped it monitor-only and showed the enforced behaviour on a mainnet fork. Anything TWAP-based is hard to demo honestly on testnet today.

4. **Observation cardinality decides how long your window can be.** `observe()` reverts if the window reaches past the oldest stored observation, and how far back that goes depends on the pool's cardinality and how often it trades. Mainnet had 6,700 observations, but on a fresh or quiet pool you may need to call `increaseObservationCardinalityNext` and then wait for the pool to fill. We checked this with `cast` before choosing 30 minutes. It isn't obvious from the `observe()` docs alone how to pick a safe window for a given pool.

## What would have helped

- An **official Solidity 0.8 `OracleLibrary` + `TickMath`** package (or a clearly blessed one), including a `consult`-style helper that returns a decimals-adjusted quote for a token pair.
- A **recommended v4 oracle path**: a reference oracle hook, where it is deployed, and which pools use it.
- **Testnet pools that track a reference price**: a few WETH/USDC pools on Base Sepolia kept near Chainlink by a bot, or at least a published list of "healthy" testnet pools.
- A short guide on **choosing a TWAP window**: cardinality, trade frequency, how to check the oldest observation, and manipulation cost vs window length.
- A worked example of using a **TWAP as a sanity check against another oracle**, which seems like a common pattern.
