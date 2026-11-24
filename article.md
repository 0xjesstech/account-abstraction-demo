Using defi shouldn’t be difficult. 

Last week my dad set up a wallet and bought 50 USDC (he’s recently retired and finally wants to understand defi + what I do). Yesterday he rang me to say he kept getting hit with an error. It was *Insufficient funds for gas.* 

In 2026?

“Reduce the amount of clicks for users” is the one rule protocol user experience experts live by, and without resolving this gas problem, protocols are introducing intermediary steps that are sending their potential users away. 

This is the problem smart accounts exist to fix.

For teams like Friendzone, resolving this issue resulted in a 300% increase in the number of transactions in their app. (https://www.alchemy.com/case-studies/friendzone)

**This is my ELI5 for how to remove this point of friction for your users.**

For simplicity, I’ve written a coffee shop contract with two functions, one is the `buyCoffee` function, that people can call and pay `6TEST` (a test token) to buy a coffee, and one is a `withdraw` function, that the owner can call to withdraw their earnings. 

The issue for people like my dad is, even if he had `6TEST`, he can’t call the function because he has no ETH. 

Without a smart account he has to: 

- Purchase some ETH
- Call the approve function in the `6TEST` contract to allow the `CoffeeShop` contract to spend the tokens
- Call the `buyCoffee` function

That's 3 steps (and the first one is a huge point of friction).

**How Smart Accounts Work**

If my dad had gotten a smart account, he could have interacted with the protocol seamlessly.

**So what actually is a smart account?**

The wallet my dad set up is an Externally Owned Account (EOA) - just a private key and the address that's derived from it. This means:

- Every transaction has to be signed by that one private key
- Every transaction does exactly one thing (one `approve`, or one `buyCoffee`)
- Every transaction has to pay gas in ETH, from that same address (this is what caused the problem for my dad)

**A smart account is a wallet that's also a contract**

A smart account is a smart contract that holds your funds. A smart contract has flexibility compared to an EOA - it can accept a signature from a passkey, it can run several calls in one go, or it can let someone else pay the gas.

But only EOAs can start transactions on Ethereum, so how can a smart contract replace EOAs?

**ERC-4337**

Live on mainnet since March 2023, ERC-4337 is a standard for account abstraction that ZeroDev (and most smart account providers) build on. It enables an account's rules (who can sign, what it can do, who pays gas) to be set by code, instead of being hardcoded into Ethereum like EOAs.

Early proposals for this needed a hard fork, but ERC-4337 didn't. Instead, it adds four new components:

- **UserOperation (UserOp).** Instead of a transaction, the user signs a UserOp. It's a description of what the smart account should do ("call these contracts with this data") plus who's paying for it. It doesn't go to the normal mempool.
- **Bundler.** A bundler is a server that collects UserOps, wraps them into a normal transaction, and sends that on-chain. The bundler is an EOA, so it pays the ETH upfront and gets paid back.
- **EntryPoint.** One shared contract on every chain (v0.7 lives at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`). The bundler hands it the UserOps, and it checks each signature with the smart account, runs the calls, and settles who owes the bundler for gas.
- **Paymaster.** A contract that tells the EntryPoint "I'll cover this one". It either pays the gas for free (sponsorship), or pays in ETH and takes the user's ERC-20 tokens in return.

[box: user signs UserOp -> bundler -> EntryPoint -> (paymaster agrees to pay) -> smart account runs the calls]

**Where ZeroDev fits**

ZeroDev gives you all of this behind one RPC URL: 
- Kernel (their smart account contract)
- a bundler
- paymasters you configure from the dashboard.


**Building with ERC-4337 on Arbitrum Sepolia**

Everything below is in the repo: the contract in `src/`, the deploy script in `script/`, and the ZeroDev code in `zerodev/`. I ran all of it on Arbitrum Sepolia, so every number in this section comes from a real transaction.

**1. Deploy the shop.** The `CoffeeShop` contract in `src/CoffeeShop.sol` takes a token address and a price. `script/Deploy.s.sol` defaults to `6TEST` (`0x3870419Ba2BBf0127060bCB37f69A1b1C090992B`), a 6-decimal test token on Arbitrum Sepolia that anyone can mint, priced at `5e6` (5 tokens per coffee).

```
forge script script/Deploy.s.sol --rpc-url https://sepolia-rollup.arbitrum.io/rpc --account <your-keystore> --broadcast
```

Note: this is the only step that uses an EOA with ETH, and it's the shop owner's, not the customer's.

**2. Get a ZeroDev project.** Create a project in the ZeroDev dashboard, pick Arbitrum Sepolia, and copy the RPC URL. It looks like `https://rpc.zerodev.app/api/v3/<project-id>/chain/421614`, and that one URL serves as both your bundler and your paymaster.

Then go to **Gas Policies** in the same project and add a policy for Arbitrum Sepolia. This is the step that's easy to miss. Without a policy, ZeroDev's paymaster won't pay for anything, and every UserOp comes back with:

```
userOp did not match any gas sponsoring policies or (no ERC20 gas token data present)
```

A policy is just a rule for what you're willing to pay for. For this demo a project-wide policy is fine. In production you'd narrow it down, for example to calls to your `CoffeeShop` address, with a cap on spend per user.

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

Note: this doesn't deploy anything. `account.address` is calculated ahead of time (a "counterfactual" address, worked out from the factory and the signer with CREATE2), so dad can receive `6TEST` at that address before the contract exists. Kernel gets deployed inside his first UserOp, and the paymaster pays for that too.

You can see this for yourself with `npm run address`:

```
Smart account: 0x42Ae02Aa0d7FbA750A3A9d49f94c4a3EFFD8b66A
Deployed yet:  no (deploys in the first UserOp)
6TEST balance: 0
```

The `signer` here is a private key to keep the demo short. The ECDSA validator is just the plugin that says "a UserOp is valid if this key signed it". In a real app you'd swap it for a passkey validator, and dad would never see a seed phrase at all.

**5. Give the account some 6TEST.** This stands in for dad's 50 USDC. 6TEST has a public `mint`, so send some straight to the smart account address:

```
cast send 0x3870419Ba2BBf0127060bCB37f69A1b1C090992B "mint(address,uint256)" <smart-account> 20000000 --rpc-url https://sepolia-rollup.arbitrum.io/rpc --account <your-keystore>
```

That's 20 6TEST (6 decimals, so `20000000`). The account now holds tokens and zero ETH, which is exactly where dad was stuck.

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

The `getPaymasterData` function is where the gas gets paid. Before the UserOp is sent, the client asks ZeroDev's paymaster to sign off on it. The paymaster checks your Gas Policy from step 2, and if the UserOp matches, it agrees to cover the gas.

**7. Batch everything into one UserOp.**

```ts
const hash = await kernelClient.sendUserOperation({
  callData: await account.encodeCalls([
    // let the shop take the coffee payment
    { to: SIX_TEST, value: 0n,
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

If you open that transaction on Arbiscan, the `from` isn't dad. It's ZeroDev's bundler (`0x4337…5dd5`), calling `handleOps` on the EntryPoint at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`. That's the box diagram from earlier, as one transaction. And dad's smart account still holds 0 ETH after buying a coffee.

That's two calls (approve and buy) with one signature and one on-chain transaction. Because Kernel runs a batch atomically, if `buyCoffee` reverts, the approval reverts with it. Dad can't end up in the half-done state where he's approved the shop but has no coffee.

Notice that `CoffeeShop.sol` didn't change at all. The contract still sees a `transferFrom` from `msg.sender`, it's just that `msg.sender` is now dad's Kernel account instead of an EOA. You don't have to rewrite your protocol to get this.

**What does this cost in gas?**

To compare fairly, I also bought a coffee the old way, from a plain EOA, on the same shop. Here are all three, from real Arbitrum Sepolia transactions at ~0.021 gwei:

| Route | Gas | Cost (ETH) | ~USD at $3,000 ETH |
|---|---|---|---|
| EOA: `approve` + `buyCoffee` (2 transactions) | 106,516 | 0.0000021 | $0.006 |
| Smart account, first purchase (deploys Kernel + approve + buy) | 387,709 | 0.0000082 | $0.024 |
| Smart account, every purchase after that | 181,728 | 0.0000039 | $0.012 |

So the smart account costs *more* gas, not less. The first UserOp pays a one-time cost to deploy Kernel. After that, every purchase still costs about 1.7x the EOA route, because each UserOp pays for the EntryPoint validating the signature, the paymaster's checks, and more calldata posted to L1. Batching saves one 21,000 base fee, but that's not enough to cover the overhead.

But look at who pays and how much. Dad pays nothing, the app pays about a cent, and the user never sees a "buy ETH first" screen. On Arbitrum the difference between the two routes is under a cent per coffee. The thing you actually save is the step where you lose the user.

So to recap the whole loop: dad signs one UserOp saying "approve the shop, buy a coffee". ZeroDev's bundler wraps it in a transaction and pays the ETH. The EntryPoint checks his signature against Kernel, deploys Kernel if it's his first time, and asks the paymaster if it'll pay. The paymaster checks your Gas Policy, says yes, and the two calls run. Dad never touched ETH.

That's the Friendzone model: the app pays for gas the same way a coffee shop pays for card fees, as a cost of getting customers through the door.

**Or let users pay gas in USDC**

If you don't want to pay for gas forever, ZeroDev also has an ERC-20 paymaster. It fronts the ETH, then takes the equivalent in a token the user already holds. You change the client and add one call to the start of the batch (this is `zerodev/buyCoffeeUSDC.ts`, run with `npm run buy:usdc`):

```ts
const kernelClient = createKernelAccountClient({
  account,
  chain,
  client: publicClient,
  bundlerTransport: http(ZERODEV_RPC),
  paymaster: paymasterClient,
  paymasterContext: { token: USDC }, // pay gas in USDC instead of ETH
})

// first call in the batch: let the paymaster take its fee
await getERC20PaymasterApproveCall(paymasterClient, {
  gasToken: USDC,
  approveAmount: parseUnits("1", 6),
  entryPoint,
})
```

This is the version that fits dad best, because he already has USDC. But I couldn't run it on testnet. ZeroDev's SDK lists 6TEST as a gas token for Arbitrum Sepolia, yet their paymaster rejected it:

```
token is not currently supported. If you would like support, reach out to us.
```

Their built-in ERC-20 paymaster only accepts USDC, and only on mainnets (Ethereum, Arbitrum, Base, Optimism and Polygon). To test it on Sepolia, you'd set up your own self-funded ERC-20 paymaster in the dashboard, add 6TEST with a fixed exchange rate, and fund it with some Sepolia ETH. Until you do, `npm run buy:usdc` just prints that and exits, so nothing in the repo breaks.

**The catch**

Here's the honest limit, because this demo cuts corners a production app can't.

- **Smart accounts cost more gas.** About 1.7x an EOA per purchase on these numbers, plus a one-time deploy. On Arbitrum that's still around a cent, but on a chain with expensive gas the overhead adds up.
- **The ERC-20 paymaster isn't free either.** ZeroDev adds a 5% premium to the exchange rate when users pay gas in tokens, and any token other than mainnet USDC means running your own paymaster with a price feed.
- **Sponsorship is a bill.** Someone pays for that gas. ZeroDev either charges your card monthly or draws from credits you pre-buy, so set a policy cap before you go live, or one busy afternoon becomes an expensive one.
- **A private key is still a private key.** The `signer` in this demo is a raw key in an env var. Swapping it for a passkey validator is what actually gets your users away from seed phrases.
- **You're adding infrastructure.** Every UserOp now goes through a bundler and a paymaster. If ZeroDev's RPC is down or your gas policy runs dry, purchases fail. Wrap `sponsorUserOperation` in a try/catch and fall back to the user paying, if they have ETH.
- **Existing EOAs need EIP-7702.** Everything above gives dad a *new* address. If he already has an EOA full of tokens, EIP-7702 lets that same address run Kernel's code (ZeroDev supports it with `KERNEL_V3_3`, and it's live on Arbitrum), so you don't have to ask anyone to move their funds.

If you're building a dApp where users have to approve before they can do anything, and you're losing them at "get some ETH first", this is a one-afternoon change. Your contracts stay exactly as they are. You add one SDK, one RPC URL and a Gas Policy, then decide who pays for gas: you, or a token they already hold.

And my dad gets his coffee.

## Framing

# blog
title: How to stop "insufficient funds for gas" from killing your app, with ZeroDev and a real contract
intro: My retired dad bought 50 USDC and couldn't spend any of it, because he had no ETH. Most smart account explainers stop at "better UX" and wave at ERC-4337. This one takes a real CoffeeShop contract from 3 steps to 1 signature, and shows exactly which piece pays the gas.
signoff: One UserOp batches approve and buy, a bundler pays the ETH, and a paymaster pays for it out of your Gas Policy, all without changing your contract. If your users drop off at "get some ETH first", start here.
