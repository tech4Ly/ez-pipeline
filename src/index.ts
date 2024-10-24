import { Hono } from 'hono'
import { serve } from '@hono/node-server';
import frontend from './frontend';
import { readEnv } from './utils';
import { type EnvSchemaType } from './utils';
import { HTTPException } from 'hono/http-exception';

readEnv();

const app = new Hono<{ Bindings: EnvSchemaType }>();
app.get('/ping', (c) => {
  return c.text('pong');
})
/**
* 1. rsbuild
*/
app.get('/pipeline', (c) => {
  return c.text('Hello, World!');
});
app.route('/', frontend);
app.onError((err, c) => {
  console.error(err);
  return c.json({errorMsg: err.message}, 500);
});

serve({
  ...app,
  hostname: '0.0.0.0'
});
