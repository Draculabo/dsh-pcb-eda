# DSH FreeRouting

[English](README.md) | [简体中文](README.zh-CN.md)

通过 DSH 对当前打开的 KiCad PCB 自动布线。布线过程中，走线和过孔会分批显示在 KiCad 编辑器里；DSH 显示进度、检查结果和最终报告。

**当前为内测版，仅支持 Windows x64 和 KiCad 10。** 不支持差分自动布线，也不保证晶振电路满足电气要求。使用前保留工程备份，完成后检查结果，再手动保存。

## 功能

- 使用编辑器当前内容，包括未保存修改；保留已有走线和过孔。
- 在 KiCad 中显示过程走线，最终新增走线和过孔通过一次事务添加，支持一次撤销。
- 添加最终结果前，在离线副本中运行 KiCad 设计规则检查，并报告未解决的问题。
- 按选项重新填充已有铺铜区域；不创建新区域，也不自动保存 PCB。
- 直接使用 KiCad 自带的 `bin\freerouting.exe`（其中已含 Java 运行时），或 JAR + Java 运行时，配合随包 Python 依赖；无需常驻 Python 服务或系统 Java。

## 环境要求

| 组件      | 要求                                                            |
| --------- | --------------------------------------------------------------- |
| 操作系统  | Windows x64                                                     |
| KiCad     | 10.0.7 或更新的兼容 10.0 补丁版本，自带 Windows x64 Python 3.11 |
| KiCad API | 在 PCB 编辑器的偏好设置中启用                                   |
| DSH       | 固定 SDK 基线为 0.2.1-rc.2；其他版本仍需验证兼容性              |
| 板子      | 已在 PCB 编辑器打开，且至少保存过一次                           |

暂不支持 Linux、macOS 和其他 Python ABI。插件会在布线前检查运行环境。

## 安装

通过 DSH CLI 安装已发布版本：

```powershell
dsh plugin --profile web add -w --ignore-scripts @huaqiu/dsh-tool-freerouting
```

安装本地构建时，将包名换成 `huaqiu-dsh-tool-freerouting-<version>.tgz` 的完整路径。安装后重启 DSH。同一环境只加载一份插件。

`package.json` 声明服务端入口、浏览器入口和随包配置。DSH 读取 `cordis.patch.yml`，以 `huaqiu-dsh-tool-freerouting` 为 ID 加载插件，并注入 `tools`、`systemPrompt`、`webServer`、`jobs` 服务。无需单独安装技能。

## 配置

KiCad 内置 DSH 可以从自身安装目录查找 Python。独立启动 DSH 时，在当前 profile 的 `cordis.patch.yml` 中添加本机配置：

```yaml
- id: huaqiu-dsh-tool-freerouting
  config:
    kicadPythonPath: C:/Program Files/KiCad/10.0/bin/python.exe
```

只有一个可连接 PCB 编辑器时自动绑定。打开多个编辑器时，通过 `kicadApiSocket` 明确指定目标；地址采用目标编辑器 KiCad API 设置显示的完整 `ipc://...` 地址。

| 配置项                  | 默认值                   | 作用                                       |
| ----------------------- | ------------------------ | ------------------------------------------ |
| `realtime`              | `true`                   | 在 KiCad 中显示过程走线                    |
| `drawtimeSec`           | `5`                      | 尝试更新预览的间隔；实际变化取决于引擎快照 |
| `pollTimeoutMs`         | `1800000`                | 本轮布线最多等待 30 分钟                   |
| `autoLaunchFreerouting` | `true`                   | 自动启动随包 Java 引擎                     |
| `freeroutingBaseUrl`    | `http://127.0.0.1:37864` | 本机引擎地址                               |
| `resultTtlMs`           | `3600000`                | 已取得的下载结果默认保留一小时             |

随包配置直接使用插件定义的默认值，不重复维护另一套默认参数，也不写入开发者本机路径。

## 使用

1. 打开目标 PCB，启用 KiCad API。
2. 在 DSH 中输入：

   ```text
   使用 pcb_route 对当前 KiCad PCB 整板布线。保留已有走线和过孔，
   不跳过任何网络，设置 fill_zones=false，不保存文件。
   ```

3. 查看 KiCad 中分批出现的走线，以及 DSH 进度卡片。任务结束前不要编辑、保存或撤销板子。
4. 查看最终报告，检查未连接网络并运行 KiCad 设计规则检查。处理剩余问题后手动保存。

取消任务使用 `pcb_cancel_route`。整个插件同时只允许一个任务，不排队。关闭绑定的 PCB 编辑器会取消布线并释放插件启动的计算进程；关闭 DSH 网页不会取消任务。已经开始写板的操作会等待提交或回滚完成。

过程走线属于临时预览，最终添加结果前会清理。一次撤销可删除最终新增走线和过孔；继续撤销更早的记录，可能重新出现旧预览。铺铜属于独立步骤，不保证与走线一起撤销。

首次发现已经确认的布线规则问题时，流程可自动处理并重新布线一次。仍有问题时可能添加结果，但会明确警告。**已添加不代表规则检查通过，也不代表全部布通。** 检查失败、板子变化或写入状态不确定时，停止自动添加。若上次写入结果无法确认，先检查板子，再通过 `pcb_confirm_board_checked` 解除暂停。

## 已知限制

- 尚无通过验收的差分自动布线后端；识别到差分网络时会提前拒绝。网络名称不能替代电气约束。
- 不保证晶振电路满足电气要求。
- 当前引擎尚无经过验证的指定网络筛选能力，`pcb_route_nets` 和非空 `skip_nets` 会被拒绝。
- 仅支持直线走线和普通通孔。不支持的铜几何、自定义 `.kicad_dru` 规则或无法保留的输入会被拒绝。
- 添加成功与全部布通分别报告；无法确认的连通性标为未知。
- DSH 重启后不恢复任务和结果，仅保留最小的板子待检查标记。
- 当前进度及硬件工程师使用的提示以中文显示。

## 开发与构建

从 monorepo 根目录执行。需要 Node.js 22.19+ 的 22.x 版本或 24+、仓库固定版本的 pnpm、KiCad Python 3.11 和完整 JDK 25：

```powershell
pnpm install --frozen-lockfile
python -m pip install -r packages/dsh-tool-freerouting/requirements-dev.txt
$env:DSH_IPC_TEST_PYTHON = 'C:/Program Files/KiCad/10.0/bin/python.exe'
$env:DSH_ENGINE_TEST_JDK = 'C:/path/to/jdk-25'
pnpm --filter @huaqiu/dsh-tool-freerouting exec playwright install chromium
pnpm --filter @huaqiu/dsh-tool-freerouting package:plugin
```

该命令准备锁定依赖、检查并构建插件，打包后验证全新安装。产物位于本包 `dist/`。只有设 `DSH_PREPARE_ENGINE=1`（并配合 `DSH_ENGINE_TEST_JDK`）时才会额外构建引擎 JAR 与 JRE，供 `package-windows-exe.ps1` 出 KiCad 用的产物；插件包本身不再包含它们。首次构建需要访问 Python wheel 下载源。

`prepack` 复制引擎许可证并构建 TypeScript 入口。引擎不进入插件包：它由 `scripts/package-windows-exe.ps1` 产出，随 KiCad 安装器以 `bin\freerouting.exe` 分发。macOS/Linux 打包机仍需要同一源码版本在 Windows 上准备过的 Python 依赖树。

最终安装包只展开编译后的插件、Python 脚本和依赖、配置与许可证；FreeRouting 引擎和 JRE 由 KiCad 安装器提供（`bin\freerouting.exe`），或用 `DSH_FREEROUTING_EXE` 指定，插件包不再重复携带。展开的 Java 工程、开发脚本、测试、内部文档和构建缓存不会进入安装目录。生成的运行产物不提交 Git。

提交修改前请运行 `pnpm --filter @huaqiu/dsh-tool-freerouting check`。真实编辑器测试必须使用可丢弃测试板，不能指向正式工程。报告问题时提供插件、DSH、KiCad 版本、失败阶段及脱敏诊断；不要上传令牌或保密 PCB 数据。

## 许可证

本插件包声明为 `UNLICENSED`，不向使用者授予插件自有代码的使用许可。仓库根目录的 MIT 许可证不随此包分发。修改后的 FreeRouting 引擎保留 GPL-3.0。npm 包包含已构建的 JAR、`bundled/freerouting.LICENSE` 和构建来源记录；对应源码及构建说明见[仓库中的引擎目录](https://github.com/Huaqiu-Electronics/dsh-pcb-eda/tree/main/packages/dsh-tool-freerouting/engine)。Java 源码和源码压缩包不进入 npm 包。源码与 JAR 的版本核对方法见[第三方说明](THIRD_PARTY_NOTICES.md)。

第三方组件保留各自许可证，详见[第三方说明](THIRD_PARTY_NOTICES.md)。感谢 [FreeRouting](https://github.com/freerouting/freerouting)、[KiCad](https://www.kicad.org/) 和 [Eclipse Temurin](https://adoptium.net/)。
