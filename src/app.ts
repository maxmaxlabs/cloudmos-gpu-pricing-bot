import axios from "axios";
import { closeDeployment, createDeployment, getBids } from "./deploymentUtils";
import { DirectSecp256k1HdWallet, Registry } from "@cosmjs/proto-signing";
import { getAkashTypeRegistry } from "@akashnetwork/akashjs/build/stargate";
import { SigningStargateClient } from "@cosmjs/stargate";
import { apiEndpoint, rpcEndpoint } from "./constants";
import { ensureValidCert } from "./certificateUtils";
import * as fs from "fs";
import { getCurrentHeight, sleep } from "./utils";

require("dotenv").config();

async function run() {
  if (!process.env.WALLET_MNEMONIC) throw new Error("The env variable WALLET_MNEMONIC is not set.");

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.WALLET_MNEMONIC, { prefix: "akash" });
  const [account] = await wallet.getAccounts();

  console.log("Wallet Address: " + account.address);

  const myRegistry = new Registry([...getAkashTypeRegistry()]);

  const client = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet, { registry: myRegistry, broadcastTimeoutMs: 30_000 });
  const balanceBefore = await client.getBalance(account.address, "uakt");
  const balanceBeforeUAkt = parseFloat(balanceBefore.amount);
  const akt = Math.round((balanceBeforeUAkt / 1_000_000) * 100) / 100;
  console.log("Balance: " + akt + "akt");

  const cert = await ensureValidCert(account.address, client);

  const gpuResult = await axios.get<GpuResult>("https://api.cloudmos.io/internal/gpu");

  const vendors = Object.keys(gpuResult.data.gpus.details).filter((x) => x !== "<UNKNOWN>");

  const models = vendors.flatMap((vendor) => gpuResult.data.gpus.details[vendor].map((x) => ({ vendor, ...x })));

  models.sort(
    (a, b) => a.vendor.localeCompare(b.vendor) || a.model.localeCompare(b.model) || a.ram.localeCompare(b.ram) || a.interface.localeCompare(b.interface)
  );

  // const doneModels: string[] = [];
  for (const model of models) {
    const dseq = (await getCurrentHeight(apiEndpoint)).toString();

    process.stdout.write(`Creating deployment for ${model.vendor} ${model.model} ${model.ram} ${model.interface}...`);

    // if (doneModels.includes(model.model + "-" + model.ram)) {
    //   console.log(" Skipping.");
    //   continue;
    // }

    const gpuSdl = await getModelSdl(model.vendor, model.model, model.ram, model.interface);

    await createDeployment(client, gpuSdl, account.address, dseq);

    process.stdout.write(" Done. Waiting for bids... ");

    await sleep(30_000);

    const bids = await getBids(apiEndpoint, account.address, dseq);

    process.stdout.write(` Got ${bids.bids.length} bids. Closing deployment...`);

    await closeDeployment(client, account.address, dseq);

    console.log(" Done.");
    // doneModels.push(model.model + "-" + model.ram);

    await sleep(10_000);
  }

  console.log("Finished!");

  const balanceAfter = await client.getBalance(account.address, "uakt");
  const balanceAfterUAkt = parseFloat(balanceAfter.amount);
  const diff = balanceBeforeUAkt - balanceAfterUAkt;

  const aktPrice = 5.25;
  console.log(`The operation cost ${diff / 1_000_000} akt (~${(diff * aktPrice) / 1_000_000}$)`);
}

async function getModelSdl(vendor: string, model: string, ram: string, gpuInterface: string) {
  let gpuSdl = await fs.promises.readFile("./sdl/gpu-with-ram.sdl.yml", "utf8");
  gpuSdl = gpuSdl.replace("<VENDOR>", vendor);
  gpuSdl = gpuSdl.replace("<MODEL>", model);
  gpuSdl = gpuSdl.replace("<RAM>", ram);
  gpuSdl = gpuSdl.replace("<INTERFACE>", gpuInterface.toLowerCase().startsWith("sxm") ? "sxm" : gpuInterface.toLowerCase());

  return gpuSdl;
}

run();

type GpuResult = {
  gpus: {
    total: { allocatable: number; allocated: number };
    details: {
      [key: string]: {
        model: string;
        ram: string;
        interface: string;
        allocatable: number;
        allocated: number;
      }[];
    };
  };
};
