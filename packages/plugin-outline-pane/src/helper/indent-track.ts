/**
 * @file 缩进追踪器
 * @description 追踪拖拽时的水平移动，实现通过缩进改变插入层级的功能
 *
 * 核心功能：
 * - 追踪鼠标水平方向的移动距离
 * - 根据移动距离判断是否改变插入层级
 * - 向左移动：提升层级（插入到父节点）
 * - 向右移动：降低层级（插入到前一个兄弟节点内）
 *
 * 使用场景：
 * ```
 * 在大纲树中拖拽节点调整层级：
 *
 * 初始结构：
 * Container
 * ├─ Button1
 * ├─ Button2  <- 正在拖拽
 * └─ Input
 *
 * 向右移动（缩进）：
 * Container
 * ├─ Button1
 * │  └─ Button2  <- 成为 Button1 的子节点
 * └─ Input
 *
 * 向左移动（取消缩进）：
 * Container
 * ├─ Button1
 * └─ Input
 * Button2  <- 提升到与 Container 同级
 * ```
 *
 * 技术要点：
 * - 追踪水平坐标变化（globalX）
 * - 使用敏感度阈值（IndentSensitive = 15px）
 * - 计算移动档位（每 15px 一档）
 * - 根据方向和档位调整层级
 */

import { isLocationChildrenDetail } from '@alilc/lowcode-utils';
import { IPublicModelDropLocation, IPublicModelNode } from '@alilc/lowcode-types';

/**
 * 缩进敏感度（像素）
 *
 * 值：15px
 *
 * 说明：
 * - 鼠标水平移动 15px 算作一个缩进档位
 * - 移动 15px：改变 1 级
 * - 移动 30px：改变 2 级
 * - 移动 45px：改变 3 级
 *
 * 为什么是 15px？
 * - 经过用户体验测试的值
 * - 太小：误触发，难以精确控制
 * - 太大：需要移动太远，操作不便
 * - 15px：平衡精度和易用性
 */
const IndentSensitive = 15;

/**
 * 缩进追踪器类
 *
 * 工作原理：
 * 1. 记录开始位置（indentStart）
 * 2. 比较当前位置与开始位置
 * 3. 计算水平移动距离（delta）
 * 4. 判断移动方向（左/右）
 * 5. 计算移动档位（indent）
 * 6. 返回新的父节点和插入位置
 */
export class IndentTrack {
  // ========== 私有属性 ==========

  /**
   * 缩进起始位置（X 坐标）
   *
   * 类型：number | null
   * - number: 已记录起始位置
   * - null: 未记录，需要初始化
   *
   * 用途：
   * - 记录开始拖拽时的 X 坐标
   * - 用于计算移动距离
   * - 每次改变层级后更新
   */
  private indentStart: number | null = null;

  // ========== 公开方法：重置 ==========
  /**
   * 重置缩进起始位置
   *
   * 调用时机：
   * - 拖拽结束
   * - 切换目标节点
   * - 插入位置无效
   *
   * @example
   * ```typescript
   * // 拖拽结束时重置
   * canvas.onDragEnd(() => {
   *   indentTrack.reset();
   * });
   * ```
   */
  reset() {
    this.indentStart = null;
  }

  // ========== 公开方法：获取缩进父节点 ==========
  /**
   * 根据缩进计算新的父节点和插入位置
   *
   * @param lastLoc - 上一次的拖放位置
   * @param loc - 当前的拖放位置
   * @returns [父节点, 插入索引] 或 null
   *
   * 返回 null 的情况：
   * - 位置信息不符合条件
   * - 移动距离不足一个档位
   * - 目标节点不支持插入
   *
   * 返回 [parent, index]：
   * - parent: 新的父节点
   * - index: 在父节点中的插入位置
   *
   * 核心算法：
   * 1. 验证位置条件（同一目标、同一索引等）
   * 2. 初始化起始位置（首次）
   * 3. 计算移动距离和方向
   * 4. 计算移动档位
   * 5. 根据方向确定新父节点
   *
   * @example
   * ```typescript
   * // 拖拽过程中调用
   * const result = indentTrack.getIndentParent(lastLoc, currentLoc);
   * if (result) {
   *   const [newParent, insertIndex] = result;
   *   // 更新插入位置
   *   canvas.createLocation({
   *     target: newParent,
   *     detail: { index: insertIndex }
   *   });
   * }
   * ```
   */
  getIndentParent(lastLoc: IPublicModelDropLocation, loc: IPublicModelDropLocation): [IPublicModelNode, number | undefined] | null {
    // ===== 第1步：验证位置条件 =====
    // 检查位置是否符合缩进计算的条件
    if (
      lastLoc.target !== loc.target ||  // 目标节点必须相同
      !isLocationChildrenDetail(lastLoc.detail) ||  // 必须是 Children 类型
      !isLocationChildrenDetail(loc.detail) ||
      lastLoc.source !== loc.source ||  // 来源必须相同
      lastLoc.detail.index !== loc.detail.index ||  // 索引必须相同
      loc.detail.index == null  // 索引必须有效
    ) {
      // 条件不符，重置并返回
      this.indentStart = null;
      return null;
    }

    // ===== 第2步：初始化起始位置 =====
    // 首次计算时记录起始 X 坐标
    if (this.indentStart == null) {
      this.indentStart = lastLoc.event.globalX;
    }

    // ===== 第3步：计算移动距离 =====
    // delta: 当前位置 - 起始位置
    // 正数：向右移动（缩进）
    // 负数：向左移动（取消缩进）
    const delta = loc.event.globalX - this.indentStart;

    // ===== 第4步：计算移动档位 =====
    // 每 15px 算一个档位
    // Math.abs(delta): 取绝对值
    // Math.floor(): 向下取整
    // 例如：delta=22px -> indent=1, delta=35px -> indent=2
    const indent = Math.floor(Math.abs(delta) / IndentSensitive);

    if (indent < 1) {
      // 移动不足一个档位，不处理
      return null;
    }

    // ===== 第5步：更新起始位置 =====
    // 已经移动了至少一个档位，更新起始位置
    // 这样下次计算会从新位置开始
    // 实现连续缩进（每次移动 15px 就改变一次）
    this.indentStart = loc.event.globalX;

    // ===== 第6步：确定移动方向 =====
    const direction = delta < 0 ? 'left' : 'right';  // 左 or 右

    // ===== 第7步：确定新父节点 =====
    let parent: IPublicModelNode = loc.target;
    const { index } = loc.detail;

    if (direction === 'left') {
      // --- 向左移动：提升层级 ---
      /**
       * 逻辑：
       * - 插入到当前父节点的父节点中
       * - 位置：当前父节点的下一个位置
       *
       * 示例：
       * Container (parent.parent)
       * ├─ Div (parent)
       * │  └─ Button <- 向左移动
       * └─ Input
       *
       * 结果：
       * Container
       * ├─ Div
       * ├─ Button <- 提升到与 Div 同级
       * └─ Input
       *
       * 条件检查：
       * - 父节点必须存在
       * - index 必须等于父节点的子节点数（在末尾）
       * - 父节点不是插槽节点
       */
      if (!parent.parent || index < (parent.children?.size || 0) || parent.isSlotNode) {
        return null;  // 条件不满足，不能提升
      }
      // 返回：[新父节点, 插入位置]
      return [(parent as any).parent, parent.index + 1];
    } else {
      // --- 向右移动：降低层级 ---
      /**
       * 逻辑：
       * - 插入到前一个兄弟节点内部
       * - 位置：前一个兄弟节点的最后
       *
       * 示例：
       * Container
       * ├─ Div
       * ├─ Button <- 向右移动
       * └─ Input
       *
       * 结果：
       * Container
       * ├─ Div
       * │  └─ Button <- 成为 Div 的子节点
       * └─ Input
       *
       * 条件检查：
       * - index 不能为 0（前面必须有兄弟节点）
       * - 前一个兄弟必须是容器节点
       */
      if (index === 0) {
        return null;  // 第一个位置，前面没有兄弟节点
      }

      // 获取前一个兄弟节点
      parent = parent.children?.get(index - 1) as any;

      if (parent && parent.isContainerNode) {
        // 前一个兄弟是容器，可以插入其内部
        // 返回：[新父节点（前一个兄弟）, 插入位置（最后）]
        return [parent, parent.children?.size];
      }
    }

    // 默认返回 null（不符合条件）
    return null;
  }
}
