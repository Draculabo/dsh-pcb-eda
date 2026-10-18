/**
 * Localized copy for the plugin-update UI (browser half).
 *
 * zh is the fallback, matching the rest of the Huaqiu plugin family
 * (`<html lang>` drives the resolution via the shared sidebar-entry locale
 * helpers). The wording follows the shell's own plugin manager
 * (`ui-plugin-manager/src/client/locales.ts`) so both read as one product.
 *
 * @module
 */

const zh = {
  entryLabel: '插件更新',
  entryTooltip: '查看可用的插件更新',
  viewTitle: '插件更新',
  viewIntro: '检查并安装可用的插件更新',
  viewInfo: '在这里查看插件集的更新。标注为「被阻止」的插件因主机或 HQ Edge 版本不兼容而无法安装；已是最新的插件无需操作。',
  refresh: '刷新',
  close: '关闭',
  loading: '正在读取插件更新…',
  empty: '没有可用的插件更新',
  checkFailed: '检查更新失败，请重试',
  installAll: (count: number) => `安装 ${count} 项更新`,
  installOne: '安装',
  installing: '正在安装…（DSH 将自动重启）',
  nothingToInstall: '暂无可安装的更新',
  ignore: '忽略此版本',
  unignore: '恢复提醒',
  ignoredOffer: '已忽略当前插件集更新',
  groupCount: (count: number) => `${count} 个插件`,
  group: {
    actionable: '待处理',
    blocked: '无法安装',
    ignored: '已忽略',
    current: '已是最新',
  },
  state: {
    current: '当前',
    update: '可更新',
    install: '待安装',
    ignored: '已忽略',
    blocked: '被阻止',
  },
  blockedReason: {
    host: '不适用于当前 EDA 主机',
    'hq-edge-version': '当前 HQ Edge 版本不兼容',
    'runtime-unknown': 'HQ Edge 版本未知，无法校验',
  },
  runtime: {
    title: 'HQ Edge 运行时',
    current: '当前版本',
    latest: '最新版本',
    set: '发布插件集',
    checkedAt: '上次检查',
    source: '更新源',
    unknown: '版本未知',
    notConfigured: '未配置更新源',
    note: '运行时更新由 EDA 安装器处理',
    update: '安装运行时更新',
    updateConfirm: (version: string) =>
      `安装 HQ Edge 运行时 ${version}？HQ Edge 会先关闭并完成替换，然后重新启动。`,
    updating: '正在下载并校验运行时包，可能需要一分钟…',
    updateAccepted: '运行时更新已受理，HQ Edge 正在重启…',
    // ── Update-source editor ──
    sourceHint: '运行时更新清单的下载地址，保存后立即生效',
    sourceEdit: '修改',
    sourceSave: '保存',
    sourceReset: '恢复默认',
    saved: '更新源已保存，正在重新检查更新…',
    saveFailed: '保存更新源失败',
    sourceInputLabel: '运行时更新清单地址',
    sourcePlaceholder: 'https://gitee.com/huaqiu-electronics/dsh-pcb-eda/raw/main/edge-headless-release-manifest.json',
  },
  // ── Plugin release-manifest source editor ──
  pluginSource: {
    title: '插件更新源',
    hint: '插件更新清单的下载地址，保存后立即生效',
    edit: '修改',
    save: '保存',
    reset: '恢复默认',
    saved: '更新源已保存，正在重新检查更新…',
    saveFailed: '保存更新源失败',
    inputLabel: '插件更新清单地址',
    placeholder: 'https://gitee.com/huaqiu-electronics/dsh-pcb-eda/raw/main/plugins-release-manifest.json',
  },
  // Origin tags, shared by both source editors (hq-edge serves one type).
  originOverride: '自定义',
  originConfig: '默认配置',
  originUnset: '未配置',
  lastError: '上次检查失败',
  installError: '安装失败',
  installSuccess: '更新已安装，正在重启 DSH…',
  confirmInstall: '确认安装',
  cancel: '取消',
}

export type UpdateCopy = typeof zh

const en: UpdateCopy = {
  entryLabel: 'Plugin Updates',
  entryTooltip: 'Review available plugin updates',
  viewTitle: 'Plugin Updates',
  viewIntro: 'Check for and install available plugin updates',
  viewInfo: 'Review the plugin set updates here. A plugin marked Blocked cannot be installed because its host or HQ Edge version is incompatible; a plugin marked Current needs no action.',
  refresh: 'Refresh',
  close: 'Close',
  loading: 'Reading plugin updates…',
  empty: 'No plugin updates available',
  checkFailed: 'Failed to check for updates — please retry',
  installAll: (count: number) => `Install ${count} update${count === 1 ? '' : 's'}`,
  installOne: 'Install',
  installing: 'Installing… (DSH will restart)',
  nothingToInstall: 'Nothing to install right now',
  ignore: 'Ignore this release',
  unignore: 'Show again',
  ignoredOffer: 'The current plugin-set update is ignored',
  groupCount: (count: number) => `${count} plugin${count === 1 ? '' : 's'}`,
  group: {
    actionable: 'Actionable',
    blocked: 'Blocked',
    ignored: 'Ignored',
    current: 'Up to date',
  },
  state: {
    current: 'Current',
    update: 'Update',
    install: 'Install',
    ignored: 'Ignored',
    blocked: 'Blocked',
  },
  blockedReason: {
    host: 'Not applicable to the current EDA host',
    'hq-edge-version': 'Incompatible with the current HQ Edge version',
    'runtime-unknown': 'HQ Edge version unknown — cannot verify',
  },
  runtime: {
    title: 'HQ Edge Runtime',
    current: 'Current version',
    latest: 'Latest version',
    set: 'Release set',
    checkedAt: 'Last checked',
    source: 'Update source',
    unknown: 'Version unknown',
    notConfigured: 'No update source configured',
    note: 'Runtime updates are handled by the EDA installer',
    update: 'Install runtime update',
    updateConfirm: (version: string) =>
      `Install HQ Edge runtime ${version}? HQ Edge shuts down to swap the runtime, then restarts.`,
    updating: 'Downloading and verifying the runtime bundle — this can take a minute…',
    updateAccepted: 'Runtime update accepted — HQ Edge is restarting…',
    // ── Update-source editor ──
    sourceHint: 'Where the runtime update manifest is fetched from; saved changes take effect immediately',
    sourceEdit: 'Edit',
    sourceSave: 'Save',
    sourceReset: 'Reset to default',
    saved: 'Update source saved — re-checking for updates…',
    saveFailed: 'Failed to save the update source',
    sourceInputLabel: 'Runtime update manifest URL',
    sourcePlaceholder: 'https://gitee.com/huaqiu-electronics/dsh-pcb-eda/raw/main/edge-headless-release-manifest.json',
  },
  // ── Plugin release-manifest source editor ──
  pluginSource: {
    title: 'Plugin update source',
    hint: 'Where the plugin update manifest is fetched from; saved changes take effect immediately',
    edit: 'Edit',
    save: 'Save',
    reset: 'Reset to default',
    saved: 'Update source saved — re-checking for updates…',
    saveFailed: 'Failed to save the update source',
    inputLabel: 'Plugin update manifest URL',
    placeholder:
      'https://gitee.com/huaqiu-electronics/dsh-pcb-eda/raw/main/plugins-release-manifest.json',
  },
  // Origin tags, shared by both source editors (hq-edge serves one type).
  originOverride: 'Custom',
  originConfig: 'Configured',
  originUnset: 'Not configured',
  lastError: 'Last check failed',
  installError: 'Install failed',
  installSuccess: 'Update installed — restarting DSH…',
  confirmInstall: 'Confirm install',
  cancel: 'Cancel',
}

export const COPY = { zh, en } as const
