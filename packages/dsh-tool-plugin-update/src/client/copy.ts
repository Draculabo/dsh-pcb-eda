/**
 * Localized copy for the plugin-update UI (browser half).
 *
 * zh is the fallback, matching the rest of the Huaqiu plugin family
 * (`<html lang>` drives the resolution via the shared sidebar-entry locale
 * helpers).
 *
 * @module
 */

const zh = {
  entryLabel: '插件更新',
  entryTooltip: '查看可用的插件更新',
  viewTitle: '插件更新',
  refresh: '刷新',
  close: '关闭',
  empty: '没有可用的插件更新',
  checkFailed: '检查更新失败',
  manifestVersion: '插件集',
  ignoredOffer: '已忽略当前插件集更新',
  unignore: '恢复提醒',
  installAll: (count: number) => `安装 ${count} 项更新`,
  installing: '安装中…（DSH 将自动重启）',
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
    updateAvailable: (version: string) => `发现新版本 ${version}`,
    current: (version: string) => `当前版本 ${version}`,
    unknown: '版本未知',
    notConfigured: '未配置更新源',
    note: '运行时更新由 EDA 安装器处理',
  },
  lastError: '上次检查失败',
  fetchedAt: '检查时间',
  installError: '安装失败',
  installSuccess: '更新已安装，正在重启 DSH…',
}

export type UpdateCopy = typeof zh

const en: UpdateCopy = {
  entryLabel: 'Plugin Updates',
  entryTooltip: 'Review available plugin updates',
  viewTitle: 'Plugin Updates',
  refresh: 'Refresh',
  close: 'Close',
  empty: 'No plugin updates available',
  checkFailed: 'Failed to check for updates',
  manifestVersion: 'Plugin set',
  ignoredOffer: 'The current plugin-set update is ignored',
  unignore: 'Show again',
  installAll: (count) => `Install ${count} update${count === 1 ? '' : 's'}`,
  installing: 'Installing… (DSH will restart)',
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
    updateAvailable: (version) => `New version ${version} available`,
    current: (version) => `Current version ${version}`,
    unknown: 'Version unknown',
    notConfigured: 'No update source configured',
    note: 'Runtime updates are handled by the EDA installer',
  },
  lastError: 'Last check failed',
  fetchedAt: 'Checked at',
  installError: 'Install failed',
  installSuccess: 'Update installed — restarting DSH…',
}

export const COPY = { zh, en } as const

