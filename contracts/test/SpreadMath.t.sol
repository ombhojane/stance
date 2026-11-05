// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {SpreadMath} from "../src/lib/SpreadMath.sol";

/// @notice The onchain math must match the app (app/src/lib/market.ts). Reference values
///         were computed with the same Abramowitz–Stegun normal CDF in Python.
contract SpreadMathTest is Test {
    uint256 constant VOL = 0.62e18;
    // Nov 6 12:00 UTC → Nov 27 08:00 UTC, in years
    uint256 constant T = uint256(1795766400 - 1793966400) * 1e18 / uint256(365 days);

    function test_normCdf_matchesReference() public pure {
        assertApproxEqAbs(SpreadMath.normCdf(-3e18), 0.00134997e18, 1e11);
        assertApproxEqAbs(SpreadMath.normCdf(-1e18), 0.15865523e18, 1e11);
        assertApproxEqAbs(SpreadMath.normCdf(0), 0.49999985e18, 1e11);
        assertApproxEqAbs(SpreadMath.normCdf(0.5e18), 0.69146254e18, 1e11);
        assertApproxEqAbs(SpreadMath.normCdf(2e18), 0.97724994e18, 1e11);
    }

    function test_fairUp_matchesApp() public pure {
        // ETH 2575, range 2600–3000, Nov 27: the hero's default stance
        assertApproxEqRel(SpreadMath.fairUp(2575e18, 2600e18, 3000e18, VOL, T), 108.341904e18, 1e14); // 0.01%
        assertApproxEqRel(SpreadMath.fairUp(2575e18, 2300e18, 2600e18, VOL, T), 180.610229e18, 1e14);
        assertApproxEqRel(SpreadMath.fairUp(2575e18, 2000e18, 2400e18, VOL, T), 330.451248e18, 1e14);
    }

    function test_chanceAbove_matchesApp() public pure {
        assertApproxEqRel(SpreadMath.chanceAbove(2575e18, 3000e18, VOL, T), 0.134497e18, 1e14);
    }

    function test_atExpiry_isIntrinsic() public pure {
        assertEq(SpreadMath.fairUp(2800e18, 2600e18, 3000e18, VOL, 0), 200e18);
        assertEq(SpreadMath.fairUp(3500e18, 2600e18, 3000e18, VOL, 0), 400e18);
        assertEq(SpreadMath.fairUp(2000e18, 2600e18, 3000e18, VOL, 0), 0);
    }

    /// Fair value always stays inside [0, width] and is monotone in spot.
    function testFuzz_fairUp_bounded_and_monotone(uint256 s, uint256 days_) public pure {
        s = bound(s, 500e18, 10_000e18);
        days_ = bound(days_, 1, 400);
        uint256 t = days_ * 1e18 / 365;
        uint256 a = SpreadMath.fairUp(s, 2600e18, 3000e18, VOL, t);
        uint256 b = SpreadMath.fairUp(s + 50e18, 2600e18, 3000e18, VOL, t);
        assertLe(a, 400e18);
        assertGe(b + 1e12, a); // monotone up to rounding dust
    }
}
