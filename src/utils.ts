import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { env as honoEnv } from "hono/adapter";
import { HTTPException } from "hono/http-exception";
import { ChildProcess } from "node:child_process";
import * as fs from "node:fs/promises";
import process from "node:process";
import * as z from "zod";
export type BranchInfo = FrontendState["availableBranches"];
export type Status = FrontendState["buildStatus"][number]["status"];
export type FrontendState = z.infer<typeof frontendStateSchema>;

const branchInfoSchema = z.object({
  name: z.string(),
  path: z.string(),
});

const frontendStateSchema = z.object({
  activeBranch: z.string(),
  activeResourcesPath: z.string(),
  availableBranches: z.array(branchInfoSchema),
  buildStatus: z.array(
    z.object({
      status: z.union([z.literal("Success"), z.literal("Failure"), z.literal("In Progress")]),
      branchName: z.string(),
      commitId: z.string(),
      progression: z.number(),
    }),
  ),
});

export type FrontEndStateType = z.infer<typeof frontendStateSchema>;

export async function readFrontendState(env: EnvSchemaType): Promise<FrontEndStateType> {
  const jsonFile = await fs.readFile(`${env.EZ_PIPELINE_STATE_LOCATION}/frontend-state.json`, {
    encoding: "utf8",
  });
  const feState = JSON.parse(jsonFile);
  const result = frontendStateSchema.safeParse(feState);
  if (result.error) {
    throw new HTTPException(500, { message: "Parsing Frontend State Error" });
  }
  return result.data;
}

export async function writeFrontendState<T extends keyof FrontEndStateType>(
  key: T,
  value: FrontEndStateType[T] | FrontEndStateType["buildStatus"][number],
  env: EnvSchemaType,
): Promise<void> {
  let feState = await readFrontendState(env);

  function isBuildStatus(key: string, value: any): value is FrontEndStateType["buildStatus"][number] {
    return key === "buildStatus" && "status" in value;
  }

  if (isBuildStatus(key, value)) {
    const idx = feState.buildStatus.findIndex(b => b.commitId === value.commitId);
    if (idx > -1) {
      feState.buildStatus[idx] = value;
    } else {
      feState.buildStatus.push(value);
    }
  } else {
    feState[key] = value;
  }
  return fs.writeFile(`${env.EZ_PIPELINE_STATE_LOCATION}/frontend-state.json`, JSON.stringify(feState));
}

// env
const envSchema = z.object({
  EZ_PIPELINE_STREAMS2_FRONTEND: z.string(),
  EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER: z.string(),
  EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER_ADDR: z.string(),
  EZ_PIPELINE_LOG_LOCATION: z.string(),
  EZ_PIPELINE: z.string(),
  EZ_PIPELINE_STATE_LOCATION: z.string(),
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
    console.error("ENV file not validate");
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
