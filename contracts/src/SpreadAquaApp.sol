// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AquaApp} from "@1inch/aqua/contracts/AquaApp.sol";
import {IAqua} from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import {SpreadSeries} from "./SpreadSeries.sol";
import {SpreadMath} from "./lib/SpreadMath.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

/// @title SpreadAquaApp
/// @notice 1inch Aqua app that makes markets in Stance outcome tokens (UP or DOWN) against USDC.
///         Liquidity stays in the maker's wallet (the WriterVault) and is shared through Aqua.
///         Price = Black–Scholes fair value of the spread (Chainlink spot, owner-set vol)
///         ± a fee, shifted by inventory: the more of a side has sold, the pricier it gets,
///         so the maker rebalances itself without anyone watching.
/// @dev Uses Aqua's "direct transfer" pattern, so plain wallets can trade without a callback.
contract SpreadAquaApp is AquaApp, Ownable {
    using SafeERC20 for IERC20;

    struct Strategy {
        address maker; // the WriterVault (or any LP)
        SpreadSeries series;
        bool isUp; // true: trades UP, false: trades DOWN
        uint16 feeBps; // spread around fair value
        uint16 skewBps; // max price lift when the whole inventory has sold
        uint256 depth; // outcome units shipped, the reference for inventory skew
        bytes32 salt;
    }

    error TradingClosed();
    error StalePrice();
    error Slippage(uint256 got, uint256 limit);
    error ZeroAmount();

    event Bought(address indexed taker, address indexed series, bool isUp, uint256 usdcIn, uint256 unitsOut, uint256 ask);
    event Sold(address indexed taker, address indexed series, bool isUp, uint256 unitsIn, uint256 usdcOut, uint256 bid);
    event VolSet(uint256 vol);

    uint256 internal constant BPS = 10_000;
    uint256 internal constant UNIT = 1e18;
    /// @notice Trading stops this long before expiry.
    uint256 public constant CUTOFF = 5 minutes;

    IAggregatorV3 public immutable feed;
    /// @notice Annualised volatility used for fair value, WAD (0.62e18 = 62%).
    uint256 public vol;
    /// @notice Oldest acceptable Chainlink update for pricing.
    uint256 public maxPriceAge = 1 days;

    constructor(IAqua aqua_, IAggregatorV3 feed_, uint256 vol_, address owner_) AquaApp(aqua_) Ownable(owner_) {
        feed = feed_;
        vol = vol_;
    }

    function setVol(uint256 vol_) external onlyOwner {
        vol = vol_;
        emit VolSet(vol_);
    }

    function setMaxPriceAge(uint256 age) external onlyOwner {
        maxPriceAge = age;
    }

    // ── pricing ───────────────────────────────────────────────────────

    function strategyHash(Strategy calldata s) public pure returns (bytes32) {
        return keccak256(abi.encode(s));
    }

    function tokens(Strategy calldata s) public view returns (IERC20 usdc, IERC20 outcome) {
        usdc = s.series.usdc();
        outcome = s.isUp ? IERC20(address(s.series.up())) : IERC20(address(s.series.down()));
    }

    /// @notice Chainlink spot in 8 decimals.
    function spot() public view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        if (answer <= 0 || block.timestamp - updatedAt > maxPriceAge) revert StalePrice();
        return uint256(answer);
    }

    /// @notice Fair value of one unit of this side, in USDC (6dp).
    function fairUnit(Strategy calldata s) public view returns (uint256) {
        SpreadSeries series = s.series;
        uint256 exp = series.expiry();
        uint256 years_ = exp > block.timestamp ? Math.mulDiv(exp - block.timestamp, 1e18, 365 days) : 0;
        // 8dp → WAD
        uint256 fu = SpreadMath.fairUp(spot() * 1e10, series.k1() * 1e10, series.k2() * 1e10, vol, years_);
        uint256 fairUpUsdc = fu / 1e12; // WAD USD → 6dp USDC
        uint256 w = series.width();
        if (fairUpUsdc > w) fairUpUsdc = w;
        return s.isUp ? fairUpUsdc : w - fairUpUsdc;
    }

    /// @notice Current ask (buy) and bid (sell back) per unit in USDC, plus fair value.
    function prices(Strategy calldata s) public view returns (uint256 ask, uint256 bid, uint256 fair) {
        fair = fairUnit(s);
        uint256 w = s.series.width();
        (IERC20 usdc, IERC20 outcome) = tokens(s);
        (, uint256 inventory) = AQUA.safeBalances(s.maker, address(this), strategyHash(s), address(usdc), address(outcome));
        uint256 soldBps = s.depth > inventory ? Math.mulDiv(s.depth - inventory, BPS, s.depth) : 0;
        uint256 lift = BPS + Math.mulDiv(s.skewBps, soldBps, BPS);

        uint256 floor_ = w / 250; // 0.4% of width: long shots are never free
        uint256 base = fair < floor_ ? floor_ : fair;
        ask = Math.mulDiv(Math.mulDiv(base, BPS + s.feeBps, BPS), lift, BPS);
        uint256 cap = Math.mulDiv(w, 99, 100);
        if (ask > cap) ask = cap;
        bid = Math.mulDiv(Math.mulDiv(fair, BPS - s.feeBps, BPS), lift, BPS);
        if (bid >= ask) bid = ask > 0 ? ask - 1 : 0;
    }

    function quoteBuy(Strategy calldata s, uint256 usdcIn) external view returns (uint256 unitsOut, uint256 ask) {
        (ask,,) = prices(s);
        unitsOut = Math.mulDiv(usdcIn, UNIT, ask);
    }

    function quoteSell(Strategy calldata s, uint256 unitsIn) external view returns (uint256 usdcOut, uint256 bid) {
        (, bid,) = prices(s);
        usdcOut = Math.mulDiv(unitsIn, bid, UNIT);
    }

    // ── trading ───────────────────────────────────────────────────────

    /// @notice Pay `usdcIn` USDC, receive outcome units from the maker's Aqua liquidity.
    function buy(Strategy calldata s, uint256 usdcIn, uint256 minUnits, address to)
        external
        nonReentrantStrategy(s.maker, keccak256(abi.encode(s)))
        returns (uint256 unitsOut)
    {
        _open(s);
        if (usdcIn == 0) revert ZeroAmount();
        bytes32 h = strategyHash(s);
        (IERC20 usdc, IERC20 outcome) = tokens(s);
        (uint256 ask,,) = prices(s);
        unitsOut = Math.mulDiv(usdcIn, UNIT, ask);
        if (unitsOut < minUnits) revert Slippage(unitsOut, minUnits);

        AQUA.pull(s.maker, h, address(outcome), unitsOut, to);
        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);
        usdc.forceApprove(address(AQUA), usdcIn);
        AQUA.push(s.maker, address(this), h, address(usdc), usdcIn);
        emit Bought(msg.sender, address(s.series), s.isUp, usdcIn, unitsOut, ask);
    }

    /// @notice Sell `unitsIn` outcome units back to the maker for USDC.
    function sell(Strategy calldata s, uint256 unitsIn, uint256 minUsdc, address to)
        external
        nonReentrantStrategy(s.maker, keccak256(abi.encode(s)))
        returns (uint256 usdcOut)
    {
        _open(s);
        if (unitsIn == 0) revert ZeroAmount();
        bytes32 h = strategyHash(s);
        (IERC20 usdc, IERC20 outcome) = tokens(s);
        (, uint256 bid,) = prices(s);
        usdcOut = Math.mulDiv(unitsIn, bid, UNIT);
        if (usdcOut < minUsdc) revert Slippage(usdcOut, minUsdc);

        AQUA.pull(s.maker, h, address(usdc), usdcOut, to);
        outcome.safeTransferFrom(msg.sender, address(this), unitsIn);
        outcome.forceApprove(address(AQUA), unitsIn);
        AQUA.push(s.maker, address(this), h, address(outcome), unitsIn);
        emit Sold(msg.sender, address(s.series), s.isUp, unitsIn, usdcOut, bid);
    }

    function _open(Strategy calldata s) internal view {
        if (block.timestamp + CUTOFF >= s.series.expiry()) revert TradingClosed();
    }
}
