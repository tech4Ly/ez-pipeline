import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { env as honoEnv } from "hono/adapter";
import { HTTPException } from "hono/http-exception";
import { ChildProcess } from "node:child_process";
import { ReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import process from "node:process";
import * as z from "zod";
export type BranchInfo = FrontendState["availableBranches"];
export type Status = FrontendState["buildStatus"][number]["status"];
export type FrontendState = z.infer<typeof frontendStateSchema>;
export type BuildStatus = FrontEndStateType["buildStatus"][number];

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

const nlStateSchema = frontendStateSchema.and(z.object({
  activePID: z.number(),
}));

export type FrontEndStateType = z.infer<typeof frontendStateSchema>;
export type NLStateType = z.infer<typeof nlStateSchema>;

export async function baseReadState<Z extends z.ZodTypeAny>(schema: Z, filePath: string): Promise<z.infer<Z>> {
  const jsonFile = await fs.readFile(filePath, {
    encoding: "utf8",
  });
  const feState = JSON.parse(jsonFile);
  const result = schema.safeParse(feState);
  if (result.error) {
    throw new HTTPException(500, { message: "Parsing State Error" });
  }
  return result.data;
}

export async function readFrontendState(env: EnvSchemaType) {
  return baseReadState(frontendStateSchema, `${env.EZ_PIPELINE_STATE_LOCATION}/frontend-state.json`);
}

export async function readNLState(env: EnvSchemaType) {
  return baseReadState(nlStateSchema, `${env.EZ_PIPELINE_STATE_LOCATION}/streams2-p2-notification-letter-state.json`);
}

export async function baseWriteState<T extends z.ZodType<FrontEndStateType>, K extends keyof z.infer<T>>(
  schema: T,
  key: K,
  value: z.infer<T>[K] | (FrontEndStateType["buildStatus"][number]),
  filePath: string,
): Promise<void> {
  let feState = await baseReadState(schema, filePath);

  function isBuildStatus(key: string | number | symbol, value: any): value is BuildStatus {
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
  return fs.writeFile(filePath, JSON.stringify(feState));
}

export async function writeFrontendState<K extends keyof FrontEndStateType>(
  key: K,
  value: FrontEndStateType[K] | BuildStatus,
  env: EnvSchemaType,
) {
  return baseWriteState(frontendStateSchema, key, value, `${env.EZ_PIPELINE_STATE_LOCATION}/frontend-state.json`);
}
export async function writeNLState<K extends keyof NLStateType>(key: K, value: NLStateType[K], env: EnvSchemaType) {
  return baseWriteState(nlStateSchema, key, value, `${env.EZ_PIPELINE_STATE_LOCATION}/frontend-state.json`);
}

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
