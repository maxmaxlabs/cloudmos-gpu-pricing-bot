import { SigningStargateClient } from "@cosmjs/stargate";
import { apiEndpoint, networkMarketVersion, networkVersion } from "./constants";
import { SDL } from "@akashnetwork/akashjs/build/sdl";
import { signAndBroadcast } from "./utils";
import { MsgCloseDeployment, MsgCreateDeployment } from "@akashnetwork/akashjs/build/protobuf/akash/deployment/v1beta3/deploymentmsg";
import axios from "axios";
import { RestApiBidsResponseType } from "./types/bid";

export async function createDeployment(client: SigningStargateClient, sdlStr: string, owner: string, dseq: string) {
  //const sdl = SDL.fromString(sdlStr, "beta3");
  // ^^^ GPU resource is required for profile web ^^^
  const sdl = SDL.fromString(sdlStr, "beta3");
  //const sdl = new SDL(sdlV2.data, "beta3");
  const manifestVersion = await sdl.manifestVersion();
  const message = {
    typeUrl: `/akash.deployment.${networkVersion}.MsgCreateDeployment`,
    value: MsgCreateDeployment.fromPartial({
      id: {
        owner: owner,
        dseq: dseq
      },
      groups: sdl.groups(),
      version: manifestVersion,
      deposit: {
        denom: "uakt",
        amount: "500000" // 0.5 AKT
      },
      depositor: owner
    })
  };

  await signAndBroadcast(owner, client, [message]);
}

export async function closeDeployment(client: SigningStargateClient, owner: string, dseq: string) {
  const message = {
    typeUrl: `/akash.deployment.${networkVersion}.MsgCloseDeployment`,
    value: MsgCloseDeployment.fromPartial({
      id: {
        owner: owner,
        dseq: dseq
      }
    })
  };

  await signAndBroadcast(owner, client, [message]);
}

export async function getBids(apiEndpoint: string, owner: string, dseq: string) {
  const response = await axios.get<RestApiBidsResponseType>(
    `${apiEndpoint}/akash/market/${networkMarketVersion}/bids/list?filters.owner=${owner}&filters.dseq=${dseq}`
  );

  return response.data;
}
