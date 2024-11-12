import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { GitError, GitResponseError } from "simple-git";
import { triggerPull } from "./gitHelper";
import { FPS } from "./lib/constants";
import { fpsPipeline } from "./lib/pipeline/streams2-p2-fps-service";
import { env, execJar, getLogText, PipelineState, processKill } from "./utils";

const fps = new Hono();

const apiSetActiveCommit = fps.post("/pipeline/streams2/fps/activeBranch/:commitId", async (c) => {
  const { commitId } = c.req.param();
  const myEnv = env(c);
  const state = await PipelineState.init(myEnv);
  const { availableBranches, activePID } = state.readByPipelineName(FPS);
  const branchInfo = availableBranches.find((value) => value.name.includes(commitId));
  if (!branchInfo) {
    return c.notFound();
  }
  if (activePID > 0) {
    try {
      await processKill(activePID, 5000);
    } catch {
      return c.json({
        msg: "Fail on terminate app",
      }, 500);
    }
  }
  const pid = execJar(
    `${myEnv.EZ_PIPELINE_STREAMS2_FPS_OUTPUT}/${branchInfo.name}.jar`,
    myEnv.EZ_PIPELINE_STREAMS2_PASSWORD,
    `${myEnv.EZ_PIPELINE_LOG_LOCATION}/${branchInfo.name}.run.log`,
  );
  if (pid) {
    state.updateStateByKey(FPS, "activeBranch", branchInfo.name);
    state.updateStateByKey(FPS, "activeResourcesPath", branchInfo.path);
    state.updateStateByKey(FPS, "activePID", pid);
    return c.json({
      msg: "The given branch is considered active",
    });
  }
  return c.json({
    msg: "Fail on run the app",
  }, 500);
});

const apiGetAppLog = fps.get("/pipeline/streams2/fps/activeBranch/:commitId", async (c) => {
  const myEnv = env(c);
  const state = await PipelineState.init(myEnv);
  const { activeBranch } = state.readByPipelineName(FPS);
  if (activeBranch) {
    const log = await getLogText(`${myEnv.EZ_PIPELINE_LOG_LOCATION}/${activeBranch}.run.log`);
    return c.text(log);
  }
  return c.notFound();
});

const apiTriggerPipeline = fps.post("/pipeline/streams2/fps/:branchName/:commitId", async (c) => {
  console.log("trigger streams2 fps pipeline");
  const { commitId, branchName } = c.req.param();
  const myEnv = env(c);
  try {
    await triggerPull(myEnv.EZ_PIPELINE_STREAMS2_FPS, commitId);
    // 开始触发, 触发后不需要等待它结束
    fpsPipeline(myEnv, branchName, commitId);
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

const apiGetPipelineDetail = fps.get("/pipeline/streams2/fps/:branchName/:commitId", async (c) => {
  const { commitId } = c.req.param();
  const log = await getLogText(`${env(c).EZ_PIPELINE_LOG_LOCATION}/${commitId}.log`);
  return c.text(log);
});

const apiGetPipelineStatus =  fps.get("/pipeline/streams2/fps", async (c) => {
  const state = await PipelineState.init(env(c));
  const { buildStatus } = state.readByPipelineName(FPS);
  return c.json({
    msg: "Return build staus",
    buildingStatus: buildStatus,
  });
});

export default fps;

export type FPSPipelineApi = {
  apiSetActiveCommit: typeof apiSetActiveCommit,
  apiGetAppLog: typeof apiGetAppLog,
  apiGetPipelineDetail: typeof apiGetPipelineDetail,
  apiGetPipelineStatus: typeof apiGetPipelineStatus,
  apiTriggerPipeline: typeof apiTriggerPipeline,
}
