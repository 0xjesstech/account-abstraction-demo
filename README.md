# CoffeeShop: gasless purchases with ZeroDev smart accounts

A tiny shop contract that only takes an ERC-20 token, plus scripts that let a user with **zero ETH** buy a coffee in **one signature**, using an ERC-4337 smart account (ZeroDev Kernel) and a sponsoring paymaster on Arbitrum Sepolia.

Companion repo for the article in [`article.md`](article.md).

## What's here

| Path | What it is |
|---|---|
| `src/CoffeeShop.sol` | The shop: `buyCoffee(quantity)` pulls `price * quantity` tokens, `withdraw(to)` for the owner |
| `script/Deploy.s.sol` | Deploys the shop. Defaults to 6TEST on Arbitrum Sepolia at 5 tokens per coffee |
| `test/` | Foundry tests, including the "before AA" approve-then-buy EOA flow |
| `zerodev/account.ts` | Creates the user's Kernel smart account (ECDSA signer) |
| `zerodev/address.ts` | Prints the smart account's address, whether it's deployed, and its 6TEST balance |
| `zerodev/buyCoffeeSponsored.ts` | Approve + buy in one UserOp, gas sponsored by your ZeroDev Gas Policy |
| `zerodev/buyCoffeeUSDC.ts` | Same, but the user pays gas in an ERC-20. Needs mainnet USDC or a self-funded ERC-20 paymaster, and skips cleanly otherwise |

## Run it

You need [Foundry](https://book.getfoundry.sh/), Node 22+, an EOA with a little Arbitrum Sepolia ETH (for deploying), and a [ZeroDev](https://dashboard.zerodev.app) project.

**1. Deploy the shop**

```shell
forge script script/Deploy.s.sol --rpc-url https://sepolia-rollup.arbitrum.io/rpc --account <your-keystore> --broadcast
```

Copy the `CoffeeShop:` address it prints.

**2. Set up ZeroDev**

In the ZeroDev dashboard, create a project on Arbitrum Sepolia and copy its RPC URL. Then open **Gas Policies** and add a policy. Without one, every sponsored UserOp fails with `userOp did not match any gas sponsoring policies`.

**3. Configure the scripts**

```shell
cd zerodev
npm install
cp .env.example .env
```

Fill in `ZERODEV_RPC`, `PRIVATE_KEY` (the user's signer, never needs ETH) and `SHOP_ADDRESS`.

**4. Fund the smart account with 6TEST**

```shell
npm run address    # prints the smart account address
cast send 0x3870419Ba2BBf0127060bCB37f69A1b1C090992B "mint(address,uint256)" <smart-account> 20000000 \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc --account <your-keystore>
```

**5. Buy a coffee**

```shell
npm run buy
```

The first run deploys the Kernel account inside the same UserOp. The smart account still holds 0 ETH afterwards.

## Example run (Arbitrum Sepolia)

| | |
|---|---|
| CoffeeShop | [`0xf8e2478afbc867840AbFD04eD6dcdfAD71281b5D`](https://sepolia.arbiscan.io/address/0xf8e2478afbc867840AbFD04eD6dcdfAD71281b5D) |
| Smart account | [`0x42Ae02Aa0d7FbA750A3A9d49f94c4a3EFFD8b66A`](https://sepolia.arbiscan.io/address/0x42Ae02Aa0d7FbA750A3A9d49f94c4a3EFFD8b66A) |
| First purchase (deploys Kernel) | [`0x9f4f3167…1350b`](https://sepolia.arbiscan.io/tx/0x9f4f3167b040fa0953560682e2ebec05be70f1f798a771801afaa75475d1350b), 387,709 gas |
| Second purchase | [`0x0aa21c6d…4bab1`](https://sepolia.arbiscan.io/tx/0x0aa21c6d64dacf049cf259d535369e1fed8dfa828be5f4e4032f2cd9e634bab1), 181,728 gas |
| EOA comparison (approve + buy) | [`0x2e9e321b…12624`](https://sepolia.arbiscan.io/tx/0x2e9e321b1e2c2efb1a95e71ed918d9fb89b8de3aa064199deb07e34ada012624) + [`0x425f66c3…639be`](https://sepolia.arbiscan.io/tx/0x425f66c32547d3c8b43dd17ff8fc9578aecae09303d66ce10b8ff98f5ac639be), 106,516 gas |

## Contract development

```shell
forge build
forge test
forge fmt
```

CI runs `forge fmt --check`, `forge build`, `forge test`, and a typecheck of the `zerodev/` scripts.
