// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SpreadSeries} from "./SpreadSeries.sol";
import {WriterVault} from "./WriterVault.sol";

/// @notice Chainlink CRE consumer interface: the Forwarder delivers signed reports here.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title SettlementReceiver
/// @notice Target of the Stance CRE workflow. On a cron schedule the workflow finds ranges that
///         have expired, picks the first Chainlink round at or after expiry, and sends a report
///         here; this contract settles the series and closes its house vault.
/// @dev `settle` is permissionless and self-validating, so the forwarder check only stops spam.
contract SettlementReceiver is IReceiver, Ownable {
    error NotForwarder(address sender);

    event ForwarderSet(address forwarder);
    event Settlement(address indexed series, uint80 roundId, bool ok, bytes reason);

    address public forwarder;

    constructor(address forwarder_, address owner_) Ownable(owner_) {
        forwarder = forwarder_;
    }

    function setForwarder(address f) external onlyOwner {
        forwarder = f;
        emit ForwarderSet(f);
    }

    /// @param report abi.encode(address[] series, address[] vaults, uint80[] roundIds)
    function onReport(bytes calldata, bytes calldata report) external {
        if (forwarder != address(0) && msg.sender != forwarder) revert NotForwarder(msg.sender);
        (address[] memory series, address[] memory vaults, uint80[] memory roundIds) =
            abi.decode(report, (address[], address[], uint80[]));
        for (uint256 i; i < series.length; ++i) {
            // one bad entry must not block the rest of the batch
            try SpreadSeries(series[i]).settle(roundIds[i]) {
                emit Settlement(series[i], roundIds[i], true, "");
            } catch (bytes memory reason) {
                emit Settlement(series[i], roundIds[i], false, reason);
                continue;
            }
            if (vaults[i] != address(0)) {
                try WriterVault(vaults[i]).close() {} catch {}
            }
        }
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == type(IReceiver).interfaceId || id == 0x01ffc9a7; // IERC165
    }
}
