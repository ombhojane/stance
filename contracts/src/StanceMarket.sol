// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SpreadSeries} from "./SpreadSeries.sol";
import {SpreadAquaApp} from "./SpreadAquaApp.sol";
import {WriterVault} from "./WriterVault.sol";

/// @title StanceMarket
/// @notice Registry of Stance ranges: each is a SpreadSeries plus the WriterVault that makes its
///         market on 1inch Aqua. The app reads `allRanges()` and snaps user targets to them.
/// @dev Series and vaults are deployed by script (a factory holding both creation codes would
///      exceed the 24KB contract limit); `register` checks they belong together.
contract StanceMarket is Ownable {
    struct Range {
        SpreadSeries series;
        WriterVault vault;
        uint256 k1;
        uint256 k2;
        uint256 expiry;
    }

    error Mismatch();

    event RangeRegistered(uint256 indexed id, address series, address vault, uint256 k1, uint256 k2, uint256 expiry);

    SpreadAquaApp public immutable app;
    Range[] internal _ranges;

    constructor(SpreadAquaApp app_, address owner_) Ownable(owner_) {
        app = app_;
    }

    function register(SpreadSeries series, WriterVault vault) external onlyOwner returns (uint256 id) {
        if (vault.series() != series || vault.app() != app) revert Mismatch();
        if (series.feed() != app.feed()) revert Mismatch();
        id = _ranges.length;
        _ranges.push(Range(series, vault, series.k1(), series.k2(), series.expiry()));
        emit RangeRegistered(id, address(series), address(vault), series.k1(), series.k2(), series.expiry());
    }

    function rangeCount() external view returns (uint256) {
        return _ranges.length;
    }

    function rangeAt(uint256 id) external view returns (Range memory) {
        return _ranges[id];
    }

    function allRanges() external view returns (Range[] memory) {
        return _ranges;
    }
}
