// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IAggregatorV3} from "../../src/interfaces/IAggregatorV3.sol";
import {ISettlementGuard} from "../../src/interfaces/ISettlementGuard.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Chainlink-style feed with explicit rounds, so tests can control settlement history.
contract MockAggregator is IAggregatorV3 {
    struct Round {
        int256 answer;
        uint256 updatedAt;
    }

    mapping(uint80 => Round) public rounds;
    uint80 public latest;

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "ETH / USD";
    }

    function push(int256 answer, uint256 updatedAt) external returns (uint80 id) {
        id = ++latest;
        rounds[id] = Round(answer, updatedAt);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        Round memory r = rounds[latest];
        return (latest, r.answer, r.updatedAt, r.updatedAt, latest);
    }

    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80) {
        Round memory r = rounds[id];
        require(r.updatedAt != 0, "No data present");
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }
}

contract MockGuard is ISettlementGuard {
    uint256 public guardPrice;
    uint256 public toleranceBps = 150;

    function set(uint256 p) external {
        guardPrice = p;
    }

    function check(uint256 price) external view returns (bool ok, uint256 g) {
        g = guardPrice;
        uint256 diff = price > g ? price - g : g - price;
        ok = diff * 10_000 <= g * toleranceBps;
    }
}
