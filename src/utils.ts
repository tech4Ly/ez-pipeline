import * as fs from 'node:fs/promises';
import * as z from 'zod';
export interface BranchInfo {
  name: string;
  path: string;
}
type Status = 'Success' | 'Failure' | 'In Progress';
export interface FrontendState {
  activeBranch: string;
  activeResourcesPath: string;
  availableBranches: BranchInfo[];
  buildStatus: {
    status: Status;
    branchName: string;
  }[]
}

export async function readFrontendState(): FrontendState {
  const jsonFile = await fs.readFile(`${__dirname}/frontend_state`, {
    encoding: 'utf8'
  });

  // return {
  //   activeBranch: 'main',
  //   // activeResourcesPath: '/home/ncs/streams2/fontend/main',
  //   activeResourcesPath: '/Users/bb/Documents/',

  // }
}
