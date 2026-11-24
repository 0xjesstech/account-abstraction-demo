import { createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk"
import { encodeFunctionData, http } from "viem"
import {
  PRICE, SIX_TEST, ZERODEV_RPC, chain, erc20Abi, getAccount, publicClient, shopAbi, shopAddress,
} from "./account.js"

// Buy one coffee where the app pays all the gas.
// Requires a Gas Policy in the ZeroDev dashboard, or nothing gets sponsored.
const SHOP = shopAddress()
const account = await getAccount()
console.log("Smart account:", account.address)

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

// No paymaster approve needed: the user only approves the shop, then buys.
const hash = await kernelClient.sendUserOperation({
  callData: await account.encodeCalls([
    {
      to: SIX_TEST,
      value: 0n,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SHOP, PRICE] }),
    },
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
