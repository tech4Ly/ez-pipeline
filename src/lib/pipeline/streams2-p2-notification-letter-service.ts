import { exec } from "child_process";
import { EnvSchemaType, promiseFromChildProcess } from "../../utils";
import { NOTIFICATION_LETTER } from "../constants";
import { Pipeline, printTitle } from ".";

export async function nlPiprline(env: EnvSchemaType, branchName: string, commitId: string, force: boolean = false) {
  const pipeline = new Pipeline(env, NOTIFICATION_LETTER);
  await pipeline.init(commitId, branchName, force);

  pipeline.use(async (ctx, next) => {
    await printTitle(ctx.logStream, "Step 1: Spring Boot package");

    const childHandler = exec(
      `mvn clean install spring-boot:repackage -DskipTests -Denv.config=local -Dspring.profiles=local -Dproject.build.directory=${env.EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER_OUTPUT}/${ctx.pipeStatus.commitId}`,
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
    ctx.pipeStatus.writePipelineStatu("Success", 100);
  });
  await pipeline.exec();
}
