import { createKernelAccount } from "@zerodev/sdk"
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { createPublicClient, http, parseAbi } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { arbitrumSepolia } from "viem/chains"

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} in .env (see .env.example)`)
  return value
}

export const ZERODEV_RPC = env("ZERODEV_RPC")
export const chain = arbitrumSepolia
export const entryPoint = getEntryPoint("0.7")
export const kernelVersion = KERNEL_V3_1

// The shop's payment token: a 6-decimal test token on Arbitrum Sepolia that anyone can mint
export const TOKEN = "0x3870419Ba2BBf0127060bCB37f69A1b1C090992B"
export const PRICE = 5_000_000n // 5 tokens, matches script/Deploy.s.sol

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
])
export const shopAbi = parseAbi([
  "function buyCoffee(uint256 quantity)",
  "function coffeesBought(address buyer) view returns (uint256)",
])

export const publicClient = createPublicClient({ chain, transport: http(ZERODEV_RPC) })

/// The user's Kernel smart account. Counterfactual: the address exists
/// before the contract does, and Kernel deploys inside the first UserOp.
export async function getAccount() {
  const signer = privateKeyToAccount(env("PRIVATE_KEY") as `0x${string}`)
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, { signer, entryPoint, kernelVersion })
  return createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
  })
}

export function shopAddress(): `0x${string}` {
  return env("SHOP_ADDRESS") as `0x${string}`
}
