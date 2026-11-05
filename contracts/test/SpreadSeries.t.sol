// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SpreadSeries} from "../src/SpreadSeries.sol";
import {ISettlementGuard} from "../src/interfaces/ISettlementGuard.sol";
import {MockUSDC, MockAggregator, MockGuard} from "./mocks/Mocks.sol";

contract SpreadSeriesTest is Test {
    uint256 constant NOW = 1793966400; // Nov 6 2026 12:00 UTC
    uint256 constant EXPIRY = 1795766400; // Nov 27 2026 08:00 UTC

    MockUSDC usdc;
    MockAggregator feed;
    MockGuard guard;
    SpreadSeries series;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.warp(NOW);
        usdc = new MockUSDC();
        feed = new MockAggregator();
        guard = new MockGuard();
        feed.push(2575e8, NOW);
        series = new SpreadSeries(usdc, feed, guard, 2600e8, 3000e8, EXPIRY, "ETH 2600-3000 Nov27");
        usdc.mint(alice, 1_000_000e6);
        vm.prank(alice);
        usdc.approve(address(series), type(uint256).max);
    }

    function test_mint_locksWidthPerUnit() public {
        vm.prank(alice);
        uint256 paid = series.mint(3e18, alice);
        assertEq(paid, 1200e6); // 3 units × $400
        assertEq(series.up().balanceOf(alice), 3e18);
        assertEq(series.down().balanceOf(alice), 3e18);
        assertEq(usdc.balanceOf(address(series)), 1200e6);
    }

    function test_burn_returnsCollateral() public {
        vm.startPrank(alice);
        series.mint(2e18, alice);
        uint256 back = series.burn(2e18, alice);
        vm.stopPrank();
        assertEq(back, 800e6);
        assertEq(usdc.balanceOf(address(series)), 0);
    }

    function _settleAt(int256 price) internal returns (uint80 id) {
        feed.push(2700e8, EXPIRY - 1 hours); // last round before expiry
        id = feed.push(price, EXPIRY + 30); // first round at/after expiry
        guard.set(uint256(price));
        vm.warp(EXPIRY + 60);
        series.settle(id);
    }

    function test_settle_inRange_paysRamp() public {
        vm.prank(alice);
        series.mint(1e18, alice);
        _settleAt(2850e8);
        assertEq(series.upPayoutPerUnit(), 250e6);
        vm.prank(alice);
        uint256 paid = series.redeem(1e18, 1e18, alice);
        assertEq(paid, 400e6); // UP 250 + DOWN 150 = full collateral back
    }

    function test_settle_aboveRange_upGetsAll() public {
        vm.prank(alice);
        series.mint(1e18, alice);
        IERC20 upTok = IERC20(address(series.up()));
        vm.prank(alice);
        upTok.transfer(bob, 1e18);
        _settleAt(3400e8);
        vm.prank(bob);
        assertEq(series.redeem(1e18, 0, bob), 400e6);
        vm.prank(alice);
        assertEq(series.redeem(0, 1e18, alice), 0);
    }

    function test_settle_rejectsCherryPickedLaterRound() public {
        feed.push(2700e8, EXPIRY - 1 hours);
        feed.push(2900e8, EXPIRY + 30); // the honest round
        uint80 later = feed.push(3200e8, EXPIRY + 600); // a later, more convenient one
        guard.set(3200e8);
        vm.warp(EXPIRY + 700);
        vm.expectRevert(SpreadSeries.InvalidRound.selector);
        series.settle(later);
    }

    function test_settle_rejectsBeforeExpiry() public {
        uint80 id = feed.push(2900e8, NOW + 1);
        vm.expectRevert(SpreadSeries.NotExpired.selector);
        series.settle(id);
    }

    function test_settle_guardBlocksManipulatedPrice() public {
        feed.push(2700e8, EXPIRY - 1 hours);
        uint80 id = feed.push(2900e8, EXPIRY + 30);
        guard.set(2700e8); // TWAP disagrees by >1.5%
        vm.warp(EXPIRY + 60);
        vm.expectRevert(abi.encodeWithSelector(SpreadSeries.GuardRejected.selector, 2900e8, 2700e8));
        series.settle(id);
    }

    function test_noMintAfterExpiry() public {
        vm.warp(EXPIRY);
        vm.prank(alice);
        vm.expectRevert(SpreadSeries.TradingClosed.selector);
        series.mint(1e18, alice);
    }

    /// The series can never owe more than it holds, whatever the price and whoever redeems.
    function testFuzz_solvent(uint256 units, uint256 upShare, int256 price) public {
        units = bound(units, 1, 1_000e18);
        upShare = bound(upShare, 0, units);
        price = int256(bound(uint256(price), 1e8, 20_000e8));
        vm.prank(alice);
        series.mint(units, alice);
        IERC20 upTok = IERC20(address(series.up()));
        vm.prank(alice);
        upTok.transfer(bob, upShare);

        feed.push(2700e8, EXPIRY - 1 hours);
        uint80 id = feed.push(price, EXPIRY + 30);
        guard.set(uint256(price));
        vm.warp(EXPIRY + 60);
        series.settle(id);

        uint256 held = usdc.balanceOf(address(series));
        vm.prank(bob);
        uint256 a = series.redeem(upShare, 0, bob);
        vm.prank(alice);
        uint256 b = series.redeem(units - upShare, units, alice);
        assertLe(a + b, held);
        assertLe(held - (a + b), 3); // only rounding dust stays behind
    }

    function test_worksWithoutGuard() public {
        SpreadSeries s = new SpreadSeries(usdc, feed, ISettlementGuard(address(0)), 2600e8, 3000e8, EXPIRY, "x");
        feed.push(2700e8, EXPIRY - 1 hours);
        uint80 id = feed.push(2900e8, EXPIRY + 30);
        vm.warp(EXPIRY + 60);
        s.settle(id);
        assertEq(s.settlePrice(), 2900e8);
        assertEq(address(IERC20(address(s.usdc()))), address(usdc));
    }
}
