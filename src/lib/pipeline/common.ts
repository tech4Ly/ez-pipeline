import { exec } from "child_process";
import { PipelineHandler, printTitle } from ".";
import { PipelineState, promiseFromChildProcess } from "../../utils";
import { opendir } from "fs/promises";
import path from "path";
import { copyFileSync } from "fs";


export function stepPackageJar(cwd: string): PipelineHandler {
  return async (ctx, next) => {
    await printTitle(ctx.logStream, "Step 1: Spring Boot package");

    const childHandler = exec(
      `mvn clean install spring-boot:repackage -DskipTests -Denv.config=local -Dspring.profiles=local`,
      { cwd }
    );
    if (!childHandler.stderr || !childHandler.stdout) {
      throw new Error("no stderr or stdout");
    }
    childHandler.stdout.pipe(ctx.logStream, { end: false });
    childHandler.stderr.pipe(ctx.logStream, { end: false });
    console.log("start to run mvn clean install spring-boot:repackage");
    const [code, _signals] = await promiseFromChildProcess(childHandler);
    if (code !== 0) {
      ctx.pipeStatus.writePipelineStatu("Failure", 0);
      console.error("pipeline fail on 'mvn install spring-boot:repackage'");
      return;
    }
    ctx.pipeStatus.writePipelineStatu("In Progress", 90);
    await next();
  };
}
export function stepMoveJarToTargetDir(src: string, dest: `${string}.jar`): PipelineHandler {
  return async (ctx) => {
    await printTitle(ctx.logStream, "Step 2: Moving output resources to target dir");
    const dir = await opendir(src, { encoding: "utf8" });
    for await (const dirent of dir) {
      const ext = path.extname(dirent.name);
      console.log("checking file", dirent.name, " ", "ext: ", ext);
      if (ext === ".jar") {
        try {
          copyFileSync(`${dirent.parentPath}/${dirent.name}`, dest);
          const state = await PipelineState.init(ctx.env);
          const { availableBranches } = state.readByPipelineName(ctx.pipelineName);
          state.updateStateByKey(ctx.pipelineName, "availableBranches", [...availableBranches, {
            path: dest,
            name: ctx.pipeStatus.commitId,
          }]);
          await ctx.pipeStatus.writePipelineStatu("Success", 100);
        } catch (e) {
          console.error(e);
          await ctx.pipeStatus.writePipelineStatu("Failure", 0);
        }
      } else {
        await ctx.pipeStatus.writePipelineStatu("Failure", 0);
      }
    }
  }
}
