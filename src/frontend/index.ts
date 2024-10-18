import { Hono } from "hono";
import { env } from 'hono/adapter'
import { stream } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static"
import * as fs from 'node:fs'
import * as fsPs from 'node:fs/promises';
import * as path from 'node:path';
import { getMimeType } from "hono/utils/mime";
import { readFrontendState } from "../utils";
/** 前端流程
 1. pre-commit format
 2. git push origin:target-test
 3. rsbuild build with option: 
    - outputDir: branch-name
    - mode: development
    - load rsbuild.config.ts
 4. select a version to be run on a specify port like (e.g 3000)
*/


type MyEnv = {
  SERVICE_A: string
}

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
  const { SERVICE_A } = env<MyEnv>(c);
  const reqOptions: RequestInit = {
    method,
    ...(raw.body && { body: raw.body }),
    headers: raw.headers
  };
  return fetch(`http://${SERVICE_A}${path}`, reqOptions);
});

/**
a static resrouces service
*/
frontend.get('/resources/*', (c) => {
  // build a file system
  const { activeResourcesPath } = readFrontendState();
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

frontend.get('/web', (c) => {
  const { activeResourcesPath } = readFrontendState();
  const indexPath = path.resolve(activeResourcesPath, 'index.html');
  const content = fsPs.readFile(indexPath, {encoding: 'utf8'});
  return c.html(content);
});

export default frontend;
