import { ReactElement } from 'react';
import { obx, computed, autorun, makeObservable, runInAction, wrapWithEventSwitch, action, createModuleEventBus, IEventBus } from '@alilc/lowcode-editor-core';
import {
  IPublicTypeNodeSchema,
  IPublicTypePropsMap,
  IPublicTypePropsList,
  IPublicTypeNodeData,
  IPublicTypeI18nData,
  IPublicTypeSlotSchema,
  IPublicTypePageSchema,
  IPublicTypeComponentSchema,
  IPublicTypeCompositeValue,
  GlobalEvent,
  IPublicTypeComponentAction,
  IPublicModelNode,
  IPublicModelExclusiveGroup,
  IPublicEnumTransformStage,
  IPublicTypeDisposable,
  IBaseModelNode,
} from '@alilc/lowcode-types';
import { compatStage, isDOMText, isJSExpression, isNode, isNodeSchema } from '@alilc/lowcode-utils';
import { ISettingTopEntry } from '@alilc/lowcode-designer';
import { Props, getConvertedExtraKey, IProps } from './props/props';
import type { IDocumentModel } from '../document-model';
import { NodeChildren, INodeChildren } from './node-children';
import { IProp, Prop } from './props/prop';
import type { IComponentMeta } from '../../component-meta';
import { ExclusiveGroup, isExclusiveGroup } from './exclusive-group';
import type { IExclusiveGroup } from './exclusive-group';
import { includeSlot, removeSlot } from '../../utils/slot';
import { foreachReverse } from '../../utils/tree';
import { NodeRemoveOptions, EDITOR_EVENT } from '../../types';

export interface NodeStatus {
  locking: boolean;
  pseudo: boolean;
  inPlaceEditing: boolean;
}

export interface IBaseNode<Schema extends IPublicTypeNodeSchema = IPublicTypeNodeSchema> extends Omit<IBaseModelNode<
  IDocumentModel,
  IBaseNode,
  INodeChildren,
  IComponentMeta,
  ISettingTopEntry,
  IProps,
  IProp,
  IExclusiveGroup
>,
  'isRoot' |
  'isPage' |
  'isComponent' |
  'isModal' |
  'isSlot' |
  'isParental' |
  'isLeaf' |
  'settingEntry' |
  // 在内部的 node 模型中不存在
  'getExtraPropValue' |
  'setExtraPropValue' |
  'exportSchema' |
  'visible' |
  'importSchema' |
  // 内外实现有差异
  'isContainer' |
  'isEmpty'
> {
  isNode: boolean;

  get componentMeta(): IComponentMeta;

  get settingEntry(): ISettingTopEntry;

  get isPurged(): boolean;

  get index(): number | undefined;

  get isPurging(): boolean;

  getId(): string;

  getParent(): INode | null;

  /**
   * 内部方法，请勿使用
   * @param useMutator 是否触发联动逻辑
   */
  internalSetParent(parent: INode | null, useMutator?: boolean): void;

  setConditionGroup(grp: IPublicModelExclusiveGroup | string | null): void;

  internalToShellNode(): IPublicModelNode | null;

  internalPurgeStart(): void;

  unlinkSlot(slotNode: INode): void;

  /**
   * 导出 schema
   */
  export<T = Schema>(stage: IPublicEnumTransformStage, options?: any): T;

  emitPropChange(val: IPublicTypePropChangeOptions): void;

  import(data: Schema, checkId?: boolean): void;

  internalSetSlotFor(slotFor: Prop | null | undefined): void;

  addSlot(slotNode: INode): void;

  onVisibleChange(func: (flag: boolean) => any): () => void;

  getSuitablePlace(node: INode, ref: any): any;

  onChildrenChange(fn: (param?: { type: string; node: INode }) => void): IPublicTypeDisposable | undefined;

  onPropChange(func: (info: IPublicTypePropChangeOptions) => void): IPublicTypeDisposable;

  isModal(): boolean;

  isRoot(): boolean;

  isPage(): boolean;

  isComponent(): boolean;

  isSlot(): boolean;

  isParental(): boolean;

  isLeaf(): boolean;

  isContainer(): boolean;

  isEmpty(): boolean;

  remove(
    useMutator?: boolean,
    purge?: boolean,
    options?: NodeRemoveOptions,
  ): void;

  didDropIn(dragment: INode): void;

  didDropOut(dragment: INode): void;

  purge(): void;

  removeSlot(slotNode: INode): boolean;

  setVisible(flag: boolean): void;

  getVisible(): boolean;

  getChildren(): INodeChildren | null;

  clearPropValue(path: string | number): void;

  setProps(props?: IPublicTypePropsMap | IPublicTypePropsList | Props | null): void;

  mergeProps(props: IPublicTypePropsMap): void;

  /** 是否可以选中 */
  canSelect(): boolean;
}

/**
 * 基础节点
 *
 * [Node Properties]
 *  componentName: Page/Block/Component
 *  props
 *  children
 *
 * [Directives]
 *  loop
 *  loopArgs
 *  condition
 *  ------- addition support -----
 *  conditionGroup use for condition, for exclusive
 *  title          display on outline
 *  ignored        ignore this node will not publish to render, but will store
 *  isLocked       can not select/hover/ item on canvas and outline
 *  hidden         not visible on canvas
 *  slotArgs       like loopArgs, for slot node
 *
 * 根容器节点
 *
 * [Node Properties]
 *  componentName: Page/Block/Component
 *  props
 *  children
 *
 * [Root Container Extra Properties]
 *  fileName
 *  meta
 *  state
 *  defaultProps
 *  dataSource
 *  lifeCycles
 *  methods
 *  css
 *
 * [Directives **not used**]
 *  loop
 *  loopArgs
 *  condition
 *  ------- future support -----
 *  conditionGroup
 *  title
 *  ignored
 *  isLocked
 *  hidden
 */
export class Node<Schema extends IPublicTypeNodeSchema = IPublicTypeNodeSchema> implements IBaseNode {
  private emitter: IEventBus;

  /**
   * 是节点实例
   */
  readonly isNode = true;

  /**
   * 节点 id
   */
  readonly id: string;

  /**
   * 节点组件类型
   * 特殊节点：
   *  * Page 页面
   *  * Block 区块
   *  * Component 组件/元件
   *  * Fragment 碎片节点，无 props，有指令
   *  * Leaf 文字节点 | 表达式节点，无 props，无指令？
   *  * Slot 插槽节点，无 props，正常 children，有 slotArgs，有指令
   */
  readonly componentName: string;

  /**
   * 属性抽象
   */
  props: IProps;

  protected _children?: INodeChildren;

  /**
   * @deprecated
   */
  private _addons: { [key: string]: { exportData: () => any; isProp: boolean } } = {};

  @obx.ref private _parent: INode | null = null;

  /**
   * 父级节点
   */
  get parent(): INode | null {
    return this._parent;
  }

  /**
   * 当前节点子集
   */
  get children(): INodeChildren | null {
    return this._children || null;
  }

  /**
   * 当前节点深度
   */
  @computed get zLevel(): number {
    if (this._parent) {
      return this._parent.zLevel + 1;
    }
    return 0;
  }

  @computed get title(): string | IPublicTypeI18nData | ReactElement {
    let t = this.getExtraProp('title');
    // TODO: 暂时走不到这个分支
    // if (!t && this.componentMeta.descriptor) {
    //   t = this.getProp(this.componentMeta.descriptor, false);
    // }
    if (t) {
      const v = t.getAsString();
      if (v) {
        return v;
      }
    }
    return this.componentMeta.title;
  }

  get icon() {
    return this.componentMeta.icon;
  }

  isInited = false;

  _settingEntry: ISettingTopEntry;

  get settingEntry(): ISettingTopEntry {
    if (this._settingEntry) return this._settingEntry;
    this._settingEntry = this.document.designer.createSettingEntry([this]);
    return this._settingEntry;
  }

  private autoruns?: Array<() => void>;

  private _isRGLContainer = false;

  set isRGLContainer(status: boolean) {
    this._isRGLContainer = status;
  }

  get isRGLContainer(): boolean {
    return !!this._isRGLContainer;
  }

  set isRGLContainerNode(status: boolean) {
    this._isRGLContainer = status;
  }

  get isRGLContainerNode(): boolean {
    return !!this._isRGLContainer;
  }

  get isEmptyNode() {
    return this.isEmpty();
  }

  private _slotFor?: IProp | null | undefined = null;

  @obx.shallow _slots: INode[] = [];

  get slots(): INode[] {
    return this._slots;
  }

  /* istanbul ignore next */
  @obx.ref private _conditionGroup: IExclusiveGroup | null = null;

  /* istanbul ignore next */
  get conditionGroup(): IExclusiveGroup | null {
    return this._conditionGroup;
  }

  private purged = false;

  /**
   * 是否已销毁
   */
  get isPurged() {
    return this.purged;
  }

  private purging: boolean = false;

  /**
   * 是否正在销毁
   */
  get isPurging() {
    return this.purging;
  }

  @obx.shallow status: NodeStatus = {
    inPlaceEditing: false,
    locking: false,
    pseudo: false,
  };

  constructor(readonly document: IDocumentModel, nodeSchema: Schema) {
    makeObservable(this);
    const { componentName, id, children, props, ...extras } = nodeSchema;
    this.id = document.nextId(id);
    this.componentName = componentName;
    if (this.componentName === 'Leaf') {
      this.props = new Props(this, {
        children: isDOMText(children) || isJSExpression(children) ? children : '',
      });
    } else {
      this.props = new Props(this, props, extras);
      this._children = new NodeChildren(this as INode, this.initialChildren(children));
      this._children.internalInitParent();
      this.props.merge(
        this.upgradeProps(this.initProps(props || {})),
        this.upgradeProps(extras),
      );
      this.setupAutoruns();
    }

    this.initBuiltinProps();

    this.isInited = true;
    this.emitter = createModuleEventBus('Node');
    const { editor } = this.document.designer;
    this.onVisibleChange((visible: boolean) => {
      editor?.eventBus.emit(EDITOR_EVENT.NODE_VISIBLE_CHANGE, this, visible);
    });
    this.onChildrenChange((info?: { type: string; node: INode }) => {
      editor?.eventBus.emit(EDITOR_EVENT.NODE_CHILDREN_CHANGE, {
        type: info?.type,
        node: this,
      });
    });
  }

  /**
   * 节点初始化期间就把内置的一些 prop 初始化好，避免后续不断构造实例导致 reaction 执行多次
   */
  @action
  private initBuiltinProps() {
    this.props.has(getConvertedExtraKey('hidden')) || this.props.add(false, getConvertedExtraKey('hidden'));
    this.props.has(getConvertedExtraKey('title')) || this.props.add('', getConvertedExtraKey('title'));
    this.props.has(getConvertedExtraKey('isLocked')) || this.props.add(false, getConvertedExtraKey('isLocked'));
    this.props.has(getConvertedExtraKey('condition')) || this.props.add(true, getConvertedExtraKey('condition'));
    this.props.has(getConvertedExtraKey('conditionGroup')) || this.props.add('', getConvertedExtraKey('conditionGroup'));
    this.props.has(getConvertedExtraKey('loop')) || this.props.add(undefined, getConvertedExtraKey('loop'));
  }

  @action
  private initProps(props: any): any {
    return this.document.designer.transformProps(props, this, IPublicEnumTransformStage.Init);
  }

  @action
  private upgradeProps(props: any): any {
    return this.document.designer.transformProps(props, this, IPublicEnumTransformStage.Upgrade);
  }

  private setupAutoruns() {
    const { autoruns } = this.componentMeta.advanced;
    if (!autoruns || autoruns.length < 1) {
      return;
    }
    this.autoruns = autoruns.map((item) => {
      return autorun(() => {
        item.autorun(this.props.getNode().settingEntry.get(item.name)?.internalToShellField());
      });
    });
  }

  private initialChildren(children: IPublicTypeNodeData | IPublicTypeNodeData[] | undefined): IPublicTypeNodeData[] {
    const { initialChildren } = this.componentMeta.advanced;

    if (children == null) {
      if (initialChildren) {
        if (typeof initialChildren === 'function') {
          return initialChildren(this.internalToShellNode()!) || [];
        }
        return initialChildren;
      }
      return [];
    }

    if (Array.isArray(children)) {
      return children;
    }

    return [children];
  }

  isContainer(): boolean {
    return this.isContainerNode;
  }

  get isContainerNode(): boolean {
    return this.isParentalNode && this.componentMeta.isContainer;
  }

  isModal(): boolean {
    return this.isModalNode;
  }

  get isModalNode(): boolean {
    return this.componentMeta.isModal;
  }

  isRoot(): boolean {
    return this.isRootNode;
  }

  get isRootNode(): boolean {
    return this.document.rootNode === (this as any);
  }

  isPage(): boolean {
    return this.isPageNode;
  }

  get isPageNode(): boolean {
    return this.isRootNode && this.componentName === 'Page';
  }

  isComponent(): boolean {
    return this.isComponentNode;
  }

  get isComponentNode(): boolean {
    return this.isRootNode && this.componentName === 'Component';
  }

  isSlot(): boolean {
    return this.isSlotNode;
  }

  get isSlotNode(): boolean {
    return this._slotFor != null && this.componentName === 'Slot';
  }

  /**
   * 是否一个父亲类节点
   */
  isParental(): boolean {
    return this.isParentalNode;
  }

  get isParentalNode(): boolean {
    return !this.isLeafNode;
  }

  /**
   * 终端节点，内容一般为 文字 或者 表达式
   */
  isLeaf(): boolean {
    return this.isLeafNode;
  }
  get isLeafNode(): boolean {
    return this.componentName === 'Leaf';
  }

  internalSetWillPurge() {
    this.internalSetParent(null);
    this.document.addWillPurge(this);
  }

  didDropIn(dragment: INode) {
    const { callbacks } = this.componentMeta.advanced;
    if (callbacks?.onNodeAdd) {
      const cbThis = this.internalToShellNode();
      callbacks?.onNodeAdd.call(cbThis, dragment.internalToShellNode(), cbThis);
    }
    if (this._parent) {
      this._parent.didDropIn(dragment);
    }
  }

  didDropOut(dragment: INode) {
    const { callbacks } = this.componentMeta.advanced;
    if (callbacks?.onNodeRemove) {
      const cbThis = this.internalToShellNode();
      callbacks?.onNodeRemove.call(cbThis, dragment.internalToShellNode(), cbThis);
    }
    if (this._parent) {
      this._parent.didDropOut(dragment);
    }
  }

  /**
   * 内部方法，请勿使用
   * @param useMutator 是否触发联动逻辑
   */
  internalSetParent(parent: INode | null, useMutator = false) {
    if (this._parent === parent) {
      return;
    }

    // 解除老的父子关系，但不需要真的删除节点
    if (this._parent) {
      if (this.isSlot()) {
        this._parent.unlinkSlot(this);
      } else {
        this._parent.children?.unlinkChild(this);
      }
    }
    if (useMutator) {
      this._parent?.didDropOut(this);
    }
    if (parent) {
      // 建立新的父子关系，尤其注意：对于 parent 为 null 的场景，不会赋值，因为 subtreeModified 等事件可能需要知道该 node 被删除前的父子关系
      this._parent = parent;
      this.document.removeWillPurge(this);
      /* istanbul ignore next */
      if (!this.conditionGroup) {
        // initial conditionGroup
        const grp = this.getExtraProp('conditionGroup', false)?.getAsString();
        if (grp) {
          this.setConditionGroup(grp);
        }
      }

      if (useMutator) {
        parent.didDropIn(this);
      }
    }
  }

  internalSetSlotFor(slotFor: Prop | null | undefined) {
    this._slotFor = slotFor;
  }

  internalToShellNode(): IPublicModelNode | null {
    return this.document.designer.shellModelFactory.createNode(this);
  }

  /**
   * 关联属性
   */
  get slotFor(): IProp | null | undefined {
    return this._slotFor;
  }

  /**
   * 移除当前节点
   */
  remove(
    useMutator = true,
    purge = true,
    options: NodeRemoveOptions = { suppressRemoveEvent: false },
  ) {
    if (this.parent) {
      if (!options.suppressRemoveEvent) {
        this.document.designer.editor?.eventBus.emit('node.remove.topLevel', {
          node: this,
          index: this.parent?.children?.indexOf(this),
        });
      }
      if (this.isSlot()) {
        this.parent.removeSlot(this);
        this.parent.children?.internalDelete(this, purge, useMutator, { suppressRemoveEvent: true });
      } else {
        this.parent.children?.internalDelete(this, purge, useMutator, { suppressRemoveEvent: true });
      }
    }
  }

  /**
   * 锁住当前节点
   */
  lock(flag = true) {
    this.setExtraProp('isLocked', flag);
  }

  /**
   * 获取当前节点的锁定状态
   */
  get isLocked(): boolean {
    return !!this.getExtraProp('isLocked')?.getValue();
  }

  canSelect(): boolean {
    const onSelectHook = this.componentMeta?.advanced?.callbacks?.onSelectHook;
    const canSelect = typeof onSelectHook === 'function' ? onSelectHook(this.internalToShellNode()!) : true;
    return canSelect;
  }

  /**
   * 选择当前节点
   */
  select() {
    this.document.selection.select(this.id);
  }

  /**
   * 悬停高亮
   */
  hover(flag = true) {
    if (flag) {
      this.document.designer.detecting.capture(this);
    } else {
      this.document.designer.detecting.release(this);
    }
  }

  /**
   * 节点组件描述
   */
  @computed get componentMeta(): IComponentMeta {
    return this.document.getComponentMeta(this.componentName);
  }

  @computed get propsData(): IPublicTypePropsMap | IPublicTypePropsList | null {
    if (!this.isParental() || this.componentName === 'Fragment') {
      return null;
    }
    return this.props.export(IPublicEnumTransformStage.Serilize).props || null;
  }

  hasSlots() {
    return this._slots.length > 0;
  }

  /* istanbul ignore next */
  setConditionGroup(grp: IPublicModelExclusiveGroup | string | null) {
    let _grp: IExclusiveGroup | null = null;
    if (!grp) {
      this.getExtraProp('conditionGroup', false)?.remove();
      if (this._conditionGroup) {
        this._conditionGroup.remove(this);
        this._conditionGroup = null;
      }
      return;
    }
    if (!isExclusiveGroup(grp)) {
      if (this.prevSibling?.conditionGroup?.name === grp) {
        _grp = this.prevSibling.conditionGroup;
      } else if (this.nextSibling?.conditionGroup?.name === grp) {
        _grp = this.nextSibling.conditionGroup;
      } else if (typeof grp === 'string') {
        _grp = new ExclusiveGroup(grp);
      }
    }
    if (_grp && this._conditionGroup !== _grp) {
      this.getExtraProp('conditionGroup', true)?.setValue(_grp.name);
      if (this._conditionGroup) {
        this._conditionGroup.remove(this);
      }
      this._conditionGroup = _grp;
      _grp?.add(this);
    }
  }

  /* istanbul ignore next */
  isConditionalVisible(): boolean | undefined {
    return this._conditionGroup?.isVisible(this);
  }

  /* istanbul ignore next */
  setConditionalVisible() {
    this._conditionGroup?.setVisible(this);
  }

  hasCondition() {
    const v = this.getExtraProp('condition', false)?.getValue();
    return v != null && v !== '' && v !== true;
  }

  /**
   * has loop when 1. loop is validArray with length > 1 ; OR  2. loop is variable object
   * @return boolean, has loop config or not
   */
  hasLoop() {
    const value = this.getExtraProp('loop', false)?.getValue();
    if (value === undefined || value === null) {
      return false;
    }

    if (Array.isArray(value)) {
      return true;
    }
    if (isJSExpression(value)) {
      return true;
    }
    return false;
  }

  /* istanbul ignore next */
  wrapWith(schema: Schema) {
    const wrappedNode = this.replaceWith({ ...schema, children: [this.export()] });
    return wrappedNode.children!.get(0);
  }

  replaceWith(schema: Schema, migrate = false): any {
    // reuse the same id? or replaceSelection
    schema = Object.assign({}, migrate ? this.export() : {}, schema);
    return this.parent?.replaceChild(this, schema);
  }

  /**
   * 替换子节点
   *
   * @param {INode} node
   * @param {object} data
   */
  replaceChild(node: INode, data: any): INode | null {
    if (this.children?.has(node)) {
      const selected = this.document.selection.has(node.id);

      delete data.id;
      const newNode = this.document.createNode(data);

      if (!isNode(newNode)) {
        return null;
      }

      this.insertBefore(newNode, node, false);
      node.remove(false);

      if (selected) {
        this.document.selection.select(newNode.id);
      }
      return newNode;
    }
    return node;
  }

  setVisible(flag: boolean): void {
    this.getExtraProp('hidden')?.setValue(!flag);
    this.emitter.emit('visibleChange', flag);
  }

  getVisible(): boolean {
    return !this.getExtraProp('hidden')?.getValue();
  }

  onVisibleChange(func: (flag: boolean) => any): () => void {
    const wrappedFunc = wrapWithEventSwitch(func);
    this.emitter.on('visibleChange', wrappedFunc);
    return () => {
      this.emitter.removeListener('visibleChange', wrappedFunc);
    };
  }

  getProp(path: string, createIfNone = true): IProp | null {
    return this.props.query(path, createIfNone) || null;
  }

  getExtraProp(key: string, createIfNone = true): IProp | null {
    return this.props.get(getConvertedExtraKey(key), createIfNone) || null;
  }

  setExtraProp(key: string, value: IPublicTypeCompositeValue) {
    this.getProp(getConvertedExtraKey(key), true)?.setValue(value);
  }

  /**
   * 获取单个属性值
   */
  getPropValue(path: string): any {
    return this.getProp(path, false)?.value;
  }

  /**
   * 设置单个属性值
   */
  setPropValue(path: string, value: any) {
    this.getProp(path, true)!.setValue(value);
  }

  /**
   * 清除已设置的值
   */
  clearPropValue(path: string): void {
    this.getProp(path, false)?.unset();
  }

  /**
   * 设置多个属性值，和原有值合并
   */
  mergeProps(props: IPublicTypePropsMap) {
    this.props.merge(props);
  }

  /**
   * 设置多个属性值，替换原有值
   */
  setProps(props?: IPublicTypePropsMap | IPublicTypePropsList | Props | null) {
    if (props instanceof Props) {
      this.props = props;
      return;
    }
    this.props.import(props);
  }

  /**
   * 获取节点在父容器中的索引
   */
  @computed get index(): number | undefined {
    if (!this.parent) {
      return -1;
    }
    return this.parent.children?.indexOf(this);
  }

  /**
   * 获取下一个兄弟节点
   */
  get nextSibling(): INode | null | undefined {
    if (!this.parent) {
      return null;
    }
    const { index } = this;
    if (typeof index !== 'number') {
      return null;
    }
    if (index < 0) {
      return null;
    }
    return this.parent.children?.get(index + 1);
  }

  /**
   * 获取上一个兄弟节点
   */
  get prevSibling(): INode | null | undefined {
    if (!this.parent) {
      return null;
    }
    const { index } = this;
    if (typeof index !== 'number') {
      return null;
    }
    if (index < 1) {
      return null;
    }
    return this.parent.children?.get(index - 1);
  }

  /**
   * 获取符合搭建协议-节点 schema 结构
   */
  get schema(): Schema {
    return this.export(IPublicEnumTransformStage.Save);
  }

  set schema(data: Schema) {
    runInAction(() => this.import(data));
  }

  import(data: Schema, checkId = false) {
    const { componentName, id, children, props, ...extras } = data;
    if (this.isSlot()) {
      foreachReverse(
        this.children!,
        (subNode: INode) => {
          subNode.remove(true, true);
        },
        (iterable, idx) => (iterable as INodeChildren).get(idx),
      );
    }
    if (this.isParental()) {
      this.props.import(props, extras);
      this._children?.import(children, checkId);
    } else {
      this.props
        .get('children', true)!
        .setValue(isDOMText(children) || isJSExpression(children) ? children : '');
    }
  }

  toData() {
    return this.export();
  }

  /**
   * 导出 schema
   */
  export<T = IPublicTypeNodeSchema>(stage: IPublicEnumTransformStage = IPublicEnumTransformStage.Save, options: any = {}): T {
    stage = compatStage(stage);
    const baseSchema: any = {
      componentName: this.componentName,
    };

    if (stage !== IPublicEnumTransformStage.Clone) {
      baseSchema.id = this.id;
    }
    if (stage === IPublicEnumTransformStage.Render) {
      baseSchema.docId = this.document.id;
    }

    if (this.isLeaf()) {
      if (!options.bypassChildren) {
        baseSchema.children = this.props.get('children')?.export(stage);
      }
      return baseSchema;
    }

    const { props = {}, extras } = this.props.export(stage) || {};
    const _extras_: { [key: string]: any } = {
      ...extras,
    };
    /* istanbul ignore next */
    Object.keys(this._addons).forEach((key) => {
      const addon = this._addons[key];
      if (addon) {
        if (addon.isProp) {
          (props as any)[getConvertedExtraKey(key)] = addon.exportData();
        } else {
          _extras_[key] = addon.exportData();
        }
      }
    });

    const schema: any = {
      ...baseSchema,
      props: this.document.designer.transformProps(props, this, stage),
      ...this.document.designer.transformProps(_extras_, this, stage),
    };

    if (this.isParental() && this.children && this.children.size > 0 && !options.bypassChildren) {
      schema.children = this.children.export(stage);
    }

    return schema;
  }

  /**
   * 判断是否包含特定节点
   */
  contains(node: INode): boolean {
    return contains(this, node);
  }

  /**
   * 获取特定深度的父亲节点
   */
  getZLevelTop(zLevel: number): INode | null {
    return getZLevelTop(this, zLevel);
  }

  /**
   * 判断与其它节点的位置关系
   *
   *  16 thisNode contains otherNode
   *  8  thisNode contained_by otherNode
   *  2  thisNode before or after otherNode
   *  0  thisNode same as otherNode
   */
  comparePosition(otherNode: INode): PositionNO {
    return comparePosition(this, otherNode);
  }

  unlinkSlot(slotNode: INode) {
    const i = this._slots.indexOf(slotNode);
    if (i < 0) {
      return false;
    }
    this._slots.splice(i, 1);
  }

  /**
   * 删除一个Slot节点
   */
  removeSlot(slotNode: INode): boolean {
    // if (purge) {
    //   // should set parent null
    //   slotNode?.internalSetParent(null, false);
    //   slotNode?.purge();
    // }
    // this.document.unlinkNode(slotNode);
    // this.document.selection.remove(slotNode.id);
    const i = this._slots.indexOf(slotNode);
    if (i < 0) {
      return false;
    }
    this._slots.splice(i, 1);
    return false;
  }

  addSlot(slotNode: INode) {
    const slotName = slotNode?.getExtraProp('name')?.getAsString();
    // 一个组件下的所有 slot，相同 slotName 的 slot 应该是唯一的
    if (includeSlot(this, slotName)) {
      removeSlot(this, slotName);
    }
    slotNode.internalSetParent(this as INode, true);
    this._slots.push(slotNode);
  }

  /**
   * 当前node对应组件是否已注册可用
   */
  isValidComponent() {
    const allComponents = this.document?.designer?.componentsMap;
    if (allComponents && allComponents[this.componentName]) {
      return true;
    }
    return false;
  }

  /**
   * 删除一个节点
   * @param node
   */
  removeChild(node: INode) {
    this.children?.delete(node);
  }

  /**
   * 销毁
   */
  purge() {
    if (this.purged) {
      return;
    }
    this.purged = true;
    this.autoruns?.forEach((dispose) => dispose());
    this.props.purge();
    this.settingEntry?.purge();
    // this.document.destroyNode(this);
  }

  internalPurgeStart() {
    this.purging = true;
  }

  /**
   * 是否可执行某 action
   */
  canPerformAction(actionName: string): boolean {
    const availableActions =
      this.componentMeta?.availableActions?.filter((action: IPublicTypeComponentAction) => {
        const { condition } = action;
        return typeof condition === 'function' ?
          condition(this) !== false :
          condition !== false;
      })
        .map((action: IPublicTypeComponentAction) => action.name) || [];

    return availableActions.indexOf(actionName) >= 0;
  }

  // ======= compatible apis ====
  isEmpty(): boolean {
    return this.children ? this.children.isEmpty() : true;
  }

  getChildren() {
    return this.children;
  }

  getComponentName() {
    return this.componentName;
  }

  insert(node: INode, ref?: INode, useMutator = true) {
    this.insertAfter(node, ref, useMutator);
  }

  insertBefore(node: INode, ref?: INode, useMutator = true) {
    const nodeInstance = ensureNode(node, this.document);
    this.children?.internalInsert(nodeInstance, ref ? ref.index : null, useMutator);
  }

  insertAfter(node: any, ref?: INode, useMutator = true) {
    const nodeInstance = ensureNode(node, this.document);
    this.children?.internalInsert(nodeInstance, ref ? (ref.index || 0) + 1 : null, useMutator);
  }

  getParent() {
    return this.parent;
  }

  getId() {
    return this.id;
  }

  getIndex() {
    return this.index;
  }

  getNode() {
    return this;
  }

  getRoot() {
    return this.document.rootNode;
  }

  getProps() {
    return this.props;
  }

  onChildrenChange(fn: (param?: { type: string; node: INode }) => void): IPublicTypeDisposable | undefined {
    const wrappedFunc = wrapWithEventSwitch(fn);
    return this.children?.onChange(wrappedFunc);
  }

  mergeChildren(
    remover: (node: INode, idx: number) => any,
    adder: (children: INode[]) => IPublicTypeNodeData[] | null,
    sorter: (firstNode: INode, secondNode: INode) => any,
  ) {
    this.children?.mergeChildren(remover, adder, sorter);
  }

  /**
   * @deprecated
   */
  getStatus(field?: keyof NodeStatus) {
    if (field && this.status[field] != null) {
      return this.status[field];
    }

    return this.status;
  }

  /**
   * @deprecated
   */
  setStatus(field: keyof NodeStatus, flag: boolean) {
    if (!this.status.hasOwnProperty(field)) {
      return;
    }

    if (flag !== this.status[field]) {
      this.status[field] = flag;
    }
  }

  /**
   * @deprecated
   */
  getDOMNode(): any {
    const instance = this.document.simulator?.getComponentInstances(this)?.[0];
    if (!instance) {
      return;
    }
    return this.document.simulator?.findDOMNodes(instance)?.[0];
  }

  /**
   * @deprecated
   */
  getPage() {
    console.warn('getPage is deprecated, use document instead');
    return this.document;
  }

  /**
   * 获取磁贴相关信息
   */
  getRGL(): {
    isContainerNode: boolean;
    isEmptyNode: boolean;
    isRGLContainerNode: boolean;
    isRGLNode: boolean;
    isRGL: boolean;
    rglNode: Node | null;
  } {
    const isContainerNode = this.isContainer();
    const isEmptyNode = this.isEmpty();
    const isRGLContainerNode = this.isRGLContainer;
    const isRGLNode = (this.getParent()?.isRGLContainer) as boolean;
    const isRGL = isRGLContainerNode || (isRGLNode && (!isContainerNode || !isEmptyNode));
    let rglNode = isRGLContainerNode ? this : isRGL ? this?.getParent() : null;
    return { isContainerNode, isEmptyNode, isRGLContainerNode, isRGLNode, isRGL, rglNode };
  }

  /**
   * @deprecated no one is using this, will be removed in a future release
   */
  getSuitablePlace(node: INode, ref: any): any {
    const focusNode = this.document?.focusNode;
    // 如果节点是模态框，插入到根节点下
    if (node?.componentMeta?.isModal) {
      return { container: focusNode, ref };
    }

    if (!ref && focusNode && this.contains(focusNode)) {
      const rootCanDropIn = focusNode.componentMeta?.prototype?.options?.canDropIn;
      if (
        rootCanDropIn === undefined ||
        rootCanDropIn === true ||
        (typeof rootCanDropIn === 'function' && rootCanDropIn(node))
      ) {
        return { container: focusNode };
      }

      return null;
    }

    if (this.isRoot() && this.children) {
      const dropElement = this.children.filter((c) => {
        if (!c.isContainerNode) {
          return false;
        }
        const canDropIn = c.componentMeta?.prototype?.options?.canDropIn;
        if (
          canDropIn === undefined ||
          canDropIn === true ||
          (typeof canDropIn === 'function' && canDropIn(node))
        ) {
          return true;
        }
        return false;
      })[0];

      if (dropElement) {
        return { container: dropElement, ref };
      }

      const rootCanDropIn = this.componentMeta?.prototype?.options?.canDropIn;
      if (
        rootCanDropIn === undefined ||
        rootCanDropIn === true ||
        (typeof rootCanDropIn === 'function' && rootCanDropIn(node))
      ) {
        return { container: this, ref };
      }

      return null;
    }

    const canDropIn = this.componentMeta?.prototype?.options?.canDropIn;
    if (this.isContainer()) {
      if (
        canDropIn === undefined ||
        (typeof canDropIn === 'boolean' && canDropIn) ||
        (typeof canDropIn === 'function' && canDropIn(node))
      ) {
        return { container: this, ref };
      }
    }

    if (this.parent) {
      return this.parent.getSuitablePlace(node, { index: this.index });
    }

    return null;
  }

  /**
   * @deprecated
   */
  getAddonData(key: string) {
    const addon = this._addons[key];
    if (addon) {
      return addon.exportData();
    }
    return this.getExtraProp(key)?.getValue();
  }

  /**
   * @deprecated
   */
  registerAddon(key: string, exportData: () => any, isProp = false) {
    this._addons[key] = { exportData, isProp };
  }

  getRect(): DOMRect | null {
    if (this.isRoot()) {
      return this.document.simulator?.viewport.contentBounds || null;
    }
    return this.document.simulator?.computeRect(this) || null;
  }

  /**
   * @deprecated
   */
  getPrototype() {
    return this.componentMeta.prototype;
  }

  /**
   * @deprecated
   */
  setPrototype(proto: any) {
    this.componentMeta.prototype = proto;
  }

  getIcon() {
    return this.icon;
  }

  toString() {
    return this.id;
  }

  emitPropChange(val: IPublicTypePropChangeOptions) {
    this.emitter?.emit('propChange', val);
  }

  onPropChange(func: (info: IPublicTypePropChangeOptions) => void): IPublicTypeDisposable {
    const wrappedFunc = wrapWithEventSwitch(func);
    this.emitter.on('propChange', wrappedFunc);
    return () => {
      this.emitter.removeListener('propChange', wrappedFunc);
    };
  }
}

function ensureNode(node: any, document: IDocumentModel): INode {
  let nodeInstance = node;
  if (!isNode(node)) {
    if (node.getComponentName) {
      nodeInstance = document.createNode({
        componentName: node.getComponentName(),
      });
    } else {
      nodeInstance = document.createNode(node);
    }
  }
  return nodeInstance;
}

export interface LeafNode extends Node {
  readonly children: null;
}

export type IPublicTypePropChangeOptions = Omit<GlobalEvent.Node.Prop.ChangeOptions, 'node'>;

export type ISlotNode = IBaseNode<IPublicTypeSlotSchema>;
export type IPageNode = IBaseNode<IPublicTypePageSchema>;
export type IComponentNode = IBaseNode<IPublicTypeComponentSchema>;
export type IRootNode = IPageNode | IComponentNode;
export type INode = IPageNode | ISlotNode | IComponentNode | IRootNode;

export function isRootNode(node: INode): node is IRootNode {
  return node && node.isRootNode;
}

export function isLowCodeComponent(node: INode): node is IComponentNode {
  return node.componentMeta?.getMetadata().devMode === 'lowCode';
}

export function getZLevelTop(child: INode, zLevel: number): INode | null {
  let l = child.zLevel;
  if (l < zLevel || zLevel < 0) {
    return null;
  }
  if (l === zLevel) {
    return child;
  }
  let r: any = child;
  while (r && l-- > zLevel) {
    r = r.parent;
  }
  return r;
}

/**
 * 测试两个节点是否为包含关系
 * @param node1 测试的父节点
 * @param node2 测试的被包含节点
 * @returns 是否包含
 */
export function contains(node1: INode, node2: INode): boolean {
  if (node1 === node2) {
    return true;
  }

  if (!node1.isParentalNode || !node2.parent) {
    return false;
  }

  const p = getZLevelTop(node2, node1.zLevel);
  if (!p) {
    return false;
  }

  return node1 === p;
}

// 16 node1 contains node2
// 8  node1 contained_by node2
// 2  node1 before or after node2
// 0  node1 same as node2
export enum PositionNO {
  Contains = 16,
  ContainedBy = 8,
  BeforeOrAfter = 2,
  TheSame = 0,
}
export function comparePosition(node1: INode, node2: INode): PositionNO {
  if (node1 === node2) {
    return PositionNO.TheSame;
  }
  const l1 = node1.zLevel;
  const l2 = node2.zLevel;
  if (l1 === l2) {
    return PositionNO.BeforeOrAfter;
  }

  let p: any;
  if (l1 < l2) {
    p = getZLevelTop(node2, l1);
    if (p && p === node1) {
      return PositionNO.Contains;
    }
    return PositionNO.BeforeOrAfter;
  }

  p = getZLevelTop(node1, l2);
  if (p && p === node2) {
    return PositionNO.ContainedBy;
  }

  return PositionNO.BeforeOrAfter;
}

// 🔥 【步骤2】插入单个子节点的核心函数
// 这个函数负责处理不同类型的 thing（现有节点、节点数据）转换为实际节点并插入
export function insertChild(
  container: INode,                        // 目标父容器节点
  thing: INode | IPublicTypeNodeData,      // 要插入的内容：现有节点 或 节点数据(Schema)
  at?: number | null,                      // 插入位置索引，null 表示末尾
  copy?: boolean,                          // 是否复制模式（true=复制，false=移动）
): INode | null {
  let node: INode | null | IRootNode | undefined; // 最终要插入的节点实例
  let nodeSchema: IPublicTypeNodeSchema;          // 节点 Schema 数据

  // 🎯 情况1：thing 是现有节点 且 需要复制 或 是插槽节点
  if (isNode<INode>(thing) && (copy || thing.isSlot())) {
    // 导出节点的 Schema（克隆阶段，包含所有属性和子节点）
    nodeSchema = thing.export(IPublicEnumTransformStage.Clone);
    // 🔥 【步骤4】调用 document.createNode 创建新的节点实例
    node = container.document?.createNode(nodeSchema);
  }
  // 🎯 情况2：thing 是现有节点 且 是移动模式（非复制、非插槽）
  else if (isNode<INode>(thing)) {
    // 直接使用现有节点，不需要创建新实例
    node = thing;
  }
  // 🎯 情况3：thing 是节点数据(Schema) - 🔥 组件库拖拽走这个分支
  else if (isNodeSchema(thing)) {
    // 🔥 【步骤4】根据 Schema 数据创建新的节点实例
    // 这是组件库拖拽的关键步骤：NodeData -> Node 实例
    node = container.document?.createNode(thing);
  }

  // 如果成功获得了有效的节点实例
  if (isNode<INode>(node)) {
    // 🔥 【步骤3】调用容器的 children.insert 方法将节点插入到指定位置
    // 这里会触发 NodeChildren.insert -> NodeChildren.internalInsert
    container.children?.insert(node, at);
    return node; // 返回成功插入的节点
  }

  return null; // 插入失败，返回 null
}

// 🔥 【步骤2】批量插入子节点的函数 - Designer.onDragend 直接调用
// 负责将多个节点或节点数据按顺序插入到指定容器中
export function insertChildren(
  container: INode,                        // 目标父容器节点
  nodes: INode[] | IPublicTypeNodeData[],  // 要插入的节点数组：现有节点数组 或 Schema数据数组
  at?: number | null,                      // 起始插入位置索引
  copy?: boolean,                          // 是否复制模式
): INode[] {
  let index = at;                          // 当前插入位置，会随着插入过程递增
  let node: any;                           // 当前处理的节点
  const results: INode[] = [];             // 存储成功插入的节点实例数组

  // 🔄 从数组末尾开始逐个弹出并处理（保证插入顺序正确）
  // 使用 while + pop() 的方式是为了确保多个节点按正确顺序插入
  // eslint-disable-next-line no-cond-assign
  while ((node = nodes.pop())) {
    // 🔥 【核心调用】对每个节点调用 insertChild 进行单个插入
    // 这里会处理 NodeData -> Node 的转换（如果需要）
    node = insertChild(container, node, index, copy);

    // 将成功插入的节点添加到结果数组
    results.push(node);

    // 📍 更新下一个节点的插入位置
    // 使用刚插入节点的实际索引，确保后续节点插入在正确位置
    index = node.index;
  }

  // 返回所有成功插入的节点实例数组
  // 这个数组会被 Designer.onDragend 用于后续的选中操作
  return results;
}
