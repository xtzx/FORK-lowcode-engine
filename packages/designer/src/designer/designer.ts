/**
 * @file Designer 设计器主类
 * @description 低代码设计器的核心协调类，管理和协调所有子系统
 *
 * 📌 核心地位：
 * - Designer 是整个设计器的大脑和指挥中心
 * - 协调 Project、Document、Node、Dragon 等所有模块
 * - 提供统一的 API 接口
 * - 管理全局状态和配置
 *
 * 🎯 核心职责：
 * 1. 模块协调：管理 Project、Dragon、Detecting 等子系统
 * 2. 组件管理：ComponentMeta 的注册和管理
 * 3. 拖拽系统：Dragon 拖拽引擎的封装
 * 4. 事件系统：全局事件的分发
 * 5. 资源管理：动态加载组件库
 * 6. 属性转换：Props Transducer 管道
 * 7. 设置管理：SettingTopEntry 的创建
 * 8. 快捷键：Hotkeys 的注册和管理
 * 9. 生命周期：mount、suspend、purge
 * 10. 工具管理：BEM Tools、ContextMenu 等
 *
 * 🏗️ 架构关系：
 * ```
 * Engine（引擎）
 * └── Editor（编辑器）
 *     └── Designer（设计器）⭐ 本类
 *         ├── Project（项目）
 *         │   └── DocumentModel[]（文档）
 *         │       └── Node[]（节点）
 *         ├── Dragon（拖拽系统）
 *         ├── ActiveTracker（激活追踪）
 *         ├── Detecting（检测系统）
 *         ├── ComponentMeta Map（组件元数据）
 *         ├── ComponentActions（组件动作）
 *         └── ContextMenuActions（右键菜单）
 * ```
 *
 * 🔄 Designer 生命周期：
 * ```
 * 1. 创建：new Designer(props)
 * 2. 初始化：创建所有子系统
 * 3. 挂载：mount()
 * 4. 运行：接收操作、协调模块
 * 5. 暂停：suspend()（可选）
 * 6. 清理：purge()
 * ```
 *
 * 🎨 核心子系统：
 * - Project: 管理多个文档（页面）
 * - Dragon: 拖拽引擎，处理所有拖拽操作
 * - ActiveTracker: 追踪当前激活的节点
 * - Detecting: 检测系统，悬停高亮
 * - ComponentMeta: 组件元数据管理
 *
 * 📚 隐藏知识点：
 * 1. Shell 模型工厂：内部模型到公开 API 的转换
 * 2. Props Transducer：属性转换管道
 * 3. 增量资源加载：动态加载组件库
 * 4. BEM Tools：拖拽辅助工具（边框、插入线等）
 * 5. OffsetObserver：监听节点位置变化
 * 6. Scroller：自动滚动系统
 *
 * @example
 * ```typescript
 * // 创建设计器
 * const designer = new Designer({
 *   editor,
 *   shellModelFactory,
 *   defaultSchema: pageSchema,
 *   componentMetadatas: [buttonMeta, inputMeta]
 * });
 *
 * // 使用设计器
 * const doc = designer.project.createDocument(schema);
 * designer.dragon.boost(dragObject);
 * designer.createComponentMeta(componentMeta);
 * ```
 */

import { ComponentType } from 'react';
import {
    obx,  // MobX 响应式装饰器
    computed,  // 计算属性装饰器
    autorun,  // 自动运行函数
    makeObservable,  // 使类可观察
    IReactionPublic,  // 公共响应接口
    IReactionOptions,  // 响应选项
    IReactionDisposer,  // 响应清理器
} from '@alilc/lowcode-editor-core';
import {
    IPublicTypeProjectSchema,  // 项目 Schema 类型
    IPublicTypeComponentMetadata,  // 组件元数据类型
    IPublicTypeComponentAction,  // 组件动作类型
    IPublicTypeNpmInfo,  // NPM 包信息类型
    IPublicModelEditor,  // 编辑器模型接口
    IPublicTypeCompositeObject,  // 复合对象类型
    IPublicTypePropsList,  // 属性列表类型
    IPublicTypeNodeSchema,  // 节点 Schema 类型
    IPublicTypePropsTransducer,  // 属性转换器类型
    IShellModelFactory,  // Shell 模型工厂接口
    IPublicModelDragObject,  // 拖拽对象模型
    IPublicTypeScrollable,  // 可滚动类型
    IPublicModelScroller,  // 滚动器模型
    IPublicTypeLocationData,  // 位置数据类型
    IPublicEnumTransformStage,  // 转换阶段枚举
    IPublicModelLocateEvent,  // 定位事件模型
} from '@alilc/lowcode-types';
import {
    mergeAssets,  // 合并资源函数
    IPublicTypeAssetsJson,  // 资源 JSON 类型
    isNodeSchema,  // 判断是否为节点 Schema
    isDragNodeObject,  // 判断是否为拖拽节点对象
    isDragNodeDataObject,  // 判断是否为拖拽节点数据对象
    isLocationChildrenDetail,  // 判断是否为子节点位置详情
    Logger,  // 日志工具
} from '@alilc/lowcode-utils';
import { IProject, Project } from '../project';  // 项目相关
import { Node, DocumentModel, insertChildren, INode, ISelection } from '../document';  // 文档和节点相关
import { ComponentMeta, IComponentMeta } from '../component-meta';  // 组件元数据相关
import { INodeSelector, Component } from '../simulator';  // 模拟器相关
import { Scroller } from './scroller';  // 滚动器
import { Dragon, IDragon } from './dragon';  // 拖拽系统
import { ActiveTracker, IActiveTracker } from './active-tracker';  // 活动节点追踪器
import { Detecting } from './detecting';  // 检测系统
import { DropLocation } from './location';  // 放置位置
import { OffsetObserver, createOffsetObserver } from './offset-observer';  // 偏移观察器
import { ISettingTopEntry, SettingTopEntry } from './setting';  // 设置入口
import { BemToolsManager } from '../builtin-simulator/bem-tools/manager';  // BEM 工具管理器
import { ComponentActions } from '../component-actions';  // 组件动作管理
import { ContextMenuActions, IContextMenuActions } from '../context-menu-actions';  // 右键菜单动作

/**
 * 设计器日志记录器
 *
 * 配置：
 * - level: 'warn' - 只记录警告和错误
 * - bizName: 'designer' - 业务标识
 *
 * 用途：
 * - 记录设计器运行时的问题
 * - 调试和错误追踪
 */
const logger = new Logger({ level: 'warn', bizName: 'designer' });

// ==================== DesignerProps 接口 ====================
/**
 * 设计器属性接口
 *
 * 定义创建 Designer 实例所需的所有配置项
 *
 * 核心配置：
 * - editor: 编辑器实例（必需）
 * - shellModelFactory: Shell 模型工厂（必需）
 * - defaultSchema: 默认项目 Schema
 * - componentMetadatas: 组件元数据列表
 *
 * 可选配置：
 * - simulatorComponent: 自定义模拟器
 * - dragGhostComponent: 自定义拖拽幽灵
 * - hotkeys: 快捷键配置
 * - onMount/onDragstart/onDrag/onDragend: 生命周期回调
 */
export interface DesignerProps {
    [key: string]: any;  // 支持扩展属性

    // ===== 必需配置 =====
    /**
     * 编辑器实例
     *
     * 作用：
     * - 提供全局服务（事件总线、配置等）
     * - 连接各个模块
     * - Designer 的上层容器
     */
    editor: IPublicModelEditor;

    /**
     * Shell 模型工厂
     *
     * 作用：
     * - 创建公开 API 的包装对象
     * - 内部模型到公开接口的转换
     * - 如：Node -> IPublicModelNode
     */
    shellModelFactory: IShellModelFactory;

    // ===== 样式配置 =====
    className?: string;  // 容器 CSS 类名
    style?: object;  // 容器内联样式

    // ===== Schema 配置 =====
    /**
     * 默认项目 Schema
     *
     * 用途：
     * - 初始化时自动加载
     * - 提供初始页面
     * - 快速启动
     */
    defaultSchema?: IPublicTypeProjectSchema;

    // ===== 功能配置 =====
    hotkeys?: object;  // 快捷键配置
    viewName?: string;  // 视图名称标识

    /**
     * 模拟器配置
     *
     * 可以是：
     * - 对象：固定配置
     * - 函数：动态配置（根据文档）
     *
     * 示例：
     * ```typescript
     * // 固定配置：
     * simulatorProps: { theme: 'dark' }
     *
     * // 动态配置：
     * simulatorProps: (document) => ({
     *   theme: document.getConfig('theme')
     * })
     * ```
     */
    simulatorProps?: Record<string, any> | ((document: DocumentModel) => object);

    /**
     * 自定义模拟器组件
     *
     * 用途：
     * - 替换默认的模拟器
     * - 实现自定义渲染逻辑
     */
    simulatorComponent?: ComponentType<any>;

    /**
     * 自定义拖拽幽灵组件
     *
     * 用途：
     * - 拖拽时显示的预览
     * - 自定义拖拽视觉效果
     */
    dragGhostComponent?: ComponentType<any>;

    /**
     * 是否暂停状态
     *
     * 用途：
     * - 初始化时暂停渲染
     * - 性能优化
     */
    suspensed?: boolean;

    /**
     * 组件元数据列表
     *
     * 用途：
     * - 批量注册组件元数据
     * - 初始化时加载
     */
    componentMetadatas?: IPublicTypeComponentMetadata[];

    /**
     * 全局组件动作列表
     *
     * 用途：
     * - 所有组件通用的动作
     * - 如：删除、复制、锁定等
     */
    globalComponentActions?: IPublicTypeComponentAction[];

    // ===== 生命周期回调 =====
    /**
     * 挂载完成回调
     *
     * 触发时机：
     * - Designer 初始化完成
     * - 所有子系统创建完毕
     *
     * 用途：
     * - 执行初始化后的操作
     * - 插件注册
     * - 自定义初始化
     */
    onMount?: (designer: Designer) => void;

    /**
     * 拖拽开始回调
     *
     * 触发时机：
     * - 用户开始拖拽
     *
     * 用途：
     * - 记录拖拽开始
     * - 自定义拖拽逻辑
     */
    onDragstart?: (e: IPublicModelLocateEvent) => void;

    /**
     * 拖拽中回调
     *
     * 触发时机：
     * - 拖拽过程中持续触发
     *
     * 用途：
     * - 实时反馈
     * - 自定义拖拽行为
     */
    onDrag?: (e: IPublicModelLocateEvent) => void;

    /**
     * 拖拽结束回调
     *
     * 触发时机：
     * - 拖拽完成
     *
     * 参数：
     * - dragObject: 拖拽的对象
     * - copy: 是否是复制模式
     * - loc: 放置位置
     *
     * 用途：
     * - 记录拖拽结果
     * - 执行后置操作
     */
    onDragend?: (e: {dragObject: IPublicModelDragObject; copy: boolean}, loc?: DropLocation) => void;
}

// ==================== IDesigner 接口 ====================
/**
 * Designer 接口定义
 *
 * 定义设计器对外提供的所有公共方法和属性
 *
 * 核心 API：
 * - project: 项目管理
 * - dragon: 拖拽系统
 * - detecting: 检测系统
 * - getComponentMeta: 获取组件元数据
 * - createLocation: 创建放置位置
 * - loadIncrementalAssets: 加载增量资源
 */
export interface IDesigner {
    /**
     * Shell 模型工厂
     *
     * 用途：
     * - 创建公开 API 的包装对象
     * - 内部模型 -> 公开接口转换
     */
    readonly shellModelFactory: IShellModelFactory;

    /**
     * 视图名称
     *
     * 用途：
     * - 标识不同的视图
     * - 多视图支持
     */
    viewName: string | undefined;

    /**
     * 项目实例
     *
     * 核心模块：
     * - 管理所有文档
     * - 提供文档操作
     */
    readonly project: IProject;

    /**
     * 拖拽系统
     *
     * 核心模块：
     * - 处理所有拖拽操作
     * - 管理拖拽状态
     * - 协调传感器
     */
    get dragon(): IDragon;

    /**
     * 活动节点追踪器
     *
     * 功能：
     * - 追踪当前激活的节点
     * - 鼠标悬停追踪
     * - 用于属性面板更新
     */
    get activeTracker(): IActiveTracker;

    /**
     * 组件动作管理器
     *
     * 功能：
     * - 管理组件的操作动作
     * - 如：删除、复制、锁定等
     */
    get componentActions(): ComponentActions;

    /**
     * 右键菜单动作管理器
     *
     * 功能：
     * - 管理右键菜单项
     * - 动作注册和执行
     */
    get contextMenuActions(): ContextMenuActions;

    /**
     * 编辑器实例引用
     *
     * 用途：
     * - 访问编辑器服务
     * - 发送全局事件
     */
    get editor(): IPublicModelEditor;

    /**
     * 检测系统
     *
     * 功能：
     * - 节点检测（悬停高亮）
     * - 检测状态管理
     */
    get detecting(): Detecting;

    /**
     * 模拟器组件
     *
     * 用途：
     * - 自定义的模拟器组件
     * - 替换默认模拟器
     */
    get simulatorComponent(): ComponentType<any> | undefined;

    /**
     * 当前选中项管理
     *
     * 用途：
     * - 获取当前文档的选中管理器
     * - 快捷访问
     */
    get currentSelection(): ISelection;

    // ========== 工具方法 ==========

    /**
     * 创建滚动器
     *
     * @param scrollable - 可滚动对象
     * @returns 滚动器实例
     *
     * 用途：
     * - 为画布或面板创建自动滚动
     * - 拖拽到边缘时自动滚动
     */
    createScroller(scrollable: IPublicTypeScrollable): IPublicModelScroller;

    /**
     * 刷新组件元数据映射
     *
     * 用途：
     * - 重新构建组件映射表
     * - 组件库更新后调用
     */
    refreshComponentMetasMap(): void;

    /**
     * 创建偏移观察器
     *
     * @param nodeInstance - 节点选择器
     * @returns 偏移观察器或 null
     *
     * 用途：
     * - 监听节点位置变化
     * - 用于拖拽辅助线
     * - BEM Tools 使用
     */
    createOffsetObserver(nodeInstance: INodeSelector): OffsetObserver | null;

    /**
     * 创建插入位置
     *
     * @param locationData - 位置数据
     * @returns DropLocation 实例
     *
     * 用途：
     * - 拖拽时创建插入位置
     * - 显示插入线
     * - 计算插入索引
     *
     * TODO: 考虑放到 dragon 中
     * - 位置创建与拖拽相关
     * - 可能更合适放在 Dragon 类中
     */
    createLocation(locationData: IPublicTypeLocationData<INode>): DropLocation;

    /**
     * 获取组件映射表
     *
     * @returns 组件映射对象
     *
     * 结构：{ 组件名: NPM信息或组件类 }
     *
     * 用途：
     * - 获取所有可用组件
     * - 检查组件是否存在
     * - 渲染器使用
     */
    get componentsMap(): {[key: string]: IPublicTypeNpmInfo | Component};

    /**
     * 加载增量资源
     *
     * @param incrementalAssets - 增量资源配置
     * @returns Promise
     *
     * 功能：
     * - 动态加载组件库
     * - 不需要重新加载整个页面
     * - 热更新组件
     *
     * 使用场景：
     * ```typescript
     * // 用户安装新组件库
     * await designer.loadIncrementalAssets({
     *   packages: [
     *     { package: 'antd', version: '5.x', ... }
     *   ]
     * });
     * // 组件库加载完成，可以使用
     * ```
     */
    loadIncrementalAssets(incrementalAssets: IPublicTypeAssetsJson): Promise<void>;

    /**
     * 获取组件元数据
     *
     * @param componentName - 组件名称
     * @param generateMetadata - 生成元数据的函数（可选）
     * @returns 组件元数据
     *
     * 功能：
     * - 从缓存获取或创建
     * - 支持动态生成元数据
     * - 懒加载机制
     */
    getComponentMeta(
        componentName: string,
        generateMetadata?: () => IPublicTypeComponentMetadata | null,
    ): IComponentMeta;

    /**
     * 清除插入位置
     *
     * 功能：
     * - 清除当前的 dropLocation
     * - 隐藏插入线
     * - 拖拽结束时调用
     */
    clearLocation(): void;

    /**
     * 创建组件元数据
     *
     * @param data - 组件元数据
     * @returns ComponentMeta 实例或 null
     *
     * 功能：
     * - 创建并注册组件元数据
     * - 添加到映射表
     */
    createComponentMeta(data: IPublicTypeComponentMetadata): IComponentMeta | null;

    /**
     * 获取组件元数据映射表
     *
     * @returns Map<组件名, ComponentMeta>
     *
     * 用途：
     * - 遍历所有组件元数据
     * - 批量操作
     */
    getComponentMetasMap(): Map<string, IComponentMeta>;

    /**
     * 添加属性转换器
     *
     * @param reducer - 转换器函数
     * @param stage - 转换阶段
     *
     * 功能：
     * - 注册属性转换器
     * - 在特定阶段转换属性
     * - 属性处理管道
     *
     * 使用场景：
     * ```typescript
     * // 添加转换器
     * designer.addPropsReducer((props, node) => {
     *   // 自动添加默认值
     *   return { ...props, defaultProp: 'value' };
     * }, TransformStage.Init);
     * ```
     */
    addPropsReducer(reducer: IPublicTypePropsTransducer, stage: IPublicEnumTransformStage): void;

    /**
     * 发送事件
     *
     * @param event - 事件名称
     * @param args - 事件参数
     *
     * 功能：
     * - 发送设计器事件
     * - 全局事件总线
     *
     * 使用：
     * ```typescript
     * designer.postEvent('node.create', node);
     * designer.postEvent('document.save', document);
     * ```
     */
    postEvent(event: string, ...args: any[]): void;

    /**
     * 转换属性
     *
     * @param props - 原始属性
     * @param node - 节点实例
     * @param stage - 转换阶段
     * @returns 转换后的属性
     *
     * 功能：
     * - 应用所有注册的转换器
     * - 按阶段处理属性
     *
     * 使用：Node 构造函数中调用
     */
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

        // 🔥 【步骤1】注册拖拽结束事件监听器 - 这是数据真正插入文档的入口
        this.dragon.onDragend((e) => {
            // 从拖拽引擎获取拖拽对象和复制标记
            const { dragObject, copy } = e;
            logger.debug('onDragend: dragObject ', dragObject, ' copy ', copy);
            // 获取当前的放置位置信息（在拖拽过程中通过 locate 方法持续更新）
            const loc = this._dropLocation;

            if (loc) {
                // 检查是否为有效的子节点放置位置（区分插入到子节点 vs 替换节点）
                if (isLocationChildrenDetail(loc.detail) && loc.detail.valid !== false) {
                    let nodes: INode[] | undefined; // 存储成功插入的节点数组

                    // 🎯 情况A：拖拽的是已存在的节点（从画布移动）
                    if (isDragNodeObject(dragObject)) {
                        // 调用 insertChildren 插入现有节点到目标位置
                        // - loc.target: 目标父容器节点
                        // - [...dragObject.nodes]: 被拖拽的节点数组（展开避免引用问题）
                        // - loc.detail.index: 插入位置索引
                        // - copy: 是否复制（true=复制，false=移动）
                        nodes = insertChildren(loc.target, [...dragObject.nodes], loc.detail.index, copy);
                    }
                    // 🎯 情况B：拖拽的是组件库中的组件数据（新增组件）
                    else if (isDragNodeDataObject(dragObject)) {
                        // 🔥 【关键】这是组件库拖拽的处理分支

                        // 统一处理数据格式：单个对象转为数组
                        const nodeData = Array.isArray(dragObject.data) ? dragObject.data : [dragObject.data];

                        // 数据有效性检查：确保所有数据都是合法的 NodeSchema
                        const isNotNodeSchema = nodeData.find((item) => !isNodeSchema(item));
                        if (isNotNodeSchema) {
                            return; // 有无效数据，直接退出
                        }

                        // 🔥 【核心调用】调用 insertChildren 将 NodeData 转换为 Node 并插入
                        // - loc.target: 目标父容器节点
                        // - nodeData: 组件 Schema 数据数组
                        // - loc.detail.index: 插入位置索引
                        // - 注意：组件库拖拽不传递 copy 参数，默认为新增模式
                        nodes = insertChildren(loc.target, nodeData, loc.detail.index);
                    }

                    // 🎯 插入成功后的后续处理
                    if (nodes) {
                        // 【步骤5】自动选中新插入的所有节点
                        // 将节点数组转为 ID 数组，调用 selection.selectAll
                        loc.document?.selection.selectAll(nodes.map((o) => o.id));

                        // 【步骤6】延迟聚焦到第一个插入的节点（滚动到可视区域）
                        // 使用 setTimeout 确保选中状态更新完成后再执行
                        setTimeout(() => this.activeTracker.track(nodes![0]), 10);
                    }
                }
            }

            // 调用外部自定义的 onDragend 回调（如果存在）
            if (this.props?.onDragend) {
                this.props.onDragend(e, loc);
            }

            // 发送全局 dragend 事件，供其他模块监听
            this.postEvent('dragend', e, loc);

            // 重新启用节点检测功能（拖拽过程中被禁用以避免干扰）
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
