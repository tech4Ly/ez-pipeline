import { exec } from "child_process";
import * as fs from "fs";
import { opendir } from "node:fs/promises";
import * as path from "path";
import { EnvSchemaType, PipelineState, promiseFromChildProcess } from "../../utils";
import { NOTIFICATION_LETTER } from "../constants";
import { Pipeline, printTitle } from ".";

export async function nlPiprline(env: EnvSchemaType, branchName: string, commitId: string, force: boolean = false) {
  const pipeline = new Pipeline(env, NOTIFICATION_LETTER);
  await pipeline.init(commitId, branchName, force);

  pipeline.use(async (ctx, next) => {
    await printTitle(ctx.logStream, "Step 1: Spring Boot package");

    const childHandler = exec(
      `mvn clean install spring-boot:repackage -DskipTests -Denv.config=local -Dspring.profiles=local`,
      { cwd: env.EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER },
    );
    if (!childHandler.stderr || !childHandler.stdout) {
      throw new Error("no stderr or stdout");
    }
    const _a = childHandler.stdout.pipe(ctx.logStream, { end: false });
    const _b = childHandler.stderr.pipe(ctx.logStream, { end: false });
    console.log("start to run pnpm install");
    const [code, _signals] = await promiseFromChildProcess(childHandler);
    if (code !== 0) {
      ctx.pipeStatus.writePipelineStatu("Failure", 0);
      console.error("pipeline fail on 'mvn install spring-boot:repackage'");
      return;
    }
    ctx.pipeStatus.writePipelineStatu("In Progress", 90);
    await next();
  });

  pipeline.use(async (ctx) => {
    await printTitle(ctx.logStream, "Step 2: Moving output resources to target dir");
    const dir = await opendir(`${ctx.env.EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER}/target`, { encoding: "utf8" });
    for await (const dirent of dir) {
      const ext = path.extname(dirent.name);
      console.log("checking file", dirent.name, " ", "ext: ", ext);
      if (ext === ".jar") {
        try {
          const dest = `${ctx.env.EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER_OUTPUT}/${ctx.pipeStatus.commitId}.jar`;
          fs.copyFileSync(`${dirent.parentPath}/${dirent.name}`, dest);
          const state = await PipelineState.init(ctx.env);
          const { availableBranches } = state.readByPipelineName(ctx.pipelineName);
          state.updateStateByKey(ctx.pipelineName, "availableBranches", [...availableBranches, {
            path: dest,
            name: ctx.pipeStatus.commitId,
          }]);
          await ctx.pipeStatus.writePipelineStatu("Success", 100);
        } catch (e) {
          await ctx.pipeStatus.writePipelineStatu("Failure", 0);
        }
      }
      await ctx.pipeStatus.writePipelineStatu("Failure", 0);
    }
  });

  await pipeline.exec();
}
