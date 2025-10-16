/**
 * @file Selection 选中管理系统
 * @description 管理文档中节点的选中状态，支持单选和多选
 *
 * 📌 核心地位：
 * - Selection 是选中状态的唯一管理者
 * - 所有选中操作都通过 Selection
 * - 保证选中状态的一致性
 *
 * 🎯 核心职责：
 * 1. 选中管理：单选、多选、取消选中
 * 2. 状态维护：_selected 数组管理
 * 3. 有效性检查：canSelect() 检查
 * 4. 事件通知：selectionchange 事件
 * 5. 节点查询：getNodes()、getTopNodes()
 * 6. 状态判断：has()、isEmpty()
 *
 * 🔄 选中流程：
 * ```
 * 1. 用户点击节点
 * 2. 调用 select(id) 或 add(id)
 * 3. 检查节点是否可选中
 * 4. 更新 _selected 数组
 * 5. 发送 selectionchange 事件
 * 6. UI 响应（高亮、属性面板等）
 * ```
 *
 * 🎨 选中模式：
 * - 单选：select(id) - 清空其他选中
 * - 多选：add(id) - 添加到选中列表
 * - 移除：remove(id) - 从选中列表移除
 * - 清空：clear() - 清空所有选中
 *
 * 📚 设计要点：
 * - 只存储 ID，不存储 Node 对象（避免引用问题）
 * - 使用 @obx.shallow 实现响应式
 * - 反向遍历 dispose（删除时安全）
 * - 避免不必要的 reaction（性能优化）
 *
 * @example
 * ```typescript
 * // 单选
 * selection.select('node_123');
 *
 * // 多选
 * selection.add('node_456');
 * selection.add('node_789');
 *
 * // 获取选中节点
 * const nodes = selection.getNodes();
 *
 * // 监听选中变化
 * selection.onSelectionChange((ids) => {
 *   console.log('选中节点：', ids);
 * });
 * ```
 */

import { obx, makeObservable, IEventBus, createModuleEventBus } from '@alilc/lowcode-editor-core';
import { INode, comparePosition, PositionNO } from './node/node';
import { DocumentModel } from './document-model';
import { IPublicModelSelection } from '@alilc/lowcode-types';

// ==================== ISelection 接口 ====================
/**
 * Selection 接口
 *
 * 继承：IPublicModelSelection
 *
 * Omit 'node'：
 * - 公开接口有 node getter
 * - 内部实现不需要
 *
 * 扩展方法：
 * - containsNode: 判断节点是否在选中列表中
 */
export interface ISelection extends Omit<IPublicModelSelection<INode>, 'node'> {
  /**
   * 判断节点是否在选中列表中
   *
   * @param node - 要判断的节点
   * @param excludeRoot - 是否排除根节点
   * @returns true - 在选中列表中，false - 不在
   */
  containsNode(node: INode, excludeRoot: boolean): boolean;
}

// ==================== Selection 类 ====================
/**
 * 选中管理类
 *
 * 职责：
 * - 管理选中节点的 ID 列表
 * - 提供选中操作方法
 * - 发送选中变化事件
 *
 * 核心数据：
 * - _selected: 选中节点的 ID 数组
 *
 * 为什么只存 ID 不存 Node？
 * - 避免循环引用
 * - 节点可能被删除
 * - ID 是稳定的标识
 */
export class Selection implements ISelection {
  /**
   * 事件总线
   *
   * 用途：
   * - 发送 selectionchange 事件
   * - 通知选中变化
   */
  private emitter: IEventBus = createModuleEventBus('Selection');

  /**
   * 选中的节点 ID 数组
   *
   * @obx.shallow 装饰器：
   * - MobX 浅监听
   * - 数组增删会触发更新
   * - 不深度监听元素内部
   *
   * 为什么用浅监听？
   * - ID 是字符串，不会变化
   * - 只需监听数组本身的变化
   * - 性能优化
   */
  @obx.shallow private _selected: string[] = [];

  /**
   * 构造 Selection 实例
   *
   * @param doc - 所属文档（只读）
   *
   * 初始化：
   * - 启用 MobX 响应式
   * - 空选中列表
   */
  constructor(readonly doc: DocumentModel) {
    makeObservable(this);
  }

  /**
   * 获取选中的节点 ID 数组
   *
   * @returns 节点 ID 数组
   */
  get selected(): string[] {
    return this._selected;
  }

  // ========== 核心方法：单选 ==========
  /**
   * 选中单个节点（清空其他选中）
   *
   * @param id - 节点 ID
   *
   * 功能：
   * - 清空之前的选中
   * - 选中指定节点
   * - 发送事件
   *
   * 性能优化：
   * - 如果已经只选中这一个节点，不重复操作
   * - 避免触发不必要的 reaction
   *
   * 有效性检查：
   * - 节点必须存在
   * - 节点必须可选中（不锁定、不是伪节点等）
   */
  select(id: string) {
    // ===== 性能优化：避免重复选中 =====
    if (this._selected.length === 1 && this._selected.indexOf(id) > -1) {
      return;  // 已经选中这一个，不重复操作
    }

    // ===== 有效性检查 =====
    const node = this.doc.getNode(id);
    if (!node?.canSelect()) {
      return;  // 节点不存在或不可选中
    }

    // ===== 更新选中状态 =====
    this._selected = [id];  // 只选中这一个

    // ===== 发送事件 =====
    this.emitter.emit('selectionchange', this._selected);
  }

  // ========== 核心方法：批量选中 ==========
  /**
   * 批量选中节点
   *
   * @param ids - 节点 ID 数组
   *
   * 功能：
   * - 过滤出可选中的节点
   * - 批量选中
   * - 发送事件
   *
   * 使用场景：
   * - 插入多个节点后自动选中
   * - 全选操作
   * - 框选操作
   *
   * 有效性过滤：
   * - 遍历所有 ID
   * - 检查每个节点是否可选中
   * - 只选中有效的节点
   */
  selectAll(ids: string[]) {
    const selectIds: string[] = [];  // 可选中的 ID

    // 遍历过滤
    ids.forEach(d => {
      const node = this.doc.getNode(d);
      // 检查是否可选中
      if (node?.canSelect()) {
        selectIds.push(d);
      }
    });

    // 更新选中状态
    this._selected = selectIds;

    // 发送事件
    // 触发：
    // - 大纲树高亮
    // - 属性面板更新
    // - BEM Tools 显示边框
    this.emitter.emit('selectionchange', this._selected);
  }

  /**
   * 清除选中
   *
   * 功能：
   * - 清空选中列表
   * - 发送事件
   *
   * 性能优化：
   * - 如果已经是空，不重复操作
   */
  clear() {
    if (this._selected.length < 1) {
      return;  // 已经是空
    }

    this._selected = [];
    this.emitter.emit('selectionchange', this._selected);
  }

  /**
   * 整理选中列表
   *
   * 功能：
   * - 移除不存在的节点 ID
   * - 清理无效选中
   *
   * 调用时机：
   * - 节点删除后
   * - 文档更新后
   * - 定期清理
   *
   * 实现：
   * - 反向遍历（安全删除）
   * - 检查节点是否存在
   * - 移除不存在的 ID
   *
   * 为什么反向遍历？
   * - 删除时不影响未遍历的索引
   * - 从后往前删除安全
   */
  dispose() {
    const l = this._selected.length;
    let i = l;

    // 反向遍历
    while (i-- > 0) {
      const id = this._selected[i];
      // 检查节点是否存在
      if (!this.doc.hasNode(id)) {
        // 不存在，移除
        this._selected.splice(i, 1);
      }
    }

    // 如果有变化，发送事件
    if (this._selected.length !== l) {
      this.emitter.emit('selectionchange', this._selected);
    }
  }

  /**
   * 添加选中
   */
  add(id: string) {
    if (this._selected.indexOf(id) > -1) {
      return;
    }

    this._selected.push(id);
    this.emitter.emit('selectionchange', this._selected);
  }

  /**
   * 是否选中
   */
  has(id: string) {
    return this._selected.indexOf(id) > -1;
  }

  /**
   * 移除选中
   */
  remove(id: string) {
    const i = this._selected.indexOf(id);
    if (i > -1) {
      this._selected.splice(i, 1);
      this.emitter.emit('selectionchange', this._selected);
    }
  }

  /**
   * 选区是否包含节点
   */
  containsNode(node: INode, excludeRoot = false) {
    for (const id of this._selected) {
      const parent = this.doc.getNode(id);
      if (excludeRoot && parent?.contains(this.doc.focusNode)) {
        continue;
      }
      if (parent?.contains(node)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取选中的节点
   */
  getNodes(): INode[] {
    const nodes: INode[] = [];
    for (const id of this._selected) {
      const node = this.doc.getNode(id);
      if (node) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  /**
   * 获取顶层选区节点，场景：拖拽时，建立蒙层，只蒙在最上层
   */
  getTopNodes(includeRoot = false) {
    const nodes = [];
    for (const id of this._selected) {
      const node = this.doc.getNode(id);
      // 排除根节点
      if (!node || (!includeRoot && node.contains(this.doc.focusNode))) {
        continue;
      }
      let i = nodes.length;
      let isTop = true;
      while (i-- > 0) {
        const n = comparePosition(nodes[i], node);
        // nodes[i] contains node
        if (n === PositionNO.Contains || n === PositionNO.TheSame) {
          isTop = false;
          break;
        } else if (n === PositionNO.ContainedBy) {
          // node contains nodes[i], delete nodes[i]
          nodes.splice(i, 1);
        }
      }
      // node is top item, push to nodes
      if (isTop) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  onSelectionChange(fn: (ids: string[]) => void): () => void {
    this.emitter.on('selectionchange', fn);
    return () => {
      this.emitter.removeListener('selectionchange', fn);
    };
  }
}
