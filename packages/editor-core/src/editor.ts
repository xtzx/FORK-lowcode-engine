/* eslint-disable no-console */
/* eslint-disable max-len */
import { StrictEventEmitter } from 'strict-event-emitter-types'; // 严格类型的事件发射器，提供类型安全的事件
import { EventEmitter } from 'events'; // Node.js 的事件发射器基类

import { EventBus, IEventBus } from './event-bus'; // 事件总线，用于全局事件通信
import {
    IPublicModelEditor, // Editor 的公共接口
    EditorConfig, // 编辑器配置类型
    PluginClassSet, // 插件类集合
    IPublicTypeEditorValueKey, // IoC 容器的键类型
    IPublicTypeEditorGetResult, // IoC 容器获取结果类型
    HookConfig, // 钩子配置
    IPublicTypeComponentDescription, // 本地组件描述
    IPublicTypeRemoteComponentDescription, // 远程组件描述
    GlobalEvent, // 全局事件类型定义
} from '../../types/src';
import { engineConfig } from './config'; // 引擎全局配置管理
import { globalLocale } from './intl'; // 国际化管理
import { obx } from './utils'; // MobX 响应式工具
import { IPublicTypeAssetsJson, AssetLoader } from '../../utils/src'; // 资源加载相关
import { assetsTransform } from './utils/assets-transform'; // 资源转换工具

// 设置事件监听器的最大数量，避免内存泄漏警告
EventEmitter.defaultMaxListeners = 100;

// 内部实例键的黑名单，这些键不应该被存储到配置中
// 因为它们是运行时的实例，而不是配置项
const keyBlacklist = [
    'designer', // 设计器实例
    'skeleton', // 骨架屏实例
    'currentDocument', // 当前文档实例
    'simulator', // 模拟器实例
    'plugins', // 插件管理器实例
    'setters', // 设置器管理器实例
    'material', // 物料管理器实例
    'innerHotkey', // 内部快捷键管理器
    'innerPlugins', // 内部插件管理器
];

// 远程组件资源缓存
// 用于缓存已加载的远程组件，避免重复加载
// key 是 exportName，value 是远程组件描述
const AssetsCache: {
    [key: string]: IPublicTypeRemoteComponentDescription;
} = {};

// Editor 类的接口声明，继承自 StrictEventEmitter
// 这里声明了所有 EventEmitter 的方法签名，确保类型安全
export declare interface Editor extends StrictEventEmitter<EventEmitter, GlobalEvent.EventConfig> {
    addListener(event: string | symbol, listener: (...args: any[]) => void): this; // 添加事件监听器
    once(event: string | symbol, listener: (...args: any[]) => void): this; // 添加一次性事件监听器
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this; // 移除事件监听器
    off(event: string | symbol, listener: (...args: any[]) => void): this; // removeListener 的别名
    removeAllListeners(event?: string | symbol): this; // 移除所有监听器
    setMaxListeners(n: number): this; // 设置最大监听器数量
    getMaxListeners(): number; // 获取最大监听器数量
    listeners(event: string | symbol): Function[]; // 获取指定事件的监听器列表
    rawListeners(event: string | symbol): Function[]; // 获取原始监听器列表
    listenerCount(type: string | symbol): number; // 获取监听器数量
    // Node 6+ 新增的方法
    prependListener(event: string | symbol, listener: (...args: any[]) => void): this; // 在监听器列表开头添加
    prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this; // 在开头添加一次性监听器
    eventNames(): Array<string | symbol>; // 获取所有事件名称
}

// Editor 的内部接口定义
export interface IEditor extends IPublicModelEditor {
    config?: EditorConfig; // 编辑器配置对象

    components?: PluginClassSet; // 插件组件集合

    eventBus: IEventBus; // 事件总线实例

    init(config?: EditorConfig, components?: PluginClassSet): Promise<any>; // 初始化方法
}

// eslint-disable-next-line no-redeclare
// Editor 核心类：整个低代码引擎的核心管理器
// 职责：
// 1. IoC 容器：管理所有服务实例的注册和获取
// 2. 事件中心：提供全局事件的发布和订阅
// 3. 资源管理：处理组件资源的加载和缓存
// 4. 生命周期管理：管理编辑器的初始化和销毁
export class Editor extends EventEmitter implements IEditor {
    /**
     * IoC 容器
     * 使用 Map 存储所有注册的服务实例
     * @obx.shallow 表示浅层响应式，只监听 Map 本身的变化，不深度监听值的变化
     */
    @obx.shallow private context = new Map<IPublicTypeEditorValueKey, any>();

    // 获取当前语言环境
    get locale() {
        return globalLocale.getLocale();
    }

    config?: EditorConfig; // 编辑器配置对象，在 init 时赋值

    eventBus: EventBus; // 事件总线实例，用于全局事件通信

    components?: PluginClassSet; // 插件组件集合，在 init 时赋值

    // readonly utils = utils;  // 工具函数集合（已注释）

    private hooks: HookConfig[] = []; // 钩子函数配置列表，用于生命周期管理

    // 等待队列：存储等待某个服务注册的回调函数
    // key: 服务键名
    // value: 等待该服务的回调函数数组
    private waits = new Map<
        IPublicTypeEditorValueKey,
        Array<{
            once?: boolean; // 是否只执行一次
            resolve: (data: any) => void; // 回调函数
        }>
    >();

    /**
     * 构造函数
     * @param viewName 视图名称，默认为 'global'
     * @param workspaceMode 是否为工作空间模式
     */
    constructor(readonly viewName: string = 'global', readonly workspaceMode: boolean = false) {
        // eslint-disable-next-line constructor-super
        super(); // 调用 EventEmitter 的构造函数
        // 设置全局事件监听器的最大数量，避免内存泄漏警告
        this.setMaxListeners(200);
        // 创建事件总线，传入 this 作为事件发射器
        this.eventBus = new EventBus(this);
    }

    /**
     * 从 IoC 容器获取服务实例
     * @param keyOrType 服务的键名或类型
     * @returns 服务实例，如果不存在则返回 undefined
     */
    get<T = undefined, KeyOrType = any>(keyOrType: KeyOrType): IPublicTypeEditorGetResult<T, KeyOrType> | undefined {
        return this.context.get(keyOrType as any);
    }

    /**
     * 检查 IoC 容器中是否存在指定服务
     * @param keyOrType 服务的键名或类型
     * @returns 是否存在
     */
    has(keyOrType: IPublicTypeEditorValueKey): boolean {
        return this.context.has(keyOrType);
    }

    /**
     * 向 IoC 容器注册服务
     * @param key 服务的键名
     * @param data 服务实例或数据
     * @returns void 或 Promise<void>（处理资源时返回 Promise）
     */
    set(key: IPublicTypeEditorValueKey, data: any): void | Promise<void> {
        // 特殊处理资源设置，需要异步加载远程组件
        if (key === 'assets') {
            return this.setAssets(data);
        }
        // 将数据同步存储到 engineConfig 中（黑名单中的键除外）
        // 黑名单中的键是运行时实例，不应该被持久化
        if (!keyBlacklist.includes(key as string)) {
            engineConfig.set(key as any, data);
        }
        // 存储到 IoC 容器
        this.context.set(key, data);
        // 通知所有等待该服务的回调函数
        this.notifyGot(key);
    }

    /**
     * 设置资源包（组件库、物料等）
     * 处理本地组件和远程组件，远程组件需要异步加载
     * @param assets 资源包配置
     * @returns Promise<void>
     */
    async setAssets(assets: IPublicTypeAssetsJson) {
        const { components } = assets;
        if (components && components.length) {
            // 将组件分为两类：本地组件和远程组件
            const componentDescriptions: IPublicTypeComponentDescription[] = []; // 本地组件
            const remoteComponentDescriptions: IPublicTypeRemoteComponentDescription[] = []; // 远程组件

            // 遍历所有组件，根据是否有 exportName 和 url 来判断是本地还是远程组件
            components.forEach((component: any) => {
                if (!component) {
                    return;
                }
                // 有 exportName 和 url 的是远程组件
                if (component.exportName && component.url) {
                    remoteComponentDescriptions.push(component);
                } else {
                    // 否则是本地组件
                    componentDescriptions.push(component);
                }
            });
            assets.components = componentDescriptions;
            assets.componentList = assets.componentList || [];

            // 如果有远程组件描述协议，则自动加载并补充到资产包中
            // 同时触发 designer.incrementalAssetsReady 通知组件面板更新数据
            if (remoteComponentDescriptions && remoteComponentDescriptions.length) {
                // 并行加载所有远程组件
                await Promise.all(
                    remoteComponentDescriptions.map(async (component: IPublicTypeRemoteComponentDescription) => {
                        const { exportName, url, npm } = component;
                        if (!url || !exportName) {
                            return;
                        }
                        // 检查缓存：如果组件未加载过，或版本有更新，则重新加载
                        if (
                            !AssetsCache[exportName] || // 未缓存
                            !npm?.version || // 无版本信息
                            AssetsCache[exportName].npm?.version !== npm?.version // 版本不匹配
                        ) {
                            // 使用 AssetLoader 加载远程组件脚本
                            await new AssetLoader().load(url);
                        }
                        // 更新缓存
                        AssetsCache[exportName] = component;

                        /**
                         * 设置组件资源到 assets 中
                         * @param component 组件对象
                         * @param extraNpmInfo 额外的 npm 信息
                         */
                        function setAssetsComponent(component: any, extraNpmInfo: any = {}) {
                            const { components } = component;
                            // 合并组件列表
                            assets.componentList = assets.componentList?.concat(component.componentList || []);
                            // 处理组件数组的情况
                            if (Array.isArray(components)) {
                                components.forEach((d) => {
                                    assets.components = assets.components.concat(
                                        {
                                            npm: {
                                                ...npm, // 继承父级 npm 信息
                                                ...extraNpmInfo, // 添加额外信息
                                            },
                                            ...d, // 组件配置
                                        } || [],
                                    );
                                });
                                return;
                            }
                            // 处理单个组件的情况
                            if (component.components) {
                                assets.components = assets.components.concat(
                                    {
                                        npm: {
                                            ...npm,
                                            ...extraNpmInfo,
                                        },
                                        ...component.components,
                                    } || [],
                                );
                            }
                        }

                        /**
                         * 处理数组类型的资源
                         * 递归处理嵌套数组，为每个元素生成 exportName 和 subName
                         * @param value 资源数组
                         * @param preExportName 前缀导出名
                         * @param preSubName 前缀子名称
                         */
                        function setArrayAssets(value: any[], preExportName: string = '', preSubName: string = '') {
                            value.forEach((d: any, i: number) => {
                                // 生成当前元素的导出名和子名称
                                const exportName = [preExportName, i.toString()].filter((d) => !!d).join('.');
                                const subName = [preSubName, i.toString()].filter((d) => !!d).join('.');
                                // 递归处理嵌套数组或设置组件
                                Array.isArray(d)
                                    ? setArrayAssets(d, exportName, subName) // 递归处理
                                    : setAssetsComponent(d, { // 设置组件
                                          exportName,
                                          subName,
                                      });
                            });
                        }
                        // 从全局对象获取加载的组件并处理
                        // 远程组件加载后会挂载到 window[exportName] 上
                        if ((window as any)[exportName]) {
                            // 判断是数组还是单个组件
                            if (Array.isArray((window as any)[exportName])) {
                                setArrayAssets((window as any)[exportName] as any);
                            } else {
                                setAssetsComponent((window as any)[exportName] as any);
                            }
                        }
                        return (window as any)[exportName];
                    }),
                );
            }
        }
        // 转换资源格式为内部格式
        const innerAssets = assetsTransform(assets);
        // 存储到 IoC 容器
        this.context.set('assets', innerAssets);
        // 通知所有等待资源的回调
        this.notifyGot('assets');
    }

    /**
     * 等待获取服务（一次性）
     * 如果服务已存在，立即返回；否则等待服务注册后返回
     * @param keyOrType 服务的键名或类型
     * @returns Promise，服务注册后 resolve
     */
    onceGot<T = undefined, KeyOrType extends IPublicTypeEditorValueKey = any>(
        keyOrType: KeyOrType,
    ): Promise<IPublicTypeEditorGetResult<T, KeyOrType>> {
        // 尝试立即获取服务
        const x = this.context.get(keyOrType);
        if (x !== undefined) {
            // 服务已存在，立即返回
            return Promise.resolve(x);
        }
        // 服务不存在，添加到等待队列
        return new Promise((resolve) => {
            this.setWait(keyOrType, resolve, true); // once = true，只触发一次
        });
    }

    /**
     * 监听服务注册（持续监听）
     * 如果服务已存在，立即调用回调；之后每次服务更新都会调用回调
     * @param keyOrType 服务的键名或类型
     * @param fn 回调函数
     * @returns 取消监听的函数
     */
    onGot<T = undefined, KeyOrType extends IPublicTypeEditorValueKey = any>(
        keyOrType: KeyOrType,
        fn: (data: IPublicTypeEditorGetResult<T, KeyOrType>) => void,
    ): () => void {
        // 如果服务已存在，立即调用回调
        const x = this.context.get(keyOrType);
        if (x !== undefined) {
            fn(x);
        }
        // 添加到等待队列，持续监听
        this.setWait(keyOrType, fn);
        // 返回取消监听的函数
        return () => {
            this.delWait(keyOrType, fn);
        };
    }

    /**
     * 监听服务变化（不立即调用）
     * 与 onGot 的区别是：即使服务已存在也不会立即调用回调
     * 只在服务后续更新时调用回调
     * @param keyOrType 服务的键名或类型
     * @param fn 回调函数
     * @returns 取消监听的函数
     */
    onChange<T = undefined, KeyOrType extends IPublicTypeEditorValueKey = any>(
        keyOrType: KeyOrType,
        fn: (data: IPublicTypeEditorGetResult<T, KeyOrType>) => void,
    ): () => void {
        // 直接添加到等待队列，不立即调用
        this.setWait(keyOrType, fn);
        return () => {
            this.delWait(keyOrType, fn);
        };
    }

    /**
     * 注册服务（set 方法的简化版）
     * @param data 服务实例
     * @param key 服务键名（可选，不提供则使用 data 本身作为键）
     */
    register(data: any, key?: IPublicTypeEditorValueKey): void {
        // 如果没有提供 key，则使用 data 本身作为键（适用于类实例）
        this.context.set(key || data, data);
        // 通知等待该服务的回调
        this.notifyGot(key || data);
    }

    /**
     * 初始化编辑器
     * 执行生命周期钩子，注册事件监听器
     * @param config 编辑器配置
     * @param components 组件集合
     * @returns Promise<boolean>
     */
    async init(config?: EditorConfig, components?: PluginClassSet): Promise<any> {
        this.config = config || {};
        this.components = components || {};
        const { hooks = [], lifeCycles } = this.config;

        // 触发初始化前事件
        this.emit('editor.beforeInit');

        // 获取生命周期初始化函数
        const init = (lifeCycles && lifeCycles.init) || ((): void => {});

        try {
            // 执行初始化生命周期函数
            await init(this);
            // 注册快捷键（注释表示待实现）
            // 注册钩子函数
            this.registerHooks(hooks);
            // 触发初始化后事件
            this.emit('editor.afterInit');

            return true;
        } catch (err) {
            console.error(err);
        }
    }

    /**
     * 销毁编辑器
     * 清理钩子函数，执行销毁生命周期
     */
    destroy(): void {
        if (!this.config) {
            return;
        }
        try {
            const { lifeCycles = {} } = this.config;

            // 清理所有注册的钩子函数
            this.unregisterHooks();

            // 执行销毁生命周期函数
            if (lifeCycles.destroy) {
                lifeCycles.destroy(this);
            }
        } catch (err) {
            console.warn(err);
        }
    }

    /**
     * 初始化钩子函数
     * 将所有钩子函数的第一个参数绑定为 editor 实例
     * @param hooks 钩子配置数组
     * @returns 处理后的钩子数组
     */
    initHooks = (hooks: HookConfig[]) => {
        this.hooks = hooks.map((hook) => ({
            ...hook,
            // 指定第一个参数为 editor，方便钩子函数访问 editor 实例
            handler: hook.handler.bind(this, this),
        }));

        return this.hooks;
    };

    /**
     * 注册钩子函数到事件系统
     * 根据钩子类型（on/once）添加事件监听器
     * @param hooks 钩子配置数组
     */
    registerHooks = (hooks: HookConfig[]) => {
        // 初始化钩子并遍历注册
        this.initHooks(hooks).forEach(({ message, type, handler }) => {
            // 只支持 'on' 和 'once' 两种类型
            if (['on', 'once'].indexOf(type) !== -1) {
                // 动态调用 this.on 或 this.once
                this[type](message as any, handler);
            }
        });
    };

    /**
     * 取消注册所有钩子函数
     * 从事件系统中移除所有钩子监听器
     */
    unregisterHooks = () => {
        this.hooks.forEach(({ message, handler }) => {
            // 移除事件监听器
            this.removeListener(message, handler);
        });
    };

    /**
     * 通知所有等待某个服务的回调函数
     * 当服务被注册或更新时调用
     * @param key 服务键名
     */
    private notifyGot(key: IPublicTypeEditorValueKey) {
        // 获取等待该服务的回调队列
        let waits = this.waits.get(key);
        if (!waits) {
            return;
        }
        // 复制数组并反转，确保按注册顺序调用
        waits = waits.slice().reverse();
        let i = waits.length;
        while (i--) {
            // 调用回调函数，传入服务实例
            waits[i].resolve(this.get(key));
            // 如果是一次性回调，则移除
            if (waits[i].once) {
                waits.splice(i, 1);
            }
        }
        // 更新或清理等待队列
        if (waits.length > 0) {
            this.waits.set(key, waits);
        } else {
            this.waits.delete(key);
        }
    }

    /**
     * 添加等待回调到队列
     * @param key 服务键名
     * @param resolve 回调函数
     * @param once 是否只执行一次
     */
    private setWait(key: IPublicTypeEditorValueKey, resolve: (data: any) => void, once?: boolean) {
        const waits = this.waits.get(key);
        if (waits) {
            // 如果已有等待队列，则添加到队列末尾
            waits.push({ resolve, once });
        } else {
            // 创建新的等待队列
            this.waits.set(key, [{ resolve, once }]);
        }
    }

    /**
     * 从等待队列中移除指定回调
     * @param key 服务键名
     * @param fn 要移除的回调函数
     */
    private delWait(key: IPublicTypeEditorValueKey, fn: any) {
        const waits = this.waits.get(key);
        if (!waits) {
            return;
        }
        // 从后向前遍历，安全删除元素
        let i = waits.length;
        while (i--) {
            if (waits[i].resolve === fn) {
                waits.splice(i, 1);
            }
        }
        // 如果队列为空，则删除整个键
        if (waits.length < 1) {
            this.waits.delete(key);
        }
    }
}

// 全局公共事件总线
// 用于跨模块、跨组件的事件通信
export const commonEvent = new EventBus(new EventEmitter());
