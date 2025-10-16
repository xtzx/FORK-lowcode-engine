/**
 * @file 停留计时器
 * @description 实现拖拽时的停留检测机制
 *
 * 核心功能：
 * - 检测鼠标是否在某个节点上停留
 * - 停留超过阈值时间后触发回调
 * - 用于自动展开节点（拖拽悬停展开）
 *
 * 使用场景：
 * ```
 * 用户拖拽组件到大纲树：
 *
 * 1. 鼠标移动到 Container 节点上
 * 2. 开始计时（默认 500ms）
 * 3. 如果鼠标继续停留在 Container 上
 * 4. 500ms 后自动展开 Container
 * 5. 用户可以看到 Container 的子节点
 * 6. 可以将组件拖入 Container 内部
 *
 * 如果鼠标移开：
 * - 立即重置计时器
 * - 不会触发展开
 * ```
 *
 * 设计理念：
 * - 防抖（Debounce）：避免频繁触发
 * - 用户友好：自动展开，无需手动操作
 * - 性能优化：只有真正停留才触发
 *
 * 技术要点：
 * - 使用 setTimeout 实现计时
 * - 移动时自动重置计时器
 * - 避免重复计时（同一节点不重复）
 */

import { isLocationChildrenDetail } from '@alilc/lowcode-utils';
import { IPublicModelNode, IPublicModelDropLocation, IPublicModelLocateEvent } from '@alilc/lowcode-types';

/**
 * 停留检查计时器类
 *
 * 工作原理：
 * 1. 鼠标进入节点 -> 开始计时
 * 2. 鼠标移动到其他节点 -> 重置计时
 * 3. 鼠标停留足够时间 -> 触发回调
 * 4. 回调执行后 -> 自动重置
 *
 * 防抖机制：
 * - 频繁移动不会触发回调
 * - 只有真正停留才触发
 */
export default class DwellTimer {
  // ========== 私有属性 ==========

  /**
   * 计时器 ID
   *
   * 类型：number | undefined
   * - number: 计时器正在运行
   * - undefined: 计时器未运行
   *
   * 用途：
   * - 存储 setTimeout 的返回值
   * - 用于 clearTimeout 取消计时
   */
  private timer: number | undefined;

  /**
   * 上一次聚焦的节点
   *
   * 用途：
   * - 判断节点是否变化
   * - 如果节点相同，不重新计时
   * - 避免同一节点反复计时
   */
  private previous?: IPublicModelNode;

  /**
   * 定位事件对象
   *
   * 用途：
   * - 存储鼠标事件信息
   * - 传递给决策函数
   */
  private event?: IPublicModelLocateEvent;

  /**
   * 决策函数
   *
   * 类型：(node, event) => void
   *
   * 用途：
   * - 停留时间到达后执行的回调
   * - 通常用于展开节点或创建插入位置
   *
   * 示例：
   * ```typescript
   * const decide = (node, event) => {
   *   // 自动展开节点
   *   node.expand(true);
   *   // 或创建插入位置
   *   canvas.createLocation({ target: node, ... });
   * };
   * ```
   */
  private decide: (node: IPublicModelNode, event: IPublicModelLocateEvent) => void;

  /**
   * 超时时间（毫秒）
   *
   * 默认值：500ms
   *
   * 说明：
   * - 鼠标需要停留多久才触发
   * - 500ms 是经过用户体验测试的值
   * - 太短：误触发
   * - 太长：用户等待时间过长
   */
  private timeout = 500;

  // ========== 构造函数 ==========
  /**
   * 构造停留计时器
   *
   * @param decide - 决策回调函数
   * @param timeout - 超时时间（毫秒），默认 500
   *
   * @example
   * ```typescript
   * const timer = new DwellTimer((node, event) => {
   *   console.log(`在 ${node.componentName} 上停留了 500ms`);
   *   node.expand(true);  // 自动展开
   * }, 500);
   * ```
   */
  constructor(decide: (node: IPublicModelNode, event: IPublicModelLocateEvent) => void, timeout = 500) {
    this.decide = decide;  // 保存决策函数
    this.timeout = timeout;  // 保存超时时间
  }

  // ========== 公开方法：聚焦节点 ==========
  /**
   * 聚焦到某个节点，开始计时
   *
   * @param node - 要聚焦的节点
   * @param event - 定位事件
   *
   * 逻辑：
   * 1. 如果节点与上次相同 -> 不处理（已在计时中）
   * 2. 如果节点不同 -> 重置计时器
   * 3. 记录新节点
   * 4. 启动新的计时器
   *
   * 为什么要检查 previous === node？
   * - 避免重复计时
   * - 防止鼠标在同一节点上微小移动导致重置
   *
   * @example
   * ```typescript
   * // 鼠标进入节点A
   * timer.focus(nodeA, event);  // 开始计时
   *
   * // 鼠标仍在节点A上移动
   * timer.focus(nodeA, event);  // 不处理，继续计时
   *
   * // 鼠标移动到节点B
   * timer.focus(nodeB, event);  // 重置，重新计时
   * ```
   */
  focus(node: IPublicModelNode, event: IPublicModelLocateEvent) {
    // 保存事件对象
    this.event = event;

    // 检查是否与上次相同
    if (this.previous === node) {
      return;  // 相同节点，不重新计时
    }

    // 重置上次的计时器
    this.reset();

    // 记录新节点
    this.previous = node;

    // 启动新的计时器
    this.timer = setTimeout(() => {
      // 时间到，执行决策函数
      this.previous && this.decide(this.previous, this.event!);
      // 执行后重置
      this.reset();
    }, this.timeout) as any;
  }

  // ========== 公开方法：尝试聚焦 ==========
  /**
   * 尝试从 DropLocation 提取焦点节点并聚焦
   *
   * @param loc - 拖放位置对象
   *
   * 功能：
   * - 检查位置详情是否为 Children 类型
   * - 提取 focus 节点
   * - 调用 focus 方法
   *
   * 为什么需要这个方法？
   * - DropLocation 是拖拽系统的标准数据结构
   * - detail.focus 可能包含需要停留的节点
   * - 封装提取逻辑，简化调用
   *
   * focus 的类型：
   * - { type: 'node', node: IPublicModelNode } - 聚焦节点
   * - { type: 'slots' } - 聚焦插槽
   * - undefined - 无焦点
   *
   * @example
   * ```typescript
   * // 拖拽系统调用
   * canvas.onDragMove((loc) => {
   *   timer.tryFocus(loc);
   * });
   *
   * // 如果 loc.detail.focus.type === 'node'
   * // 会自动调用 focus() 并开始计时
   * ```
   */
  tryFocus(loc?: IPublicModelDropLocation | null) {
    // ===== 检查位置有效性 =====
    // 位置不存在 或 detail 不是 Children 类型 -> 重置
    if (!loc || !isLocationChildrenDetail(loc.detail)) {
      this.reset();
      return;
    }

    // ===== 提取焦点节点 =====
    if (loc.detail.focus?.type === 'node') {
      // 焦点类型是节点 -> 聚焦该节点
      this.focus(loc.detail.focus.node, loc.event);
    } else {
      // 焦点类型不是节点（可能是 'slots' 或 undefined）-> 重置
      this.reset();
    }
  }

  // ========== 公开方法：重置计时器 ==========
  /**
   * 重置计时器
   *
   * 功能：
   * - 取消当前计时器（如果有）
   * - 清空 previous 节点
   *
   * 调用时机：
   * - 鼠标移动到新节点
   * - 拖拽结束
   * - 手动取消
   *
   * @example
   * ```typescript
   * // 拖拽结束时重置
   * canvas.onDragEnd(() => {
   *   timer.reset();
   * });
   * ```
   */
  reset() {
    // 取消计时器（如果存在）
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    // 清空 previous 节点
    this.previous = undefined;
  }
}
