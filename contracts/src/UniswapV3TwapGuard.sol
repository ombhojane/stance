// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {FixedPointMathLib as F} from "solady/utils/FixedPointMathLib.sol";
import {ISettlementGuard} from "./interfaces/ISettlementGuard.sol";

interface IUniswapV3PoolOracle {
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

/// @title UniswapV3TwapGuard
/// @notice Second opinion for settlement: the time-weighted ETH/USD price from a Uniswap v3
///         WETH/USDC pool. Settlement is refused if Chainlink and the TWAP disagree by more
///         than `toleranceBps`, so a single bad print can't settle a range.
contract UniswapV3TwapGuard is ISettlementGuard {
    IUniswapV3PoolOracle public immutable pool;
    uint32 public immutable window;
    uint256 public immutable toleranceBps;
    bool public immutable wethIsToken0;
    uint8 public immutable wethDecimals;
    uint8 public immutable usdcDecimals;

    int256 internal constant LN_1_0001 = 99_995_000_333_308; // ln(1.0001) in WAD

    constructor(
        IUniswapV3PoolOracle pool_,
        address weth,
        uint32 window_,
        uint256 toleranceBps_,
        uint8 wethDecimals_,
        uint8 usdcDecimals_
    ) {
        pool = pool_;
        window = window_;
        toleranceBps = toleranceBps_;
        wethIsToken0 = pool_.token0() == weth;
        wethDecimals = wethDecimals_;
        usdcDecimals = usdcDecimals_;
    }

    /// @notice ETH price in USD with 8 decimals, averaged over `window` seconds.
    function twapPrice() public view returns (uint256) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = window;
        ago[1] = 0;
        (int56[] memory cum,) = pool.observe(ago);
        int256 avgTick = int256(cum[1] - cum[0]) / int256(uint256(window));
        // token1 per token0 = 1.0001^tick (raw units)
        uint256 raw = uint256(F.expWad(avgTick * LN_1_0001)); // WAD
        // USDC per WETH, adjusted for decimals, as WAD
        uint256 px;
        if (wethIsToken0) {
            px = raw * (10 ** wethDecimals) / (10 ** usdcDecimals);
        } else {
            px = F.divWad(1e18, raw) * (10 ** wethDecimals) / (10 ** usdcDecimals);
        }
        return px / 1e10; // WAD → 8 decimals
    }

    function check(uint256 price) external view returns (bool ok, uint256 guardPrice) {
        guardPrice = twapPrice();
        uint256 diff = price > guardPrice ? price - guardPrice : guardPrice - price;
        ok = diff * 10_000 <= guardPrice * toleranceBps;
    }
}
