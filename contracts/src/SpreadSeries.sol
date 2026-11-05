// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {OutcomeToken} from "./OutcomeToken.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {ISettlementGuard} from "./interfaces/ISettlementGuard.sol";

/// @title SpreadSeries
/// @notice A cash-settled ETH vertical spread sold as complete sets.
///         Lock (k2 - k1) USDC per unit → receive 1 UP + 1 DOWN.
///         At expiry UP pays clamp(S - k1, 0, W) and DOWN pays W minus that, so
///         UP + DOWN always equals the collateral: the series can never owe more than it holds.
/// @dev Strikes and prices use the Chainlink feed's 8 decimals. Outcome tokens use 18 decimals
///      (1e18 = one unit). USDC uses 6 decimals.
contract SpreadSeries {
    using SafeERC20 for IERC20;

    error NotExpired();
    error AlreadySettled();
    error NotSettled();
    error TradingClosed();
    error InvalidRound();
    error GuardRejected(uint256 price, uint256 guardPrice);
    error ZeroAmount();

    event Minted(address indexed by, address indexed to, uint256 units, uint256 collateral);
    event Burned(address indexed by, address indexed to, uint256 units, uint256 collateral);
    event Settled(uint80 roundId, uint256 price, uint256 guardPrice, uint256 upPayoutPerUnit);
    event Redeemed(address indexed by, address indexed to, uint256 upUnits, uint256 downUnits, uint256 paid);

    uint256 public constant UNIT = 1e18;
    /// @dev 8-decimal USD → 6-decimal USDC
    uint256 internal constant PRICE_TO_USDC = 100;
    /// @notice A settlement round must be reported within this window after expiry.
    uint256 public constant MAX_SETTLEMENT_DELAY = 1 days;

    IERC20 public immutable usdc;
    IAggregatorV3 public immutable feed;
    ISettlementGuard public immutable guard; // optional (address(0) = no guard)
    uint256 public immutable k1; // 8 decimals
    uint256 public immutable k2; // 8 decimals
    uint256 public immutable expiry; // unix seconds
    OutcomeToken public immutable up;
    OutcomeToken public immutable down;

    bool public settled;
    uint256 public settlePrice; // 8 decimals
    /// @notice USDC (6dp) paid per 1e18 UP after settlement; DOWN gets width() minus this.
    uint256 public upPayoutPerUnit;

    constructor(
        IERC20 usdc_,
        IAggregatorV3 feed_,
        ISettlementGuard guard_,
        uint256 k1_,
        uint256 k2_,
        uint256 expiry_,
        string memory label
    ) {
        require(k2_ > k1_ && k1_ > 0, "strikes");
        require(expiry_ > block.timestamp, "expiry");
        usdc = usdc_;
        feed = feed_;
        guard = guard_;
        k1 = k1_;
        k2 = k2_;
        expiry = expiry_;
        up = new OutcomeToken(string.concat("Stance UP ", label), "sUP");
        down = new OutcomeToken(string.concat("Stance DOWN ", label), "sDOWN");
    }

    // ── views ─────────────────────────────────────────────────────────

    /// @notice USDC (6dp) per unit: the most one UP or one DOWN can ever pay.
    function width() public view returns (uint256) {
        return (k2 - k1) / PRICE_TO_USDC;
    }

    /// @notice USDC needed to mint `units` complete sets (rounded up).
    function collateralFor(uint256 units) public view returns (uint256) {
        return Math.mulDiv(units, k2 - k1, UNIT * PRICE_TO_USDC, Math.Rounding.Ceil);
    }

    /// @notice USDC (6dp) per unit UP would pay if ETH ended at `price` (8dp).
    function upPayoutAt(uint256 price) public view returns (uint256) {
        if (price <= k1) return 0;
        if (price >= k2) return width();
        return (price - k1) / PRICE_TO_USDC;
    }

    // ── complete sets ─────────────────────────────────────────────────

    /// @notice Lock USDC, receive `units` UP and `units` DOWN.
    function mint(uint256 units, address to) external returns (uint256 collateral) {
        if (units == 0) revert ZeroAmount();
        if (block.timestamp >= expiry) revert TradingClosed();
        collateral = collateralFor(units);
        usdc.safeTransferFrom(msg.sender, address(this), collateral);
        up.mint(to, units);
        down.mint(to, units);
        emit Minted(msg.sender, to, units, collateral);
    }

    /// @notice Return `units` UP + `units` DOWN for their USDC, any time before settlement.
    function burn(uint256 units, address to) external returns (uint256 collateral) {
        if (units == 0) revert ZeroAmount();
        if (settled) revert AlreadySettled();
        collateral = Math.mulDiv(units, k2 - k1, UNIT * PRICE_TO_USDC);
        up.burn(msg.sender, units);
        down.burn(msg.sender, units);
        usdc.safeTransfer(to, collateral);
        emit Burned(msg.sender, to, units, collateral);
    }

    // ── settlement ────────────────────────────────────────────────────

    /// @notice Settle with the first Chainlink round at or after expiry. Anyone can call;
    ///         the CRE workflow does it automatically. The previous round must be before
    ///         expiry, so nobody can cherry-pick a later, more convenient price.
    function settle(uint80 roundId) external {
        if (settled) revert AlreadySettled();
        if (block.timestamp < expiry) revert NotExpired();

        (, int256 answer,, uint256 updatedAt,) = feed.getRoundData(roundId);
        if (answer <= 0 || updatedAt < expiry || updatedAt > expiry + MAX_SETTLEMENT_DELAY) revert InvalidRound();
        if (roundId > 0) {
            try feed.getRoundData(roundId - 1) returns (uint80, int256, uint256, uint256 prevUpdatedAt, uint80) {
                if (prevUpdatedAt >= expiry) revert InvalidRound();
            } catch {} // phase boundary: no earlier round in this phase
        }

        uint256 price = uint256(answer);
        uint256 guardPrice;
        if (address(guard) != address(0)) {
            bool ok;
            (ok, guardPrice) = guard.check(price);
            if (!ok) revert GuardRejected(price, guardPrice);
        }

        settled = true;
        settlePrice = price;
        upPayoutPerUnit = upPayoutAt(price);
        emit Settled(roundId, price, guardPrice, upPayoutPerUnit);
    }

    /// @notice After settlement, burn outcome tokens for their USDC.
    function redeem(uint256 upUnits, uint256 downUnits, address to) external returns (uint256 paid) {
        if (!settled) revert NotSettled();
        if (upUnits > 0) {
            up.burn(msg.sender, upUnits);
            paid += Math.mulDiv(upUnits, upPayoutPerUnit, UNIT);
        }
        if (downUnits > 0) {
            down.burn(msg.sender, downUnits);
            paid += Math.mulDiv(downUnits, width() - upPayoutPerUnit, UNIT);
        }
        if (paid > 0) usdc.safeTransfer(to, paid);
        emit Redeemed(msg.sender, to, upUnits, downUnits, paid);
    }
}
