// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title OutcomeToken
/// @notice One half of a Stance complete set (UP or DOWN). Only its series can mint or burn.
contract OutcomeToken is ERC20 {
    error OnlySeries();

    address public immutable series;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        series = msg.sender;
    }

    modifier onlySeries() {
        if (msg.sender != series) revert OnlySeries();
        _;
    }

    function mint(address to, uint256 amount) external onlySeries {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlySeries {
        _burn(from, amount);
    }
}
