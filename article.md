Using DeFi shouldn't be difficult.

Last week my dad set up a wallet and bought 50 USDC (he's recently retired and finally wants to understand DeFi + what I do). Yesterday he rang me to say he kept hitting an error. It was Insufficient funds for gas.

In 2026?

"Reduce the amount of clicks for users" is the one rule UX experts in crypto live by, and without resolving this gas problem, protocols are introducing intermediary steps and losing their potential users.

This is the problem smart accounts exist to fix.

For teams like Friendzone, resolving this issue resulted in a 300% increase in transactions. [alchemy.com/case-studies/friendzone](https://www.alchemy.com/case-studies/friendzone)

**This is my ELI5 for how to remove this point of friction for your users.**

For simplicity, I've written a coffee shop contract with two functions: buyCoffee, which people call to pay a test token to buy a coffee, and withdraw, which the owner can call to withdraw their earnings.

The issue for people like my dad is, even if he had the test token, he can't call the function because he has no ETH. 

Without a smart account he has to: 

- Purchase some ETH
- Call the approve function in the token contract to allow the `CoffeeShop` contract to spend the tokens
- Call the `buyCoffee` function

That's 3 steps (and the first one is a huge point of friction).

**How Smart Accounts Work**

If my dad had gotten a smart account, he could have interacted with the protocol seamlessly.

The wallet my dad set up is an Externally Owned Account (EOA) - just a private key and the address that's derived from it. This means:

- Every transaction has to be signed by that one private key
- Every transaction does exactly one thing (one `approve`, or one `buyCoffee`)
- Every transaction has to pay gas in ETH, from that same address (this is what caused the problem for my dad)

**A smart account is a wallet that's also a contract**

A smart account is a smart contract that holds your funds. A smart contract has flexibility compared to an EOA - it can accept a signature from a passkey, it can run several calls in one go, or it can let someone else pay the gas.

But only EOAs can start transactions on Ethereum, so how can a smart contract replace EOAs?

**ERC-4337**

Live on mainnet since March 2023, ERC-4337 is a standard for account abstraction that ZeroDev (and most smart account providers) build on. 

It has four components:

- **UserOperation (UserOp).** Instead of a transaction, the user signs a UserOp. It's a description of what the smart account should do ("call these contracts with this data") plus who's paying for it. It doesn't go to the normal mempool, instead, it goes to a bundler.
- **Bundler.** A bundler is a server that collects UserOps, wraps them into a normal transaction, and sends that on-chain. The bundler is an EOA, so it pays the ETH upfront and gets paid back.
- **EntryPoint.** The entrypoint is one shared contract on every chain. The bundler sends the UserOps to the entrypoint contract, which checks each signature with the smart account, runs the calls, and settles who owes the bundler for gas.
- **Paymaster.** The paymaster is a separate contract that tells the EntryPoint contract how gas should be paid. It either pays the gas for free (sponsorship), or pays in ETH and takes the user's ERC-20 tokens in return.

**Where ZeroDev fits**

ZeroDev gives you all of this with one RPC URL: 
- Kernel (their smart account contract)
- a bundler
- paymasters you configure from the dashboard.

**Building with ERC-4337 and ZeroDev on Arbitrum Sepolia**

**Step 1. Deploy the shop.** 

The `CoffeeShop` contract in `src/CoffeeShop.sol` takes a token address and a price. 

`script/Deploy.s.sol` defaults to a 6-decimal test token on Arbitrum Sepolia that anyone can mint (`0x3870419Ba2BBf0127060bCB37f69A1b1C090992B`), priced at `5e6` (5 tokens per coffee).

```
forge script script/Deploy.s.sol --rpc-url https://sepolia-rollup.arbitrum.io/rpc --account <your-keystore> --broadcast
```

Note: this is the only step that uses an EOA with ETH, and it's the shop owner's, not the customer's.

**2. Get a ZeroDev project.** 

Create a project in the ZeroDev dashboard, pick Arbitrum Sepolia, and copy the RPC URL into `zerodev/.env` 

It looks like `https://rpc.zerodev.app/api/v3/<project-id>/chain/421614`, and serves as both your bundler and your paymaster.

Then go to **Gas Policies** in the same project and enable the sponsor all transactions toggle. 

A policy is just a rule for what you're willing to pay for. For this demo a project-wide policy works, but in production you'd narrow it down, for example to calls to your `CoffeeShop` address, with a cap on spend per user.

**3. Set up the scripts.**

```
cd zerodev
npm install
cp .env.example .env
```

Fill in three values in `.env`: `ZERODEV_RPC` (from step 2), `PRIVATE_KEY` (the user's signer, a throwaway key that never needs ETH) and `SHOP_ADDRESS` (printed by the deploy in step 1).

**4. Create a user's smart account.** This is `zerodev/account.ts`:

```ts
import { createKernelAccount } from "@zerodev/sdk"
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { createPublicClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { arbitrumSepolia } from "viem/chains"

const ZERODEV_RPC = process.env.ZERODEV_RPC!
const chain = arbitrumSepolia
const entryPoint = getEntryPoint("0.7")
const kernelVersion = KERNEL_V3_1

const signer = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`)
const publicClient = createPublicClient({ chain, transport: http(ZERODEV_RPC) })

const ecdsaValidator = await signerToEcdsaValidator(publicClient, { signer, entryPoint, kernelVersion })
const account = await createKernelAccount(publicClient, {
  plugins: { sudo: ecdsaValidator },
  entryPoint,
  kernelVersion,
})
```

Note: this doesn't deploy anything. `account.address` is calculated from the factory and the signer with CREATE2 so that users can receive tokens at an address before the contract even exists. Kernel gets deployed inside the user's first UserOp, and the paymaster pays for it.

You can see this with `npm run address`:

```
Smart account: 0x42Ae02Aa0d7FbA750A3A9d49f94c4a3EFFD8b66A
Deployed yet:  no (deploys in the first UserOp)
Token balance: 0
```

The `signer` here is a private key (to keep the demo short), but in a real app you'd swap it for a passkey validator, and the users would never see a seed phrase at all.

**5. Give the account some test tokens.** The test token I'm using has a public `mint` function, so we can send some straight to the smart account address with this command:

```
cast send 0x3870419Ba2BBf0127060bCB37f69A1b1C090992B "mint(address,uint256)" <smart-account> 20000000 --rpc-url https://sepolia-rollup.arbitrum.io/rpc --account <your-keystore>
```

That's 20 tokens (6 decimals, so `20000000`). The account now holds tokens and zero ETH.

**6. Point the client at ZeroDev's paymaster.** This is `zerodev/buyCoffeeSponsored.ts`:

```ts
const paymasterClient = createZeroDevPaymasterClient({ chain, transport: http(ZERODEV_RPC) })

const kernelClient = createKernelAccountClient({
  account,
  chain,
  client: publicClient,
  bundlerTransport: http(ZERODEV_RPC),
  paymaster: {
    getPaymasterData(userOperation) {
      return paymasterClient.sponsorUserOperation({ userOperation })
    },
  },
})
```

The `getPaymasterData` function is where the gas gets paid. Before the UserOp is sent, the client asks ZeroDev's paymaster to sign off on it. The paymaster checks the Gas Policy from step 2, and if the UserOp matches, it agrees to cover the gas.

**7. Batch everything into one UserOp.**

```ts
const hash = await kernelClient.sendUserOperation({
  callData: await account.encodeCalls([
    // let the shop take the coffee payment
    { to: TOKEN, value: 0n,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SHOP, PRICE] }) },
    // buy the coffee
    { to: SHOP, value: 0n,
      data: encodeFunctionData({ abi: shopAbi, functionName: "buyCoffee", args: [1n] }) },
  ]),
})

const receipt = await kernelClient.waitForUserOperationReceipt({ hash })
```

Run it with `npm run buy`:

```
Smart account: 0x42Ae02Aa0d7FbA750A3A9d49f94c4a3EFFD8b66A
UserOp hash:   0xa78739e84177eca36e8cef143e12d9fbe4d814c9e2d27ed260c13c70cf0ada74
Tx:            https://sepolia.arbiscan.io/tx/0x9f4f3167b040fa0953560682e2ebec05be70f1f798a771801afaa75475d1350b
Success:       true
Coffees bought: 1
```

If you open that transaction on Arbiscan, the `from` isn't the end user's wallet, it's ZeroDev's bundler (`0x4337…5dd5`), calling `handleOps` on the EntryPoint at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`. 
The user's smart account still holds 0 ETH after buying a coffee.

This transaction is two calls (approve and buy) with one signature in one on-chain transaction. What's cool is since Kernel runs a batch atomically, if `buyCoffee` reverts, the approval reverts with it. This means that end users can't end up in a half-done state, where they've approved the shop but have no coffee.

**Notice that `CoffeeShop.sol` didn't change at all - you don't have to rewrite your protocol to get this UX improvement.**

**What does this cost in gas?**

Real Arbitrum Sepolia transactions:

| Route | Gas | Cost (ETH) | ~USD at $3,000 ETH |
|---|---|---|---|
| EOA: `approve` + `buyCoffee` (2 transactions) | 106,516 | 0.0000021 | $0.006 |
| Smart account, first purchase (deploys Kernel + approve + buy) | 387,709 | 0.0000082 | $0.024 |
| Smart account, every purchase after that | 181,728 | 0.0000039 | $0.012 |

The first UserOp pays a one-time cost to deploy Kernel. After that, every purchase costs about 1.7x the EOA route, because each UserOp pays for the EntryPoint validating the signature, the paymaster's checks, and more calldata posted to L1. 

On Arbitrum Sepolia, the difference between the two routes is under a cent per coffee.

**Or let users pay gas in USDC**

If you don't want to pay for gas forever, ZeroDev also has an ERC-20 paymaster. It fronts the ETH, then takes the equivalent in a token the user already holds. You change the client and add one call to the start of the batch (this is `zerodev/buyCoffeeUSDC.ts`, run with `npm run buy:usdc`):

```ts
const kernelClient = createKernelAccountClient({
  account,
  chain,
  client: publicClient,
  bundlerTransport: http(ZERODEV_RPC),
  paymaster: paymasterClient,
  paymasterContext: { token: GAS_TOKEN }, // pay gas in this token instead of ETH
})

// first call in the batch: let the paymaster take its fee
await getERC20PaymasterApproveCall(paymasterClient, {
  gasToken: GAS_TOKEN,
  approveAmount: parseUnits("1", 6),
  entryPoint,
})
```

Note: ZeroDev's built-in ERC-20 paymaster only accepts USDC, and only on mainnet. If you want to use another token, you need to run your own paymaster with a price feed. In this repo, `npm run buy:usdc` skips cleanly on testnet unless you set `GAS_TOKEN` (and `ERC20_PAYMASTER_RPC`) for your own ERC-20 paymaster in `.env`.

If you're building a dApp where users have to approve before they can do anything, and you're losing them at the error "get some ETH first", account abstraction might improve the UX. 