/**
 * @file 国际化文件入口
 * @description 导出大纲树插件的国际化资源
 *
 * 作用：
 * - 提供多语言支持
 * - 导出中文和英文文案
 *
 * 文案内容：
 * - UI 标签（如"大纲树"、"过滤"）
 * - 提示信息（如"暂无节点"）
 * - 操作文案（如"删除"、"锁定"）
 *
 * 使用方式：
 * ```typescript
 * import { zhCN, enUS } from './locale';
 *
 * const messages = locale === 'zh-CN' ? zhCN : enUS;
 * console.log(messages['Outline Tree']);  // "大纲树" 或 "Outline Tree"
 * ```
 */

import enUS from './en-US.json';  // 英文文案
import zhCN from './zh-CN.json';  // 中文文案

/**
 * 导出国际化资源
 *
 * enUS: 英文文案
 * zhCN: 中文简体文案
 *
 * JSON 文件格式：
 * ```json
 * {
 *   "Outline Tree": "大纲树",
 *   "Filter": "过滤",
 *   "No nodes": "暂无节点"
 * }
 * ```
 */
export { enUS, zhCN };
