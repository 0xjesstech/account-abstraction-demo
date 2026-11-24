// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockToken} from "./mocks/MockToken.sol";
import {CoffeeShop} from "../src/CoffeeShop.sol";

contract CoffeeShopTest is Test {
    MockToken token; // stands in for 6TEST (6 decimals)
    CoffeeShop shop;
    address alice = makeAddr("alice");

    uint256 constant PRICE = 5e6; // 5 tokens at 6 decimals

    function setUp() public {
        token = new MockToken("6 Decimal Test Token", "6TEST", 6);
        shop = new CoffeeShop(address(token), PRICE);
        token.mint(alice, 100e6); // 100 tokens
    }

    /// The "before AA" flow: an EOA has to send two separate transactions.
    function test_EOAFlow_ApproveThenBuy() public {
        vm.startPrank(alice);
        token.approve(address(shop), 2 * PRICE); // tx 1
        shop.buyCoffee(2); // tx 2
        vm.stopPrank();

        assertEq(shop.coffeesBought(alice), 2);
        assertEq(token.balanceOf(address(shop)), 10e6);
        assertEq(token.balanceOf(alice), 90e6);
    }

    /// Skipping approve fails: the shop can't pull the tokens.
    function test_RevertWhen_NoApproval() public {
        vm.prank(alice);
        vm.expectRevert(bytes("MockToken: allowance"));
        shop.buyCoffee(1);
    }

    function test_RevertWhen_NotEnoughTokens() public {
        address bob = makeAddr("bob");
        vm.startPrank(bob);
        token.approve(address(shop), type(uint256).max);
        vm.expectRevert(bytes("MockToken: balance"));
        shop.buyCoffee(1);
        vm.stopPrank();
    }

    function test_RevertWhen_ZeroQuantity() public {
        vm.prank(alice);
        vm.expectRevert(CoffeeShop.ZeroQuantity.selector);
        shop.buyCoffee(0);
    }

    function test_RevertWhen_ZeroPrice() public {
        vm.expectRevert(CoffeeShop.ZeroPrice.selector);
        new CoffeeShop(address(token), 0);
    }

    /// Same contract works with an 18-decimal token like LINK, just a different price.
    function test_WorksWith18DecimalToken() public {
        MockToken link = new MockToken("ChainLink Token", "LINK", 18);
        CoffeeShop linkShop = new CoffeeShop(address(link), 5e18);
        link.mint(alice, 10e18);

        vm.startPrank(alice);
        link.approve(address(linkShop), 5e18);
        linkShop.buyCoffee(1);
        vm.stopPrank();

        assertEq(linkShop.coffeesBought(alice), 1);
        assertEq(link.balanceOf(alice), 5e18);
    }

    function test_OwnerWithdraws() public {
        vm.startPrank(alice);
        token.approve(address(shop), PRICE);
        shop.buyCoffee(1);
        vm.stopPrank();

        address treasury = makeAddr("treasury");
        shop.withdraw(treasury);
        assertEq(token.balanceOf(treasury), PRICE);
        assertEq(token.balanceOf(address(shop)), 0);
    }

    function test_RevertWhen_NonOwnerWithdraws() public {
        vm.prank(alice);
        vm.expectRevert(CoffeeShop.NotOwner.selector);
        shop.withdraw(alice);
    }
}
