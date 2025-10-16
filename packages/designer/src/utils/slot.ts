/**
 * @file Slot 插槽工具函数
 * @description 提供插槽节点的操作工具函数
 *
 * 核心功能：
 * - includeSlot: 判断节点是否包含指定插槽
 * - removeSlot: 移除节点的指定插槽
 *
 * 插槽概念：
 * - 类似 Vue 的 slot 或 React 的 children
 * - 用于组件内容分发
 * - 一个节点可以有多个插槽
 *
 * 插槽示例：
 * ```
 * Dialog 组件：
 * ├── header 插槽
 * ├── body 插槽
 * └── footer 插槽
 * ```
 *
 * 使用场景：
 * - 检查插槽是否存在
 * - 删除不需要的插槽
 * - 插槽管理
 */

import { Node } from '../document/node/node';

/**
 * 判断节点是否包含指定名称的插槽
 *
 * @param node - 要检查的节点
 * @param slotName - 插槽名称
 * @returns true - 包含该插槽，false - 不包含
 *
 * 实现原理：
 * - 遍历节点的 slots 数组
 * - 检查每个插槽的 name 额外属性
 * - 使用 Array.some() 判断是否存在
 *
 * 插槽的 name 存储：
 * - 使用 ExtraProp（额外属性）存储
 * - 不污染节点的 Schema
 * - 只在编辑器中使用
 *
 * 为什么用 some()？
 * - 只需要知道是否存在
 * - 找到第一个匹配就返回
 * - 性能更好（提前终止）
 *
 * @example
 * ```typescript
 * const hasHeaderSlot = includeSlot(dialogNode, 'header');
 *
 * if (hasHeaderSlot) {
 *   console.log('Dialog 有 header 插槽');
 * }
 *
 * // 使用场景：
 * // 1. 添加内容前检查插槽是否存在
 * // 2. UI 上决定是否显示插槽相关操作
 * // 3. 验证组件配置
 * ```
 */
export function includeSlot(node: Node, slotName: string | undefined): boolean {
  // 获取节点的插槽数组（默认空数组）
  const { slots = [] } = node;

  // 遍历检查是否有匹配的插槽
  return slots.some((slot) => {
    // 匹配条件：
    // 1. slotName 不为空
    // 2. slot 的 name 额外属性等于 slotName
    return slotName && slotName === slot?.getExtraProp('name')?.getAsString();
  });
}

/**
 * 移除节点的指定插槽
 *
 * @param node - 要操作的节点
 * @param slotName - 要移除的插槽名称
 * @returns true - 移除成功，false - 未找到插槽
 *
 * 实现原理：
 * - 遍历节点的 slots 数组
 * - 找到匹配的插槽
 * - 调用 slot.remove() 删除
 * - 从数组中移除引用
 *
 * 删除操作：
 * - slot.remove(): 从文档中删除插槽节点
 * - slots.splice(idx, 1): 从数组中移除引用
 *
 * 为什么要两步删除？
 * - remove(): 删除节点数据
 * - splice(): 更新数组引用
 * - 确保数据和引用都清理
 *
 * 返回值的作用：
 * - true: 找到并删除了
 * - false: 没找到
 * - 调用者可以根据返回值决定后续操作
 *
 * @example
 * ```typescript
 * // 移除 header 插槽
 * const removed = removeSlot(dialogNode, 'header');
 *
 * if (removed) {
 *   console.log('header 插槽已移除');
 * } else {
 *   console.log('未找到 header 插槽');
 * }
 *
 * // 使用场景：
 * // 1. 用户删除插槽内容
 * // 2. 组件配置变化，移除不需要的插槽
 * // 3. 清理操作
 * ```
 */
export function removeSlot(node: Node, slotName: string | undefined): boolean {
  // 获取节点的插槽数组（默认空数组）
  const { slots = [] } = node;

  // 遍历查找并删除匹配的插槽
  return slots.some((slot, idx) => {
    // 检查是否匹配
    if (slotName && slotName === slot?.getExtraProp('name')?.getAsString()) {
      // 匹配，执行删除
      slot.remove();  // 从文档中删除节点
      slots.splice(idx, 1);  // 从数组中移除引用
      return true;  // 返回 true，终止遍历
    }
    return false;  // 不匹配，继续遍历
  });
}
