import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { env as honoEnv } from "hono/adapter";
import { HTTPException } from "hono/http-exception";
import { ChildProcess } from "node:child_process";
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
  EZ_PIPELINE_LOG_LOCATION: z.string(),
  EZ_PIPELINE: z.string(),
  EZ_PIPELINE_STATE_LOCATION: z.string(),
  EZ_PIPELINE_STREAMS2_FRONTEND_OUTPUT: z.string(),
  EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER_OUTPUT: z.string(),
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

export async function getBuildLogText(env: EnvSchemaType, commitId: string) {
  const logFilePath = `${env.EZ_PIPELINE_LOG_LOCATION}/${commitId}.log`;
  const file = await fs.open(logFilePath, "r");
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

  async replaceState(state: StateType) {
    this.state = state;
    this._stateQueque.push(state);
    await this.exectue();
  }
  async flush() {
    if (this._stateQueque.length > 0) {
      while (this._writing) {}
      await fs.writeFile(`${this.env.EZ_PIPELINE_STATE_LOCATION}/state.json`, JSON.stringify(this._stateQueque.pop()));
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

  async replaceStateByName(name: string, state: StateElementType) {
    const newState = [...this.state];
    const idx = newState.findIndex(s => s.pipelineName === name);
    newState[idx] = state;
    this.replaceState(newState);
  }

  async updateStateByKey<K extends keyof StateElementType>(name: string, key: K, value: StateElementType[K]) {
    const state = this.state.find(s => s.pipelineName === name);
    if (state) {
      const newState = {
        ...state,
        [key]: value,
      };
      await this.replaceStateByName(name, newState);
    }
  }

  async updateBuildStatus(name: string, commitId: string, status: BuildStatus) {
    const state = this.state.find(s => s.pipelineName === name);
    if (state) {
      const targetStatusIdx = state.buildStatus.findIndex(b => b.commitId === commitId);
      const newBuildStatus = [...state.buildStatus];
      if (targetStatusIdx < 0) {
        newBuildStatus.push(status);
      } else {
        newBuildStatus[targetStatusIdx] = status;
      }
      await this.updateStateByKey(name, "buildStatus", newBuildStatus);
    }
  }
}
