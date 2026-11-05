// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TestUSD
/// @notice 6-decimal test dollar for the Base Sepolia demo, with a built-in faucet so anyone can
///         try Stance instantly. Mainnet uses real USDC (see test/fork).
contract TestUSD is ERC20, Ownable {
    error TooSoon(uint256 nextAt);

    uint256 public constant FAUCET_AMOUNT = 10_000e6;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;
    mapping(address => uint256) public lastDrip;

    constructor(address owner_) ERC20("Stance Test USD", "tUSD") Ownable(owner_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Get 10,000 test USD, once an hour.
    function faucet() external {
        uint256 next = lastDrip[msg.sender] + FAUCET_COOLDOWN;
        if (lastDrip[msg.sender] != 0 && block.timestamp < next) revert TooSoon(next);
        lastDrip[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Seed liquidity for the house vaults.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
