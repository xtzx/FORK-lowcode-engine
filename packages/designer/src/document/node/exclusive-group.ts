/**
 * @file ExclusiveGroup 互斥组管理
 * @description 管理条件渲染节点的互斥显示（如 if-else-if-else）
 *
 * 核心功能：
 * 1. 条件分组：将多个条件节点组合成互斥组
 * 2. 互斥显示：同一时刻只能有一个节点可见
 * 3. 可见性管理：控制哪个节点显示
 * 4. 大纲树展示：在大纲树中作为一个整体展示
 *
 * 使用场景：
 * ```jsx
 * // React 条件渲染
 * {condition === 'a' && <ComponentA />}
 * {condition === 'b' && <ComponentB />}
 * {condition === 'c' && <ComponentC />}
 *
 * // 在设计器中，这三个节点会被组合成一个 ExclusiveGroup
 * // 设计时可以切换显示不同的分支
 * ```
 *
 * 与 Modal 的区别：
 * - ExclusiveGroup: 同级兄弟节点，互斥显示（if-else-if-else）
 * - ModalNodesManager: 跨层级节点，独立显示（Dialog、Drawer 等）
 *
 * 工作原理：
 * ```
 * 1. 检测条件渲染节点（有 conditionGroup 属性）
 * 2. 将相邻的同组节点添加到 ExclusiveGroup
 * 3. 通过 visibleIndex 控制当前显示哪个节点
 * 4. 在大纲树中只显示一个折叠项
 * ```
 *
 * @example
 * ```typescript
 * // 创建互斥组
 * const group = new ExclusiveGroup('condition-group-1');
 *
 * // 添加节点
 * group.add(nodeA);  // if 分支
 * group.add(nodeB);  // else if 分支
 * group.add(nodeC);  // else 分支
 *
 * // 切换显示
 * group.setVisible(nodeB);  // 显示第二个分支
 *
 * // 检查可见性
 * group.isVisible(nodeB)  // true
 * group.visibleNode       // nodeB
 * ```
 */

import { obx, computed, makeObservable } from '@alilc/lowcode-editor-core';
import { uniqueId } from '@alilc/lowcode-utils';
import { IPublicTypeTitleContent, IPublicModelExclusiveGroup } from '@alilc/lowcode-types';
import type { INode } from './node';
import { intl } from '../../locale';

// ==================== IExclusiveGroup 接口 ====================
/**
 * 互斥组接口
 *
 * 核心属性：
 * - name: 组名（用于识别）
 * - children: 组内所有节点
 * - visibleNode: 当前可见节点
 * - visibleIndex: 当前可见节点的索引
 *
 * 核心方法：
 * - add: 添加节点到组
 * - remove: 从组中移除节点
 * - setVisible: 设置可见节点
 * - isVisible: 检查节点是否可见
 */
export interface IExclusiveGroup extends IPublicModelExclusiveGroup<INode> {
  /**
   * 组名（唯一标识）
   */
  readonly name: string;

  /**
   * 组的索引（使用第一个节点的索引）
   */
  get index(): number | undefined;

  /**
   * 从组中移除节点
   */
  remove(node: INode): void;

  /**
   * 添加节点到组
   */
  add(node: INode): void;

  /**
   * 检查节点是否可见
   */
  isVisible(node: INode): boolean;

  /**
   * 组内节点数量
   */
  get length(): number;

  /**
   * 当前可见的节点
   */
  get visibleNode(): INode;
}

// ==================== ExclusiveGroup 类 ====================
/**
 * 互斥组类
 *
 * 职责：
 * - 存储组内所有节点（children）
 * - 维护可见节点索引（visibleIndex）
 * - 提供节点增删接口
 * - 提供可见性切换接口
 *
 * 核心数据：
 * ```typescript
 * {
 *   name: 'condition-group-1',     // 组名
 *   children: [nodeA, nodeB, nodeC],  // 所有节点
 *   visibleIndex: 0,               // 当前显示第 0 个
 *   title: '条件分组'               // 显示标题
 * }
 * ```
 *
 * 注释说明：
 * - modals: 关联 x-hide 属性，跨层级（ModalNodesManager）
 * - if-else-if: 关联 conditionGroup 属性，同层级兄弟节点（ExclusiveGroup）
 * - 需要渲染引擎支持
 */
// modals assoc x-hide value, initial: check is Modal, yes will put it in modals, cross levels
// if-else-if assoc conditionGroup value, should be the same level,
// and siblings, need renderEngine support
export class ExclusiveGroup implements IExclusiveGroup {
  /**
   * 类型标识
   */
  readonly isExclusiveGroup = true;

  /**
   * 唯一 ID
   */
  readonly id = uniqueId('exclusive');

  /**
   * 显示标题（在大纲树中）
   */
  readonly title: IPublicTypeTitleContent;

  /**
   * 组内所有节点
   *
   * @obx.shallow 浅响应式：数组本身变化会触发响应，但数组元素的属性变化不会
   */
  @obx.shallow readonly children: INode[] = [];

  /**
   * 当前可见节点的索引
   *
   * @obx 完全响应式：值变化会触发所有依赖的 computed 重新计算
   */
  @obx private visibleIndex = 0;

  /**
   * 所属文档
   *
   * @computed 计算属性：从 visibleNode 获取
   */
  @computed get document() {
    return this.visibleNode.document;
  }

  /**
   * z-index 层级
   *
   * @computed 计算属性：从 visibleNode 获取
   */
  @computed get zLevel() {
    return this.visibleNode.zLevel;
  }

  /**
   * 组内节点数量
   */
  @computed get length() {
    return this.children.length;
  }

  /**
   * 当前可见的节点
   *
   * 说明：
   * - 通过 visibleIndex 获取
   * - 用于在设计器中显示对应的分支
   */
  @computed get visibleNode(): INode {
    return this.children[this.visibleIndex];
  }

  /**
   * 第一个节点
   *
   * 说明：
   * - 用于获取组的索引位置
   */
  @computed get firstNode(): INode {
    return this.children[0]!;
  }

  /**
   * 组的索引
   *
   * 说明：
   * - 使用第一个节点的索引
   * - 用于在父容器中定位
   */
  get index() {
    return this.firstNode.index;
  }

  /**
   * 构造函数
   *
   * @param name - 组名（唯一标识）
   * @param title - 显示标题
   */
  constructor(readonly name: string, title?: IPublicTypeTitleContent) {
    makeObservable(this);
    this.title = title || {
      type: 'i18n',
      intl: intl('Condition Group'),
    };
  }

  /**
   * 添加节点到组
   *
   * @param node - 要添加的节点
   *
   * 逻辑：
   * 1. 如果节点的下一个兄弟节点也在该组中，插入到它前面（保持顺序）
   * 2. 否则，添加到末尾
   *
   * 为什么检查 nextSibling？
   * - 保证组内节点的顺序与在父容器中的顺序一致
   * - 例如：A -> B -> C，当添加 B 时，检测到 C 在组中，则插入到 C 前面
   */
  add(node: INode) {
    if (node.nextSibling && node.nextSibling.conditionGroup?.id === this.id) {
      // 插入到下一个兄弟节点前面
      const i = this.children.indexOf(node.nextSibling);
      this.children.splice(i, 0, node);
    } else {
      // 添加到末尾
      this.children.push(node);
    }
  }

  /**
   * 从组中移除节点
   *
   * @param node - 要移除的节点
   *
   * 逻辑：
   * 1. 找到节点的索引
   * 2. 从数组中移除
   * 3. 调整 visibleIndex：
   *    - 如果移除的在可见节点之前，visibleIndex 减 1
   *    - 如果移除的是可见节点且是最后一个，显示前一个
   *
   * 为什么要调整 visibleIndex？
 * - 保证 visibleIndex 始终有效
   * - 保证用户不会看到空白（始终有节点可见）
   */
  remove(node: INode) {
    const i = this.children.indexOf(node);
    if (i > -1) {
      // 从数组中移除
      this.children.splice(i, 1);

      // 调整可见索引
      if (this.visibleIndex > i) {
        // 移除的在可见节点之前，索引减 1
        this.visibleIndex -= 1;
      } else if (this.visibleIndex >= this.children.length) {
        // 移除的是最后一个且是可见节点，显示新的最后一个
        this.visibleIndex = this.children.length - 1;
      }
    }
  }

  /**
   * 设置可见节点
   *
   * @param node - 要显示的节点
   *
   * 说明：
   * - 切换当前显示的分支
   * - 在大纲树中点击不同的分支时调用
   */
  setVisible(node: INode) {
    const i = this.children.indexOf(node);
    if (i > -1) {
      this.visibleIndex = i;
    }
  }

  /**
   * 检查节点是否可见
   *
   * @param node - 要检查的节点
   * @returns 是否可见
   *
   * 说明：
   * - 用于在大纲树中高亮当前分支
   * - 用于在属性面板中显示对应的属性
   */
  isVisible(node: INode) {
    const i = this.children.indexOf(node);
    return i === this.visibleIndex;
  }
}

// ==================== 类型守卫 ====================
/**
 * 判断是否是互斥组
 *
 * @param obj - 要检查的对象
 * @returns 是否是 ExclusiveGroup
 */
export function isExclusiveGroup(obj: any): obj is ExclusiveGroup {
  return obj && obj.isExclusiveGroup;
}
