import { EnvSchemaType } from "../../utils";
import { NOTIFICATION_LETTER } from "../constants";
import { Pipeline } from ".";
import { stepMoveJarToTargetDir, stepPackageJar } from "./common";

export async function nlPiprline(env: EnvSchemaType, branchName: string, commitId: string, force: boolean = false) {
  const pipeline = new Pipeline(env, NOTIFICATION_LETTER);
  await pipeline.init(commitId, branchName, force);

  pipeline.use(stepPackageJar(`${env.EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER}`));

  pipeline.use(
    stepMoveJarToTargetDir(
      `${env.EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER}/target`,
      `${env.EZ_PIPELINE_STREAMS2_NOTIFICATION_LETTER_OUTPUT}/${commitId}.jar`,
    ),
  );

  await pipeline.exec();
}
