import { EnvSchemaType } from "../../utils";
import { FPS } from "../constants";
import { Pipeline } from ".";
import { stepMoveJarToTargetDir, stepPackageJar } from "./common";

export async function fpsPiprline(env: EnvSchemaType, branchName: string, commitId: string, force: boolean = false) {
  const pipeline = new Pipeline(env, FPS);
  await pipeline.init(commitId, branchName, force);

  pipeline.use(stepPackageJar(`${env.EZ_PIPELINE_STREAMS2_FPS}`));

  pipeline.use(
    stepMoveJarToTargetDir(
      `${env.EZ_PIPELINE_STREAMS2_FPS_ADDR}/target`,
      `${env.EZ_PIPELINE_STREAMS2_FPS_OUTPUT}/${commitId}.jar`,
    ),
  );

  await pipeline.exec();
}
