import { HTTPException } from "hono/http-exception";
import { exec } from "node:child_process";
import { createWriteStream, Stats, statSync, WriteStream } from "node:fs";
import { Readable } from "node:stream";
import { EnvSchemaType, FrontEndStateType, promiseFromChildProcess, Status, writeFrontendState } from "../utils";

async function pipeTitle(w: WriteStream, title: string) {
  const b = Buffer.from(`\r\n==============${title}===========\r\n`);
  const rs = Readable.from(b);
  rs.pipe(w, { end: false });
  return new Promise((res, rej) => {
    rs.once("end", () => res(true));
    rs.once("error", rej);
  });
}

class PipelineStatus {
  branchName: string;
  commitId: string;
  progression = 0;
  status: Status = "In Progress";
  env: EnvSchemaType;
  constructor(commitId: string, branchName: string, env: EnvSchemaType) {
    this.branchName = branchName;
    this.commitId = commitId;
    this.env = env;
  }
  async writePipelineStatu(nextStatus: Status, progression: number) {
    const newStatus: FrontEndStateType["buildStatus"][number] = {
      status: nextStatus,
      commitId: this.commitId,
      branchName: this.branchName,
      progression: progression,
    };
    await writeFrontendState("buildStatus", newStatus, this.env);
  }
}

export async function pipeline(env: EnvSchemaType, branchName: string, commitId: string, force: boolean = false) {
  const pipe = new Pipeline(env);
  await pipe.init(commitId, branchName, force);
  pipe.use(async (ctx, next) => {
    await pipeTitle(ctx.logStream, "Step 1: pnpm install");
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
      throw new HTTPException(500, { message: "pipeline fail on pnpm install" });
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
    await pipeTitle(ctx.logStream, "Step 2: pnpm run lint");
    console.log("start to run pnpm install");
    const handler2 = exec("pnpm run lint", { cwd: env.EZ_PIPELINE_STREAMS2_FRONTEND });
    if (!handler2.stderr || !handler2.stdout) {
      throw new Error("no stderr or stdout");
    }
    const _a = handler2.stdout.pipe(ctx.logStream, { end: false });
    const _b = handler2.stderr.pipe(ctx.logStream, { end: false });
    const [code, signals] = await promiseFromChildProcess(handler2);
    if (code !== 0) {
      ctx.pipeStatus.writePipelineStatu("Failure", 0);
      throw new HTTPException(500, { message: "pipeline fail on pnpm run lint" });
    }
    console.log("after exec pnpm run lint");
    console.log("installation exit by", code);
    console.log("installation singals is", signals);
    ctx.pipeStatus.writePipelineStatu("In Progress", 50);
    await next();
  });

  pipe.use(async (ctx, next) => {
    await pipeTitle(ctx.logStream, "Step 3: pnpm run build");
    const handler = exec("pnpm run build", { cwd: env.EZ_PIPELINE_STREAMS2_FRONTEND });
    if (!handler.stderr || !handler.stdout) {
      throw new Error("no stderr or stdout");
    }
    const _a = handler.stdout.pipe(ctx.logStream, { end: false });
    const _b = handler.stderr.pipe(ctx.logStream, { end: false });
    const [code, signals] = await promiseFromChildProcess(handler);
    if (code !== 0) {
      ctx.pipeStatus.writePipelineStatu("Failure", 0);
      throw new HTTPException(500, { message: "pipeline fail on pnpm run build" });
    }
    console.log("after exec pnpm run lint");
    console.log("installation exit by", code);
    console.log("installation singals is", signals);
    console.log("the stream is writeable", ctx.logStream.writable);
    console.log("the stream is finished", ctx.logStream.writableFinished);
    console.log("the stream is end", ctx.logStream.writableEnded);
    ctx.pipeStatus.writePipelineStatu("Success", 100);
    await next();
  });
  await pipe.exec();
}

interface Next {
  (): Promise<void>;
}

type PipelineHandler = (ctx: Pick<Pipeline, "env" | "logStream" | "pipeStatus">, next: Next) => Promise<void>;

export class Pipeline {
  middleware: Array<PipelineHandler> = [];
  env: EnvSchemaType;
  logStream: WriteStream = null as unknown as WriteStream;
  pipeStatus: PipelineStatus = null as unknown as PipelineStatus;
  inited: boolean = false;
  handleErr: (e: Error) => void;
  constructor(env: EnvSchemaType) {
    this.env = env;
    this.handleErr = (err: Error) => {
      throw err;
    };
  }
  async init(commitId: string, branchName: string, force: boolean) {
    let stat: Stats | undefined;
    let flags: "w+" = "w+";
    try {
      stat = statSync(`${this.env.EZ_PIPELINE_LOG_LOCATION}/${commitId}`);
    } catch {}
    if (stat && !force) {
      throw new HTTPException(500, { message: "已经构建过该 commit，请勿重复构建" });
    }
    const pipeStatus = new PipelineStatus(commitId, branchName, this.env);
    this.pipeStatus = pipeStatus;
    pipeStatus.writePipelineStatu("In Progress", 10);

    const wStream = createWriteStream(`${this.env.EZ_PIPELINE_LOG_LOCATION}/${commitId}.log`, { flags, autoClose: false });
    this.logStream = wStream;
    this.inited = true;
  }

  onErr(handler: Pipeline["handleErr"]) {
    this.handleErr = handler;
  }

  use(handler: PipelineHandler) {
    this.middleware.push(handler);
  }
  async exec() {
    if (!this.inited) {
      throw new Error("pipeline is executed before init");
    }
    let countWarpper = { count: 0 };
    const next = async () => {
      countWarpper.count += 1;
      const count = countWarpper.count;
      if (count < this.middleware.length) {
        const fn = this.middleware[count];
        try {
          await fn(this, next);
        } catch (e) {
          this.handleErr(e as Error);
        }
      } else {
        console.log("pipeline end");
        this.logStream.destroy();
      }
    };
    await this.middleware[countWarpper.count](this, next);
  }
}
