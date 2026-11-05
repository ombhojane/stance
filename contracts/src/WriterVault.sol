// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IAqua} from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import {SpreadSeries} from "./SpreadSeries.sol";
import {SpreadAquaApp} from "./SpreadAquaApp.sol";

/// @title WriterVault
/// @notice "Be the house" for one Stance range. Depositors pool USDC; the vault mints complete
///         sets and offers both UP and DOWN on 1inch Aqua. One USDC reserve backs both
///         strategies at once (Aqua shared liquidity). Deposits unlock after settlement.
/// @dev The vault is the Aqua maker: tokens never leave it except through Aqua pulls.
contract WriterVault is ERC20 {
    using SafeERC20 for IERC20;

    error Locked();
    error NotSettled();
    error ZeroAmount();

    event Deposited(address indexed from, address indexed to, uint256 usdc, uint256 shares);
    event Withdrawn(address indexed owner, address indexed to, uint256 shares, uint256 usdc);
    event Reshipped(bytes32 upHash, bytes32 downHash, uint256 usdcReserve, uint256 upUnits, uint256 downUnits);
    event Closed(uint256 usdcBalance);

    uint16 public constant FEE_BPS = 300; // 3% around fair value
    uint16 public constant SKEW_BPS = 3000; // up to +30% when a side sells out
    uint256 public constant MINT_BPS = 6000; // 60% of deposits become sets, 40% stays as USDC reserve

    IAqua public immutable aqua;
    SpreadAquaApp public immutable app;
    SpreadSeries public immutable series;
    IERC20 public immutable usdc;
    IERC20 public immutable upToken;
    IERC20 public immutable downToken;

    SpreadAquaApp.Strategy internal _up;
    SpreadAquaApp.Strategy internal _down;
    bytes32 public upHash;
    bytes32 public downHash;
    uint256 public nonce;
    bool public closed;

    constructor(IAqua aqua_, SpreadAquaApp app_, SpreadSeries series_, string memory name_)
        ERC20(name_, "sHOUSE")
    {
        aqua = aqua_;
        app = app_;
        series = series_;
        usdc = series_.usdc();
        upToken = IERC20(address(series_.up()));
        downToken = IERC20(address(series_.down()));
        usdc.forceApprove(address(series_), type(uint256).max);
        usdc.forceApprove(address(aqua_), type(uint256).max);
        upToken.forceApprove(address(aqua_), type(uint256).max);
        downToken.forceApprove(address(aqua_), type(uint256).max);
    }

    function decimals() public pure override returns (uint8) {
        return 6; // shares are denominated like USDC
    }

    // ── views for the app ─────────────────────────────────────────────

    /// @notice The live Aqua strategies traders use with SpreadAquaApp.buy/sell.
    function strategies() external view returns (SpreadAquaApp.Strategy memory up, SpreadAquaApp.Strategy memory down) {
        return (_up, _down);
    }

    /// @notice Net asset value in USDC: cash + inventory at fair value (or settled value).
    function totalAssets() public view returns (uint256 nav) {
        nav = usdc.balanceOf(address(this));
        uint256 upBal = upToken.balanceOf(address(this));
        uint256 downBal = downToken.balanceOf(address(this));
        if (upBal == 0 && downBal == 0) return nav;
        uint256 upUnit;
        uint256 downUnit;
        if (series.settled()) {
            upUnit = series.upPayoutPerUnit();
            downUnit = series.width() - upUnit;
        } else {
            upUnit = app.fairUnit(_up);
            downUnit = series.width() - upUnit;
        }
        nav += Math.mulDiv(upBal, upUnit, 1e18) + Math.mulDiv(downBal, downUnit, 1e18);
    }

    // ── house flows ───────────────────────────────────────────────────

    /// @notice Deposit USDC to back both sides. Locked until the range settles.
    function deposit(uint256 amount, address to) external returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();
        if (closed || block.timestamp + app.CUTOFF() >= series.expiry()) revert Locked();
        uint256 nav = totalAssets();
        uint256 supply = totalSupply();
        shares = supply == 0 || nav == 0 ? amount : Math.mulDiv(amount, supply, nav);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _mint(to, shares);

        // turn part of the deposit into complete sets, keep the rest as the shared USDC reserve
        uint256 units = Math.mulDiv(Math.mulDiv(amount, MINT_BPS, 10_000), 1e18, series.width());
        if (units > 0) series.mint(units, address(this));
        _reship();
        emit Deposited(msg.sender, to, amount, shares);
    }

    /// @notice After settlement: stop quoting, redeem every outcome token, hold only USDC.
    function close() public {
        if (closed) return;
        if (!series.settled()) revert NotSettled();
        _dockAll();
        uint256 upBal = upToken.balanceOf(address(this));
        uint256 downBal = downToken.balanceOf(address(this));
        if (upBal > 0 || downBal > 0) series.redeem(upBal, downBal, address(this));
        closed = true;
        emit Closed(usdc.balanceOf(address(this)));
    }

    /// @notice Withdraw your share of the vault's USDC once the range has settled.
    function withdraw(uint256 shares, address to) external returns (uint256 amount) {
        if (shares == 0) revert ZeroAmount();
        if (!closed) close();
        amount = Math.mulDiv(shares, usdc.balanceOf(address(this)), totalSupply());
        _burn(msg.sender, shares);
        usdc.safeTransfer(to, amount);
        emit Withdrawn(msg.sender, to, shares, amount);
    }

    // ── Aqua plumbing ─────────────────────────────────────────────────

    /// @dev Aqua strategies are immutable, so new liquidity means dock + ship with a fresh salt.
    ///      Both strategies are shipped against the same USDC reserve (shared liquidity).
    function _reship() internal {
        _dockAll();
        uint256 reserve = usdc.balanceOf(address(this));
        uint256 upBal = upToken.balanceOf(address(this));
        uint256 downBal = downToken.balanceOf(address(this));
        bytes32 salt = bytes32(++nonce);

        _up = SpreadAquaApp.Strategy(address(this), series, true, FEE_BPS, SKEW_BPS, upBal, salt);
        _down = SpreadAquaApp.Strategy(address(this), series, false, FEE_BPS, SKEW_BPS, downBal, salt);
        upHash = aqua.ship(address(app), abi.encode(_up), _pair(upToken), _amounts(reserve, upBal));
        downHash = aqua.ship(address(app), abi.encode(_down), _pair(downToken), _amounts(reserve, downBal));
        emit Reshipped(upHash, downHash, reserve, upBal, downBal);
    }

    function _dockAll() internal {
        if (upHash != bytes32(0)) {
            aqua.dock(address(app), upHash, _pair(upToken));
            aqua.dock(address(app), downHash, _pair(downToken));
            upHash = bytes32(0);
            downHash = bytes32(0);
        }
    }

    function _pair(IERC20 outcome) internal view returns (address[] memory t) {
        t = new address[](2);
        t[0] = address(usdc);
        t[1] = address(outcome);
    }

    function _amounts(uint256 a, uint256 b) internal pure returns (uint256[] memory x) {
        x = new uint256[](2);
        x[0] = a;
        x[1] = b;
    }
}
