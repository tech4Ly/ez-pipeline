import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { env as honoEnv } from "hono/adapter";
import { HTTPException } from "hono/http-exception";
import { Children } from "hono/jsx";
import { ChildProcess, spawn } from "node:child_process";
import { createWriteStream, writeFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import process from "node:process";
import * as z from "zod";

export type StateType = z.infer<typeof stateSchema>;
export type StateElementType = z.infer<typeof stateSchema.element>;
export type BranchInfo = StateElementType["availableBranches"];
export type Status = StateElementType["buildStatus"][number]["status"];
export type BuildStatus = StateElementType["buildStatus"][number];

const branchInfoSchema = z.object({
  name: z.string(),
  path: z.string(),
});

const stateSchema = z.object({
  pipelineName: z.string(),
  activeBranch: z.string(),
  activeResourcesPath: z.string(),
  availableBranches: z.array(branchInfoSchema),
  activePID: z.number(),
  buildStatus: z.array(
    z.object({
      status: z.union([z.literal("Success"), z.literal("Failure"), z.literal("In Progress")]),
      branchName: z.string(),
      commitId: z.string(),
      progression: z.number(),
    }),
  ),
}).array();

// env
const envSchema = z.object({
  EZ_PIPELINE_STREAMS2_FRONTEND: z.string(),
  EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER: z.string(),
  EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER_ADDR: z.string(),
  EZ_PIPELINE_STREAMS2_FPS: z.string(),
  EZ_PIPELINE_STREAMS2_FPS_ADDR: z.string(),
  EZ_PIPELINE_STREAMS2_STR: z.string(),
  EZ_PIPELINE_STREAMS2_STR_ADDR: z.string(),
  EZ_PIPELINE_STREAMS2_LABELLING: z.string(),
  EZ_PIPELINE_STREAMS2_LABELLING_ADDR: z.string(),
  EZ_PIPELINE_LOG_LOCATION: z.string(),
  EZ_PIPELINE: z.string(),
  EZ_PIPELINE_STATE_LOCATION: z.string(),
  EZ_PIPELINE_STREAMS2_FRONTEND_OUTPUT: z.string(),
  EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER_OUTPUT: z.string(),
  EZ_PIPELINE_STREAMS2_FPS_OUTPUT: z.string(),
  EZ_PIPELINE_STREAMS2_STR_OUTPUT: z.string(),
  EZ_PIPELINE_STREAMS2_LABELLING_OUTPUT: z.string(),
  EZ_PIPELINE_STREAMS2_DB_URL: z.string(),
  EZ_PIPELINE_STREAMS2_DB_USERNAME: z.string(),
  EZ_PIPELINE_STREAMS2_DB_PASSWORD: z.string(),
  EZ_PIPELINE_STREAMS2_PASSWORD: z.string(),
});
export type EnvSchemaType = z.infer<typeof envSchema>;
export let env = null as unknown as typeof honoEnv<EnvSchemaType>;

export function readEnv() {
  const result = expand(config({ path: [".env.local"] }));
  if (result.error) {
    console.error("miss ENV file");
    process.exit(1);
  }
  const zodRes = envSchema.safeParse(result.parsed);
  if (zodRes.error) {
    const errFields = zodRes.error.errors.reduce((pre, cur) => {
      return pre + ", " + cur.path.toString();
    }, "");
    console.error(`ENV file not validate, miss field ${errFields}`);
    process.exit(1);
  }
  env = honoEnv<EnvSchemaType>;
}

export function promiseFromChildProcess(child: ChildProcess) {
  return new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
    child.on("close", (code, signals) => resolve([code, signals]));
    child.on("error", reject);
  });
}

export async function getLogText(logPath: `${string}.log`) {
  const file = await fs.open(logPath, "r");
  // when you read file, this file may been written
  const stat = await file.stat();
  const b = Buffer.alloc(stat.size);
  const x = await file.read(b, null, stat.size);
  return x.buffer.toString("utf8");
}

declare global {
  var State: PipelineState | null;
}

export class PipelineState {
  env: EnvSchemaType;
  state: StateType = [];
  private _stateQueque: StateType[] = [];
  private _writing = false;
  private constructor(env: EnvSchemaType) {
    this.env = env;
  }
  static async init(env: EnvSchemaType) {
    if (!globalThis.State) {
      const state = new PipelineState(env);
      await state.readFromDisk();
      globalThis.State = state;
      return state;
    }
    return globalThis.State;
  }
  async readFromDisk(): Promise<StateType> {
    const jsonFile = await fs.readFile(`${this.env.EZ_PIPELINE_STATE_LOCATION}/state.json`, {
      encoding: "utf8",
    });
    const feState = JSON.parse(jsonFile);
    const result = stateSchema.safeParse(feState);
    if (result.error) {
      throw new HTTPException(500, { message: "Parsing State Error", cause: result.error });
    }
    this.state = result.data;
    return result.data;
  }

  readAll() {
    return this.state!;
  }

  readByPipelineName(name: string) {
    const res = this.state?.find(s => s.pipelineName === name);
    if (!res) {
      throw new Error(`Cannot found pipeline by the name ${name}`);
    }
    return res;
  }

  replaceState(state: StateType) {
    this.state = state;
    // this._stateQueque.push(state);
    // await this.exectue();
    writeFileSync(`${this.env.EZ_PIPELINE_STATE_LOCATION}/state.json`, JSON.stringify(state));
  }
  flush() {
    if (this._stateQueque.length > 0) {
      while (this._writing) { }
      writeFileSync(`${this.env.EZ_PIPELINE_STATE_LOCATION}/state.json`, JSON.stringify(this._stateQueque.pop()));
    }
  }

  private async exectue() {
    const curLength = this._stateQueque.length;
    if (curLength > 0 && !this._writing) {
      const lastState = this._stateQueque[curLength - 1];
      this._writing = true;
      await fs.writeFile(`${this.env.EZ_PIPELINE_STATE_LOCATION}/state.json`, JSON.stringify(lastState));
      this._writing = false;
      this._stateQueque = this._stateQueque.splice(0, curLength);
    } else {
      console.log("Somewhere is writing state, pushed to queue");
    }
  }

  replaceStateByName(name: string, state: StateElementType) {
    const newState = [...this.state];
    const idx = newState.findIndex(s => s.pipelineName === name);
    newState[idx] = state;
    this.replaceState(newState);
  }

  updateStateByKey<K extends keyof StateElementType>(name: string, key: K, value: StateElementType[K]) {
    const state = this.state.find(s => s.pipelineName === name);
    if (state) {
      const newState = {
        ...state,
        [key]: value,
      };
      this.replaceStateByName(name, newState);
    }
  }

  updateBuildStatus(name: string, commitId: string, status: BuildStatus) {
    const state = this.state.find(s => s.pipelineName === name);
    if (state) {
      const targetStatusIdx = state.buildStatus.findIndex(b => b.commitId === commitId);
      const newBuildStatus = [...state.buildStatus];
      if (targetStatusIdx < 0) {
        newBuildStatus.push(status);
      } else {
        newBuildStatus[targetStatusIdx] = status;
      }
      this.updateStateByKey(name, "buildStatus", newBuildStatus);
    }
  }
}

export async function processKill(pid: number, timeout: number) {
  return new Promise((res, rej) => {
    let count = 0;
    let err: Error | null = null;
    try {
      process.kill(pid, "SIGINT");
    } catch (e) {
      if (e instanceof Error) {
        err = e;
      }
    }
    if (err) {
      rej(new Error(`PID: ${pid} is not running`));
    }
    setInterval(() => {
      try {
        process.kill(pid, 0);
      } catch {
        res(true);
      }
      if ((count += 100) > timeout) {
        rej(new Error("Timeout"));
      }
    }, 100);
  });
}

export function execJar(jarPath: `${string}.jar`, password: string, logPath: string, args: string[] = []) {
  const proc = spawn("java", ["-jar", jarPath, `-Djasypt.encryptor.password="${password}"`, ...args]);

  const wStream = createWriteStream(`${logPath}`, {
    flags: "w",
  });
  proc.stdout.pipe(wStream);
  proc.stderr.pipe(wStream);

  return proc.pid;
}
