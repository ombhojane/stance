// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AquaRouter} from "@1inch/aqua/contracts/AquaRouter.sol";
import {IAqua} from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import {SpreadSeries} from "../src/SpreadSeries.sol";
import {SpreadAquaApp} from "../src/SpreadAquaApp.sol";
import {ISettlementGuard} from "../src/interfaces/ISettlementGuard.sol";
import {MockUSDC, MockAggregator} from "./mocks/Mocks.sol";

/// @notice Trades against the official Aqua registry code (AquaRouter from 1inch/aqua).
contract SpreadAquaAppTest is Test {
    uint256 constant NOW = 1793966400; // Nov 6 2026 12:00 UTC
    uint256 constant EXPIRY = 1795766400; // Nov 27 2026 08:00 UTC

    MockUSDC usdc;
    MockAggregator feed;
    IAqua aqua;
    SpreadSeries series;
    SpreadAquaApp app;
    SpreadAquaApp.Strategy strat;
    IERC20 up;
    address lp = makeAddr("lp");
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(NOW);
        usdc = new MockUSDC();
        feed = new MockAggregator();
        feed.push(2575e8, NOW);
        aqua = IAqua(address(new AquaRouter(address(this))));
        series = new SpreadSeries(usdc, feed, ISettlementGuard(address(0)), 2600e8, 3000e8, EXPIRY, "ETH 2600-3000 Nov27");
        app = new SpreadAquaApp(aqua, feed, 0.62e18, address(this));
        up = IERC20(address(series.up()));

        // LP mints 100 sets, keeps the USDC reserve and the UP inventory in its own wallet
        usdc.mint(lp, 100_000e6);
        vm.startPrank(lp);
        usdc.approve(address(series), type(uint256).max);
        series.mint(100e18, lp);
        usdc.approve(address(aqua), type(uint256).max);
        up.approve(address(aqua), type(uint256).max);
        strat = SpreadAquaApp.Strategy({
            maker: lp, series: series, isUp: true, feeBps: 300, skewBps: 3000, depth: 100e18, salt: bytes32(0)
        });
        address[] memory toks = new address[](2);
        toks[0] = address(usdc);
        toks[1] = address(up);
        uint256[] memory amts = new uint256[](2);
        amts[0] = 20_000e6;
        amts[1] = 100e18;
        aqua.ship(address(app), abi.encode(strat), toks, amts);
        vm.stopPrank();

        usdc.mint(alice, 10_000e6);
        vm.prank(alice);
        usdc.approve(address(app), type(uint256).max);
    }

    function test_fairValue_matchesApp() public view {
        (uint256 ask, uint256 bid, uint256 fair) = app.prices(strat);
        assertApproxEqRel(fair, 108.341904e6, 1e15); // 0.1%
        assertApproxEqRel(ask, uint256(111_592_161), 2e15); // fair × 1.03
        assertLt(bid, fair);
    }

    function test_buy_thenSellBack() public {
        // The hero's default stance: make $500 if ETH > $3,000 by Nov 27 → pay ≈ $193
        vm.prank(alice);
        uint256 units = app.buy(strat, 193.46e6, 0, alice);
        assertApproxEqRel(units, 1.73e18, 0.01e18);
        assertEq(up.balanceOf(alice), units);
        // the LP's USDC went up by exactly what Alice paid, its UP down by what she got
        assertEq(usdc.balanceOf(lp), 100_000e6 - 40_000e6 + 193.46e6);
        assertEq(up.balanceOf(lp), 100e18 - units);

        vm.startPrank(alice);
        up.approve(address(app), units);
        uint256 back = app.sell(strat, units, 0, alice);
        vm.stopPrank();
        assertLt(back, 193.46e6); // round trip costs the spread
        assertGt(back, 193.46e6 * 90 / 100);
        assertEq(up.balanceOf(alice), 0);
    }

    function test_inventorySkew_raisesAskAsUpSells() public {
        (uint256 askBefore,,) = app.prices(strat);
        vm.prank(alice);
        app.buy(strat, 5_000e6, 0, alice); // ~45% of the UP inventory
        (uint256 askAfter,,) = app.prices(strat);
        assertGt(askAfter, askBefore * 110 / 100);
    }

    function test_slippageProtection() public {
        vm.prank(alice);
        vm.expectRevert();
        app.buy(strat, 100e6, 10e18, alice);
    }

    function test_tradingClosesBeforeExpiry() public {
        vm.warp(EXPIRY - 1 minutes);
        feed.push(2575e8, EXPIRY - 1 minutes);
        vm.prank(alice);
        vm.expectRevert(SpreadAquaApp.TradingClosed.selector);
        app.buy(strat, 100e6, 0, alice);
    }

    function test_stalePriceRefusesToQuote() public {
        vm.warp(NOW + 2 days);
        vm.expectRevert(SpreadAquaApp.StalePrice.selector);
        app.prices(strat);
    }
}
