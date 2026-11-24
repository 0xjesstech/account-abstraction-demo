import { createKernelAccountClient, createZeroDevPaymasterClient, getERC20PaymasterApproveCall } from "@zerodev/sdk"
import { encodeFunctionData, http, parseUnits } from "viem"
import {
  PRICE, SIX_TEST, ZERODEV_RPC, chain, entryPoint, erc20Abi, getAccount, publicClient, shopAbi, shopAddress,
} from "./account.js"

// Buy one coffee and pay the gas in an ERC-20 (USDC) instead of ETH.
//
// ZeroDev's built-in ERC-20 paymaster only accepts USDC on mainnets, and it
// rejects 6TEST on Arbitrum Sepolia ("token is not currently supported").
// So on testnet this only runs once you've set up a self-funded ERC-20
// paymaster in the ZeroDev dashboard and put its details in .env:
//   GAS_TOKEN=<token the paymaster accepts>
//   ERC20_PAYMASTER_RPC=<that paymaster's RPC URL>
const GAS_TOKEN = process.env.GAS_TOKEN as `0x${string}` | undefined
if (!GAS_TOKEN) {
  console.log("Skipping: paying gas in tokens needs mainnet USDC or a self-funded ERC-20 paymaster.")
  console.log("Set GAS_TOKEN (and ERC20_PAYMASTER_RPC on testnet) in .env to run this. See the article.")
  console.log("For the working testnet demo, run: npm run buy")
  process.exit(0)
}

const SHOP = shopAddress()
const account = await getAccount()
console.log("Smart account:", account.address)

const paymasterClient = createZeroDevPaymasterClient({
  chain,
  transport: http(process.env.ERC20_PAYMASTER_RPC || ZERODEV_RPC),
})

const kernelClient = createKernelAccountClient({
  account,
  chain,
  client: publicClient,
  bundlerTransport: http(ZERODEV_RPC),
  paymaster: paymasterClient,
  paymasterContext: { token: GAS_TOKEN }, // pay gas in this token instead of ETH
})

// Three calls, one signature, one UserOp. Atomic: if buyCoffee reverts, the approvals do too.
const hash = await kernelClient.sendUserOperation({
  callData: await account.encodeCalls([
    // 1. let the paymaster take its gas fee in the token
    await getERC20PaymasterApproveCall(paymasterClient, {
      gasToken: GAS_TOKEN,
      approveAmount: parseUnits("1", 6),
      entryPoint,
    }),
    // 2. let the shop take the coffee payment
    {
      to: SIX_TEST,
      value: 0n,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SHOP, PRICE] }),
    },
    // 3. buy the coffee
    {
      to: SHOP,
      value: 0n,
      data: encodeFunctionData({ abi: shopAbi, functionName: "buyCoffee", args: [1n] }),
    },
  ]),
})
console.log("UserOp hash:  ", hash)

const receipt = await kernelClient.waitForUserOperationReceipt({ hash })
const coffees = await publicClient.readContract({
  address: SHOP,
  abi: shopAbi,
  functionName: "coffeesBought",
  args: [account.address],
})

console.log("Tx:           ", `https://sepolia.arbiscan.io/tx/${receipt.receipt.transactionHash}`)
console.log("Success:      ", receipt.success)
console.log("Coffees bought:", coffees.toString())
