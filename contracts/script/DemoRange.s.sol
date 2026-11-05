// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAqua} from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import {SpreadSeries} from "../src/SpreadSeries.sol";
import {SpreadAquaApp} from "../src/SpreadAquaApp.sol";
import {WriterVault} from "../src/WriterVault.sol";
import {StanceMarket} from "../src/StanceMarket.sol";
import {TestUSD} from "../src/TestUSD.sol";
import {ISettlementGuard} from "../src/interfaces/ISettlementGuard.sol";

/// @notice Adds one short-dated range (default: expires in 2 hours) to the live Base Sepolia
///         deployment, so the Chainlink CRE workflow can settle something during a demo.
///
///   forge script script/DemoRange.s.sol --rpc-url https://sepolia.base.org --broadcast --slow \
///     --account <name> --password-file ~/.stance-pw --sender <DEPLOYER_ADDRESS>
///   optional env: DEMO_EXPIRY_MINUTES (default 120), SEED_PER_VAULT (6dp, default 25,000)
contract DemoRange is Script {
    using stdJson for string;

    function run() external {
        require(block.chainid == 84532, "DemoRange: Base Sepolia (84532) only");
        address me = msg.sender;
        address expected = vm.envOr("DEPLOYER_ADDRESS", address(0));
        require(expected != address(0) && me == expected, "DemoRange: signer is not DEPLOYER_ADDRESS");

        string memory d = vm.readFile("deployments/84532.json");
        StanceMarket market = StanceMarket(d.readAddress(".market"));
        SpreadAquaApp app = SpreadAquaApp(d.readAddress(".app"));
        IAqua aqua = IAqua(d.readAddress(".aqua"));
        TestUSD tusd = TestUSD(d.readAddress(".usd"));
        ISettlementGuard guard = ISettlementGuard(d.readAddress(".guard"));

        uint256 minutes_ = vm.envOr("DEMO_EXPIRY_MINUTES", uint256(120));
        uint256 seed = vm.envOr("SEED_PER_VAULT", uint256(25_000e6));
        uint256 expiry = block.timestamp + minutes_ * 1 minutes;

        (, int256 px,,,) = app.feed().latestRoundData();
        // a tight range around spot so a 2-hour move actually lands inside it
        uint256 k1 = (uint256(px) - 30e8) / 10e8 * 10e8;
        uint256 k2 = k1 + 60e8;
        string memory label = string.concat("ETH ", Strings.toString(k1 / 1e8), "-", Strings.toString(k2 / 1e8), " demo");

        vm.startBroadcast(me);
        SpreadSeries series = new SpreadSeries(IERC20(address(tusd)), app.feed(), guard, k1, k2, expiry, label);
        WriterVault vault = new WriterVault(aqua, app, series, string.concat("Stance House ", label));
        uint256 id = market.register(series, vault);
        tusd.mint(me, seed);
        tusd.approve(address(vault), seed);
        vault.deposit(seed, me);
        vm.stopBroadcast();

        console2.log("demo range id", id);
        console2.log("series", address(series), "vault", address(vault));
        console2.log("k1, k2 (8dp)", k1, k2);
        console2.log("expiry (unix)", expiry);
    }
}
