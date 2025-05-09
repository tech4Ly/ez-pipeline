import { serve } from "@hono/node-server";
import { Hono } from "hono";
import fps from "./fps";
import frontend from "./frontend";
import labelling from "./labelling";
import nl from "./nl";
import str from "./str";
import { readEnv, env, PipelineState } from "./utils";
import { type EnvSchemaType } from "./utils";
export { type FrontendPipelineApi } from "./frontend";
export { type FPSPipelineApi } from "./fps";
export { type NLPipelineApi } from "./nl";
export { type STRPipelineApi } from "./str";
import {
    STR,
    FPS,
    LABELLING,
    NOTIFICATION_LETTER,
    STREAMS2_FRONTEND,
} from "./lib/constants";

readEnv();

const app = new Hono();
app.get("/ping", (c) => {
    return c.text("pong");
});
/**
 * 1. rsbuild
 */
app.get("/pipeline", (c) => {
    return c.text("Hello, World!");
});
app.route("/", frontend);
app.route("/", nl);
app.route("/", fps);
app.route("/", labelling);
app.route("/", str);
const getStatusByPipelineName = app.get(
    "/pipeline/:pipelineName/status",
    async (c) => {
        const myEnv = env(c);
        const state = await PipelineState.init(myEnv);
        let pipeName: string | undefined;
        switch (c.req.param("pipelineName")) {
            case "str":
                pipeName = STR;
            case "nl":
                pipeName = NOTIFICATION_LETTER;
            case "frontend":
                pipeName = STREAMS2_FRONTEND;
            case "labelling":
                pipeName = LABELLING;
            case "fps":
                pipeName = FPS;
        }
        if (!pipeName) return c.notFound();

        return c.json(state.readByPipelineName(pipeName));
    },
);
app.onError((err, c) => {
    console.error(err);
    return c.json({ errorMsg: err.message }, 500);
});

serve({
    ...app,
    hostname: "0.0.0.0",
});

export type GetStatusByPipelineName = typeof getStatusByPipelineName;
