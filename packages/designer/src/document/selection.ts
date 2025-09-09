import { obx, makeObservable, IEventBus, createModuleEventBus } from '@alilc/lowcode-editor-core';
import { INode, comparePosition, PositionNO } from './node/node';
import { DocumentModel } from './document-model';
import { IPublicModelSelection } from '@alilc/lowcode-types';

export interface ISelection extends Omit<IPublicModelSelection<INode>, 'node'> {
  containsNode(node: INode, excludeRoot: boolean): boolean;
}

export class Selection implements ISelection {
  private emitter: IEventBus = createModuleEventBus('Selection');

  @obx.shallow private _selected: string[] = [];

  constructor(readonly doc: DocumentModel) {
    makeObservable(this);
  }

  /**
   * 选中的节点 id
   */
  get selected(): string[] {
    return this._selected;
  }

  /**
   * 选中
   */
  select(id: string) {
    if (this._selected.length === 1 && this._selected.indexOf(id) > -1) {
      // avoid cause reaction
      return;
    }

    const node = this.doc.getNode(id);

    if (!node?.canSelect()) {
      return;
    }

    this._selected = [id];
    this.emitter.emit('selectionchange', this._selected);
  }

  // 🔥 【步骤5】批量选中节点的方法 - 插入完成后自动选中新节点
  // 用于在节点插入后自动选中新插入的节点，提升用户体验
  selectAll(ids: string[]) {
    const selectIds: string[] = []; // 存储实际可选中的节点 ID 数组

    // 🔍 遍历所有传入的节点 ID，进行选中资格检查
    ids.forEach(d => {
      // 根据 ID 获取对应的节点实例
      const node = this.doc.getNode(d);

      // 🎯 节点有效性和可选中性检查
      // canSelect() 会检查：节点是否存在、是否被锁定、是否在条件渲染中等
      if (node?.canSelect()) {
        selectIds.push(d); // 只有可选中的节点才添加到选中列表
      }
    });

    // 📝 更新内部选中状态
    this._selected = selectIds;

    // 🔔 发送选中变化事件，通知所有监听者
    // 这会触发：
    // - 大纲树高亮对应节点
    // - 属性面板显示选中节点的属性
    // - BemTools 显示选中边框
    // - 其他插件的选中响应逻辑
    this.emitter.emit('selectionchange', this._selected);
  }

  /**
   * 清除选中
   */
  clear() {
    if (this._selected.length < 1) {
      return;
    }
    this._selected = [];
    this.emitter.emit('selectionchange', this._selected);
  }

  /**
   * 整理选中
   */
  dispose() {
    const l = this._selected.length;
    let i = l;
    while (i-- > 0) {
      const id = this._selected[i];
      if (!this.doc.hasNode(id)) {
        this._selected.splice(i, 1);
      }
    }
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
