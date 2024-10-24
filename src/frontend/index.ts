import { Hono } from "hono";
import { stream } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static"
import * as fs from 'node:fs'
import * as fsPs from 'node:fs/promises';
import * as path from 'node:path';
import { getMimeType } from "hono/utils/mime";
import { env, getBuildLogText, readFrontendState } from "../utils";
import { GitError, GitResponseError, LogResult, simpleGit } from "simple-git";
import { HTTPException } from "hono/http-exception";
import { pipeline } from "./build";
/** 前端流程
 1. pre-commit format
 2. git push origin:target-test
 3. rsbuild build with option: 
    - outputDir: branch-name
    - mode: development
    - load rsbuild.config.ts
 4. select a version to be run on a specify port like (e.g 3000)
*/


/** 
# 前端模块
## 这模块干嘛的？
### 用户视角
- 用户可以看到近期的开发分支
- 用户能在网页端选择应用一个分支进行测试
- 若是测试结果不如预期可以快速复原回 main 分支
- 能够通过入口访问网页应用

### 开发者视角
- [] 用户上传完分支后，服务需要获取到该分支代码进行构建
- [] 构建完成后存放到文件系统中，改变该分支的状态，使得用户可以应用该分支进行测试
- [] 若是构建失败则无法合并至 main 分支, 并改变分支状态至错误状态
- [] 应用该分支既是把 文件静态服务的入口移动至该分支的构建产物路径
- [] 复原 mian 分支既是把 境外文件系统服务的入口移动至 main 分支产物的目录
- [] 有一个定时服务会删除过期产物以及过期分支 (被标记过的特殊分支不会被删除)
- [x] 为了避免前端应用在请求后端数据时出现 CORS 错误，需要一个代理
- [x] 为了提供前端服务，需要一个静态资源服务
- [x] 提供一个入口访问前端服务

## 实现逻辑

*/
const frontend = new Hono();
// frontend.use('/resources/*', serveStatic({}));

/** a proxy to avoid CORS errors */
frontend.all('/api/*', (c) => {
  const { method, path, raw } = c.req;
  const { STREAMS2_NOTIFICATION_LETTER_ADDR } = env(c);
  console.log('env: ', STREAMS2_NOTIFICATION_LETTER_ADDR);
  const reqOptions: RequestInit = {
    method,
    ...(raw.body && { body: raw.body }),
    headers: raw.headers
  };
  return fetch(`${STREAMS2_NOTIFICATION_LETTER_ADDR}${path}`, reqOptions);
});

/**
a static resrouces service
*/
frontend.get('/resources/*', async (c) => {
  // build a file system
  const { activeResourcesPath } = await readFrontendState(env(c));
  const reqPath = c.req.path;
  // 这里是绝对路径 split 后会有至少三个元素 ['', 'resources', 'file.xx']
  let paths = reqPath.split('/');
  paths = paths.slice(1);
  paths[0] = activeResourcesPath;
  const absolutPath = path.resolve(...paths);

  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(absolutPath);
  } catch { }

  console.log('get path', absolutPath);
  console.info(stat);
  if (!stat || stat.isDirectory()) {
    return c.notFound();
  }
  const readStream = fs.createReadStream(absolutPath);
  const readableStream = new ReadableStream({
    start(controller) {
      readStream.on('data', (chunk) => {
        controller.enqueue(chunk);
      });
      readStream.on('end', () => {
        controller.close();
      })
    },
    cancel() {
      readStream.destroy();
    }
  });

  const mimeType = getMimeType(path.basename(absolutPath));
  c.header('Content-Type', mimeType || 'application/octet-stream');
  c.header('Content-Length', stat.size.toString());
  return c.body(readableStream, 200);
});

frontend.get('/web', async (c) => {
  const { activeResourcesPath } = await readFrontendState(env(c));
  const indexPath = path.resolve(activeResourcesPath, 'index.html');
  const content = fsPs.readFile(indexPath, { encoding: 'utf8' });
  return c.html(content);
});

frontend.post('/pipeline/streams2/:branchName/:commitId', async (c) => {
  console.log('trigger streams2 frontend pipeline');
  const { commitId, branchName } = c.req.param();
  const { STREAMS2_FRONTEND } = env(c);
  console.log('Project locate at', STREAMS2_FRONTEND);
  const git = simpleGit({ baseDir: STREAMS2_FRONTEND, });
  try {
    const logRes = await git.checkout(branchName).log();
    const head = logRes.latest!;
    if (head.hash.includes(commitId)) {
      // 开始触发, 触发后不需要等待它结束
      pipeline(env(c), branchName, commitId);
    } else {
      throw new HTTPException(404, { message: `没有在分支: ${branchName} 上找到指定的 commit. commitId: ${commitId}` });
    }
    return c.text(`triggered the build process for commit: ${commitId}`);
  } catch (e) {
    if (e instanceof GitError) {
      if (e.message.includes('not a git repository')) {
        throw new HTTPException(500, { message: '检查下是不是没有安装git环境, 或者环境变量中 STREAMS2_FRONTEND 路径是否错误，该路径需要指向 Streams2 前端项目的根目录' });
      }
      if (e.message.includes('did not match any file')) {
        throw new HTTPException(404, { message: `库内没有名为 ${branchName} 的分支` });
      }
    }
    throw e;
  }
});

frontend.get('/pipeline/streams2/:branchName/:commitId', async (c) => {
  const { branchName, commitId } = c.req.param();
  const log = await getBuildLogText(env(c), commitId);
  return c.text(log);
});

export default frontend;
