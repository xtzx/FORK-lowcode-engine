/**
 * @file Invariant 断言函数
 * @description 运行时断言函数，用于检查条件是否满足
 *
 * 作用：
 * - 在开发和测试阶段检查条件
 * - 条件不满足时抛出错误
 * - 帮助快速发现问题
 *
 * 使用场景：
 * - 参数校验
 * - 前置条件检查
 * - 状态一致性检查
 *
 * 类似概念：
 * - assert (Node.js)
 * - console.assert (浏览器)
 * - throw new Error (手动抛出)
 *
 * @example
 * ```typescript
 * // 参数校验
 * function addNode(parent, child) {
 *   invariant(parent, 'parent 不能为空');
 *   invariant(child, 'child 不能为空', 'addNode');
 *   parent.children.push(child);
 * }
 *
 * // 前置条件检查
 * function removeNode(node) {
 *   invariant(!node.isLocked, '节点已锁定，无法删除');
 *   node.remove();
 * }
 *
 * // 状态检查
 * invariant(document.root, '文档必须有根节点');
 * ```
 */

/**
 * 断言函数
 *
 * @param check - 要检查的条件（truthy/falsy）
 * @param message - 错误消息
 * @param thing - 可选的上下文信息（如函数名、对象名）
 *
 * 功能：
 * - 如果 check 为 truthy -> 什么都不做
 * - 如果 check 为 falsy -> 抛出 Error
 *
 * 错误消息格式：
 * - 无 thing: `[designer] Invariant failed: {message}`
 * - 有 thing: `[designer] Invariant failed: {message} in '{thing}'`
 *
 * 为什么要加 [designer] 前缀？
 * - 标识错误来源
 * - 便于日志过滤
 * - 区分不同模块的错误
 *
 * truthy vs falsy：
 * - truthy: true, 1, "text", {}, [], ...
 * - falsy: false, 0, "", null, undefined, NaN
 *
 * 与 if...throw 的对比：
 * ```typescript
 * // 使用 invariant（推荐）
 * invariant(user, '用户不存在');
 *
 * // 手动 throw（冗余）
 * if (!user) {
 *   throw new Error('[designer] Invariant failed: 用户不存在');
 * }
 * ```
 *
 * 注意事项：
 * - 只用于不应该发生的情况（程序错误）
 * - 不用于预期的错误（如用户输入错误）
 * - 生产环境可以通过构建工具移除（代码压缩）
 *
 * @throws {Error} 当 check 为 falsy 时抛出错误
 *
 * @example
 * ```typescript
 * // 示例1：简单检查
 * invariant(node, 'node 不能为 null');
 * // 如果 node 为 null，抛出：
 * // Error: [designer] Invariant failed: node 不能为 null
 *
 * // 示例2：带上下文
 * invariant(parent.isContainer, '父节点必须是容器', 'insertNode');
 * // 如果条件不满足，抛出：
 * // Error: [designer] Invariant failed: 父节点必须是容器 in 'insertNode'
 *
 * // 示例3：表达式检查
 * invariant(index >= 0 && index < children.length, '索引越界');
 * ```
 */
export function invariant(check: any, message: string, thing?: any) {
  if (!check) {
    throw new Error(`[designer] Invariant failed: ${message}${thing ? ` in '${thing}'` : ''}`);
  }
}
