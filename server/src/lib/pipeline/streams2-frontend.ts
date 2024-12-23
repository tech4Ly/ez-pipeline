import { exec } from "node:child_process";
import { EnvSchemaType, PipelineState, promiseFromChildProcess, StateType, Status } from "../../utils";
import { STREAMS2_FRONTEND } from "../constants";
import { Pipeline, printTitle } from ".";

export async function startPipeline(env: EnvSchemaType, branchName: string, commitId: string, force: boolean = false) {
  const pipe = new Pipeline(env, STREAMS2_FRONTEND);
  await pipe.init(commitId, branchName, force);
  pipe.use(async (ctx, next) => {
    await printTitle(ctx.logStream, "Step 1: pnpm install");
    const childHandler = exec("pnpm i", { cwd: env.EZ_PIPELINE_STREAMS2_FRONTEND });
    if (!childHandler.stderr || !childHandler.stdout) {
      throw new Error("no stderr or stdout");
    }
    const _a = childHandler.stdout.pipe(ctx.logStream, { end: false });
    const _b = childHandler.stderr.pipe(ctx.logStream, { end: false });
    console.log("start to run pnpm install");
    const [code, signals] = await promiseFromChildProcess(childHandler);
    if (code !== 0) {
      ctx.pipeStatus.writePipelineStatu("Failure", 0);
      console.error("pipeline fail on pnpm install");
      return;
    }
    console.log("installation exit by", code);
    console.log("installation singals is", signals);
    console.log("the stream is writeable", ctx.logStream.writable);
    console.log("the stream is finished", ctx.logStream.writableFinished);
    console.log("the stream is end", ctx.logStream.writableEnded);
    ctx.pipeStatus.writePipelineStatu("In Progress", 30);
    await next();
  });

  pipe.use(async (ctx, next) => {
    await printTitle(ctx.logStream, "Step 2: pnpm run lint");
    console.log("start to run pnpm install");
    const handler2 = exec("pnpm run lint:sit", { cwd: env.EZ_PIPELINE_STREAMS2_FRONTEND });
    if (!handler2.stderr || !handler2.stdout) {
      throw new Error("no stderr or stdout");
    }
    const _a = handler2.stdout.pipe(ctx.logStream, { end: false });
    const _b = handler2.stderr.pipe(ctx.logStream, { end: false });
    const [code, signals] = await promiseFromChildProcess(handler2);
    if (code !== 0) {
      ctx.pipeStatus.writePipelineStatu("Failure", 0);
      console.error("pipeline fail on pnpm run lint:sit");
      return;
    }
    console.log("after exec pnpm run lint");
    console.log("installation exit by", code);
    console.log("installation singals is", signals);
    ctx.pipeStatus.writePipelineStatu("In Progress", 50);
    await next();
  });

  pipe.use(async (ctx, next) => {
    await printTitle(ctx.logStream, "Step 3: pnpm run build");
    const handler = exec("pnpm run build:odc", {
      cwd: env.EZ_PIPELINE_STREAMS2_FRONTEND,
      env: {
        ...ctx.env,
        EZ_PIPELINE_OUTPUT_PATH: `${ctx.env.EZ_PIPELINE_STREAMS2_FRONTEND_OUTPUT}/${ctx.pipeStatus.commitId}`,
      },
    });
    if (!handler.stderr || !handler.stdout) {
      throw new Error("no stderr or stdout");
    }
    const _a = handler.stdout.pipe(ctx.logStream, { end: false });
    const _b = handler.stderr.pipe(ctx.logStream, { end: false });
    const [code, signals] = await promiseFromChildProcess(handler);
    if (code !== 0) {
      ctx.pipeStatus.writePipelineStatu("Failure", 0);
      console.error("pipeline fail on pnpm run build");
      return;
    }
    console.log("after exec pnpm run build:odc");
    console.log("installation exit by", code);
    console.log("installation singals is", signals);
    console.log("the stream is writeable", ctx.logStream.writable);
    console.log("the stream is finished", ctx.logStream.writableFinished);
    console.log("the stream is end", ctx.logStream.writableEnded);
    ctx.pipeStatus.writePipelineStatu("In Progress", 90);
    await next();
  });

  pipe.use(async (ctx, next) => {
    console.log("The process of streams2-frontend has done");
    const state = await PipelineState.init(ctx.env);
    const { availableBranches } = state.readByPipelineName(STREAMS2_FRONTEND);
    const branches = [...availableBranches, {
      name: `${ctx.pipeStatus.branchName}-${ctx.pipeStatus.commitId}`,
      path: `${ctx.env.EZ_PIPELINE_STREAMS2_FRONTEND_OUTPUT}/${commitId}`,
    }];
    state.updateStateByKey(ctx.pipelineName, "availableBranches", branches);
    ctx.pipeStatus.writePipelineStatu("Success", 100);
    return;
  });
  await pipe.exec();
}
