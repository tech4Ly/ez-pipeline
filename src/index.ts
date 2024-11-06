import { serve } from "@hono/node-server";
import { Hono } from "hono";
import fps from "./fps";
import frontend from "./frontend";
import labelling from "./labelling";
import nl from "./nl";
import str from "./str";
import { readEnv } from "./utils";
import { type EnvSchemaType } from "./utils";

readEnv();

const app = new Hono<{ Bindings: EnvSchemaType }>();
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
app.onError((err, c) => {
  console.error(err);
  return c.json({ errorMsg: err.message }, 500);
});

serve({
  ...app,
  hostname: "0.0.0.0",
});
