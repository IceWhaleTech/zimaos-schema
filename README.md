# ZimaOS Schemas

本仓库发布 ZimaOS 使用的 JSON Schema，并通过固定版本的源码和 CI 校验保证生成产物可复现。

当前包含：

- ZimaApp v2App Compose Schema
- ZimaApp Repository Compose Schema
- ZimaApp 顶层 `x-casaos` 扩展 Schema
- ZimaApp 所依赖的 compose-go `v1.20.2` Compose Schema 本地副本

## 目录结构

```text
.
├── reops/
│   ├── ZimaOS-AppManagement/       # 私有 Git submodule，Schema 源码和生成器
│   └── compose-go/                 # 固定上游 Compose Schema 的 Git submodule
└── schema/
    ├── compose-go/
    │   └── v1.20.2/
    │       └── compose-spec.json   # 固定版本的上游 Compose Schema
    └── zimaapp/
        └── v2/
            ├── repository.schema.json
            ├── x-casaos.schema.json
            └── zimaapp-v2app.schema.json
```

`schema/zimaapp` 和 `schema/compose-go` 都是当前仓库跟踪的普通目录，不是指向 submodule 的软链接。这样可以保证 GitHub Raw、Release Archive、未初始化 submodule 的普通 clone，以及离线 Schema 消费者都能直接读取已发布的 JSON 文件。

## Schema 使用

### Repository Compose

用于校验提交到应用仓库的 Compose 文件。顶层 `x-casaos` 和规范化的 `x-casaos.id` 为必填字段。

```yaml
# yaml-language-server: $schema=./schema/zimaapp/v2/repository.schema.json
```

### 通用 v2App Compose

用于校验一般 v2App Compose 文件。顶层 `x-casaos` 及其 `id` 均可选。

```yaml
# yaml-language-server: $schema=./schema/zimaapp/v2/zimaapp-v2app.schema.json
```

请根据 Compose 文件所在目录调整相对路径。如果本仓库公开发布，也可以改用 GitHub Raw URL；私有仓库的 Raw URL 需要认证，VS Code YAML Language Server 等消费者通常不能直接访问。

例如公开发布后的 Repository Schema URL：

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/IceWhaleTech/zimaos-schemas/master/schema/zimaapp/v2/repository.schema.json
```

更完整的字段说明见 `schema/zimaapp/v2/README.md`。

## 生成来源

ZimaApp Schema 不在本仓库中手工维护。字段和生成逻辑的源码真值位于私有 submodule `reops/ZimaOS-AppManagement`：

- 字段模型：`pkg/zimaapp/compose/v2`
- 应用 ID 规则：`pkg/zimaapp/appid`
- Schema 生成逻辑：`internal/zimaappschema`
- 生成入口：`cmd/zimaapp-schema`

上游 Compose Schema 的源码真值位于公开 submodule `reops/compose-go`。父仓库的两个 gitlink 分别固定生成器和 Compose Schema 的精确 commit；CI 根据 gitlink checkout，而不是跟随可变化的分支或重新解析 tag。

生成后，CI 会：

1. 校验两个 submodule 的实际 checkout commit 与父仓库 gitlink 一致。
2. 删除子仓库中的旧 Schema，避免使用残留产物。
3. 编译并运行子仓库 Schema generator。
4. 要求生成器恰好产生三个预期 Schema 文件。
5. 运行 generator 测试。
6. 将 Compose Schema 和生成结果同步到当前仓库的普通发布目录。
7. 将 Compose Schema 的远程 `$ref` 改为版本化本地相对路径。
8. 使用固定版本的 `oxfmt` 格式化发布 Schema，并检查格式。
9. 比较从固定 submodule 重新生成的结果与已提交文件，存在漂移时使 CI 失败。

因此，更新任一 submodule gitlink 后必须同时提交对应的 Schema 生成结果。

## 本地初始化

子仓库是私有仓库，本地 Git 凭据必须具有 `IceWhaleTech/ZimaOS-AppManagement` 的读取权限。

使用 HTTPS：

```bash
git clone https://github.com/IceWhaleTech/zimaos-schemas.git
cd zimaos-schemas
git submodule update --init --recursive
```

使用 SSH 时，可以覆盖 submodule URL：

```bash
git submodule sync -- reops/ZimaOS-AppManagement
git config submodule.reops/ZimaOS-AppManagement.url git@github.com:IceWhaleTech/ZimaOS-AppManagement.git
git submodule update --init --recursive
```

确认工作区中的两个子仓库与父仓库 gitlink 一致：

```bash
test "$(git rev-parse HEAD:reops/ZimaOS-AppManagement)" = \
  "$(git -C reops/ZimaOS-AppManagement rev-parse HEAD)"
test "$(git rev-parse HEAD:reops/compose-go)" = \
  "$(git -C reops/compose-go rev-parse HEAD)"
```

## 本地生成

需要先初始化两个子仓库、运行 `npm install`，并安装私有子仓库 `go.mod` 指定的 Go 版本。运行快捷命令：

```bash
npm run generate:zimaapp
```

该命令会校验两个子仓库 HEAD 与父仓库索引中的 gitlink 一致，从 compose-go 同步发布副本，清理旧产物，编译并运行上游 generator，执行 generator 测试，将上游 README 和三个 Schema 同步到 `schema/zimaapp/v2`，把 Compose `$ref` 改为本仓库的本地相对路径，最后使用固定版本的 `oxfmt` 格式化四个发布 Schema。

检查生成结果：

```bash
jq empty schema/compose-go/v1.20.2/compose-spec.json schema/zimaapp/v2/*.schema.json
git diff --check
git diff -- schema/zimaapp/v2
```

## GitHub Actions 私有仓库权限

父仓库的 `GITHUB_TOKEN` 默认不能读取另一个私有仓库。需要创建 Fine-grained personal access token，并保存为当前仓库的 Actions Secret。

Token 建议使用最小权限：

- Repository access：仅选择 `IceWhaleTech/ZimaOS-AppManagement`
- Repository permissions：`Contents: Read-only`
- Repository permissions：`Metadata: Read-only`

在当前仓库中添加 Secret：

```text
Settings
└── Secrets and variables
    └── Actions
        └── New repository secret
```

Secret 名称必须为：

```text
SUBMODULES_TOKEN
```

如果 GitHub Organization 启用了 SAML SSO，还需要为 Token 授权该组织。建议使用由组织维护的 Bot/Machine User Token，避免个人离职、Token 到期或权限变化导致 CI 中断。

## 更新 Compose Schema

当前 ZimaApp Schema 使用 compose-go `v1.20.2`：

```text
schema/compose-go/v1.20.2/compose-spec.json
```

该文件来自固定版本的 submodule：

```text
reops/compose-go/schema/compose-spec.json
```

生成脚本会从 compose-go gitlink 固定的上游文件复制 Schema，再使用 `oxfmt` 统一格式；CI 通过重新生成后的 Git diff 验证发布副本。升级 Docker Compose 或 compose-go 时，需要同时更新：

1. `reops/compose-go` gitlink，并确认它指向目标版本 tag 的 commit
2. `schema/compose-go/<version>/compose-spec.json`
3. `scripts/generate-zimaapp.mjs` 中的版本和路径
4. `schema/zimaapp/v2/zimaapp-v2app.schema.json` 中的相对 `$ref`
5. 相关 README 中的版本说明

## CI

- `.github/workflows/generate-zimaapp-schema.yml`：仅在推送 `vX.Y.Z` 格式的三段数字版本 tag 时执行，例如 `v1.0.0`、`v1.2.3`。普通分支 push、Pull Request 和带预发布后缀的 tag 不会触发 Schema 生成。
- `.github/workflows/deploy-cloudflare-pages.yml`：推送到 `main` 时构建静态站点并通过 Wrangler 部署到 Cloudflare Pages。checkout 明确设置 `submodules: false`，因此不会读取私有子仓库。

## 静态站点

仓库包含一个不依赖第三方 npm 包的静态站点构建脚本。它会校验 `schema/` 下的全部 JSON 文件，并将站点输出到 Git 忽略的 `dist/`：

```bash
npm run build
```

输出内容包括：

- `dist/schema/`：只复制 JSON Schema 并完整保留原有路径，已有相对 `$ref` 无需改变
- `dist/docs/`：由 `@adobe/jsonschema2md` 根据 ZimaApp Schema 自动生成的 Markdown 字段参考
- `dist/llms.txt`：符合 llms.txt 约定的精简文档索引
- `dist/llms-full.txt`：可直接载入上下文的完整 `x-casaos` 字段文档
- `dist/index.html`：Schema Registry 首页
- `dist/404.html`：静态错误页面
- `dist/_headers`：CORS、安全响应头和版本化 Schema 缓存策略

构建过程不会将 README 或其他非 JSON 文件复制到 `dist/schema/`，也不会在其子目录中生成任何 HTML 文件。字段类型、必填状态、枚举、示例、格式约束、废弃状态和 Profile 差异始终直接来自 Schema。

只校验 JSON、不生成站点：

```bash
npm run check
```

`llms.txt` 和字段文档生成过程不调用 LLM，也不依赖网络或 API Key。`@adobe/jsonschema2md` 会读取 Schema 中的字段说明和约束，并额外展示 `x-zimaapp-status`、`x-zimaapp-warning` 和 `x-zimaapp-replacement`。后续 Schema 变化后重新运行 `npm run build` 即可同步文档。

### Cloudflare Pages

Cloudflare 的 Git 集成会在运行构建命令前自动初始化本仓库声明的 submodule，无法读取私有 `ZimaOS-AppManagement` 时会直接失败。本站改由 GitHub Actions 构建，并使用 Wrangler Direct Upload，Cloudflare Pages 不再 checkout 仓库。

先在 Cloudflare Dashboard 中创建 Pages 项目，然后在 GitHub 仓库中配置以下 Actions Secrets：

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

`CLOUDFLARE_API_TOKEN` 使用最小权限 `Account / Cloudflare Pages / Edit`。另添加 Actions Repository Variable：

```text
CLOUDFLARE_PAGES_PROJECT=<Pages 项目名称>
```

如果 Pages 项目已经连接 GitHub，在 Cloudflare Dashboard 的项目设置中关闭 production 和 preview 分支自动部署，避免 Cloudflare 自己再次 checkout 并初始化 submodule。之后推送到 `main`，或手动运行 `Deploy Cloudflare Pages` workflow。

静态站点构建直接发布当前仓库已经提交的 `schema/` 文件，不需要安装 npm 依赖或初始化私有 submodule。Schema 生成和漂移校验仍由单独的 GitHub Actions workflow 负责。

部署后，Schema URL 保持稳定，例如：

```text
https://schema.zimaos.com/schema/zimaapp/v2/repository.schema.json
https://schema.zimaos.com/schema/zimaapp/v2/zimaapp-v2app.schema.json
https://schema.zimaos.com/schema/zimaapp/v2/x-casaos.schema.json
```

建议绑定专用域名，例如 `schemas.zimaos.com`，并将编辑器中的 `$schema` 地址切换到该域名。Cloudflare Pages 会按 `.json` 扩展名设置 Content-Type，并读取 `dist/_headers` 允许跨域读取 Schema；compose-go 的版本化文件使用长期 immutable 缓存，ZimaApp Schema 使用短缓存并要求重新验证。

## npm 发布

本仓库可作为公开 scoped npm 包 `@icewhale/zimaos-schema` 发布。发布前会通过 `prepack` 自动运行 Schema JSON 校验：

```bash
npm pack --dry-run
npm publish
```

`package.json` 使用 `files` 白名单限制包内容。最终 npm 包仅包含：

```text
package.json
README.md
schema/
```

不会包含 `dist/`、`scripts/`、`.github/`、私有 submodule 或其他仓库文件。首次发布前需要登录具有 `@icewhale` scope 发布权限的 npm 账号：

```bash
npm login
```

消费者安装后可以直接引用包内 Schema，例如：

```text
node_modules/@icewhale/zimaos-schema/schema/zimaapp/v2/repository.schema.json
node_modules/@icewhale/zimaos-schema/schema/zimaapp/v2/zimaapp-v2app.schema.json
```
