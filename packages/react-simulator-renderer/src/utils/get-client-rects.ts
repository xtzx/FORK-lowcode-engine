/**
 * @file 元素位置信息获取工具
 * @description 获取 DOM 节点（包括文本节点）的位置信息（ClientRect/DOMRect）
 *
 * 作用：
 * - 获取元素的精确位置、大小信息
 * - 支持普通元素节点（Element）
 * - 支持文本节点（Text），使用 Range API 处理
 *
 * 使用场景：
 * - 设计器需要高亮选中的组件
 * - 计算组件的边界框（bounding box）
 * - 实现拖拽时的位置计算
 * - 获取文本节点的渲染位置（如行内文本）
 *
 * 技术要点：
 * - Element 节点：直接使用 getBoundingClientRect()
 * - Text 节点：需要通过 Range API 获取位置
 * - 复用 Range 对象以提升性能
 */

import { isElement } from '@alilc/lowcode-utils';

/**
 * 全局复用的 Range 对象
 *
 * 为什么要复用？
 * - Range 对象创建有一定开销
 * - 文本节点位置获取可能频繁调用
 * - 复用可以减少对象创建，提升性能
 *
 * 注意事项：
 * - Range 是可变的，使用前需要重新设置
 * - selectNode() 会清空之前的选区
 */
const cycleRange = document.createRange();

/**
 * 获取节点的位置信息（ClientRect）
 *
 * @param node - 要获取位置的节点（Element 或 Text）
 * @returns DOMRect 数组，包含节点的位置和尺寸信息
 *
 * 返回值说明：
 * - Element 节点：返回包含单个 DOMRect 的数组
 * - Text 节点：可能返回多个 DOMRect（文本跨行时）
 *
 * DOMRect 结构：
 * ```typescript
 * {
 *   x: number;        // 左上角 X 坐标（相对视口）
 *   y: number;        // 左上角 Y 坐标（相对视口）
 *   width: number;    // 宽度
 *   height: number;   // 高度
 *   top: number;      // 上边距（相对视口）
 *   right: number;    // 右边距（相对视口）
 *   bottom: number;   // 下边距（相对视口）
 *   left: number;     // 左边距（相对视口）
 * }
 * ```
 *
 * @example
 * ```typescript
 * // 获取元素位置
 * const div = document.querySelector('div');
 * const rects = getClientRects(div);
 * console.log(rects[0].top, rects[0].left);
 *
 * // 获取文本节点位置
 * const textNode = div.firstChild;
 * const textRects = getClientRects(textNode);
 * // 文本可能跨多行，每行一个 rect
 * textRects.forEach(rect => {
 *   console.log(`行位置：${rect.top}`);
 * });
 * ```
 */
export function getClientRects(node: Element | Text) {
  // ===== 情况1：普通元素节点 =====
  if (isElement(node)) {
    // Element.getBoundingClientRect() 返回单个 DOMRect
    // 包装成数组以统一返回格式
    return [node.getBoundingClientRect()];
  }

  // ===== 情况2：文本节点 =====
  // 为什么文本节点需要特殊处理？
  // - Text 节点没有 getBoundingClientRect() 方法
  // - 需要使用 Range API 来获取文本的渲染位置

  // 将 Range 选择到目标文本节点
  // selectNode() 会选中整个节点（包括开始和结束）
  cycleRange.selectNode(node);

  // Range.getClientRects() 返回 DOMRectList（类数组对象）
  // 为什么可能有多个 rect？
  // - 文本可能跨多行渲染
  // - 每一行对应一个 rect
  //
  // 示例：
  // "Hello World" 如果在窗口边缘换行：
  // rect[0]: "Hello " 的位置
  // rect[1]: "World" 的位置
  return Array.from(cycleRange.getClientRects());
}
