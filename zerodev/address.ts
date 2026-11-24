import { formatUnits } from "viem"
import { TOKEN, erc20Abi, getAccount, publicClient } from "./account.js"

// Prints the user's smart account address so you can send it tokens before buying.
const account = await getAccount()
const balance = await publicClient.readContract({
  address: TOKEN,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
})
const code = await publicClient.getCode({ address: account.address })

console.log("Smart account:", account.address)
console.log("Deployed yet: ", code ? "yes" : "no (deploys in the first UserOp)")
console.log("Token balance:", formatUnits(balance, 6))
