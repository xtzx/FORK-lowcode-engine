// ==================== 依赖导入 ====================
import React, { createElement, ReactInstance } from 'react';
import { render as reactRender } from 'react-dom';
import { host } from './host';  // 宿主对象，用于与设计器通信
import SimulatorRendererView from './renderer-view';  // 视图层根组件
import { computed, observable as obx, untracked, makeObservable, configure } from 'mobx';  // 响应式状态管理
import { getClientRects } from './utils/get-client-rects';
import { reactFindDOMNodes, getReactInternalFiber } from './utils/react-find-dom-nodes';
import {
    Asset,  // 资源定义类型
    isElement,  // 判断是否为 DOM 元素
    cursor,  // 光标状态管理
    setNativeSelection,  // 设置原生选择
    buildComponents,  // 构建组件映射表
    getSubComponent,  // 获取子组件
    compatibleLegaoSchema,  // 兼容 Legao Schema
    isPlainObject,  // 判断是否为普通对象
    AssetLoader,  // 资源加载器
    getProjectUtils,  // 获取项目工具函数
} from '@alilc/lowcode-utils';
import {
    IPublicTypeComponentSchema,  // 组件 Schema 类型
    IPublicEnumTransformStage,  // 转换阶段枚举
    IPublicTypeNodeInstance,  // 节点实例类型
    IPublicTypeProjectSchema,  // 项目 Schema 类型
} from '@alilc/lowcode-types';
// just use types
import { BuiltinSimulatorRenderer, Component, IDocumentModel, INode } from '@alilc/lowcode-designer';
import LowCodeRenderer from '@alilc/lowcode-react-renderer';  // 低代码渲染器
import { createMemoryHistory, MemoryHistory } from 'history';  // 内存路由
import Slot from './builtin-components/slot';  // 插槽组件
import Leaf from './builtin-components/leaf';  // 叶子组件
import { withQueryParams, parseQuery } from './utils/url';  // URL 工具
import { merge } from 'lodash';  // 深度合并

// ==================== 全局配置 ====================
const loader = new AssetLoader();  // 创建全局资源加载器实例
configure({ enforceActions: 'never' });  // 配置 MobX 不强制使用 action

// ==================== 文档实例类 ====================
/**
 * 📄 文档实例类 DocumentInstance
 *
 * 职责：管理单个文档（页面）的渲染实例和状态
 *
 * 核心功能：
 * 1. 维护节点ID与React实例的映射关系（instancesMap）
 * 2. 管理文档级别的配置（组件、上下文、设计模式等）
 * 3. 提供节点查询和实例挂载能力
 *
 * 生命周期：由 SimulatorRendererContainer 创建和管理
 */
export class DocumentInstance {
    // ========== 实例映射管理 ==========
    /**
     * 组件实例映射表：nodeId -> ReactInstance[]
     *
     * 为什么是数组？
     * - 一个节点可能对应多个 React 实例（如列表循环渲染）
     * - 用于设计器定位和操作组件实例
     */
    instancesMap = new Map<string, ReactInstance[]>();

    // ========== Schema 导出 ==========
    /**
     * 获取当前文档的渲染态 Schema
     *
     * 从设计器的文档模型导出专门用于渲染的 Schema（非设计态）
     * 会进行必要的转换和优化
     */
    get schema(): any {
        return this.document.export(IPublicEnumTransformStage.Render);
    }

    // ========== 清理函数集合 ==========
    /**
     * 清理函数数组
     * 存储需要在 dispose 时执行的清理函数（如事件监听器、订阅等）
     */
    private disposeFunctions: Array<() => void> = [];

    // ========== 组件管理 ==========
    /**
     * @obx.ref 私有组件映射表
     * MobX 可观察对象，使用 ref 模式（仅在引用改变时触发更新）
     */
    @obx.ref private _components: any = {};

    /**
     * @computed 计算属性：组件映射表
     *
     * 未来扩展点：根据 device 选择不同组件
     * 更好的做法：根据设备加载不同的组件资源包
     */
    @computed get components(): object {
        // 根据 device 选择不同组件，进行响应式
        // 更好的做法是，根据 device 选择加载不同的组件资源，甚至是 simulatorUrl
        return this._components;
    }

    // ========== 应用上下文 ==========
    /**
     * @obx.ref 应用上下文（私有）
     * 包含：utils、constants、history、location、match 等运行时对象
     */
    @obx.ref private _appContext = {};

    /**
     * @computed 计算属性：应用上下文
     * 提供给渲染器的全局上下文对象
     */
    @computed get context(): any {
        return this._appContext;
    }

    // ========== 设计模式 ==========
    /**
     * @obx.ref 设计模式（私有）
     * 'design' - 设计态，'preview' - 预览态
     */
    @obx.ref private _designMode = 'design';

    /**
     * @computed 计算属性：设计模式
     */
    @computed get designMode(): any {
        return this._designMode;
    }

    // ========== 请求处理器映射 ==========
    /**
     * @obx.ref 请求处理器映射（私有）
     * 用于数据源请求的处理器配置
     */
    @obx.ref private _requestHandlersMap = null;

    /**
     * @computed 计算属性：请求处理器映射
     */
    @computed get requestHandlersMap(): any {
        return this._requestHandlersMap;
    }

    // ========== 设备类型 ==========
    /**
     * @obx.ref 设备类型（私有）
     * 'default' | 'mobile' | 'tablet' 等
     */
    @obx.ref private _device = 'default';

    /**
     * @computed 计算属性：设备类型
     */
    @computed get device() {
        return this._device;
    }

    // ========== 组件元数据映射 ==========
    /**
     * @obx.ref 组件元数据映射（私有）
     * 组件名 -> 组件元数据
     */
    @obx.ref private _componentsMap = {};

    /**
     * @computed 计算属性：组件元数据映射
     */
    @computed get componentsMap(): any {
        return this._componentsMap;
    }

    // ========== 暂停标志 ==========
    /**
     * @computed 计算属性：是否暂停渲染
     * 当前固定返回 false，预留扩展
     */
    @computed get suspended(): any {
        return false;
    }

    // ========== 作用域 ==========
    /**
     * @computed 计算属性：渲染作用域
     * 当前固定返回 null，预留扩展
     */
    @computed get scope(): any {
        return null;
    }

    // ========== 路由路径 ==========
    /**
     * 获取文档路由路径
     * 格式：/文档名
     * 用于内存路由系统
     */
    get path(): string {
        return `/${this.document.fileName}`;
    }

    // ========== 文档ID ==========
    /**
     * 获取文档唯一标识
     */
    get id() {
        return this.document.id;
    }

    // ========== 构造函数 ==========
    /**
     * 构造文档实例
     *
     * @param container - 渲染容器引用（只读）
     * @param document - 文档模型引用（只读）
     */
    constructor(readonly container: SimulatorRendererContainer, readonly document: IDocumentModel) {
        makeObservable(this);  // 启用 MobX 响应式
    }

    // ========== 私有方法：卸载实例 ==========
    /**
     * 从实例映射表中卸载指定实例
     *
     * @param id - 节点 ID
     * @param instance - 要卸载的 React 实例
     *
     * 流程：
     * 1. 从映射表查找实例数组
     * 2. 找到并移除指定实例
     * 3. 通知 host 更新实例引用
     */
    private unmountInstance(id: string, instance: ReactInstance) {
        // 获取该节点的所有实例
        const instances = this.instancesMap.get(id);
        if (instances) {
            // 查找实例在数组中的索引
            const i = instances.indexOf(instance);
            if (i > -1) {
                // 从数组中移除
                instances.splice(i, 1);
                // 通知 host 更新（设计器需要知道实例变化）
                host.setInstance(this.document.id, id, instances);
            }
        }
    }

    // ========== 公开方法：挂载实例 ==========
    /**
     * 挂载组件实例
     *
     * 核心功能：将 React 组件实例与节点 ID 关联，建立设计器与渲染器的桥梁
     *
     * @param id - 节点 ID（Schema 中的唯一标识）
     * @param instance - React 组件实例或 null（null 表示卸载）
     *
     * 关键机制：
     * 1. 实例复用检测：避免实例在多个节点间冲突
     * 2. 生命周期劫持：通过劫持 componentWillUnmount 自动清理
     * 3. 符号标记：使用 Symbol 在实例上标记归属关系
     * 4. 挂载状态过滤：自动清理已卸载的实例
     */
    mountInstance(id: string, instance: ReactInstance | null) {
        // 获取当前文档 ID
        const docId = this.document.id;
        const { instancesMap } = this;

        // ===== 情况1：instance 为 null，表示卸载操作 =====
        if (instance == null) {
            // 获取该节点的所有实例
            let instances = this.instancesMap.get(id);
            if (instances) {
                // 过滤掉已经卸载的实例（检查 DOM 是否还在文档中）
                instances = instances.filter(checkInstanceMounted);
                if (instances.length > 0) {
                    // 还有有效实例，更新映射表
                    instancesMap.set(id, instances);
                    host.setInstance(this.document.id, id, instances);
                } else {
                    // 没有有效实例了，从映射表删除
                    instancesMap.delete(id);
                    host.setInstance(this.document.id, id, null);
                }
            }
            return;
        }

        // ===== 情况2：instance 不为 null，表示挂载操作 =====

        // 绑定 unmountInstance 方法的 this 上下文
        const unmountInstance = this.unmountInstance.bind(this);

        // 获取实例上的原始节点 ID（如果之前已经挂载过）
        const origId = (instance as any)[SYMBOL_VNID];

        // 检查实例复用：如果这个实例之前属于另一个节点
        if (origId && origId !== id) {
            // 另外一个节点的 instance 在此被复用了，需要从原来地方卸载
            unmountInstance(origId, instance);
        }

        // 如果是 DOM 元素，缓存 React 内部 key（用于后续查找 Fiber 节点）
        if (isElement(instance)) {
            cacheReactKey(instance);
        } else if (origId !== id) {
            // 如果是组件实例且不是原节点（涵盖 origId == null || origId !== id）

            // 劫持 componentWillUnmount 生命周期
            let origUnmount: any = instance.componentWillUnmount;

            // 如果已经被劫持过，获取原始方法
            if (origUnmount && origUnmount.origUnmount) {
                origUnmount = origUnmount.origUnmount;
            }

            // 创建新的卸载方法：在组件卸载时自动从映射表移除
            const newUnmount = function (this: any) {
                unmountInstance(id, instance);  // 先从映射表移除
                origUnmount && origUnmount.call(this);  // 再调用原始卸载方法
            };

            // 保存原始方法的引用（用于多次劫持的情况）
            (newUnmount as any).origUnmount = origUnmount;

            // 替换组件的卸载方法
            instance.componentWillUnmount = newUnmount;
        }

        // 在实例上标记节点 ID 和文档 ID（使用 Symbol 避免冲突）
        (instance as any)[SYMBOL_VNID] = id;
        (instance as any)[SYMBOL_VDID] = docId;

        // 获取该节点当前的实例数组
        let instances = this.instancesMap.get(id);

        if (instances) {
            // 已有实例数组
            const l = instances.length;  // 记录原始长度

            // 过滤掉已卸载的实例
            instances = instances.filter(checkInstanceMounted);

            // 判断是否有变化
            let updated = instances.length !== l;

            // 如果当前实例不在数组中，添加进去
            if (!instances.includes(instance)) {
                instances.push(instance);
                updated = true;
            }

            // 如果没有任何变化，直接返回
            if (!updated) {
                return;
            }
        } else {
            // 还没有实例数组，创建新数组
            instances = [instance];
        }

        // 更新映射表
        instancesMap.set(id, instances);

        // 通知 host（设计器需要知道实例变化，用于选中、高亮等操作）
        host.setInstance(this.document.id, id, instances);
    }

    // ========== 挂载上下文（预留） ==========
    /**
     * 挂载上下文
     * 当前为空实现，预留扩展点
     */
    mountContext() {}

    // ========== 获取节点 ==========
    /**
     * 根据节点 ID 获取节点模型
     *
     * @param id - 节点 ID
     * @returns 节点模型或 null
     */
    getNode(id: string): INode | null {
        return this.document.getNode(id);
    }

    // ========== 销毁方法 ==========
    /**
     * 销毁文档实例，清理资源
     *
     * 清理内容：
     * 1. 执行所有注册的清理函数
     * 2. 清空实例映射表
     */
    dispose() {
        // 执行所有清理函数（事件监听、订阅等）
        this.disposeFunctions.forEach((fn) => fn());
        // 清空实例映射表
        this.instancesMap = new Map();
    }
}

// ==================== 模拟器渲染容器类 ====================
/**
 * 🎯 模拟器渲染容器类 SimulatorRendererContainer
 *
 * 职责：整个 iframe 内渲染器的核心管理类，是设计器与渲染器的连接枢纽
 *
 * 核心功能：
 * 1. 📚 管理多个文档实例（DocumentInstance）
 * 2. 🧩 维护组件库和资源加载
 * 3. 🔗 与设计器 host 通信和状态同步
 * 4. 🌐 提供应用上下文（utils、constants、i18n等）
 * 5. 🚀 启动和管理整个渲染生命周期
 * 6. 🛤️ 管理内存路由系统
 *
 * 设计模式：单例模式（全局只有一个实例）
 */
export class SimulatorRendererContainer implements BuiltinSimulatorRenderer {
    // ========== 标识属性 ==========
    /**
     * 渲染器类型标识
     * 用于类型判断和接口实现验证
     */
    readonly isSimulatorRenderer = true;

    // ========== 清理管理 ==========
    /**
     * 清理函数集合
     * 存储需要在销毁时执行的清理函数（事件监听、订阅等）
     */
    private disposeFunctions: Array<() => void> = [];

    // ========== 路由管理 ==========
    /**
     * 内存路由实例
     * 用于多文档（多页面）切换，不依赖浏览器 URL
     */
    readonly history: MemoryHistory;

    // ========== 文档实例管理 ==========
    /**
     * @obx.ref 文档实例数组（私有）
     * 存储所有文档的渲染实例
     */
    @obx.ref private _documentInstances: DocumentInstance[] = [];

    /**
     * 请求处理器映射（私有）
     * 用于数据源请求配置
     */
    private _requestHandlersMap: any;

    /**
     * 获取文档实例数组
     * @returns 所有文档实例
     */
    get documentInstances() {
        return this._documentInstances;
    }

    // ========== 布局管理 ==========
    /**
     * @obx 布局配置（私有）
     * 存储全局布局组件配置
     */
    @obx private _layout: any = null;

    /**
     * @computed 计算属性：布局配置
     * TODO: 解析布局组件
     */
    @computed get layout(): any {
        // TODO: parse layout Component
        return this._layout;
    }

    /**
     * 设置布局配置
     */
    set layout(value: any) {
        this._layout = value;
    }

    // ========== 组件库管理 ==========
    /**
     * 组件库映射表（私有）
     * 格式：{ 包名: window 全局变量名 }
     * 例如：{ 'antd': 'antd', '@alifd/next': 'Next' }
     */
    private _libraryMap: {[key: string]: string} = {};

    /**
     * 组件映射表（私有）
     * 格式：{ 组件名: React 组件 }
     * 包含所有可用的 React 组件
     */
    private _components: Record<string, React.FC | React.ComponentClass> | null = {};

    /**
     * 获取组件映射表
     *
     * 未来扩展点：根据 device 选择不同组件
     * 更好的做法：根据设备加载不同的组件资源包
     */
    get components(): Record<string, React.FC | React.ComponentClass> {
        // 根据 device 选择不同组件，进行响应式
        // 更好的做法是，根据 device 选择加载不同的组件资源，甚至是 simulatorUrl
        return this._components || {};
    }

    // ========== 应用上下文管理 ==========
    /**
     * @obx.ref 应用上下文（私有）
     * 包含：utils、constants、history、location、match 等运行时对象
     * 这些对象会注入到低代码渲染器中，供 JSExpression 使用
     */
    @obx.ref private _appContext: any = {};

    /**
     * @computed 计算属性：应用上下文
     */
    @computed get context(): any {
        return this._appContext;
    }

    // ========== 设计模式管理 ==========
    /**
     * @obx.ref 设计模式（私有）
     * 'design' - 设计态，'preview' - 预览态
     */
    @obx.ref private _designMode: string = 'design';

    /**
     * @computed 计算属性：设计模式
     */
    @computed get designMode(): any {
        return this._designMode;
    }

    // ========== 设备类型管理 ==========
    /**
     * @obx.ref 设备类型（私有）
     * 'default' | 'mobile' | 'tablet' 等
     */
    @obx.ref private _device: string = 'default';

    /**
     * @computed 计算属性：设备类型
     */
    @computed get device() {
        return this._device;
    }

    // ========== 国际化管理 ==========
    /**
     * @obx.ref 语言环境（私有）
     * 'zh-CN' | 'en-US' 等
     */
    @obx.ref private _locale: string | undefined = undefined;

    /**
     * @computed 计算属性：语言环境
     */
    @computed get locale() {
        return this._locale;
    }

    // ========== 组件元数据管理 ==========
    /**
     * @obx.ref 组件元数据映射（私有）
     * 存储所有组件的元信息（属性配置、事件配置等）
     */
    @obx.ref private _componentsMap = {};

    /**
     * @computed 计算属性：组件元数据映射
     */
    @computed get componentsMap(): any {
        return this._componentsMap;
    }

    // ========== 渲染控制标志 ==========
    /**
     * 是否自动渲染
     * 控制画布是否实时渲染（可以暂停渲染以提升性能）
     */
    autoRender = true;

    /**
     * 是否自动重绘节点
     * 控制画布是否自动监听事件来重绘节点
     */
    autoRepaintNode = true;

    /**
     * 是否正在运行
     * 防止重复调用 run 方法
     */
    private _running = false;

    // ========== 构造函数 ==========
    /**
     * 构造模拟器渲染容器
     *
     * 初始化流程：
     * 1. 启用 MobX 响应式
     * 2. 连接 host，同步配置
     * 3. 监听文档变化
     * 4. 创建内存路由
     * 5. 初始化应用上下文
     * 6. 消费组件资源
     */
    constructor() {
        // ===== 第1步：启用 MobX 响应式 =====
        makeObservable(this);  // 启用装饰器定义的响应式属性

        // ===== 第2步：同步初始配置 =====
        this.autoRender = host.autoRender;  // 从 host 获取自动渲染配置

        // ===== 第3步：连接 host，建立双向通信 =====
        /**
         * host.connect() 建立与设计器的连接
         * 回调函数会在以下情况执行：
         * 1. 首次连接时立即执行
         * 2. host 相关状态变化时自动执行（通过 MobX autorun）
         *
         * 功能：持续同步设计器的配置到渲染器
         */
        this.disposeFunctions.push(
            host.connect(this, () => {
                // --- 同步布局配置 ---
                this._layout = host.project.get('config').layout;

                // --- 同步组件库配置 ---
                // TODO: 优化：不应该所有配置变化都重新构建组件
                // 只有 libraryMap 或 componentsMap 变化时才需要重新构建
                if (this._libraryMap !== host.libraryMap || this._componentsMap !== host.designer.componentsMap) {
                    this._libraryMap = host.libraryMap || {};  // 组件库映射
                    this._componentsMap = host.designer.componentsMap;  // 组件元数据映射
                    this.buildComponents();  // 重新构建组件映射表
                }

                // --- 同步设计模式 ---
                this._designMode = host.designMode;  // 'design' | 'preview'

                // --- 同步语言环境 ---
                this._locale = host.locale;  // 'zh-CN' | 'en-US'

                // --- 同步请求处理器 ---
                this._requestHandlersMap = host.requestHandlersMap;  // 数据源请求配置

                // --- 同步设备类型 ---
                this._device = host.device;  // 'default' | 'mobile' | 'tablet'
            }),
        );
        // ===== 第4步：监听文档变化，管理文档实例 =====
        /**
         * documentInstanceMap 用于缓存文档实例
         * key: 文档 ID, value: DocumentInstance
         * 避免文档列表变化时重复创建实例
         */
        const documentInstanceMap = new Map<string, DocumentInstance>();

        /**
         * initialEntry 初始路由路径
         * 在第一次 autorun 时确定
         */
        let initialEntry = '/';

        /**
         * firstRun 标志是否为首次运行
         * 用于区分初始化和后续更新
         */
        let firstRun = true;

        /**
         * host.autorun() 监听文档列表和当前文档变化
         *
         * 功能：
         * 1. 文档列表变化时，创建或复用 DocumentInstance
         * 2. 当前文档变化时，同步更新路由
         */
        this.disposeFunctions.push(
            host.autorun(() => {
                // --- 更新文档实例数组 ---
                // 将设计器的文档模型映射为渲染器的文档实例
                this._documentInstances = host.project.documents.map((doc) => {
                    // 先从缓存中查找
                    let inst = documentInstanceMap.get(doc.id);
                    if (!inst) {
                        // 缓存中没有，创建新实例
                        inst = new DocumentInstance(this, doc);
                        documentInstanceMap.set(doc.id, inst);
                    }
                    return inst;
                });

                // --- 获取当前文档的路由路径 ---
                const path = host.project.currentDocument
                    ? documentInstanceMap.get(host.project.currentDocument.id)!.path
                    : '/';

                // --- 处理路由同步 ---
                if (firstRun) {
                    // 首次运行：记录初始路径（稍后创建路由时使用）
                    initialEntry = path;
                    firstRun = false;
                } else if (this.history.location.pathname !== path) {
                    // 后续运行：如果路径变化，更新路由
                    this.history.replace(path);
                }
            }),
        );

        // ===== 第5步：创建内存路由 =====
        /**
         * 创建内存路由实例
         * 使用之前确定的 initialEntry 作为初始路径
         */
        const history = createMemoryHistory({
            initialEntries: [initialEntry],
        });
        this.history = history;

        /**
         * 监听路由变化
         * 当路由变化时，通知设计器打开对应文档
         *
         * 这样可以实现双向同步：
         * - 设计器切换文档 → 更新路由（上面的 autorun）
         * - 路由变化 → 设计器切换文档（这里的 listen）
         */
        history.listen((location) => {
            const docId = location.pathname.slice(1);  // 移除开头的 '/'
            docId && host.project.open(docId);  // 打开对应文档
        });
        // ===== 第6步：消费组件资源 =====
        /**
         * 监听组件资源变化（组件库 JS/CSS）
         * 当设计器加载新的组件库时：
         * 1. 加载组件资源（JS/CSS）
         * 2. 重新构建组件映射表
         */
        host.componentsConsumer.consume(async (componentsAsset) => {
            if (componentsAsset) {
                await this.load(componentsAsset);  // 加载资源到 window
                this.buildComponents();  // 构建组件映射表
            }
        });

        // ===== 第7步：初始化应用上下文 =====
        /**
         * 应用上下文对象
         * 会注入到低代码渲染器，供 JSExpression 使用
         *
         * 结构：
         * - utils: 工具函数集合
         *   - router: 路由工具
         *   - legaoBuiltins: 遗留系统内置方法
         *   - i18n: 国际化工具
         *   - 其他自定义工具
         * - constants: 常量
         * - requestHandlersMap: 请求处理器
         */
        this._appContext = {
            utils: {
                // --- 路由工具 ---
                router: {
                    /**
                     * 路由跳转（添加历史记录）
                     * @param path - 路径
                     * @param params - 查询参数
                     */
                    push(path: string, params?: object) {
                        history.push(withQueryParams(path, params));
                    },
                    /**
                     * 路由替换（不添加历史记录）
                     * @param path - 路径
                     * @param params - 查询参数
                     */
                    replace(path: string, params?: object) {
                        history.replace(withQueryParams(path, params));
                    },
                },
                // --- Legao 遗留系统内置方法 ---
                legaoBuiltins: {
                    /**
                     * 获取 URL 参数
                     * @returns URL 参数对象
                     */
                    getUrlParams() {
                        const { search } = history.location;
                        return parseQuery(search);
                    },
                },
                // --- 国际化工具 ---
                i18n: {
                    /**
                     * 设置语言环境
                     * @param loc - 语言代码
                     */
                    setLocale: (loc: string) => {
                        this._appContext.utils.i18n.currentLocale = loc;
                        this._locale = loc;
                    },
                    currentLocale: this.locale,  // 当前语言
                    messages: {},  // 国际化消息
                },
                // --- 项目自定义工具函数 ---
                ...getProjectUtils(this._libraryMap, host.get('utilsMetadata')),
            },
            // --- 常量 ---
            constants: {},
            // --- 请求处理器映射 ---
            requestHandlersMap: this._requestHandlersMap,
        };

        // ===== 第8步：消费注入配置 =====
        /**
         * 监听 appHelper 注入
         * 允许设计器动态注入自定义的 utils、constants 等
         *
         * 典型用途：注入业务自定义的工具函数和常量
         */
        host.injectionConsumer.consume((data) => {
            // TODO: sync utils, i18n, contants,... config
            // 创建新上下文对象（保持不可变性，触发 MobX 更新）
            const newCtx = {
                ...this._appContext,
            };
            // 深度合并注入的 appHelper
            merge(newCtx, data.appHelper || {});
            this._appContext = newCtx;
        });

        // ===== 第9步：消费国际化消息 =====
        /**
         * 监听国际化消息变化
         * 更新 i18n messages
         */
        host.i18nConsumer.consume((data) => {
            // 创建新上下文对象
            const newCtx = {
                ...this._appContext,
            };
            // 更新国际化消息
            newCtx.utils.i18n.messages = data || {};
            this._appContext = newCtx;
        });
    }

    // ========== 私有方法：构建组件映射表 ==========
    /**
     * 构建组件映射表
     *
     * 功能：将组件库和组件元数据转换为可用的 React 组件
     *
     * 处理：
     * 1. 从 window 全局变量获取组件库（根据 libraryMap）
     * 2. 根据 componentsMap 的配置构建组件
     * 3. 低代码组件通过 createComponent 创建
     * 4. 添加内置组件（Slot、Leaf）
     */
    private buildComponents() {
        // 根据组件库映射和元数据构建组件映射表
        // createComponent 用于创建低代码组件
        this._components = buildComponents(this._libraryMap, this._componentsMap, this.createComponent.bind(this));

        // 添加内置组件（Slot、Leaf 等）
        // 内置组件优先级最高，会覆盖同名的普通组件
        this._components = {
            ...builtinComponents,
            ...this._components,
        };
    }

    // ========== 公开方法：加载资源 ==========
    /**
     * 加载资源（组件库 JS/CSS）
     *
     * @param asset - 资源配置对象
     * @returns Promise
     *
     * 资源格式示例：
     * {
     *   packages: [
     *     { package: 'antd', version: '4.x', urls: ['antd.min.js', 'antd.min.css'] }
     *   ]
     * }
     */
    load(asset: Asset): Promise<any> {
        return loader.load(asset);
    }

    /**
     * 异步加载组件库
     *
     * @param asyncLibraryMap - 异步组件库映射
     *
     * 用途：支持动态导入，延迟加载不常用的组件库
     */
    async loadAsyncLibrary(asyncLibraryMap: Record<string, any>) {
        await loader.loadAsyncLibrary(asyncLibraryMap);
        this.buildComponents();  // 重新构建组件映射表
    }

    // ========== 公开方法：获取组件 ==========
    /**
     * 根据组件名获取组件
     *
     * @param componentName - 组件名，支持点号分隔的子组件路径
     *                        例如：'Button', 'Ant.Button', 'Ant.Button.Group'
     * @returns React 组件或 null
     *
     * 查找逻辑：
     * 1. 先尝试完整路径：'Ant.Button.Group'
     * 2. 未找到则逐级回退：'Ant.Button' -> 然后获取 .Group
     * 3. 再回退：'Ant' -> 然后获取 .Button.Group
     */
    getComponent(componentName: string) {
        const paths = componentName.split('.');  // 分割路径
        const subs: string[] = [];  // 存储子组件路径

        while (true) {
            const component = this._components?.[componentName];
            if (component) {
                // 找到组件，获取子组件（如果有）
                return getSubComponent(component, subs);
            }

            // 未找到，回退一级
            const sub = paths.pop();
            if (!sub) {
                // 已经回退到顶级，仍未找到
                return null;
            }
            subs.unshift(sub);  // 将回退的部分加入子组件路径
            componentName = paths.join('.');  // 构建新的查找路径
        }
    }

    // ========== 公开方法：获取最近的节点实例 ==========
    /**
     * 从 React 实例向上查找最近的低代码节点实例
     *
     * @param from - React 实例或 DOM 元素
     * @param nodeId - 可选：指定要查找的节点 ID
     * @returns 节点实例信息（包含 docId、nodeId、instance）或 null
     *
     * 用途：从渲染的组件反向定位到设计器的节点
     */
    getClosestNodeInstance(from: ReactInstance, nodeId?: string): IPublicTypeNodeInstance<ReactInstance> | null {
        return getClosestNodeInstance(from, nodeId);
    }

    // ========== 公开方法：查找 DOM 节点 ==========
    /**
     * 从 React 实例查找对应的 DOM 节点
     *
     * @param instance - React 实例
     * @returns DOM 节点数组或 null
     *
     * 说明：
     * - 一个组件可能渲染多个 DOM 节点（Fragment）
     * - 支持函数组件和类组件
     */
    findDOMNodes(instance: ReactInstance): Array<Element | Text> | null {
        return reactFindDOMNodes(instance);
    }

    // ========== 公开方法：获取元素位置 ==========
    /**
     * 获取元素的位置信息
     *
     * @param element - DOM 元素或文本节点
     * @returns DOMRect 数组
     *
     * 说明：支持文本节点（使用 Range API）
     */
    getClientRects(element: Element | Text) {
        return getClientRects(element);
    }

    // ========== 公开方法：设置原生选择 ==========
    /**
     * 设置是否允许原生文本选择
     *
     * @param enableFlag - true 启用，false 禁用
     *
     * 用途：设计态通常禁用文本选择，防止与拖拽冲突
     */
    setNativeSelection(enableFlag: boolean) {
        setNativeSelection(enableFlag);
    }

    // ========== 公开方法：设置拖拽状态 ==========
    /**
     * 设置拖拽状态
     *
     * @param state - true 正在拖拽，false 不在拖拽
     *
     * 用途：改变鼠标光标样式，提供视觉反馈
     */
    setDraggingState(state: boolean) {
        cursor.setDragging(state);
    }

    // ========== 公开方法：设置复制状态 ==========
    /**
     * 设置复制状态
     *
     * @param state - true 正在复制，false 不在复制
     *
     * 用途：改变鼠标光标样式，区分移动和复制操作
     */
    setCopyState(state: boolean) {
        cursor.setCopy(state);
    }

    // ========== 公开方法：清除状态 ==========
    /**
     * 清除所有光标状态
     *
     * 用途：拖拽结束后恢复正常光标
     */
    clearState() {
        cursor.release();
    }

    // ========== 公开方法：创建低代码组件 ==========
    /**
     * 创建低代码组件
     *
     * 功能：将低代码组件的 Schema 转换为可用的 React 组件
     *
     * @param schema - 低代码组件的 Schema 定义
     * @returns React 组件类
     *
     * 工作流程：
     * 1. 兼容 Legao Schema 格式
     * 2. 注入组件 CSS 样式
     * 3. 创建 React 组件类，内部使用 LowCodeRenderer 渲染
     * 4. 注入设计器配置和上下文
     */
    createComponent(schema: IPublicTypeProjectSchema<IPublicTypeComponentSchema>): Component | null {
        // ===== 第1步：兼容 Legao Schema =====
        // 转换旧版本的 Schema 格式
        const _schema: IPublicTypeProjectSchema<IPublicTypeComponentSchema> = {
            ...schema,
            componentsTree: schema.componentsTree.map(compatibleLegaoSchema),
        };

        // 获取组件树的根节点
        const componentsTreeSchema = _schema.componentsTree[0];

        // ===== 第2步：注入组件 CSS 样式 =====
        // 如果组件定义了 CSS，将其注入到 document head
        if (componentsTreeSchema.componentName === 'Component' && componentsTreeSchema.css) {
            const doc = window.document;
            const s = doc.createElement('style');
            s.setAttribute('type', 'text/css');
            s.setAttribute('id', `Component-${componentsTreeSchema.id || ''}`);
            s.appendChild(doc.createTextNode(componentsTreeSchema.css || ''));
            doc.getElementsByTagName('head')[0].appendChild(s);
        }

        // 保存渲染器引用
        const renderer = this;

        // ===== 第3步：创建 React 组件类 =====
        /**
         * 低代码组件包装类
         *
         * 功能：将低代码 Schema 包装成标准 React 组件
         * 内部使用 LowCodeRenderer 完成实际渲染
         */
        class LowCodeComp extends React.Component<any, any> {
            render() {
                // 提取低代码组件的有效属性（过滤掉内部属性）
                const extraProps = getLowCodeComponentProps(this.props);

                // 使用 LowCodeRenderer 渲染低代码组件
                return createElement(LowCodeRenderer, {
                    ...extraProps,  // 防止覆盖下面内置属性

                    // --- 核心配置 ---
                    schema: componentsTreeSchema,  // 组件 Schema
                    components: renderer.components,  // 可用组件映射表
                    designMode: '',  // 空字符串表示非设计态

                    // --- 国际化配置 ---
                    locale: renderer.locale,  // 当前语言
                    messages: _schema.i18n || {},  // 国际化消息

                    // --- 设备和上下文 ---
                    device: renderer.device,  // 设备类型
                    appHelper: renderer.context,  // 应用上下文（utils、constants等）

                    // --- 渲染器配置 ---
                    rendererName: 'LowCodeRenderer',  // 渲染器名称
                    thisRequiredInJSE: host.thisRequiredInJSE,  // JSExpression 中是否需要 this

                    // --- 错误处理 ---
                    faultComponent: host.faultComponent,  // 通用错误组件
                    faultComponentMap: host.faultComponentMap,  // 特定组件错误组件

                    // --- 自定义创建元素 ---
                    /**
                     * 自定义 createElement 方法
                     * 用于在低代码组件内部拦截和处理组件创建
                     *
                     * @param Comp - 组件类型
                     * @param props - 属性
                     * @param children - 子元素
                     */
                    customCreateElement: (Comp: any, props: any, children: any) => {
                        // 获取组件元数据
                        const componentMeta = host.currentDocument?.getComponentMeta(Comp.displayName);

                        // 模态框组件不渲染（避免遮挡设计器）
                        if (componentMeta?.isModal) {
                            return null;
                        }

                        // 提取属性（移除内部属性）
                        const { __id, __designMode, ...viewProps } = props;

                        // 模拟 _leaf 对象，减少性能开销
                        // 低代码组件内部不需要完整的 Leaf 功能
                        const _leaf = {
                            isEmpty: () => false,  // 始终非空
                            isMock: true,  // 标记为模拟对象
                        };
                        viewProps._leaf = _leaf;

                        // 创建实际组件
                        return createElement(Comp, viewProps, children);
                    },
                });
            }
        }

        return LowCodeComp;
    }

    // ========== 公开方法：启动渲染器 ==========
    /**
     * 启动渲染器
     *
     * 功能：创建 DOM 容器并渲染整个应用
     *
     * 流程：
     * 1. 检查是否已经运行（防止重复运行）
     * 2. 创建或获取 DOM 容器
     * 3. 添加兼容性 CSS 类
     * 4. 渲染根组件
     * 5. 通知设计器渲染就绪
     */
    run() {
        // 防止重复运行
        if (this._running) {
            return;
        }
        this._running = true;

        // ===== 第1步：准备 DOM 容器 =====
        const containerId = 'app';
        let container = document.getElementById(containerId);
        if (!container) {
            // 容器不存在，创建新容器
            container = document.createElement('div');
            document.body.appendChild(container);
            container.id = containerId;
        }

        // ===== 第2步：添加兼容性 CSS 类 =====
        // 这些类名被样式系统依赖，必须添加
        document.documentElement.classList.add('engine-page');  // 页面级样式
        document.body.classList.add('engine-document');  // 文档级样式（important! Stylesheet.invoke depends）

        // ===== 第3步：渲染根组件 =====
        // 使用 React 18 之前的渲染方式
        reactRender(createElement(SimulatorRendererView, { rendererContainer: this }), container);

        // ===== 第4步：通知设计器渲染就绪 =====
        // 设计器需要知道渲染器已经准备好，可以开始交互
        host.project.setRendererReady(this);
    }

    // ========== 公开方法：刷新渲染器 ==========
    /**
     * 刷新渲染器
     *
     * 功能：强制重新渲染整个应用
     *
     * 实现：通过创建新的 appContext 对象触发 MobX 更新
     * TODO: 实现方式不太优雅，应该有更好的方法
     */
    rerender() {
        this.autoRender = true;  // 确保自动渲染开启
        // TODO: 不太优雅
        debugger;  // 调试断点，提醒开发者优化此处
        // 创建新对象触发 MobX 响应
        this._appContext = { ...this._appContext };
    }

    // ========== 公开方法：停止自动重绘节点 ==========
    /**
     * 停止自动重绘节点
     *
     * 用途：在大量更新时暂停重绘，提升性能
     */
    stopAutoRepaintNode() {
        this.autoRepaintNode = false;
    }

    // ========== 公开方法：启用自动重绘节点 ==========
    /**
     * 启用自动重绘节点
     *
     * 用途：恢复自动重绘
     */
    enableAutoRepaintNode() {
        this.autoRepaintNode = true;
    }

    // ========== 公开方法：销毁渲染器 ==========
    /**
     * 销毁渲染器，清理所有资源
     *
     * 清理内容：
     * 1. 执行所有注册的清理函数
     * 2. 销毁所有文档实例
     * 3. 清空组件映射和上下文
     *
     * 注意：使用 untracked 防止清理过程触发响应式更新
     */
    dispose() {
        // 执行所有清理函数（事件监听、订阅等）
        this.disposeFunctions.forEach((fn) => fn());

        // 销毁所有文档实例
        this.documentInstances.forEach((docInst) => docInst.dispose());

        // 清空数据（在 untracked 中执行，避免触发响应式更新）
        untracked(() => {
            this._componentsMap = {};  // 清空组件元数据
            this._components = null;  // 清空组件映射
            this._appContext = null;  // 清空应用上下文
        });
    }
}

// ==================== 内置组件 ====================
// Slot/Leaf and Fragment|FunctionComponent polyfill(ref)

/**
 * 内置组件映射
 *
 * Slot: 插槽容器组件
 * Leaf: 叶子节点组件（透传 children）
 */
const builtinComponents = {
    Slot,
    Leaf,
};

// ==================== React 内部 Key 缓存 ====================
/**
 * React 内部属性 key
 * 用于访问 React Fiber 节点
 * 不同版本的 React 使用不同的 key
 */
let REACT_KEY = '';

/**
 * 缓存 React 内部 key
 *
 * @param el - DOM 元素
 * @returns 相同的 DOM 元素
 *
 * 功能：
 * 1. 查找元素上的 React 内部属性 key
 * 2. React 16: __reactInternalInstance$...
 * 3. React 17+: __reactFiber$...
 * 4. 递归向上查找直到找到为止
 */
function cacheReactKey(el: Element): Element {
    // 如果已经缓存，直接返回
    if (REACT_KEY !== '') {
        return el;
    }

    // 查找 React 内部属性 key
    // react17 采用 __reactFiber 开头
    REACT_KEY =
        Object.keys(el).find((key) => key.startsWith('__reactInternalInstance$') || key.startsWith('__reactFiber$')) ||
        '';

    // 如果当前元素没找到，递归向父元素查找
    if (!REACT_KEY && (el as HTMLElement).parentElement) {
        return cacheReactKey((el as HTMLElement).parentElement!);
    }

    return el;
}

// ==================== 节点标记 Symbol ====================
/**
 * 节点 ID 标记
 * 在 React 实例上标记所属的低代码节点 ID
 */
const SYMBOL_VNID = Symbol('_LCNodeId');

/**
 * 文档 ID 标记
 * 在 React 实例上标记所属的文档 ID
 */
const SYMBOL_VDID = Symbol('_LCDocId');

// ==================== 辅助函数：获取最近的节点实例 ====================
/**
 * 从 React 实例或 DOM 元素查找最近的低代码节点实例
 *
 * @param from - React 实例或 DOM 元素
 * @param specId - 可选：指定要查找的节点 ID
 * @returns 节点实例信息或 null
 *
 * 查找策略：
 * 1. 如果是 DOM 元素，向上遍历 DOM 树查找
 * 2. 如果是 React 实例，向上遍历 Fiber 树查找
 * 3. 匹配 SYMBOL_VNID 标记
 */
function getClosestNodeInstance(from: ReactInstance, specId?: string): IPublicTypeNodeInstance<ReactInstance> | null {
    let el: any = from;

    if (el) {
        if (isElement(el)) {
            // DOM 元素：缓存 React key
            el = cacheReactKey(el);
        } else {
            // React 实例：从 Fiber 节点查找
            return getNodeInstance(getReactInternalFiber(el), specId);
        }
    }

    // 向上遍历 DOM 树
    while (el) {
        // 检查当前元素是否有节点 ID 标记
        if (SYMBOL_VNID in el) {
            const nodeId = el[SYMBOL_VNID];
            const docId = el[SYMBOL_VDID];

            // 如果指定了 specId，需要匹配；否则返回第一个找到的
            if (!specId || specId === nodeId) {
                return {
                    docId,
                    nodeId,
                    instance: el,
                };
            }
        }

        // 从元素获取 Fiber 节点，继续在 Fiber 树中查找
        if (el[REACT_KEY]) {
            return getNodeInstance(el[REACT_KEY], specId);
        }

        // 向上移动到父元素
        el = el.parentElement;
    }

    return null;
}

// ==================== 辅助函数：从 Fiber 节点获取节点实例 ====================
/**
 * 从 React Fiber 节点查找低代码节点实例
 *
 * @param fiberNode - React Fiber 节点
 * @param specId - 可选：指定要查找的节点 ID
 * @returns 节点实例信息或 null
 *
 * 查找策略：向上遍历 Fiber 树（return 链）
 */
function getNodeInstance(fiberNode: any, specId?: string): IPublicTypeNodeInstance<ReactInstance> | null {
    // 获取 Fiber 节点对应的组件实例
    const instance = fiberNode?.stateNode;

    // 检查实例是否有节点 ID 标记
    if (instance && SYMBOL_VNID in instance) {
        const nodeId = instance[SYMBOL_VNID];
        const docId = instance[SYMBOL_VDID];

        // 如果指定了 specId，需要匹配；否则返回第一个找到的
        if (!specId || specId === nodeId) {
            return {
                docId,
                nodeId,
                instance,
            };
        }
    }

    // 如果当前节点没找到且没有父节点，返回 null
    if (!instance && !fiberNode?.return) return null;

    // 向上递归到父 Fiber 节点
    return getNodeInstance(fiberNode?.return);
}

// ==================== 辅助函数：检查实例是否已挂载 ====================
/**
 * 检查 React 实例是否仍然挂载在 DOM 中
 *
 * @param instance - React 实例或 DOM 元素
 * @returns true - 已挂载，false - 已卸载
 *
 * 用途：过滤掉已经卸载的实例
 */
function checkInstanceMounted(instance: any): boolean {
    if (isElement(instance)) {
        // DOM 元素：检查是否在文档中
        return instance.parentElement != null && window.document.contains(instance);
    }
    // 组件实例：默认认为已挂载（React 会自动清理）
    return true;
}

// ==================== 辅助函数：提取低代码组件属性 ====================
/**
 * 从 props 中提取低代码组件的有效属性
 *
 * @param props - 原始 props
 * @returns 过滤后的 props
 *
 * 过滤规则：
 * - 移除内部属性：children、componentId、__designMode、_componentName、_leaf
 * - 将 _componentName 转换为 componentName
 */
function getLowCodeComponentProps(props: any) {
    // 非对象直接返回
    if (!props || !isPlainObject(props)) {
        return props;
    }

    const newProps: any = {};

    // 过滤属性
    Object.keys(props).forEach((k) => {
        // 跳过内部属性
        if (['children', 'componentId', '__designMode', '_componentName', '_leaf'].includes(k)) {
            return;
        }
        newProps[k] = props[k];
    });

    // 转换组件名
    newProps['componentName'] = props['_componentName'];

    return newProps;
}

// ==================== 导出默认实例 ====================
/**
 * 导出渲染器单例
 *
 * 全局唯一的渲染器实例，挂载到 window.SimulatorRenderer
 */
export default new SimulatorRendererContainer();
