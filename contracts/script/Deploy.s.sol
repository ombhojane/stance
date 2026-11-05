// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AquaRouter} from "@1inch/aqua/contracts/AquaRouter.sol";
import {IAqua} from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import {SpreadSeries} from "../src/SpreadSeries.sol";
import {SpreadAquaApp} from "../src/SpreadAquaApp.sol";
import {WriterVault} from "../src/WriterVault.sol";
import {StanceMarket} from "../src/StanceMarket.sol";
import {SettlementReceiver} from "../src/SettlementReceiver.sol";
import {TestUSD} from "../src/TestUSD.sol";
import {UniswapV3TwapGuard, IUniswapV3PoolOracle} from "../src/UniswapV3TwapGuard.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";
import {ISettlementGuard} from "../src/interfaces/ISettlementGuard.sol";

/// @notice Deploys Stance to Base Sepolia:
///   official Aqua code (AquaRouter) → SpreadAquaApp → Uniswap TWAP guard (monitor-only)
///   → registry + CRE receiver → test USD → 8 ranges × 4 dates, each seeded by a house vault.
///
///   With an encrypted Foundry keystore (recommended):
///     forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --account stance --sender <address>
///   Or with a raw key in contracts/.env: DEPLOYER_PRIVATE_KEY=0x...
///   optional env: CRE_FORWARDER, SEED_PER_VAULT (6dp)
contract Deploy is Script {
    using stdJson for string;

    // Base Sepolia
    IAggregatorV3 constant ETH_USD = IAggregatorV3(0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1);
    address constant WETH = 0x4200000000000000000000000000000000000006;
    IUniswapV3PoolOracle constant WETH_USDC_3000 = IUniswapV3PoolOracle(0x46880b404CD35c165EDdefF7421019F8dD25F4Ad);
    uint8 constant POOL_USDC_DECIMALS = 6;

    uint256 constant VOL = 0.62e18;
    uint256[4] EXPIRIES = [uint256(1794556800), 1795766400, 1798185600, 1806048000]; // Nov 13, Nov 27, Dec 25 2026, Mar 26 2027 08:00 UTC
    string[4] LABELS = ["Nov13", "Nov27", "Dec25", "Mar26"];
    uint256[4] PCTS = [uint256(5), 10, 20, 35];
    address deployer;

    function run() external {
        uint256 pk = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        address me = pk != 0 ? vm.addr(pk) : msg.sender; // keystore: --account/--sender
        deployer = me;
        address forwarder = vm.envOr("CRE_FORWARDER", address(0));
        uint256 seed = vm.envOr("SEED_PER_VAULT", uint256(25_000e6));

        (, int256 px,,,) = ETH_USD.latestRoundData();
        uint256 atm = (uint256(px) + 50e8) / 100e8 * 100e8; // nearest $100, 8dp
        console2.log("ETH/USD", uint256(px), "atm", atm);

        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast(me);
        TestUSD tusd = new TestUSD(me);
        IAqua aqua = IAqua(address(new AquaRouter(me)));
        SpreadAquaApp app = new SpreadAquaApp(aqua, ETH_USD, VOL, me);
        UniswapV3TwapGuard guard =
            new UniswapV3TwapGuard(WETH_USDC_3000, WETH, 30 minutes, 150, 18, POOL_USDC_DECIMALS, false);
        StanceMarket market = new StanceMarket(app, me);
        SettlementReceiver receiver = new SettlementReceiver(forwarder, me);
        tusd.mint(me, seed * 32);

        for (uint256 e; e < 4; ++e) {
            if (EXPIRIES[e] <= block.timestamp + 1 days) continue;
            for (uint256 i; i < 4; ++i) {
                uint256 hi = _round100(atm * (100 + PCTS[i]) / 100);
                uint256 lo = _round100(atm * (100 - PCTS[i]) / 100);
                _range(market, aqua, app, tusd, guard, atm, hi, EXPIRIES[e], LABELS[e], seed); // goes up
                _range(market, aqua, app, tusd, guard, lo, atm, EXPIRIES[e], LABELS[e], seed); // goes down
            }
        }
        vm.stopBroadcast();

        string memory o = "deploy";
        o.serialize("chainId", block.chainid);
        o.serialize("usd", address(tusd));
        o.serialize("aqua", address(aqua));
        o.serialize("app", address(app));
        o.serialize("feed", address(ETH_USD));
        o.serialize("guard", address(guard));
        o.serialize("receiver", address(receiver));
        o.serialize("deployer", me);
        string memory json = o.serialize("market", address(market));
        vm.writeJson(json, string.concat("deployments/", Strings.toString(block.chainid), ".json"));
        console2.log("market", address(market), "ranges", market.rangeCount());
    }

    function _range(
        StanceMarket market,
        IAqua aqua,
        SpreadAquaApp app,
        TestUSD tusd,
        UniswapV3TwapGuard guard,
        uint256 k1,
        uint256 k2,
        uint256 expiry,
        string memory dateLabel,
        uint256 seed
    ) internal {
        string memory label =
            string.concat("ETH ", Strings.toString(k1 / 1e8), "-", Strings.toString(k2 / 1e8), " ", dateLabel);
        SpreadSeries series =
            new SpreadSeries(IERC20(address(tusd)), ETH_USD, ISettlementGuard(address(guard)), k1, k2, expiry, label);
        WriterVault vault = new WriterVault(aqua, app, series, string.concat("Stance House ", label));
        market.register(series, vault);
        tusd.approve(address(vault), seed);
        vault.deposit(seed, deployer);
    }

    function _round100(uint256 x) internal pure returns (uint256) {
        return (x + 50e8) / 100e8 * 100e8;
    }
}
