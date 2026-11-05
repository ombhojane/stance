// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {FixedPointMathLib as F} from "solady/utils/FixedPointMathLib.sol";

/// @title SpreadMath
/// @notice Black–Scholes (r = 0) pricing for a cash-settled vertical spread, in 1e18 fixed point.
///         Mirrors app/src/lib/market.ts exactly, so the price on screen is the price onchain.
library SpreadMath {
    int256 internal constant WAD = 1e18;
    uint256 internal constant UWAD = 1e18;

    // Abramowitz & Stegun 7.1.26 constants (same as the frontend)
    int256 internal constant P = 0.2316419e18;
    int256 internal constant D = 0.3989423e18;
    int256 internal constant C1 = 0.3193815e18;
    int256 internal constant C2 = -0.3565638e18;
    int256 internal constant C3 = 1.781478e18;
    int256 internal constant C4 = -1.821256e18;
    int256 internal constant C5 = 1.330274e18;

    /// @notice Standard normal CDF, input and output in WAD.
    function normCdf(int256 x) internal pure returns (uint256) {
        int256 ax = x < 0 ? -x : x;
        int256 t = F.sDivWad(WAD, WAD + F.sMulWad(P, ax));
        int256 d = F.sMulWad(D, F.expWad(-F.sMulWad(x, x) / 2));
        int256 poly = C5;
        poly = C4 + F.sMulWad(t, poly);
        poly = C3 + F.sMulWad(t, poly);
        poly = C2 + F.sMulWad(t, poly);
        poly = C1 + F.sMulWad(t, poly);
        int256 p = F.sMulWad(F.sMulWad(d, t), poly);
        if (p < 0) p = 0;
        if (p > WAD) p = WAD;
        return uint256(x > 0 ? WAD - p : p);
    }

    /// @notice Black–Scholes call price with r = 0. All arguments and the result are WAD.
    /// @param s Spot price (USD).
    /// @param k Strike (USD).
    /// @param sd Volatility times sqrt(years to expiry).
    function callPrice(uint256 s, uint256 k, uint256 sd) internal pure returns (uint256) {
        if (sd == 0) return s > k ? s - k : 0;
        int256 lnSK = F.lnWad(int256(F.divWad(s, k)));
        int256 isd = int256(sd);
        int256 d1 = F.sDivWad(lnSK + F.sMulWad(isd, isd) / 2, isd);
        int256 d2 = d1 - isd;
        uint256 a = F.mulWad(s, normCdf(d1));
        uint256 b = F.mulWad(k, normCdf(d2));
        return a > b ? a - b : 0;
    }

    /// @notice vol * sqrt(t). vol and years in WAD.
    function stdDev(uint256 vol, uint256 yrs) internal pure returns (uint256) {
        return F.mulWad(vol, F.sqrtWad(yrs));
    }

    /// @notice Fair value of one UP unit of the [k1, k2] spread, bounded to [0, k2 - k1]. WAD USD.
    function fairUp(uint256 s, uint256 k1, uint256 k2, uint256 vol, uint256 yrs) internal pure returns (uint256 v) {
        uint256 sd = stdDev(vol, yrs);
        uint256 c1 = callPrice(s, k1, sd);
        uint256 c2 = callPrice(s, k2, sd);
        v = c1 > c2 ? c1 - c2 : 0;
        uint256 w = k2 - k1;
        if (v > w) v = w;
    }

    /// @notice P(S_T > x) under a lognormal with r = 0. WAD.
    function chanceAbove(uint256 s, uint256 x, uint256 vol, uint256 yrs) internal pure returns (uint256) {
        uint256 sd = stdDev(vol, yrs);
        if (sd == 0) return s > x ? UWAD : 0;
        int256 isd = int256(sd);
        int256 d2 = F.sDivWad(F.lnWad(int256(F.divWad(s, x))) - F.sMulWad(isd, isd) / 2, isd);
        return normCdf(d2);
    }
}
