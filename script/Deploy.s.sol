// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CoffeeShop} from "../src/CoffeeShop.sol";

/// @notice Deploys CoffeeShop for the ZeroDev demo.
/// Defaults: 6TEST on Arbitrum Sepolia (ZeroDev's built-in gas token there), 5 tokens per coffee.
/// Override with TOKEN_ADDRESS and PRICE (in the token's smallest unit, e.g. 5e18 for 5 LINK).
contract Deploy is Script {
    address constant SIX_TEST = 0x3870419Ba2BBf0127060bCB37f69A1b1C090992B;

    function run() external returns (CoffeeShop shop) {
        address token = vm.envOr("TOKEN_ADDRESS", SIX_TEST);
        uint256 price = vm.envOr("PRICE", uint256(5e6));

        vm.startBroadcast();
        shop = new CoffeeShop(token, price);
        vm.stopBroadcast();

        console.log("Token:     ", token);
        console.log("Price:     ", price);
        console.log("CoffeeShop:", address(shop));
    }
}
