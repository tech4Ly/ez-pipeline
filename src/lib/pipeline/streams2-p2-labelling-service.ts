import { EnvSchemaType } from "../../utils";
import { LABELLING } from "../constants";
import { Pipeline } from ".";
import { stepMoveJarToTargetDir, stepPackageJar } from "./common";

export async function labellingPiprline(
  env: EnvSchemaType,
  branchName: string,
  commitId: string,
  force: boolean = false,
) {
  const pipeline = new Pipeline(env, LABELLING);
  await pipeline.init(commitId, branchName, force);

  pipeline.use(stepPackageJar(`${env.EZ_PIPELINE_STREAMS2_LABELLING}`));

  pipeline.use(
    stepMoveJarToTargetDir(
      `${env.EZ_PIPELINE_STREAMS2_LABELLING}/target`,
      `${env.EZ_PIPELINE_STREAMS2_LABELLING_OUTPUT}/${commitId}.jar`,
    ),
  );

  await pipeline.exec();
}
