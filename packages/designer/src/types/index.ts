/**
 * @file Designer 类型定义
 * @description 定义设计器使用的类型、工具函数和事件枚举
 *
 * 作用：
 * - 定义节点操作相关的类型
 * - 导出常用的工具函数
 * - 定义编辑器事件枚举
 *
 * 内容：
 * 1. NodeRemoveOptions: 节点删除选项
 * 2. utils: 工具函数集合
 * 3. EDITOR_EVENT: 编辑器事件枚举
 */

import { isFormEvent, compatibleLegaoSchema, getNodeSchemaById, isNodeSchema } from '@alilc/lowcode-utils';

// ==================== 节点删除选项类型 ====================
/**
 * 节点删除选项
 *
 * 字段：
 * - suppressRemoveEvent: 是否禁止触发删除事件
 *
 * 使用场景：
 * ```typescript
 * // 静默删除（不触发事件）
 * node.remove({ suppressRemoveEvent: true });
 *
 * // 正常删除（触发事件）
 * node.remove();
 * ```
 *
 * 为什么需要禁止事件？
 * - 批量删除时避免频繁触发
 * - 内部操作不需要通知外部
 * - 性能优化
 */
export type NodeRemoveOptions = {
  suppressRemoveEvent?: boolean;  // 禁止触发删除事件
};

// ==================== 工具函数集合 ====================
/**
 * 设计器工具函数集合
 *
 * 导出常用的工具函数，便于统一访问
 *
 * 函数列表：
 * - isNodeSchema: 判断对象是否是节点 Schema
 * - isFormEvent: 判断事件是否来自表单元素
 * - compatibleLegaoSchema: 兼容 Legao Schema 格式
 * - getNodeSchemaById: 根据 ID 获取节点 Schema
 *
 * 使用场景：
 * ```typescript
 * import { utils } from '@alilc/lowcode-designer';
 *
 * if (utils.isNodeSchema(obj)) {
 *   // 是节点 Schema
 * }
 *
 * if (utils.isFormEvent(e)) {
 *   // 事件来自表单，不处理
 * }
 * ```
 */
export const utils = {
  isNodeSchema,  // 判断是否是节点 Schema
  isFormEvent,  // 判断是否是表单事件
  compatibleLegaoSchema,  // 兼容 Legao Schema
  getNodeSchemaById,  // 根据 ID 获取节点 Schema
};

// ==================== 编辑器事件枚举 ====================
/**
 * 编辑器事件类型枚举
 *
 * 用途：
 * - 定义编辑器内部事件
 * - 避免魔术字符串
 * - 提供类型安全
 *
 * 事件列表：
 * - NODE_CHILDREN_CHANGE: 节点子节点变化
 * - NODE_VISIBLE_CHANGE: 节点可见性变化
 *
 * 使用场景：
 * ```typescript
 * editor.on(EDITOR_EVENT.NODE_CHILDREN_CHANGE, (info) => {
 *   console.log('节点子节点变化：', info.node);
 * });
 *
 * editor.on(EDITOR_EVENT.NODE_VISIBLE_CHANGE, (node, visible) => {
 *   console.log('节点可见性变化：', node.id, visible);
 * });
 * ```
 */
export enum EDITOR_EVENT {
  NODE_CHILDREN_CHANGE = 'node.children.change',  // 节点子节点变化
  NODE_VISIBLE_CHANGE = 'node.visible.change',  // 节点可见性变化
}

/**
 * Utils 类型
 *
 * 说明：
 * - 使用 typeof 提取 utils 对象的类型
 * - 提供类型安全的工具函数访问
 * - 便于其他模块引用
 */
export type Utils = typeof utils;