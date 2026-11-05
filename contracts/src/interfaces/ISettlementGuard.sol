// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Second opinion on a settlement price (e.g. a Uniswap v3 TWAP).
interface ISettlementGuard {
    /// @param price Proposed settlement price, 8 decimals (Chainlink USD feed format).
    /// @return ok True when the guard's own price agrees within tolerance.
    /// @return guardPrice The guard's price, 8 decimals, for events and the UI.
    function check(uint256 price) external view returns (bool ok, uint256 guardPrice);
}
