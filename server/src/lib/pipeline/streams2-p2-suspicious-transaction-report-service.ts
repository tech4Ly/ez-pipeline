import { EnvSchemaType } from "../../utils";
import { STR } from "../constants";
import { Pipeline } from ".";
import { stepMoveJarToTargetDir, stepPackageJar } from "./common";

export async function strPipeline(env: EnvSchemaType, branchName: string, commitId: string, force: boolean = false) {
  const pipeline = new Pipeline(env, STR);
  await pipeline.init(commitId, branchName, force);

  pipeline.use(stepPackageJar(`${env.EZ_PIPELINE_STREAMS2_STR}`));

  pipeline.use(
    stepMoveJarToTargetDir(
      `${env.EZ_PIPELINE_STREAMS2_STR}/target`,
      `${env.EZ_PIPELINE_STREAMS2_STR_OUTPUT}/${commitId}.jar`,
    ),
  );

  await pipeline.exec();
}
