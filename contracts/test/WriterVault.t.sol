// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AquaRouter} from "@1inch/aqua/contracts/AquaRouter.sol";
import {IAqua} from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import {SpreadSeries} from "../src/SpreadSeries.sol";
import {SpreadAquaApp} from "../src/SpreadAquaApp.sol";
import {WriterVault} from "../src/WriterVault.sol";
import {StanceMarket} from "../src/StanceMarket.sol";
import {SettlementReceiver} from "../src/SettlementReceiver.sol";
import {ISettlementGuard} from "../src/interfaces/ISettlementGuard.sol";
import {MockUSDC, MockAggregator} from "./mocks/Mocks.sol";

/// @notice End to end: the house deposits, traders take stances on both sides through Aqua,
///         Chainlink CRE settles via the receiver, everyone collects.
contract WriterVaultTest is Test {
    uint256 constant NOW = 1793966400; // Nov 6 2026 12:00 UTC
    uint256 constant EXPIRY = 1795766400; // Nov 27 2026 08:00 UTC

    MockUSDC usdc;
    MockAggregator feed;
    IAqua aqua;
    SpreadAquaApp app;
    SpreadSeries series;
    WriterVault vault;
    StanceMarket market;
    SettlementReceiver receiver;
    address house = makeAddr("house");
    address alice = makeAddr("alice"); // thinks ETH goes up
    address bob = makeAddr("bob"); // thinks ETH goes down
    address forwarder = makeAddr("creForwarder");

    function setUp() public {
        vm.warp(NOW);
        usdc = new MockUSDC();
        feed = new MockAggregator();
        feed.push(2575e8, NOW);
        aqua = IAqua(address(new AquaRouter(address(this))));
        app = new SpreadAquaApp(aqua, feed, 0.62e18, address(this));
        series = new SpreadSeries(usdc, feed, ISettlementGuard(address(0)), 2600e8, 3000e8, EXPIRY, "ETH 2600-3000 Nov27");
        vault = new WriterVault(aqua, app, series, "Stance House ETH 2600-3000 Nov27");
        market = new StanceMarket(app, address(this));
        market.register(series, vault);
        receiver = new SettlementReceiver(forwarder, address(this));

        for (uint256 i; i < 3; ++i) {
            address who = [house, alice, bob][i];
            usdc.mint(who, 100_000e6);
            vm.startPrank(who);
            usdc.approve(address(vault), type(uint256).max);
            usdc.approve(address(app), type(uint256).max);
            vm.stopPrank();
        }
    }

    function test_deposit_shipsBothSidesOnAqua() public {
        vm.prank(house);
        uint256 shares = vault.deposit(10_000e6, house);
        assertEq(shares, 10_000e6);
        // 60% became sets: 6,000 / 400 = 15 units of UP and DOWN; 4,000 USDC stays as reserve
        assertEq(IERC20(address(series.up())).balanceOf(address(vault)), 15e18);
        assertEq(IERC20(address(series.down())).balanceOf(address(vault)), 15e18);
        assertEq(usdc.balanceOf(address(vault)), 4_000e6);
        (SpreadAquaApp.Strategy memory up, SpreadAquaApp.Strategy memory down) = vault.strategies();
        assertTrue(up.isUp && !down.isUp);
        assertEq(up.depth, 15e18);
        assertEq(market.rangeCount(), 1);
    }

    function test_fullLifecycle() public {
        vm.prank(house);
        vault.deposit(10_000e6, house);
        (SpreadAquaApp.Strategy memory up, SpreadAquaApp.Strategy memory down) = vault.strategies();

        vm.prank(alice);
        uint256 aliceUp = app.buy(up, 193.46e6, 0, alice);
        vm.prank(bob);
        uint256 bobDown = app.buy(down, 250e6, 0, bob);
        assertGt(aliceUp, 0);
        assertGt(bobDown, 0);

        // a second house deposit reships with fresh liquidity; traders keep their tokens
        vm.prank(house);
        vault.deposit(2_000e6, house);

        // expiry: ETH ends at $2,850 → UP pays $250/unit, DOWN pays $150/unit
        feed.push(2800e8, EXPIRY - 1 hours);
        uint80 round = feed.push(2850e8, EXPIRY + 30);
        vm.warp(EXPIRY + 120);

        address[] memory s = new address[](1);
        s[0] = address(series);
        address[] memory v = new address[](1);
        v[0] = address(vault);
        uint80[] memory r = new uint80[](1);
        r[0] = round;
        vm.prank(forwarder);
        receiver.onReport("", abi.encode(s, v, r));
        assertTrue(series.settled());
        assertTrue(vault.closed());

        vm.prank(alice);
        uint256 aliceGot = series.redeem(aliceUp, 0, alice);
        assertApproxEqRel(aliceGot, aliceUp * 250 / 1e12, 1e15);
        vm.prank(bob);
        series.redeem(0, bobDown, bob);

        uint256 houseShares = vault.balanceOf(house);
        vm.prank(house);
        uint256 houseGot = vault.withdraw(houseShares, house);
        // the house is paid out exactly what the vault holds; nothing is stranded
        assertEq(usdc.balanceOf(address(vault)), 0);
        assertGt(houseGot, 0);
    }

    function test_withdrawLockedUntilSettled() public {
        vm.prank(house);
        vault.deposit(1_000e6, house);
        vm.prank(house);
        vm.expectRevert(WriterVault.NotSettled.selector);
        vault.withdraw(1_000e6, house);
    }

    function test_receiver_rejectsStrangers() public {
        vm.expectRevert(abi.encodeWithSelector(SettlementReceiver.NotForwarder.selector, address(this)));
        receiver.onReport("", abi.encode(new address[](0), new address[](0), new uint80[](0)));
    }

    function test_receiver_skipsBadEntryWithoutBlockingBatch() public {
        vm.warp(EXPIRY + 120);
        address[] memory s = new address[](1);
        s[0] = address(series);
        address[] memory v = new address[](1);
        uint80[] memory r = new uint80[](1);
        r[0] = 999; // no such round
        vm.prank(forwarder);
        receiver.onReport("", abi.encode(s, v, r)); // does not revert
        assertFalse(series.settled());
    }
}
