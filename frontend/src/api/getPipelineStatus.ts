import { type FrontendPipelineApi, type FPSPipelineApi, type NLPipelineApi, type STRPipelineApi } from '@pipeline/server';
import { hc } from 'hono/client';

async function fetchFrontendStatus() {
  const client = hc<FrontendPipelineApi['apiPipelineStatus']>('http://localhost:3000/');
  return (await (client.pipeline.streams2.frontend.$get())).json();
}

async function fetchNLStatus() {
  const client = hc<NLPipelineApi['apiGetPipelineStatus']>('http://localhost:3000/');
  return (await client.pipeline.streams2.nl.$get()).json();
}

async function fetchSTRStatus() {
  const client = hc<STRPipelineApi['apiGetPipelineStatus']>('http://localhost:3000/');
  return (await client.pipeline.streams2.str.$get()).json();
}

async function fetchFPSStatus() {
  const client = hc<FPSPipelineApi['apiGetPipelineStatus']>('http://localhost:3000/');
  return (await client.pipeline.streams2.fps.$get()).json();
}
