/**
 * @file React 实例查找 DOM 节点工具
 * @description 从 React 组件实例查找对应的 DOM 节点
 *
 * 作用：
 * - 支持类组件实例转 DOM 节点
 * - 支持函数组件（通过 Fiber 节点）
 * - 支持 Fragment、Portal 等特殊情况
 * - 处理一个组件渲染多个 DOM 节点的情况
 *
 * 使用场景：
 * - 设计器需要定位组件的 DOM 位置
 * - 计算组件的边界框（bounding box）
 * - 实现组件高亮、拖拽等交互
 *
 * 技术要点：
 * - 通过 React Fiber 架构遍历节点树
 * - 兼容 React 16/17/18 的内部属性名变化
 * - 降级到 ReactDOM.findDOMNode（已废弃但仍可用）
 */

import { ReactInstance } from 'react';
import { findDOMNode } from 'react-dom';
import { isElement } from '@alilc/lowcode-utils';
import { isDOMNode } from './is-dom-node';

/**
 * 获取 React 内部 Fiber 节点
 *
 * @param el - React 组件实例或 DOM 元素
 * @returns Fiber 节点对象
 *
 * React Fiber 是什么？
 * - React 16+ 的内部数据结构
 * - 用于实现增量渲染（Concurrent Mode）
 * - 包含组件的状态、属性、子节点等信息
 *
 * 属性名兼容：
 * - React 17+: _reactInternals
 * - React 16: _reactInternalFiber
 *
 * Fiber 节点结构（简化）：
 * ```typescript
 * {
 *   type: Component | 'div' | ...,  // 组件类型
 *   stateNode: DOMElement | Instance,  // 实际的 DOM 或组件实例
 *   child: Fiber,  // 第一个子节点
 *   sibling: Fiber,  // 兄弟节点
 *   return: Fiber,  // 父节点
 * }
 * ```
 *
 * @example
 * ```typescript
 * class MyComponent extends React.Component {
 *   render() { return <div>Hello</div>; }
 * }
 * const instance = new MyComponent();
 * const fiber = getReactInternalFiber(instance);
 * console.log(fiber.type);  // MyComponent
 * ```
 */
export const getReactInternalFiber = (el: any) => {
  // 优先使用新版本的属性名，降级到旧版本
  return el._reactInternals || el._reactInternalFiber;
};

/**
 * 从 Fiber 节点递归收集所有 DOM 节点
 *
 * @param fiber - React Fiber 节点
 * @param elements - 用于收集 DOM 节点的数组（引用传递）
 *
 * 遍历策略：深度优先遍历（DFS）
 * 1. 检查当前节点的 stateNode 是否为 DOM 节点
 * 2. 如果是 DOM 节点，添加到结果数组
 * 3. 如果不是，递归遍历子节点（fiber.child）
 * 4. 遍历兄弟节点（fiber.sibling）
 *
 * 为什么需要遍历子节点和兄弟节点？
 * - 一个组件可能渲染多个 DOM 节点（Fragment）
 * - 需要收集所有相关的 DOM 节点
 *
 * 示例场景：
 * ```jsx
 * function MyComponent() {
 *   return (
 *     <>
 *       <div>Node 1</div>
 *       <div>Node 2</div>
 *     </>
 *   );
 * }
 * // 会收集两个 div 元素
 * ```
 */
function elementsFromFiber(fiber: any, elements: Array<Element | Text>) {
  // 空节点检查
  if (fiber) {
    // ===== 检查当前节点 =====
    // fiber.stateNode 是 Fiber 节点关联的实际对象
    // - 对于 DOM 元素：stateNode 是 DOM 元素本身
    // - 对于类组件：stateNode 是组件实例
    // - 对于函数组件：stateNode 可能为 null
    if (fiber.stateNode && isDOMNode(fiber.stateNode)) {
      // 是 DOM 节点，添加到结果数组
      elements.push(fiber.stateNode);
    } else if (fiber.child) {
      // 不是 DOM 节点，但有子节点
      // 递归遍历子节点（深度优先）
      elementsFromFiber(fiber.child, elements);
    }

    // ===== 遍历兄弟节点 =====
    // Fiber 树的兄弟节点通过 sibling 链接
    // 需要遍历所有兄弟节点以收集完整的 DOM 列表
    if (fiber.sibling) {
      elementsFromFiber(fiber.sibling, elements);
    }
  }
}

/**
 * 从 React 实例查找对应的 DOM 节点
 *
 * @param elem - React 实例或 DOM 元素
 * @returns DOM 节点数组，失败返回 null
 *
 * 查找策略（按优先级）：
 * 1. 如果已经是 DOM 元素，直接返回
 * 2. 通过 Fiber 节点遍历查找（推荐方式）
 * 3. 降级到 ReactDOM.findDOMNode（兼容性方案）
 *
 * 为什么返回数组？
 * - 一个组件可能渲染多个 DOM 节点（Fragment）
 * - 统一返回格式，便于处理
 *
 * 为什么需要 try-catch？
 * - findDOMNode 可能抛出异常（如组件未挂载）
 * - 确保函数的健壮性
 *
 * @example
 * ```typescript
 * // 情况1：DOM 元素
 * const div = document.querySelector('div');
 * reactFindDOMNodes(div);  // [div]
 *
 * // 情况2：类组件实例
 * class MyButton extends React.Component {
 *   render() { return <button>Click</button>; }
 * }
 * const instance = new MyButton();
 * reactFindDOMNodes(instance);  // [<button>]
 *
 * // 情况3：Fragment（多个节点）
 * function MyFragment() {
 *   return <>
 *     <div>1</div>
 *     <div>2</div>
 *   </>;
 * }
 * const instance = getFiberInstance(MyFragment);
 * reactFindDOMNodes(instance);  // [<div>1</div>, <div>2</div>]
 * ```
 */
export function reactFindDOMNodes(elem: ReactInstance | null): Array<Element | Text> | null {
  // ===== 情况0：空值检查 =====
  if (!elem) {
    return null;
  }

  // ===== 情况1：已经是 DOM 元素 =====
  // 直接返回，不需要查找
  if (isElement(elem)) {
    return [elem];
  }

  // ===== 情况2：通过 Fiber 节点查找（推荐） =====
  // 初始化结果数组
  const elements: Array<Element | Text> = [];

  // 获取 Fiber 节点
  const fiberNode = getReactInternalFiber(elem);

  // 从 Fiber 的子节点开始遍历
  // 注意：不直接检查 fiberNode.stateNode
  // 因为组件实例的 stateNode 是组件本身，不是 DOM
  elementsFromFiber(fiberNode?.child, elements);

  // 如果找到了 DOM 节点，返回结果
  if (elements.length > 0) return elements;

  // ===== 情况3：降级到 findDOMNode（兼容） =====
  // 如果 Fiber 遍历没找到（可能是旧版本 React）
  // 尝试使用 ReactDOM.findDOMNode
  try {
    // findDOMNode 已被 React 官方标记为废弃
    // 但仍然可用，主要用于兼容性
    //
    // 注意：findDOMNode 只返回第一个 DOM 节点
    // 无法处理 Fragment 的多个节点情况
    return [findDOMNode(elem) as any];
  } catch (e) {
    // 异常情况（如组件未挂载），返回 null
    return null;
  }
}
