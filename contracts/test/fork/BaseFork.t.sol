// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAqua} from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import {SpreadSeries} from "../../src/SpreadSeries.sol";
import {SpreadAquaApp} from "../../src/SpreadAquaApp.sol";
import {WriterVault} from "../../src/WriterVault.sol";
import {IAggregatorV3} from "../../src/interfaces/IAggregatorV3.sol";
import {ISettlementGuard} from "../../src/interfaces/ISettlementGuard.sol";

/// @notice Runs Stance against the real deployments on Base mainnet: the official 1inch Aqua
///         registry, Chainlink's ETH/USD feed and Circle's USDC.
///         forge test --match-path "test/fork/*" --fork-url $BASE_RPC_URL
contract BaseForkTest is Test {
    IAqua constant AQUA = IAqua(0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a);
    IAggregatorV3 constant ETH_USD = IAggregatorV3(0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70);
    IERC20 constant USDC = IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);

    SpreadAquaApp app;
    SpreadSeries series;
    WriterVault vault;
    address house = makeAddr("house");
    address alice = makeAddr("alice");

    function setUp() public {
        if (block.chainid != 8453) vm.skip(true);
        (, int256 px,,,) = ETH_USD.latestRoundData();
        uint256 spot = uint256(px);
        // a range from just above spot to +15%, rounded to $100, expiring in 3 weeks
        uint256 k1 = (spot / 100e8 + 1) * 100e8;
        uint256 k2 = ((spot * 115 / 100) / 100e8) * 100e8;
        app = new SpreadAquaApp(AQUA, ETH_USD, 0.62e18, address(this));
        series = new SpreadSeries(USDC, ETH_USD, ISettlementGuard(address(0)), k1, k2, block.timestamp + 21 days, "fork");
        vault = new WriterVault(AQUA, app, series, "Stance House fork");

        deal(address(USDC), house, 50_000e6);
        deal(address(USDC), alice, 5_000e6);
        vm.prank(house);
        USDC.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        USDC.approve(address(app), type(uint256).max);
        console2.log("ETH/USD (8dp)", spot);
        console2.log("range k1, k2 (8dp)", k1, k2);
    }

    function test_realAqua_houseAndTraderRoundTrip() public {
        vm.prank(house);
        vault.deposit(20_000e6, house);
        (SpreadAquaApp.Strategy memory up,) = vault.strategies();

        (uint256 ask, uint256 bid, uint256 fair) = app.prices(up);
        console2.log("UP fair / ask / bid (USDC 6dp)", fair, ask, bid);
        assertGt(ask, fair);
        assertLt(bid, fair);

        vm.prank(alice);
        uint256 units = app.buy(up, 250e6, 0, alice);
        IERC20 upTok = IERC20(address(series.up()));
        assertEq(upTok.balanceOf(alice), units);

        vm.startPrank(alice);
        upTok.approve(address(app), units);
        uint256 back = app.sell(up, units, 0, alice);
        vm.stopPrank();
        console2.log("bought units, sold back for", units, back);
        assertGt(back, 0);
        assertLt(back, 250e6);
    }
}

import {UniswapV3TwapGuard, IUniswapV3PoolOracle} from "../../src/UniswapV3TwapGuard.sol";

/// @notice The settlement guard against Base's real WETH/USDC 0.05% Uniswap v3 pool.
contract BaseForkGuardTest is Test {
    IUniswapV3PoolOracle constant POOL = IUniswapV3PoolOracle(0xd0b53D9277642d899DF5C87A3966A349A798F224);
    address constant WETH = 0x4200000000000000000000000000000000000006;
    IAggregatorV3 constant ETH_USD = IAggregatorV3(0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70);

    function setUp() public {
        if (block.chainid != 8453) vm.skip(true);
    }

    function test_twapAgreesWithChainlink_andRejectsOutliers() public {
        UniswapV3TwapGuard guard = new UniswapV3TwapGuard(POOL, WETH, 30 minutes, 150, 18, 6, true);
        (, int256 px,,,) = ETH_USD.latestRoundData();
        uint256 chainlink = uint256(px);
        uint256 twap = guard.twapPrice();
        console2.log("chainlink / 30m TWAP (8dp)", chainlink, twap);

        (bool ok,) = guard.check(chainlink);
        assertTrue(ok, "Chainlink and the Uniswap TWAP should agree within 1.5%");
        (bool bad,) = guard.check(chainlink * 110 / 100);
        assertFalse(bad, "a 10% off print must be refused");
    }
}
