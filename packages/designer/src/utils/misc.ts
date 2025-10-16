/**
 * @file Misc 杂项工具函数
 * @description 提供设计器使用的各种辅助工具函数
 *
 * 核心功能：
 * - isElementNode: 判断 DOM 节点类型
 * - isDOMNodeVisible: 判断节点是否在视口内
 * - normalizeTriggers: 标准化触发器名称
 * - makeEventsHandler: 创建跨文档的事件处理器
 *
 * 使用场景：
 * - DOM 操作判断
 * - 视口可见性检测
 * - 拖拽事件处理
 * - 跨 iframe 通信
 */

import Viewport from '../builtin-simulator/viewport';
import { ISimulatorHost } from '../simulator';

/**
 * 判断 DOM 节点是否是元素节点
 *
 * @param domNode - DOM 节点
 * @returns true - 是元素节点，false - 不是
 *
 * 节点类型：
 * - ELEMENT_NODE (1): 元素节点（<div>、<span> 等）
 * - TEXT_NODE (3): 文本节点
 * - COMMENT_NODE (8): 注释节点
 * - DOCUMENT_NODE (9): 文档节点
 * - ...
 *
 * 为什么需要这个函数？
 * - 某些操作只能在元素节点上执行
 * - 文本节点、注释节点需要特殊处理
 * - 类型安全
 *
 * @example
 * ```typescript
 * const div = document.createElement('div');
 * isElementNode(div);  // true
 *
 * const text = document.createTextNode('hello');
 * isElementNode(text);  // false
 * ```
 */
export function isElementNode(domNode: Element) {
  return domNode.nodeType === Node.ELEMENT_NODE;
}

/**
 * 判断 DOM 节点是否在视口内可见
 *
 * @param domNode - 要检测的 DOM 节点
 * @param viewport - 画布视口对象
 * @returns true - 可见（至少部分可见），false - 完全不可见
 *
 * 可见判断规则：
 * - 只要节点有**一部分**在视口内，就算可见
 * - 不要求节点完全在视口内
 *
 * 实现原理：
 * - 获取节点的边界矩形（getBoundingClientRect）
 * - 获取视口的尺寸（contentBounds）
 * - 比较节点位置和视口范围
 *
 * 判断条件（需同时满足）：
 * - left >= -nodeWidth: 节点右边缘在视口左边界右侧
 * - top >= -nodeHeight: 节点底边缘在视口上边界下方
 * - bottom <= height + nodeHeight: 节点上边缘在视口下边界上方
 * - right <= width + nodeWidth: 节点左边缘在视口右边界左侧
 *
 * 为什么要加上 nodeWidth 和 nodeHeight？
 * - 允许节点部分在视口外
 * - 节点只要有一部分可见就算可见
 * - 更宽松的判断条件
 *
 * 视觉示意：
 * ```
 * 视口范围：
 * ┌────────────────┐
 * │                │
 * │  [部分可见]    │ <- 算可见
 * │                │
 * └────────────────┘
 *      [完全不可见]   <- 不可见
 * ```
 *
 * 使用场景：
 * - 虚拟滚动：只渲染可见节点
 * - 性能优化：跳过不可见节点的处理
 * - 自动滚动：将节点滚动到可见区域
 *
 * @example
 * ```typescript
 * const isVisible = isDOMNodeVisible(componentElement, viewport);
 *
 * if (!isVisible) {
 *   // 节点不可见，滚动到可见区域
 *   componentElement.scrollIntoView();
 * }
 * ```
 */
export function isDOMNodeVisible(domNode: Element, viewport: Viewport) {
  // 获取节点的位置和尺寸
  const domNodeRect = domNode.getBoundingClientRect();

  // 获取视口尺寸
  const { width, height } = viewport.contentBounds;

  // 解构节点的位置和尺寸信息
  const { left, right, top, bottom, width: nodeWidth, height: nodeHeight } = domNodeRect;

  // 判断是否可见（部分可见也算）
  return (
    left >= -nodeWidth &&  // 节点右边在视口左侧或内部
    top >= -nodeHeight &&  // 节点底部在视口上侧或内部
    bottom <= height + nodeHeight &&  // 节点顶部在视口下侧或内部
    right <= width + nodeWidth  // 节点左边在视口右侧或内部
  );
}

/**
 * 标准化触发器名称（转为大写）
 *
 * @param triggers - 触发器名称数组
 * @returns 大写的触发器名称数组
 *
 * 功能：
 * - 将所有触发器名称转为大写
 * - 统一格式
 *
 * 触发器示例：
 * - 'click' -> 'CLICK'
 * - 'hover' -> 'HOVER'
 * - 'focus' -> 'FOCUS'
 *
 * 为什么要转大写？
 * - 统一比较（避免大小写不一致）
 * - 约定俗成的常量命名
 * - 提高可读性
 *
 * @example
 * ```typescript
 * const triggers = ['click', 'hover', 'focus'];
 * const normalized = normalizeTriggers(triggers);
 * // ['CLICK', 'HOVER', 'FOCUS']
 *
 * // 使用场景：
 * if (normalized.includes('CLICK')) {
 *   // 处理点击触发
 * }
 * ```
 */
export function normalizeTriggers(triggers: string[]) {
  return triggers.map((trigger: string) => trigger?.toUpperCase());
}

/**
 * 创建跨文档的事件处理器
 *
 * @param boostEvent - 启动事件（鼠标或拖拽事件）
 * @param sensors - 模拟器宿主数组（iframe列表）
 * @returns 事件处理器函数
 *
 * 功能：
 * - 收集所有相关的 Document 对象
 * - 返回一个处理器，对所有 Document 执行回调
 *
 * 收集的 Document：
 * 1. window.document: 主窗口文档
 * 2. boostEvent.view.document: 事件来源文档
 * 3. sensors[].contentDocument: 所有 iframe 文档
 *
 * 为什么需要跨文档处理？
 * ```
 * 拖拽场景：
 *
 * 主窗口（设计器）
 * ├── 组件库面板
 * └── iframe1（画布1）
 *     └── iframe2（画布2，嵌套）
 *
 * 问题：
 * - 鼠标可能在任意 iframe 中移动
 * - 每个 iframe 有独立的 document
 * - 需要在所有 document 上监听事件
 *
 * 解决：
 * - 收集所有 document
 * - 统一添加/移除事件监听器
 * - 避免遗漏事件
 * ```
 *
 * 使用场景：
 * ```typescript
 * // 拖拽开始时
 * const eventsHandler = makeEventsHandler(mouseEvent, [sim1, sim2]);
 *
 * // 在所有 document 上添加 mousemove 监听
 * eventsHandler((doc) => {
 *   doc.addEventListener('mousemove', handleMove);
 * });
 *
 * // 拖拽结束时，在所有 document 上移除监听
 * eventsHandler((doc) => {
 *   doc.removeEventListener('mousemove', handleMove);
 * });
 * ```
 *
 * 使用 Set 的原因：
 * - 自动去重（同一个 document 只添加一次）
 * - 避免重复监听
 *
 * @example
 * ```typescript
 * // 完整示例：拖拽监听
 * function startDrag(e, simulators) {
 *   const handler = makeEventsHandler(e, simulators);
 *
 *   // 添加监听
 *   handler(doc => {
 *     doc.addEventListener('mousemove', onMove);
 *     doc.addEventListener('mouseup', onEnd);
 *   });
 *
 *   // 清理监听
 *   function cleanup() {
 *     handler(doc => {
 *       doc.removeEventListener('mousemove', onMove);
 *       doc.removeEventListener('mouseup', onEnd);
 *     });
 *   }
 * }
 * ```
 */
 export function makeEventsHandler(
  boostEvent: MouseEvent | DragEvent,
  sensors: ISimulatorHost[],
): (fn: (sdoc: Document) => void) => void {
  // 主窗口的 document
  const topDoc = window.document;

  // 事件来源的 document（可能是 iframe）
  const sourceDoc = boostEvent.view?.document || topDoc;

  // 使用 Set 存储所有 document，自动去重
  const docs = new Set<Document>();

  // 添加主窗口 document
  docs.add(topDoc);

  // 添加事件来源 document
  docs.add(sourceDoc);

  // 添加所有模拟器（iframe）的 document
  sensors.forEach((sim) => {
    const sdoc = sim.contentDocument;
    if (sdoc) {
      docs.add(sdoc);
    }
  });

  // 返回处理器函数
  // 该函数接收一个回调，对所有 document 执行
  return (handle: (sdoc: Document) => void) => {
    docs.forEach((doc) => handle(doc));
  };
}