import {
    type FrontendPipelineApi,
    type FPSPipelineApi,
    type NLPipelineApi,
    type STRPipelineApi,
} from "@pipeline/server";
import { hc } from "hono/client";

export type PipelineName =
    | "streams2-frontend"
    | "streams2-nl"
    | "streams2-str"
    // | "streams2-labelling"
    | "streams2-fps";

export async function fetchFrontendStatus() {
    const client = hc<FrontendPipelineApi["apiPipelineStatus"]>("/");
    return (await client.pipeline.streams2.frontend.$get()).json();
}

export async function fetchNLStatus() {
    const client = hc<NLPipelineApi["apiGetPipelineStatus"]>("/");
    return (await client.pipeline.streams2.nl.$get()).json();
}

export async function fetchSTRStatus() {
    const client = hc<STRPipelineApi["apiGetPipelineStatus"]>("/");
    return (await client.pipeline.streams2.str.$get()).json();
}

export async function fetchFPSStatus() {
    const client = hc<FPSPipelineApi["apiGetPipelineStatus"]>(
        "import.meta.env.BASE_URL",
    );
    return (await client.pipeline.streams2.fps.$get()).json();
}

export function apiDispatch(name: PipelineName) {
    console.log("Promise execed");
    switch (name) {
        case "streams2-str":
            return fetchSTRStatus();
        case "streams2-frontend":
            return fetchFrontendStatus();
        case "streams2-nl":
            return fetchNLStatus();
        case "streams2-fps":
            return fetchFPSStatus();
    }
}
