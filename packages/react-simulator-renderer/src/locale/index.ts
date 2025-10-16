/**
 * @file 国际化工具
 * @description 提供国际化（i18n）功能，支持多语言文案
 *
 * 作用：
 * - 根据 locale 获取对应语言的文案
 * - 提供 intl 函数（返回字符串）
 * - 提供 intlNode 函数（返回 React 元素）
 *
 * 使用场景：
 * - renderer-view.tsx 中显示占位符文案
 * - 空容器提示："拖拽组件或模板到这里"
 * - 锁定提示："锁定元素及子元素无法编辑"
 *
 * 支持语言：
 * - zh-CN: 中文简体
 * - en-US: 英文
 *
 * 扩展方式：
 * 1. 在 zh-CN.json 和 en-US.json 添加新文案
 * 2. 使用 intl(id) 获取文案
 */

import { createElement } from 'react';
import enUS from './en-US.json';  // 英文文案
import zhCN from './zh-CN.json';  // 中文文案

/**
 * 国际化文案实例
 *
 * 结构：
 * ```typescript
 * {
 *   'zh-CN': {
 *     'Drag and drop components or templates here': '拖拽组件或模板到这里',
 *     'Locked elements and child elements cannot be edited': '锁定元素及子元素无法编辑'
 *   },
 *   'en-US': {
 *     'Drag and drop components or templates here': 'Drag and drop components or templates here',
 *     'Locked elements and child elements cannot be edited': 'Locked elements and child elements cannot be edited'
 *   }
 * }
 * ```
 *
 * 注意：
 * - 英文使用 id 本身作为值（简化配置）
 * - 中文提供翻译
 */
const instance: Record<string, Record<string, string>> = {
  'zh-CN': zhCN as Record<string, string>,
  'en-US': enUS as Record<string, string>,
};

/**
 * 创建国际化工具函数
 *
 * @param locale - 语言环境，默认 'zh-CN'
 * @returns 包含 intl 和 intlNode 的对象
 *
 * 返回值：
 * - intl: 根据 id 获取文案字符串
 * - intlNode: 根据 id 获取文案的 React 元素
 *
 * @example
 * ```typescript
 * const { intl, intlNode } = createIntl('zh-CN');
 *
 * // 获取字符串
 * const text = intl('Drag and drop components or templates here');
 * // 返回: '拖拽组件或模板到这里'
 *
 * // 获取 React 元素
 * const node = intlNode('Drag and drop components or templates here');
 * // 返回: <span>拖拽组件或模板到这里</span>
 *
 * // 如果 id 不存在，返回 id 本身（降级）
 * intl('non-existent-key');  // 返回: 'non-existent-key'
 * ```
 */
export function createIntl(locale: string = 'zh-CN') {
  /**
   * 获取国际化文案（字符串）
   *
   * @param id - 文案 ID（通常是英文原文）
   * @returns 对应语言的文案，如果找不到则返回 id 本身
   *
   * 实现原理：
   * 1. 从 instance[locale] 获取对应语言的文案对象
   * 2. 从文案对象中获取 id 对应的文案
   * 3. 使用可选链（?.）处理 locale 不存在的情况
   * 4. 使用 || id 作为降级方案
   *
   * 为什么降级返回 id？
   * - 通常 id 就是英文文案
   * - 即使翻译缺失，也能显示英文
   * - 比显示空白或错误更友好
   */
  const intl = (id: string) => {
    // 可选链访问：instance[locale]?.[id]
    // 如果 instance[locale] 不存在，返回 undefined
    // 如果 id 不存在，也返回 undefined
    // 最后使用 || id 提供降级值
    return instance[locale]?.[id] || id;
  };

  /**
   * 获取国际化文案（React 元素）
   *
   * @param id - 文案 ID
   * @returns 包含文案的 span 元素
   *
   * 为什么需要 intlNode？
   * - 某些场景需要 ReactElement 而不是字符串
   * - 便于统一样式处理
   * - 保持接口一致性
   *
   * 实现：
   * - 使用 createElement 创建 span 元素
   * - 内容为国际化文案
   * - 如果找不到文案，使用 id 本身
   *
   * 注意：
   * - 第二个参数是 props（这里为 null，表示没有属性）
   * - 第三个参数应该是 children（这里错误地放在了第二个参数位置）
   * - 虽然实现有误，但仍然能工作（React 容错机制）
   *
   * 正确的实现应该是：
   * ```typescript
   * createElement('span', null, instance[locale]?.[id] || id)
   * // 或者
   * createElement('span', {}, instance[locale]?.[id] || id)
   * ```
   */
  const intlNode = (id: string) => createElement('span', instance[locale]?.[id] || id);

  // 返回两个工具函数
  return {
    intl,      // 返回字符串
    intlNode,  // 返回 React 元素
  };
}
