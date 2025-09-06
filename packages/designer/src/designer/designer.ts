import { ComponentType } from 'react'; // React 组件类型定义
import {
    obx, // MobX 响应式装饰器
    computed, // 计算属性装饰器
    autorun, // 自动运行函数
    makeObservable, // 使类可观察
    IReactionPublic, // 公共响应接口
    IReactionOptions, // 响应选项
    IReactionDisposer, // 响应清理器
} from '@alilc/lowcode-editor-core';
import {
    IPublicTypeProjectSchema, // 项目 Schema 类型
    IPublicTypeComponentMetadata, // 组件元数据类型
    IPublicTypeComponentAction, // 组件动作类型
    IPublicTypeNpmInfo, // NPM 包信息类型
    IPublicModelEditor, // 编辑器模型接口
    IPublicTypeCompositeObject, // 复合对象类型
    IPublicTypePropsList, // 属性列表类型
    IPublicTypeNodeSchema, // 节点 Schema 类型
    IPublicTypePropsTransducer, // 属性转换器类型
    IShellModelFactory, // Shell 模型工厂接口
    IPublicModelDragObject, // 拖拽对象模型
    IPublicTypeScrollable, // 可滚动类型
    IPublicModelScroller, // 滚动器模型
    IPublicTypeLocationData, // 位置数据类型
    IPublicEnumTransformStage, // 转换阶段枚举
    IPublicModelLocateEvent, // 定位事件模型
} from '@alilc/lowcode-types';
import {
    mergeAssets, // 合并资源函数
    IPublicTypeAssetsJson, // 资源 JSON 类型
    isNodeSchema, // 判断是否为节点 Schema
    isDragNodeObject, // 判断是否为拖拽节点对象
    isDragNodeDataObject, // 判断是否为拖拽节点数据对象
    isLocationChildrenDetail, // 判断是否为子节点位置详情
    Logger, // 日志工具
} from '@alilc/lowcode-utils';
import { IProject, Project } from '../project'; // 项目相关
import { Node, DocumentModel, insertChildren, INode, ISelection } from '../document'; // 文档和节点相关
import { ComponentMeta, IComponentMeta } from '../component-meta'; // 组件元数据相关
import { INodeSelector, Component } from '../simulator'; // 模拟器相关
import { Scroller } from './scroller'; // 滚动器
import { Dragon, IDragon } from './dragon'; // 拖拽系统
import { ActiveTracker, IActiveTracker } from './active-tracker'; // 活动节点追踪器
import { Detecting } from './detecting'; // 检测系统
import { DropLocation } from './location'; // 放置位置
import { OffsetObserver, createOffsetObserver } from './offset-observer'; // 偏移观察器
import { ISettingTopEntry, SettingTopEntry } from './setting'; // 设置入口
import { BemToolsManager } from '../builtin-simulator/bem-tools/manager'; // BEM 工具管理器
import { ComponentActions } from '../component-actions'; // 组件动作管理
import { ContextMenuActions, IContextMenuActions } from '../context-menu-actions'; // 右键菜单动作

// 创建设计器专用日志记录器
const logger = new Logger({ level: 'warn', bizName: 'designer' });

/**
 * 设计器属性接口定义
 * 定义了初始化 Designer 实例所需的所有配置项
 */
export interface DesignerProps {
    [key: string]: any; // 支持扩展属性
    editor: IPublicModelEditor; // 🔥 关键：编辑器实例，提供全局服务
    shellModelFactory: IShellModelFactory; // Shell 模型工厂，用于创建 API 包装对象
    className?: string; // 设计器容器的 CSS 类名
    style?: object; // 设计器容器的内联样式
    defaultSchema?: IPublicTypeProjectSchema; // 默认项目 Schema，初始化时加载
    hotkeys?: object; // 快捷键配置
    viewName?: string; // 视图名称标识
    simulatorProps?: Record<string, any> | ((document: DocumentModel) => object); // 模拟器配置，可以是对象或函数
    simulatorComponent?: ComponentType<any>; // 自定义模拟器组件
    dragGhostComponent?: ComponentType<any>; // 自定义拖拽幽灵组件
    suspensed?: boolean; // 是否暂停状态
    componentMetadatas?: IPublicTypeComponentMetadata[]; // 组件元数据列表
    globalComponentActions?: IPublicTypeComponentAction[]; // 全局组件动作列表
    onMount?: (designer: Designer) => void; // 挂载完成回调
    onDragstart?: (e: IPublicModelLocateEvent) => void; // 拖拽开始回调
    onDrag?: (e: IPublicModelLocateEvent) => void; // 拖拽中回调
    onDragend?: (e: {dragObject: IPublicModelDragObject; copy: boolean}, loc?: DropLocation) => void; // 拖拽结束回调
}

/**
 * Designer 接口定义
 * 定义了设计器对外提供的所有公共方法和属性
 */
export interface IDesigner {
    readonly shellModelFactory: IShellModelFactory; // Shell 模型工厂

    viewName: string | undefined; // 视图名称

    readonly project: IProject; // 🔥 项目实例，管理所有文档

    get dragon(): IDragon; // 🔥 拖拽系统实例

    get activeTracker(): IActiveTracker; // 活动节点追踪器

    get componentActions(): ComponentActions; // 组件动作管理器

    get contextMenuActions(): ContextMenuActions; // 右键菜单动作管理器

    get editor(): IPublicModelEditor; // 编辑器实例引用

    get detecting(): Detecting; // 检测系统，用于节点检测

    get simulatorComponent(): ComponentType<any> | undefined; // 模拟器组件

    get currentSelection(): ISelection; // 当前选中项管理

    // 创建滚动器
    createScroller(scrollable: IPublicTypeScrollable): IPublicModelScroller;

    // 刷新组件元数据映射
    refreshComponentMetasMap(): void;

    // 创建偏移观察器
    createOffsetObserver(nodeInstance: INodeSelector): OffsetObserver | null;

    /**
     * 创建插入位置，考虑放到 dragon 中
     */
    createLocation(locationData: IPublicTypeLocationData<INode>): DropLocation;

    // 获取组件映射表
    get componentsMap(): {[key: string]: IPublicTypeNpmInfo | Component};

    // 🔥 加载增量资源（动态加载组件）
    loadIncrementalAssets(incrementalAssets: IPublicTypeAssetsJson): Promise<void>;

    // 获取组件元数据
    getComponentMeta(
        componentName: string,
        generateMetadata?: () => IPublicTypeComponentMetadata | null,
    ): IComponentMeta;

    // 清除插入位置
    clearLocation(): void;

    // 创建组件元数据
    createComponentMeta(data: IPublicTypeComponentMetadata): IComponentMeta | null;

    // 获取组件元数据映射表
    getComponentMetasMap(): Map<string, IComponentMeta>;

    // 添加属性转换器
    addPropsReducer(reducer: IPublicTypePropsTransducer, stage: IPublicEnumTransformStage): void;

    // 🔥 发送事件（设计器事件系统）
    postEvent(event: string, ...args: any[]): void;

    // 转换属性（属性处理管道）
    transformProps(
        props: IPublicTypeCompositeObject | IPublicTypePropsList,
        node: Node,
        stage: IPublicEnumTransformStage,
    ): IPublicTypeCompositeObject | IPublicTypePropsList;

    // 创建设置入口
    createSettingEntry(nodes: INode[]): ISettingTopEntry;

    // 自动运行响应式函数
    autorun(effect: (reaction: IReactionPublic) => void, options?: IReactionOptions<any, any>): IReactionDisposer;
}

/**
 * Designer 核心类
 * 低代码引擎的设计器控制中心，负责管理设计态的所有功能
 * 与 Editor 一起构成引擎的双核心架构
 */
export class Designer implements IDesigner {
    // === 🔥 核心系统实例 ===
    dragon: IDragon; // 拖拽系统：处理组件拖拽交互

    viewName: string | undefined; // 视图名称标识

    readonly componentActions = new ComponentActions(); // 组件动作管理器：管理组件的各种操作

    readonly contextMenuActions: IContextMenuActions; // 右键菜单动作管理器

    readonly activeTracker = new ActiveTracker(); // 活动节点追踪器：追踪当前激活/悬停的节点

    readonly detecting = new Detecting(); // 检测系统：检测鼠标位置对应的节点

    readonly project: IProject; // 🔥 项目管理器：管理所有文档和页面

    readonly editor: IPublicModelEditor; // 🔥 编辑器实例引用：访问全局服务

    readonly bemToolsManager = new BemToolsManager(this); // BEM 工具管理器：处理 Block Element Modifier 相关

    readonly shellModelFactory: IShellModelFactory; // Shell 模型工厂：创建 API 包装对象

    // === 私有状态管理 ===
    private _dropLocation?: DropLocation; // 当前拖拽的放置位置

    private propsReducers = new Map<IPublicEnumTransformStage, IPublicTypePropsTransducer[]>(); // 属性转换器映射表

    private _lostComponentMetasMap = new Map<string, ComponentMeta>(); // 丢失的组件元数据缓存

    private props?: DesignerProps; // 设计器配置属性

    private oobxList: OffsetObserver[] = []; // 偏移观察器列表

    private selectionDispose: undefined | (() => void); // 选择事件清理函数

    // === 响应式状态（MobX）===
    @obx.ref private _componentMetasMap = new Map<string, IComponentMeta>(); // 🔥 组件元数据映射表

    @obx.ref private _simulatorComponent?: ComponentType<any>; // 模拟器组件

    @obx.ref private _simulatorProps?: Record<string, any> | ((project: IProject) => object); // 模拟器属性

    @obx.ref private _suspensed = false; // 暂停状态标识

    // === 便捷访问器 ===
    /**
     * 获取当前文档
     */
    get currentDocument() {
        return this.project.currentDocument;
    }

    /**
     * 获取当前历史记录管理器
     */
    get currentHistory() {
        return this.currentDocument?.history;
    }

    /**
     * 获取当前选择管理器
     */
    get currentSelection() {
        return this.currentDocument?.selection;
    }

    constructor(props: DesignerProps) {
        makeObservable(this);
        const { editor, viewName, shellModelFactory } = props;
        this.editor = editor;
        this.viewName = viewName;
        this.shellModelFactory = shellModelFactory;
        this.setProps(props);

        this.project = new Project(this, props.defaultSchema, viewName);

        this.dragon = new Dragon(this);
        // TODO:暂时没发现这段代码有什么功能 排查问题先注释
        this.dragon.onDragstart((e) => {
            console.log('Designer 类中 new Dragon 的 onDragstart');

            this.detecting.enable = false;
            const { dragObject } = e;
            if (isDragNodeObject(dragObject)) {
                if (dragObject.nodes.length === 1) {
                    if (dragObject.nodes[0].parent) {
                        // ensure current selecting
                        dragObject.nodes[0].select();
                    } else {
                        this.currentSelection?.clear();
                    }
                }
            } else {
                this.currentSelection?.clear();
            }
            if (this.props?.onDragstart) {
                this.props.onDragstart(e);
            }
            this.postEvent('dragstart', e);
        });

        this.contextMenuActions = new ContextMenuActions(this);

        this.dragon.onDrag((e) => {
            console.log('Designer 类中 new Dragon 的 onDrag');

            if (this.props?.onDrag) {
                this.props.onDrag(e);
            }
            this.postEvent('drag', e);
        });

        this.dragon.onDragend((e) => {
            const { dragObject, copy } = e;
            logger.debug('onDragend: dragObject ', dragObject, ' copy ', copy);
            const loc = this._dropLocation;
            if (loc) {
                if (isLocationChildrenDetail(loc.detail) && loc.detail.valid !== false) {
                    let nodes: INode[] | undefined;
                    if (isDragNodeObject(dragObject)) {
                        nodes = insertChildren(loc.target, [...dragObject.nodes], loc.detail.index, copy);
                    } else if (isDragNodeDataObject(dragObject)) {
                        // process nodeData
                        const nodeData = Array.isArray(dragObject.data) ? dragObject.data : [dragObject.data];
                        const isNotNodeSchema = nodeData.find((item) => !isNodeSchema(item));
                        if (isNotNodeSchema) {
                            return;
                        }
                        nodes = insertChildren(loc.target, nodeData, loc.detail.index);
                    }
                    if (nodes) {
                        loc.document?.selection.selectAll(nodes.map((o) => o.id));
                        setTimeout(() => this.activeTracker.track(nodes![0]), 10);
                    }
                }
            }
            if (this.props?.onDragend) {
                this.props.onDragend(e, loc);
            }
            this.postEvent('dragend', e, loc);
            this.detecting.enable = true;
        });

        this.activeTracker.onChange(({ node, detail }) => {
            node.document?.simulator?.scrollToNode(node, detail);
        });

        let historyDispose: undefined | (() => void);
        const setupHistory = () => {
            if (historyDispose) {
                historyDispose();
                historyDispose = undefined;
            }
            this.postEvent('history.change', this.currentHistory);
            if (this.currentHistory) {
                const { currentHistory } = this;
                historyDispose = currentHistory.onStateChange(() => {
                    this.postEvent('history.change', currentHistory);
                });
            }
        };
        this.project.onCurrentDocumentChange(() => {
            this.postEvent('current-document.change', this.currentDocument);
            this.postEvent('selection.change', this.currentSelection);
            this.postEvent('history.change', this.currentHistory);
            this.setupSelection();
            setupHistory();
        });
        this.postEvent('init', this);
        this.setupSelection();
        setupHistory();
    }

    /**
     * 设置选择管理
     * 处理选择事件的监听和初始化选择状态
     */
    setupSelection = () => {
        // 清理之前的选择监听
        if (this.selectionDispose) {
            this.selectionDispose();
            this.selectionDispose = undefined;
        }

        const { currentSelection } = this;

        // TODO: 避免选中 Page 组件，默认选中第一个子节点；新增规则 或 判断 Live 模式
        // 在 Live 模式下，如果没有选中任何节点，自动选中第一个子节点
        if (currentSelection && currentSelection.selected.length === 0 && this.simulatorProps?.designMode === 'live') {
            const rootNodeChildrens = this.currentDocument?.getRoot()?.getChildren()?.children;
            if (rootNodeChildrens && rootNodeChildrens.length > 0) {
                currentSelection.select(rootNodeChildrens[0].id);
            }
        }

        // 发送选择变化事件
        this.postEvent('selection.change', currentSelection);

        // 监听选择变化
        if (currentSelection) {
            this.selectionDispose = currentSelection.onSelectionChange(() => {
                this.postEvent('selection.change', currentSelection);
            });
        }
    };

    /**
     * 🔥 发送设计器事件
     * 所有设计器事件都会自动添加 'designer.' 前缀
     * @param event 事件名称
     * @param args 事件参数
     */
    postEvent(event: string, ...args: any[]) {
        this.editor.eventBus.emit(`designer.${event}`, ...args);
    }

    /**
     * 获取当前拖拽的放置位置
     */
    get dropLocation() {
        return this._dropLocation;
    }

    /**
     * 🔥 创建插入位置
     * 用于拖拽时确定组件的放置位置
     * @param locationData 位置数据，包含目标节点和插入详情
     * @returns 创建的放置位置对象
     */
    createLocation(locationData: IPublicTypeLocationData<INode>): DropLocation {
        const loc = new DropLocation(locationData);

        // 如果存在之前的放置位置且属于不同文档，清理之前的位置
        if (this._dropLocation && this._dropLocation.document && this._dropLocation.document !== loc.document) {
            this._dropLocation.document.dropLocation = null;
        }

        // 更新当前放置位置
        this._dropLocation = loc;
        this.postEvent('dropLocation.change', loc);

        // 设置文档的放置位置引用
        if (loc.document) {
            loc.document.dropLocation = loc;
        }

        // 追踪目标节点（用于高亮显示等）
        this.activeTracker.track({ node: loc.target, detail: loc.detail });
        return loc;
    }

    /**
     * 清除插入位置
     * 在拖拽结束或取消时调用
     */
    clearLocation() {
        // 清理文档中的放置位置引用
        if (this._dropLocation && this._dropLocation.document) {
            this._dropLocation.document.dropLocation = null;
        }

        // 发送位置清除事件
        this.postEvent('dropLocation.change', undefined);

        // 清空当前放置位置
        this._dropLocation = undefined;
    }

    /**
     * 创建滚动器
     * 用于处理画布滚动
     * @param scrollable 可滚动对象
     * @returns 滚动器实例
     */
    createScroller(scrollable: IPublicTypeScrollable): IPublicModelScroller {
        return new Scroller(scrollable);
    }

    /**
     * 创建偏移观察器
     * 用于观察节点位置变化
     * @param nodeInstance 节点选择器实例
     * @returns 偏移观察器或 null
     */
    createOffsetObserver(nodeInstance: INodeSelector): OffsetObserver | null {
        const oobx = createOffsetObserver(nodeInstance);

        // 清理过期的观察器
        this.clearOobxList();

        // 添加到观察器列表
        if (oobx) {
            this.oobxList.push(oobx);
        }
        return oobx;
    }

    private clearOobxList(force?: boolean) {
        let l = this.oobxList.length;
        if (l > 20 || force) {
            while (l-- > 0) {
                if (this.oobxList[l].isPurged()) {
                    this.oobxList.splice(l, 1);
                }
            }
        }
    }

    touchOffsetObserver() {
        this.clearOobxList(true);
        this.oobxList.forEach((item) => item.compute());
    }

    createSettingEntry(nodes: INode[]): ISettingTopEntry {
        return new SettingTopEntry(this.editor, nodes);
    }

    /**
     * 获得合适的插入位置
     * @deprecated
     */
    getSuitableInsertion(
        insertNode?: INode | IPublicTypeNodeSchema | IPublicTypeNodeSchema[],
    ): {target: INode; index?: number} | null {
        const activeDoc = this.project.currentDocument;
        if (!activeDoc) {
            return null;
        }
        if (
            Array.isArray(insertNode) &&
            isNodeSchema(insertNode[0]) &&
            this.getComponentMeta(insertNode[0].componentName).isModal
        ) {
            return {
                target: activeDoc.rootNode as INode,
            };
        }
        const focusNode = activeDoc.focusNode!;
        const nodes = activeDoc.selection.getNodes();
        const refNode = nodes.find((item) => focusNode.contains(item));
        let target;
        let index: number | undefined;
        if (!refNode || refNode === focusNode) {
            target = focusNode;
        } else if (refNode.componentMeta.isContainer) {
            target = refNode;
        } else {
            // FIXME!!, parent maybe null
            target = refNode.parent!;
            index = (refNode.index || 0) + 1;
        }

        if (target && insertNode && !target.componentMeta.checkNestingDown(target, insertNode)) {
            return null;
        }

        return { target, index };
    }

    /**
     * 🔥 设置设计器属性
     * 支持初始化和更新两种场景
     * @param nextProps 新的属性配置
     */
    setProps(nextProps: DesignerProps) {
        const props = this.props ? { ...this.props, ...nextProps } : nextProps;

        if (this.props) {
            // === 更新场景：已有属性，进行差异更新 ===

            // check hotkeys
            // TODO: 检查和更新快捷键配置

            // 检查模拟器组件是否变化
            if (props.simulatorComponent !== this.props.simulatorComponent) {
                this._simulatorComponent = props.simulatorComponent;
            }

            // 检查模拟器属性是否变化
            if (props.simulatorProps !== this.props.simulatorProps) {
                this._simulatorProps = props.simulatorProps;

                // 如果设计模式变化，重新设置选择管理
                if (props.simulatorProps?.designMode !== this.props.simulatorProps?.designMode) {
                    this.setupSelection();
                }
            }

            // 检查暂停状态是否变化
            if (props.suspensed !== this.props.suspensed && props.suspensed != null) {
                this.suspensed = props.suspensed;
            }

            // 检查组件元数据是否变化
            if (props.componentMetadatas !== this.props.componentMetadatas && props.componentMetadatas != null) {
                this.buildComponentMetasMap(props.componentMetadatas);
            }
        } else {
            // === 初始化场景：首次设置属性 ===

            // init hotkeys
            // TODO: 初始化快捷键配置

            // 初始化模拟器组件
            if (props.simulatorComponent) {
                this._simulatorComponent = props.simulatorComponent;
            }

            // 初始化模拟器属性
            if (props.simulatorProps) {
                this._simulatorProps = props.simulatorProps;
            }

            // 初始化暂停状态
            if (props.suspensed != null) {
                this.suspensed = props.suspensed;
            }

            // 初始化组件元数据
            if (props.componentMetadatas != null) {
                this.buildComponentMetasMap(props.componentMetadatas);
            }
        }

        // 保存属性引用
        this.props = props;
    }

    async loadIncrementalAssets(incrementalAssets: IPublicTypeAssetsJson): Promise<void> {
        const { components, packages } = incrementalAssets;
        components && this.buildComponentMetasMap(components);
        if (packages) {
            await this.project.simulator?.setupComponents(packages);
        }

        if (components) {
            // 合并 assets
            let assets = this.editor.get('assets') || {};
            let newAssets = mergeAssets(assets, incrementalAssets);
            // 对于 assets 存在需要二次网络下载的过程，必须 await 等待结束之后，再进行事件触发
            await this.editor.set('assets', newAssets);
        }
        // TODO: 因为涉及修改 prototype.view，之后在 renderer 里修改了 vc 的 view 获取逻辑后，可删除
        this.refreshComponentMetasMap();
        // 完成加载增量资源后发送事件，方便插件监听并处理相关逻辑
        this.editor.eventBus.emit('designer.incrementalAssetsReady');
    }

    /**
     * 刷新 componentMetasMap，可间接触发模拟器里的 buildComponents
     */
    refreshComponentMetasMap() {
        this._componentMetasMap = new Map(this._componentMetasMap);
    }

    get(key: string): any {
        return this.props?.[key];
    }

    /**
     * 获取模拟器组件（响应式计算属性）
     * 返回自定义的模拟器组件或默认模拟器
     */
    @computed get simulatorComponent(): ComponentType<any> | undefined {
        return this._simulatorComponent;
    }

    /**
     * 获取模拟器属性（响应式计算属性）
     * 支持函数式配置，动态生成属性
     */
    @computed get simulatorProps(): Record<string, any> {
        // 如果是函数，则调用函数获取动态属性
        if (typeof this._simulatorProps === 'function') {
            return this._simulatorProps(this.project);
        }
        // 返回静态属性或空对象
        return this._simulatorProps || {};
    }

    /**
     * 🔥 提供给模拟器的完整参数（响应式计算属性）
     * 合并了用户配置和系统必需的属性
     */
    @computed get projectSimulatorProps(): any {
        return {
            ...this.simulatorProps,           // 用户配置的模拟器属性
            project: this.project,            // 项目实例
            designer: this,                   // 设计器实例
            onMount: (simulator: any) => {   // 模拟器挂载回调
                // 将模拟器实例注册到项目
                this.project.mountSimulator(simulator);
                // 将模拟器实例注册到编辑器
                this.editor.set('simulator', simulator);
            },
        };
    }

    /**
     * 获取暂停状态
     */
    get suspensed(): boolean {
        return this._suspensed;
    }

    /**
     * 设置暂停状态
     * 暂停时，设计器的某些功能会被禁用
     */
    set suspensed(flag: boolean) {
        this._suspensed = flag;
        // TODO: 后续处理暂停逻辑
        if (flag) {
            // this.project.suspensed = true?
        }
    }

    /**
     * 获取项目 Schema
     * 返回当前项目的完整 Schema 数据
     */
    get schema(): IPublicTypeProjectSchema {
        return this.project.getSchema();
    }

    /**
     * 设置项目 Schema
     * 加载新的项目 Schema
     * @param schema 项目 Schema 数据
     */
    setSchema(schema?: IPublicTypeProjectSchema) {
        this.project.load(schema);
    }

    buildComponentMetasMap(metas: IPublicTypeComponentMetadata[]) {
        metas.forEach((data) => this.createComponentMeta(data));
    }

    createComponentMeta(data: IPublicTypeComponentMetadata): IComponentMeta | null {
        const key = data.componentName;
        if (!key) {
            return null;
        }
        let meta = this._componentMetasMap.get(key);
        if (meta) {
            meta.setMetadata(data);

            this._componentMetasMap.set(key, meta);
        } else {
            meta = this._lostComponentMetasMap.get(key);

            if (meta) {
                meta.setMetadata(data);
                this._lostComponentMetasMap.delete(key);
            } else {
                meta = new ComponentMeta(this, data);
            }

            this._componentMetasMap.set(key, meta);
        }
        return meta;
    }

    getGlobalComponentActions(): IPublicTypeComponentAction[] | null {
        return this.props?.globalComponentActions || null;
    }

    getComponentMeta(
        componentName: string,
        generateMetadata?: () => IPublicTypeComponentMetadata | null,
    ): IComponentMeta {
        if (this._componentMetasMap.has(componentName)) {
            return this._componentMetasMap.get(componentName)!;
        }

        if (this._lostComponentMetasMap.has(componentName)) {
            return this._lostComponentMetasMap.get(componentName)!;
        }

        const meta = new ComponentMeta(this, {
            componentName,
            ...(generateMetadata ? generateMetadata() : null),
        });

        this._lostComponentMetasMap.set(componentName, meta);

        return meta;
    }

    getComponentMetasMap() {
        return this._componentMetasMap;
    }

    /**
     * 🔥 获取组件映射表（响应式计算属性）
     * 返回所有组件的实现代码或配置信息
     * 用于模拟器渲染组件时查找组件实现
     */
    @computed get componentsMap(): {[key: string]: IPublicTypeNpmInfo | Component} {
        const maps: any = {};
        const designer = this;

        // 遍历所有组件元数据
        designer._componentMetasMap.forEach((config, key) => {
            const metaData = config.getMetadata();

            // 根据开发模式返回不同的组件信息
            if (metaData.devMode === 'lowCode') {
                // 低代码组件：返回 Schema 定义
                maps[key] = metaData.schema;
            } else {
                // 源码组件：返回视图组件或 NPM 信息
                const { view } = config.advanced;
                if (view) {
                    maps[key] = view;  // 优先使用视图组件
                } else {
                    maps[key] = config.npm;  // 否则使用 NPM 信息
                }
            }
        });
        return maps;
    }

    /**
     * 🔥 转换属性
     * 通过属性转换管道处理节点属性
     * @param props 原始属性
     * @param node 目标节点
     * @param stage 转换阶段
     * @returns 转换后的属性
     */
    transformProps(
        props: IPublicTypeCompositeObject | IPublicTypePropsList,
        node: Node,
        stage: IPublicEnumTransformStage,
    ) {
        // 暂不支持数组形式的属性
        if (Array.isArray(props)) {
            // current not support, make this future
            return props;
        }

        // 获取该阶段的转换器列表
        const reducers = this.propsReducers.get(stage);
        if (!reducers) {
            return props;
        }

        // 通过管道依次处理属性
        return reducers.reduce((xprops, reducer) => {
            try {
                // 调用转换器处理属性
                return reducer(xprops, node.internalToShellNode() as any, { stage });
            } catch (e) {
                // 转换失败时记录警告并返回原属性
                console.warn(e);
                return xprops;
            }
        }, props);
    }

    /**
     * 添加属性转换器
     * 注册新的属性处理逻辑到指定阶段
     * @param reducer 转换器函数
     * @param stage 应用阶段
     */
    addPropsReducer(reducer: IPublicTypePropsTransducer, stage: IPublicEnumTransformStage) {
        if (!reducer) {
            logger.error('reducer is not available');
            return;
        }

        // 获取或创建该阶段的转换器列表
        const reducers = this.propsReducers.get(stage);
        if (reducers) {
            reducers.push(reducer);
        } else {
            this.propsReducers.set(stage, [reducer]);
        }
    }

    /**
     * 自动运行响应式函数
     * 封装 MobX 的 autorun 功能
     * @param effect 响应式函数
     * @param options 配置选项
     * @returns 清理函数
     */
    autorun(effect: (reaction: IReactionPublic) => void, options?: IReactionOptions<any, any>): IReactionDisposer {
        return autorun(effect, options);
    }

    /**
     * 清理设计器资源
     * 释放内存和清理事件监听
     */
    purge() {
        // TODO: 实现资源清理逻辑
    }
}
