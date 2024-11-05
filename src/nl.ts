import { Hono } from "hono";
import { triggerPull } from "./gitHelper";
import { env, getBuildLogText, PipelineState } from "./utils";
import { GitError, GitResponseError } from "simple-git";
import { HTTPException } from "hono/http-exception";
import { nlPiprline } from "./lib/pipeline/streams2-p2-notification-letter-service";
import { NOTIFICATION_LETTER } from "./lib/constants";

const nl = new Hono();

nl.post("/pipeline/streams2/nl/activeBranch/:commitId", async (c) => {
  const { commitId } = c.req.param();
  const myEnv = env(c);
  const state = await PipelineState.init(myEnv);
  const { availableBranches } = state.readByPipelineName(NOTIFICATION_LETTER);
  const branchInfo = availableBranches.find((value) => value.name.includes(commitId));
  if (!branchInfo) {
    return c.notFound();
  }
  state.updateStateByKey(NOTIFICATION_LETTER, "activeBranch", branchInfo.name);
  state.updateStateByKey(NOTIFICATION_LETTER, "activeResourcesPath", branchInfo.path);
  return c.json({
    msg: "The given branch is considered active",
  });
});

nl.post('/pipeline/streams2/nl/:branchName/:commitId', async (c) => {

  console.log("trigger streams2 nl pipeline");
  const { commitId, branchName } = c.req.param();
  const myEnv = env(c);
  try {
    await triggerPull(myEnv.EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER, commitId);
    // 开始触发, 触发后不需要等待它结束
    nlPiprline(myEnv, branchName, commitId);
    return c.text(`triggered the build process for commit: ${commitId}`);
  } catch (e) {
    if (e instanceof GitError) {
      if (e.message.includes("not a git repository")) {
        throw new HTTPException(500, {
          message:
            "检查下是不是没有安装git环境, 或者环境变量中 STREAMS2_NOTIFICATION_LETTER 路径是否错误，该路径需要指向 Streams2 前端项目的根目录",
        });
      }
      if (e.message.includes("did not match any file")) {
        throw new HTTPException(404, { message: `请检查 commitId ${commitId} 是否在库内` });
      }
    }
    if (e instanceof GitResponseError) {
      throw new HTTPException(404, { message: `没有在分支: ${branchName} 上找到指定的 commit. commitId: ${commitId}` });
    }
    throw e;
  }
});

nl.get("/pipeline/streams2/nl/:branchName/:commitId", async (c) => {
  const { commitId } = c.req.param();
  const log = await getBuildLogText(env(c), commitId);
  return c.text(log);
});

nl.get("/pipeline/streams2/nl", async (c) => {
  const state = await PipelineState.init(env(c));
  const { buildStatus } = state.readByPipelineName(NOTIFICATION_LETTER);
  return c.json({
    msg: "Return build staus",
    buildingStatus: buildStatus,
  });
});
