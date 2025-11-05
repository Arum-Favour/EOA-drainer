import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ethers } from "ethers";

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL || process.env.RPC_URL;
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY || process.env.PRIVATE_KEY;
  const destinationWallet = process.env.DESTINATION_ADDRESS || "0xb30ca65e643c864d1d22c06d9ebdd753baf9428a";

  if (!rpcUrl || !privateKey) {
    throw new Error("Missing RPC_URL/SEPOLIA_RPC_URL or PRIVATE_KEY/SEPOLIA_PRIVATE_KEY env vars");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const artifactPath = resolve("artifacts/contracts/AutoTransfer.sol/AutoTransfer.json");
  const artifactJson = JSON.parse(await readFile(artifactPath, "utf8"));
  const { abi, bytecode } = artifactJson;

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(destinationWallet);
  const receipt = await contract.deploymentTransaction().wait();

  console.log("AutoTransfer deployed to:", await contract.getAddress());
  console.log("Tx hash:", receipt.hash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
