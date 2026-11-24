import { formatUnits } from "viem"
import { SIX_TEST, erc20Abi, getAccount, publicClient } from "./account.js"

// Prints the user's smart account address so you can send it 6TEST before buying.
const account = await getAccount()
const balance = await publicClient.readContract({
  address: SIX_TEST,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
})
const code = await publicClient.getCode({ address: account.address })

console.log("Smart account:", account.address)
console.log("Deployed yet: ", code ? "yes" : "no (deploys in the first UserOp)")
console.log("6TEST balance:", formatUnits(balance, 6))
