import { Hono } from 'hono'
import { serve } from '@hono/node-server';
import frontend from './frontend';



const app = new Hono( );
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

serve({
  ...app,
  hostname: '0.0.0.0'
});
