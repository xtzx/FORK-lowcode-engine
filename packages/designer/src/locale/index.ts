/**
 * @file Designer 国际化工具
 * @description 创建并导出国际化工具函数
 *
 * 作用：
 * - 创建国际化实例
 * - 提供 intl、intlNode 等方法
 * - 支持语言切换
 *
 * 方法说明：
 * - intl(key): 返回国际化文本（字符串）
 * - intlNode(key): 返回国际化元素（ReactNode）
 * - getLocale(): 获取当前语言
 * - setLocale(locale): 设置当前语言
 *
 * 使用场景：
 * ```typescript
 * import { intl, setLocale } from '@alilc/lowcode-designer/locale';
 *
 * // 获取文案
 * console.log(intl('Node'));  // "节点" 或 "Node"
 *
 * // 切换语言
 * setLocale('en-US');
 * console.log(intl('Node'));  // "Node"
 * ```
 */

import { createIntl } from '@alilc/lowcode-editor-core';
import enUS from './en-US.json';  // 英文文案
import zhCN from './zh-CN.json';  // 中文文案

/**
 * 创建国际化实例
 *
 * 传入：
 * - 'en-US': 英文文案对象
 * - 'zh-CN': 中文文案对象
 *
 * 返回：
 * - intl: 获取文案（字符串）
 * - intlNode: 获取文案（ReactNode）
 * - getLocale: 获取当前语言
 * - setLocale: 设置当前语言
 *
 * createIntl 的实现（来自 editor-core）：
 * - 管理当前语言状态
 * - 根据语言返回对应文案
 * - 支持动态切换
 */
const { intl, intlNode, getLocale, setLocale } = createIntl({
  'en-US': enUS,
  'zh-CN': zhCN,
});

/**
 * 导出国际化工具函数
 *
 * 使用示例：
 * ```typescript
 * // 在组件中使用
 * import { intl, intlNode } from './locale';
 *
 * // 获取文本
 * const text = intl('Delete');  // "删除"
 *
 * // 获取 React 元素
 * const node = intlNode('Lock');  // <span>锁定</span>
 *
 * // 切换语言
 * setLocale('en-US');
 *
 * // 获取当前语言
 * const locale = getLocale();  // "en-US"
 * ```
 */
export { intl, intlNode, getLocale, setLocale };
