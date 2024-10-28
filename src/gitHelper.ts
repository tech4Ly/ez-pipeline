/**
 * # 仓库种类
 * 1. bare repo 只储存 git 元数据，代码会被推送到该位置，代码拉去也是从这个文件拉取
 * 2. worker repo 用户写代码用的 repo, 提交完的代码会被用户推送到 bare repo 中，并且会触发 git hook: `post-receive`
 * 3. pipeline repo，触发 `post-receive` 后，触发 pipeline，pipeline 服务会维护一个 repo 从 bare repo 拉取用户上传到代码。拉取完成后 pipeline 开始执行
 * # git flow
 * 该函数从触发 `post-receive` 后开始执行，服务会控制 pipeline repo 从 bare repo 拉取最新的代码
 * 1. git checkout 
 */
export function triggerPull() {
  
}
