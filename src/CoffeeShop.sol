// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title CoffeeShop
/// @notice Toy shop that only accepts one ERC-20 token as payment (e.g. 6TEST, USDC, LINK).
/// @dev From a plain EOA, buying takes two transactions (approve, then buyCoffee)
///      and the buyer needs ETH for gas. Account abstraction removes both:
///      batch approve + buy into one UserOperation, and pay gas in the token via a paymaster.
contract CoffeeShop {
    IERC20 public immutable token;
    address public immutable owner;

    /// @notice Price per coffee in the token's smallest unit
    ///         (5 USDC/6TEST = 5e6; 5 LINK = 5e18).
    uint256 public immutable price;

    mapping(address => uint256) public coffeesBought;

    event CoffeeBought(address indexed buyer, uint256 quantity, uint256 paid);
    event Withdrawn(address indexed to, uint256 amount);

    error ZeroQuantity();
    error ZeroPrice();
    error PaymentFailed();
    error NotOwner();

    constructor(address _token, uint256 _price) {
        if (_price == 0) revert ZeroPrice();
        token = IERC20(_token);
        price = _price;
        owner = msg.sender;
    }

    /// @notice Buy `quantity` coffees. Caller must have approved this contract for price * quantity tokens.
    function buyCoffee(uint256 quantity) external {
        if (quantity == 0) revert ZeroQuantity();
        uint256 cost = price * quantity;
        if (!token.transferFrom(msg.sender, address(this), cost)) revert PaymentFailed();
        coffeesBought[msg.sender] += quantity;
        emit CoffeeBought(msg.sender, quantity, cost);
    }

    /// @notice Owner pulls all token revenue out of the shop.
    function withdraw(address to) external {
        if (msg.sender != owner) revert NotOwner();
        uint256 amount = token.balanceOf(address(this));
        if (!token.transfer(to, amount)) revert PaymentFailed();
        emit Withdrawn(to, amount);
    }
}
