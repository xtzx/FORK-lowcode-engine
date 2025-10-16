/**
 * @file DOM 节点类型判断工具
 * @description 提供判断对象是否为 DOM 节点的工具函数
 *
 * 作用：
 * - 类型守卫，确保对象是 Element 或 Text 节点
 * - 用于在处理 React 实例时区分 DOM 节点和组件实例
 *
 * 使用场景：
 * - react-find-dom-nodes.ts 中判断 Fiber 节点的 stateNode 类型
 * - 确保只对真实 DOM 节点执行 DOM 操作
 */

/**
 * 判断对象是否为 DOM 节点（Element 或 Text）
 *
 * @param node - 要判断的对象
 * @returns 如果是 DOM 节点返回 true，否则返回 false
 *
 * 实现原理：
 * 1. 检查 node.nodeType 是否存在（所有 DOM 节点都有 nodeType 属性）
 * 2. 检查 nodeType 是否为 ELEMENT_NODE（1）或 TEXT_NODE（3）
 *
 * TypeScript 类型守卫：
 * - 使用 `node is Element | Text` 语法
 * - 在判断为 true 后，TypeScript 会自动推断类型
 *
 * @example
 * ```typescript
 * const div = document.createElement('div');
 * isDOMNode(div);  // true
 *
 * const text = document.createTextNode('hello');
 * isDOMNode(text);  // true
 *
 * const obj = { nodeType: 1 };
 * isDOMNode(obj);  // true (虽然不是真实DOM，但符合结构)
 *
 * const component = new React.Component();
 * isDOMNode(component);  // false
 * ```
 */
export function isDOMNode(node: any): node is Element | Text {
  // 短路求值：
  // 1. 先检查 node.nodeType 是否存在（truthy）
  // 2. 再检查 nodeType 的值
  //    - Node.ELEMENT_NODE === 1（元素节点，如 <div>）
  //    - Node.TEXT_NODE === 3（文本节点，如 "hello"）
  return node.nodeType && (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE);
}
