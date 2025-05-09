import { PipelineName } from "./getPipelineStatus";
import { hc } from "hono/client";
import {
    type FPSPipelineApi,
    type FrontendPipelineApi,
    type NLPipelineApi,
    type STRPipelineApi,
} from "@pipeline/server";

async function apiDispatch(name: PipelineName, commitId: string) {
    switch (name) {
        case "streams2-str": {
            const client = hc<STRPipelineApi["apiSetActiveCommit"]>("/");
            return await client.pipeline.streams2.str.activeBranch[
                ":commitId"
            ].$post({ param: { commitId } });
        }
        case "streams2-frontend": {
            const client = hc<FrontendPipelineApi["apiSetActiveCommit"]>("/");
            return await client.pipeline.streams2.frontend.activeBranch[
                ":commitId"
            ].$post({ param: { commitId } });
        }
        case "streams2-nl": {
            const client = hc<NLPipelineApi["apiSetActiveCommit"]>("/");
            return await client.pipeline.streams2.nl.activeBranch[
                ":commitId"
            ].$post({ param: { commitId } });
        }
        case "streams2-fps": {
            const client = hc<FPSPipelineApi["apiSetActiveCommit"]>("/");
            return await client.pipeline.streams2.fps.activeBranch[
                ":commitId"
            ].$post({ param: { commitId } });
        }
    }
}

export default apiDispatch;
