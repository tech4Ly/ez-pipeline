import { serve } from "@hono/node-server";
import { Hono } from "hono";
import frontend from "./frontend";
import nl from "./nl";
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
app.onError((err, c) => {
  console.error(err);
  return c.json({ errorMsg: err.message }, 500);
});

serve({
  ...app,
  hostname: "0.0.0.0",
});
