/**
 * @file Designer 工具函数入口
 * @description 导出设计器使用的工具函数
 *
 * 工具模块：
 * - invariant: 断言函数，用于运行时检查
 * - slot: 插槽相关的工具函数
 * - tree: 树结构相关的工具函数
 *
 * 使用方式：
 * ```typescript
 * import { invariant, isSlotNode, findNode } from '@alilc/lowcode-designer/utils';
 * ```
 */

/**
 * 导出断言函数
 * - invariant: 运行时断言，条件不满足时抛出错误
 */
export * from './invariant';

/**
 * 导出插槽工具
 * - isSlotNode: 判断节点是否是插槽节点
 * - 其他插槽相关工具函数
 */
export * from './slot';

/**
 * 导出树工具
 * - findNode: 在树中查找节点
 * - walkTree: 遍历树
 * - 其他树操作工具函数
 */
export * from './tree';
