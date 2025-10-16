/**
 * @file Tree 树工具函数
 * @description 提供树结构操作的工具函数
 *
 * 核心功能：
 * - foreachReverse: 反向遍历数组或 NodeChildren
 *
 * 使用场景：
 * - 从后往前遍历节点（删除时避免索引问题）
 * - 反向处理节点
 *
 * 为什么需要反向遍历？
 * ```typescript
 * // 正向遍历删除的问题：
 * for (let i = 0; i < children.length; i++) {
 *   children[i].remove();  // 删除后索引错乱
 * }
 *
 * // 反向遍历解决问题：
 * for (let i = children.length - 1; i >= 0; i--) {
 *   children[i].remove();  // 从后往前删，不影响前面的索引
 * }
 * ```
 */

import { NodeChildren } from '../document/node/node-children';

/**
 * 可遍历的数组类型
 *
 * 支持两种类型：
 * - NodeChildren: 节点子节点集合
 * - any[]: 普通数组
 *
 * 为什么支持两种？
 * - NodeChildren 是特殊的类数组对象
 * - 需要统一的遍历接口
 */
type IterableArray = NodeChildren | any[];

/**
 * 反向遍历数组或 NodeChildren
 *
 * @param arr - 要遍历的数组或 NodeChildren
 * @param action - 对每个元素执行的操作
 * @param getter - 获取元素的函数
 * @param context - 执行上下文（this）
 *
 * 功能：
 * - 从后往前遍历
 * - 对每个元素执行 action
 * - 使用 getter 获取元素
 * - 支持自定义 this 上下文
 *
 * 为什么需要 getter 参数？
 * - NodeChildren 的访问方式可能不同于普通数组
 * - arr[i] vs arr.get(i)
 * - getter 提供统一的访问接口
 *
 * 为什么需要 context 参数？
 * - action.call(context, item) 绑定 this
 * - 在 action 中可以访问 this
 * - 灵活性
 *
 * 反向遍历的优势：
 * - 删除元素时不影响未遍历的索引
 * - 安全地修改数组
 *
 * @example
 * ```typescript
 * // 示例1：删除所有子节点
 * foreachReverse(
 *   node.children,
 *   (child) => child.remove(),
 *   (arr, i) => arr.get(i)
 * );
 *
 * // 示例2：使用上下文
 * foreachReverse(
 *   items,
 *   function(item) {
 *     this.process(item);  // 可以访问 this
 *   },
 *   (arr, i) => arr[i],
 *   processor  // 作为 this
 * );
 *
 * // 为什么从后往前？
 * // 假设删除偶数索引的节点：
 * // [0, 1, 2, 3, 4]
 * //
 * // 正向遍历（错误）：
 * // i=0: 删除0 -> [1, 2, 3, 4]
 * // i=1: 删除2（原来的3） -> 错误！
 * //
 * // 反向遍历（正确）：
 * // i=4: 删除4 -> [0, 1, 2, 3]
 * // i=2: 删除2 -> [0, 1, 3]
 * // i=0: 删除0 -> [1, 3]
 * ```
 */
export function foreachReverse(
  arr: IterableArray,
  action: (item: any) => void,
  getter: (arr: IterableArray, index: number) => any,
  context: any = {},
) {
  // 从最后一个元素开始，向前遍历到第一个
  for (let i = arr.length - 1; i >= 0; i--) {
    // 使用 getter 获取元素
    const item = getter(arr, i);
    // 使用 call 绑定上下文，执行 action
    action.call(context, item);
  }
}
