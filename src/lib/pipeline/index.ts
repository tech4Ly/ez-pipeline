import { HTTPException } from "hono/http-exception";
import { createWriteStream, Stats, statSync, WriteStream } from "node:fs";
import { Readable } from "node:stream";
import { EnvSchemaType, FrontEndStateType, Status, writeFrontendState } from "../../utils";

export async function pipeTitle(w: WriteStream, title: string) {
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

    const wStream = createWriteStream(`${this.env.EZ_PIPELINE_LOG_LOCATION}/${commitId}.log`, {
      flags,
      autoClose: false,
    });
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
