/* eslint-disable no-console */
/* eslint-disable max-len */
/* eslint-disable react/prop-types */
import { create as createDataSourceEngine } from '@alilc/lowcode-datasource-engine/interpret';
import classnames from 'classnames';

import {
    IPublicTypeNodeSchema,
    IPublicTypeNodeData,
    IPublicTypeJSONValue,
    IPublicTypeCompositeValue,
} from '../../../types/src';
import { checkPropTypes, isI18nData, isJSExpression, isJSFunction } from '../../../utils/src';
import adapter from '../adapter';
import divFactory from '../components/Div';
import visualDomFactory from '../components/VisualDom';
import contextFactory from '../context';
import {
    forEach,
    getValue,
    parseData,
    parseExpression,
    parseThisRequiredExpression,
    parseI18n,
    isEmpty,
    isSchema,
    isFileSchema,
    transformArrayToMap,
    transformStringToFunction,
    getI18n,
    getFileCssName,
    capitalizeFirstLetter,
    DataHelper,
    isVariable,
    isJSSlot,
} from '../utils';
import {
    IBaseRendererProps,
    INodeInfo,
    IBaseRenderComponent,
    IBaseRendererContext,
    IRendererAppHelper,
    DataSource,
} from '../types';
import { compWrapper } from '../hoc';
import { IComponentConstruct, leafWrapper } from '../hoc/leaf';
import logger from '../utils/logger';
import isUseLoop from '../utils/is-use-loop';

/**
 * 🔄 执行 Schema 中定义的生命周期方法
 *
 * 作用：在渲染器的生命周期钩子中，执行用户在 Schema 中定义的自定义生命周期逻辑
 *
 * 调用时机：
 * - constructor: 渲染器实例化时
 * - componentDidMount: 组件挂载后
 * - componentDidUpdate: 组件更新后
 * - componentWillUnmount: 组件卸载前
 * - render: 渲染前（可选）
 *
 * @param context - 执行上下文（渲染器实例 this），方法中的 this 将指向这个对象
 * @param schema - Schema 对象，包含 lifeCycles 配置
 * @param method - 生命周期方法名（如 'componentDidMount'）
 * @param args - 传递给生命周期方法的参数数组
 * @param thisRequiredInJSE - 是否在表达式中要求 this（严格模式）
 * @returns 生命周期方法的返回值
 *
 * 示例 Schema：
 * {
 *   componentName: 'Page',
 *   lifeCycles: {
 *     componentDidMount: {
 *       type: 'JSFunction',
 *       value: 'function() { console.log("页面已挂载", this.state); }'
 *     }
 *   }
 * }
 *
 * @PRIVATE 内部方法
 */
export function executeLifeCycleMethod(
    context: any,
    schema: IPublicTypeNodeSchema,
    method: string,
    args: any,
    thisRequiredInJSE: boolean | undefined,
): any {
    // 参数校验：确保 context、schema、method 都有效
    if (!context || !isSchema(schema) || !method) {
        return;
    }

    // 从 schema.lifeCycles 中获取生命周期方法配置
    const lifeCycleMethods = getValue(schema, 'lifeCycles', {});
    let fn = lifeCycleMethods[method];

    // 如果没有定义该生命周期方法，直接返回
    if (!fn) {
        return;
    }

    // TODO: cache - 可以缓存解析后的函数，避免重复解析（性能优化）
    // 如果是 JSExpression 或 JSFunction 类型，需要先解析成真正的函数
    if (isJSExpression(fn) || isJSFunction(fn)) {
        fn = thisRequiredInJSE ? parseThisRequiredExpression(fn, context) : parseExpression(fn, context);
    }

    // 类型检查：确保解析后是函数
    if (typeof fn !== 'function') {
        logger.error(`生命周期${method}类型不符`, fn);
        return;
    }

    // 执行生命周期方法，捕获可能的错误
    try {
        return fn.apply(context, args); // 使用 apply 绑定 this 为 context
    } catch (e) {
        logger.error(`[${schema.componentName}]生命周期${method}出错`, e);
    }
}

/**
 * 📦 获取 Schema 节点的子节点
 *
 * 作用：统一处理 schema.children 和 schema.props.children，返回合并后的子节点数组
 *
 * 为什么需要这个函数？
 * - Schema 的子节点可能定义在 schema.children 中
 * - 也可能定义在 schema.props.children 中（JSX 语法习惯）
 * - 甚至两者都有（需要合并）
 *
 * 优先级规则：
 * 1. 如果 schema.props 不存在，返回 schema.children
 * 2. 如果 schema.children 不存在，返回 schema.props.children
 * 3. 如果 schema.props.children 不存在，返回 schema.children
 * 4. 如果两者都存在，合并返回（先 schema.children，后 schema.props.children）
 *
 * @param schema - Schema 节点对象
 * @returns 子节点数组或单个子节点
 *
 * 示例：
 * // 情况1：只有 schema.children
 * { componentName: 'Div', children: [{ componentName: 'Text' }] }
 * // 返回：[{ componentName: 'Text' }]
 *
 * // 情况2：只有 schema.props.children
 * { componentName: 'Div', props: { children: [{ componentName: 'Text' }] } }
 * // 返回：[{ componentName: 'Text' }]
 *
 * // 情况3：两者都有（需要合并）
 * {
 *   componentName: 'Div',
 *   children: [{ componentName: 'Text1' }],
 *   props: { children: [{ componentName: 'Text2' }] }
 * }
 * // 返回：[{ componentName: 'Text1' }, { componentName: 'Text2' }]
 *
 * @PRIVATE 内部方法
 */
export function getSchemaChildren(schema: IPublicTypeNodeSchema | undefined) {
    // schema 不存在，返回 undefined
    if (!schema) {
        return;
    }

    // 情况1：schema.props 不存在，直接返回 schema.children
    if (!schema.props) {
        return schema.children;
    }

    // 情况2：schema.children 不存在，返回 schema.props.children
    if (!schema.children) {
        return schema.props.children;
    }

    // 情况3：schema.props.children 不存在，返回 schema.children
    if (!schema.props.children) {
        return schema.children;
    }

    // 情况4：两者都存在，需要合并
    // 创建新数组，先放入 schema.children
    let result = ([] as IPublicTypeNodeData[]).concat(schema.children);

    // 将 schema.props.children 合并进来
    if (Array.isArray(schema.props.children)) {
        // 如果是数组，展开合并
        result = result.concat(schema.props.children);
    } else {
        // 如果是单个元素，直接 push
        result.push(schema.props.children);
    }
    return result;
}

/**
 * 🏭 BaseRenderer 工厂函数
 *
 * 🎯 核心职责：
 * 创建所有渲染器的基类，提供 Schema → React 虚拟 DOM 的完整转换能力
 *
 * 🔥 主要实现的能力：
 * 1. Schema 转换引擎（__createVirtualDom）- 最核心
 * 2. 表达式解析（JSExpression、JSFunction、JSSlot）
 * 3. 循环渲染（loop 属性处理）
 * 4. 条件渲染（condition 属性处理）
 * 5. 属性解析（__parseProps 递归处理）
 * 6. 生命周期管理（constructor、componentDidMount 等）
 * 7. 数据源管理（dataSource 初始化和加载）
 * 8. 自定义方法绑定（schema.methods）
 * 9. 样式注入（schema.css）
 * 10. HOC 包装（leafWrapper、compWrapper）
 *
 * 🏗️ 为什么必须在此实现？
 * - 代码复用：所有渲染器（Page/Component/Block等）都需要这些能力
 * - 一致性保证：统一的转换逻辑确保不同类型的渲染器行为一致
 * - 职责清晰：BaseRenderer 负责通用逻辑，子类只需重写特殊逻辑（如 __afterInit）
 *
 * 🔄 继承关系：
 * BaseRenderer（本类）
 *   ↓ 被继承
 * PageRenderer / ComponentRenderer / BlockRenderer / AddonRenderer / TempRenderer
 *
 * @returns BaseRenderer 类（可被继承）
 */
export default function baseRendererFactory(): IBaseRenderComponent {
    // 检查是否已有自定义的 BaseRenderer（扩展机制）
    // 目前这个机制未启用，所以 customBaseRenderer 肯定不存在
    const { BaseRenderer: customBaseRenderer } = adapter.getRenderers();

    // 如果存在自定义 BaseRenderer，直接返回（扩展点）
    if (customBaseRenderer) {
        return customBaseRenderer;
    }

    // 从适配器获取 React 运行时 API（createElement、Component 等）
    const { Component, createElement } = adapter.getRuntime();

    // 创建内置组件
    const Div = divFactory();              // Div 组件（无 JSX，纯 createElement 实现）
    const VisualDom = visualDomFactory();  // VisualDom 组件（设计态占位符显示）
    const AppContext = contextFactory();   // AppContext（跨组件传递 appHelper、components、engine）

    // 设计模式常量
    const DESIGN_MODE = {
        EXTEND: 'extend',   // 扩展模式（设计态，显示边框）
        BORDER: 'border',   // 边框模式（设计态，显示边框）
        PREVIEW: 'preview', // 预览模式（半设计态）
    };

    // 需要特殊处理的浮层组件列表（在设计态需要包装 Div 容器）
    const OVERLAY_LIST = ['Dialog', 'Overlay', 'Animate', 'ConfigProvider'];

    // 循环渲染的默认参数名
    const DEFAULT_LOOP_ARG_ITEM = 'item';   // 默认循环项变量名：item
    const DEFAULT_LOOP_ARG_INDEX = 'index'; // 默认循环索引变量名：index

    // 作用域索引计数器（用于生成唯一的 lceKey）
    let scopeIdx = 0;

    /**
     * 🏗️ BaseRenderer 类
     *
     * 所有渲染器的基类，提供完整的 Schema → React 虚拟 DOM 转换能力
     *
     * 继承链：
     * React.Component
     *   ↓
     * BaseRenderer（本类）
     *   ↓
     * PageRenderer / ComponentRenderer / BlockRenderer / AddonRenderer / TempRenderer
     */
    return class BaseRenderer extends Component<IBaseRendererProps, Record<string, any>> {
        // 允许动态添加属性（如 schema.methods 中定义的方法会挂载到 this 上）
        [key: string]: any;

        // 组件显示名称（用于 React DevTools 调试）
        static displayName = 'BaseRenderer';

        // 默认 props
        static defaultProps = {
            __schema: {}, // 默认空 schema
        };

        // 绑定 AppContext（可通过 this.context 访问）
        static contextType = AppContext;

        // ========== 国际化相关属性 ==========
        i18n: any;        // 国际化翻译函数（如：this.i18n('app.title')）
        getLocale: any;   // 获取当前语言（如：'zh-CN'）
        setLocale: any;   // 设置当前语言

        // 数据源映射表（key: 数据源 id, value: 数据）
        // 例如：{ userInfo: { name: '张三', age: 30 } }
        dataSourceMap: Record<string, any> = {};

        // ========== 内部状态属性（以 __ 开头）==========

        // 命名空间（子类会重写，如 PageRenderer 的 __namespace = 'page'）
        __namespace = 'base';

        // 组件作用域缓存（用于 generateScope 机制）
        // key: lceKey, value: scope 对象
        __compScopes: Record<string, any> = {};

        // 实例映射表（通过 fieldId 或 ref 收集的组件实例）
        // 使用场景：this.$('myButton') 获取按钮实例
        __instanceMap: Record<string, any> = {};

        // 数据源助手实例（DataHelper 或 DataSourceEngine）
        __dataHelper: any;

        // 自定义方法列表（记录哪些方法是从 schema.methods 绑定的）
        // 用途：在 __bindCustomMethods 时先清理旧方法，避免内存泄漏
        __customMethodsList: any[] = [];

        // 表达式解析函数（在构造函数中初始化）
        __parseExpression: any;

        // 渲染器实例的 ref 引用
        __ref: any;

        // 样式元素引用（<style> 标签，用于注入 schema.css）
        __styleElement: any;

        /**
         * 🏗️ 构造函数
         *
         * 执行流程：
         * 1. 调用 super(props, context) - 初始化 React Component
         * 2. 初始化 __parseExpression 方法
         * 3. 调用 __beforeInit(props) - 初始化前钩子（子类可重写，默认为空）
         * 4. 调用 __init(props) - 初始化（绑定 schema.methods）
         * 5. 调用 __afterInit(props) - 初始化后钩子（子类必须重写）
         *
         * 子类重写 __afterInit 的示例：
         * - PageRenderer: 注入 this.page、初始化 state 和 dataSource
         * - ComponentRenderer: 注入 this.component、初始化 state 和 dataSource
         * - BlockRenderer: 生成空上下文
         *
         * @param props - 渲染器属性
         * @param context - AppContext 上下文
         */
        constructor(props: IBaseRendererProps, context: IBaseRendererContext) {
            // 调用父类构造函数
            super(props, context);

            // 保存 context 引用（虽然可通过 this.context 访问，但显式保存更清晰）
            this.context = context;

            // 初始化表达式解析函数
            // 作用：将 JSExpression 字符串转换为可执行的函数或值
            // 例如：{ type: 'JSExpression', value: 'this.state.count + 1' } → 6（假设 count = 5）
            this.__parseExpression = (str: string, self: any) => {
                return parseExpression({
                    str,                               // 表达式对象
                    self,                              // 执行上下文（this）
                    thisRequired: props?.thisRequiredInJSE,  // 是否要求严格的 this
                    logScope: props.componentName,     // 日志作用域（用于错误提示）
                });
            };

            // 🔥 三段式初始化钩子（设计模式：模板方法模式）
            this.__beforeInit(props); // 初始化前（子类可重写，默认为空）
            this.__init(props);       // 初始化（绑定自定义方法）
            this.__afterInit(props);  // 初始化后（子类必须重写，注入上下文、state、dataSource）

            // 调试日志
            this.__debug(`constructor - ${props?.__schema?.fileName}`);
        }

        /**
         * 🔧 初始化前钩子
         *
         * 作用：在构造函数最开始调用，子类可重写
         * 默认实现：空方法
         *
         * 调用时机：constructor → __beforeInit → __init → __afterInit
         *
         * @param _props - 渲染器属性（未使用，占位参数）
         */
        __beforeInit(_props: IBaseRendererProps) {}

        /**
         * 🔧 初始化钩子
         *
         * 作用：执行通用初始化逻辑
         *
         * 初始化内容：
         * 1. 重置组件作用域缓存（__compScopes）
         * 2. 重置实例映射表（__instanceMap）
         * 3. 绑定自定义方法（schema.methods）
         * 4. 初始化国际化 API（i18n、getLocale、setLocale）
         *
         * 调用时机：constructor → __beforeInit → __init → __afterInit
         *
         * @param props - 渲染器属性
         */
        __init(props: IBaseRendererProps) {
            this.__compScopes = {};        // 重置作用域缓存
            this.__instanceMap = {};       // 重置实例映射表
            this.__bindCustomMethods(props); // 绑定 schema.methods 中的方法到 this
            this.__initI18nAPIs();         // 初始化国际化 API
        }

        /**
         * 🔧 初始化后钩子（子类必须重写）
         *
         * 作用：子类特定的初始化逻辑
         * 默认实现：空方法
         *
         * 子类重写示例：
         * - PageRenderer: 注入 this.page、初始化 state、初始化 dataSource
         * - ComponentRenderer: 注入 this.component、初始化 state、初始化 dataSource
         * - BlockRenderer: 生成空上下文
         *
         * 调用时机：constructor → __beforeInit → __init → __afterInit
         *
         * @param _props - 渲染器属性（未使用，占位参数）
         */
        __afterInit(_props: IBaseRendererProps) {}

        /**
         * 🔄 静态生命周期：从 props 派生 state
         *
         * React 16.3+ 的新生命周期方法
         *
         * 作用：
         * 在组件实例化和接收新 props 时调用，返回一个对象来更新 state
         *
         * 执行流程：
         * 1. 检查 schema.lifeCycles.getDerivedStateFromProps 是否存在
         * 2. 如果存在，执行用户定义的逻辑
         * 3. 返回 state 更新对象（或 null 表示不更新）
         *
         * 注意：这是静态方法，无法访问 this
         *
         * @param props - 新的 props
         * @param state - 当前 state
         * @returns state 更新对象或 null
         */
        static getDerivedStateFromProps(props: IBaseRendererProps, state: any) {
            const result = executeLifeCycleMethod(
                this,                             // this 指向类本身（静态方法）
                props?.__schema,
                'getDerivedStateFromProps',       // 生命周期方法名
                [props, state],                   // 参数数组
                props.thisRequiredInJSE,
            );

            // 如果返回 undefined，转换为 null（React 要求）
            return result === undefined ? null : result;
        }

        /**
         * 🔄 生命周期：更新前快照
         *
         * React 16.3+ 的生命周期方法
         *
         * 作用：
         * 在最近一次渲染输出（提交到 DOM 节点）之前调用
         * 返回值将作为第三个参数传递给 componentDidUpdate
         *
         * 使用场景：
         * 捕获 DOM 更新前的信息（如滚动位置）
         *
         * @param args - 传递给生命周期方法的参数
         */
        async getSnapshotBeforeUpdate(...args: any[]) {
            this.__executeLifeCycleMethod('getSnapshotBeforeUpdate', args);
            this.__debug(`getSnapshotBeforeUpdate - ${this.props?.__schema?.fileName}`);
        }

        /**
         * 🔄 生命周期：组件挂载后
         *
         * 作用：
         * 组件第一次渲染到 DOM 后调用
         *
         * 执行内容：
         * 1. 🔥 加载数据源（isInit: true 的数据源会自动请求）
         * 2. 执行用户定义的 componentDidMount 生命周期
         *
         * 典型使用场景：
         * - 发起网络请求
         * - 订阅事件
         * - 初始化第三方库
         *
         * @param args - 传递给生命周期方法的参数
         */
        async componentDidMount(...args: any[]) {
            this.reloadDataSource(); // 🔥 加载数据源（重要）
            this.__executeLifeCycleMethod('componentDidMount', args);
            this.__debug(`componentDidMount - ${this.props?.__schema?.fileName}`);
        }

        /**
         * 🔄 生命周期：组件更新后
         *
         * 作用：
         * 组件更新（props 或 state 变化）后调用
         *
         * 执行内容：
         * 执行用户定义的 componentDidUpdate 生命周期
         *
         * 典型使用场景：
         * - 对比 props 变化，决定是否发起新请求
         * - 操作 DOM（基于新数据）
         *
         * @param args - 传递给生命周期方法的参数
         *              通常包括：[prevProps, prevState, snapshot]
         */
        async componentDidUpdate(...args: any[]) {
            this.__executeLifeCycleMethod('componentDidUpdate', args);
            this.__debug(`componentDidUpdate - ${this.props.__schema.fileName}`);
        }

        /**
         * 🔄 生命周期：组件卸载前
         *
         * 作用：
         * 组件从 DOM 移除前调用
         *
         * 执行内容：
         * 执行用户定义的 componentWillUnmount 生命周期
         *
         * 典型使用场景：
         * - 清理定时器
         * - 取消网络请求
         * - 取消订阅
         * - 释放资源
         *
         * @param args - 传递给生命周期方法的参数
         */
        async componentWillUnmount(...args: any[]) {
            this.__executeLifeCycleMethod('componentWillUnmount', args);
            this.__debug(`componentWillUnmount - ${this.props?.__schema?.fileName}`);
        }

        /**
         * 🔄 生命周期：捕获错误
         *
         * 作用：
         * 子组件树中任何组件抛出错误时调用
         *
         * 执行内容：
         * 1. 执行用户定义的 componentDidCatch 生命周期
         * 2. 记录错误日志
         *
         * 典型使用场景：
         * - 记录错误到日志服务
         * - 显示错误 UI
         *
         * @param args - 错误参数，通常包括：[error, errorInfo]
         */
        async componentDidCatch(...args: any[]) {
            this.__executeLifeCycleMethod('componentDidCatch', args);
            logger.warn(args); // 记录警告日志
        }

        /**
         * 📡 重新加载数据源
         *
         * 作用：
         * 重新请求所有标记为 isInit: true 的数据源
         *
         * 执行流程：
         * 1. 检查 __dataHelper 是否存在
         * 2. 调用 __dataHelper.getInitData() 获取数据
         * 3. 如果有数据，调用 setState 更新状态
         * 4. 如果没有数据，调用 forceUpdate 强制刷新
         *
         * 使用场景：
         * - componentDidMount 时自动调用（初始加载）
         * - 用户手动调用 this.reloadDataSource()（刷新数据）
         * - 筛选条件变化时重新加载数据
         *
         * 示例：
         * // Schema 中的 methods
         * methods: {
         *   handleRefresh() {
         *     this.reloadDataSource(); // 刷新数据
         *   }
         * }
         *
         * @returns Promise - resolve 时传递数据对象，reject 时传递错误
         */
        reloadDataSource = () => new Promise((resolve, reject) => {
                this.__debug('reload data source');

                // 如果没有数据助手，直接 resolve
                if (!this.__dataHelper) {
                    return resolve({});
                }

                // 获取初始数据（isInit: true 的数据源）
                this.__dataHelper
                    .getInitData()
                    .then((res: any) => {
                        // 如果没有数据，强制更新视图
                        if (isEmpty(res)) {
                            this.forceUpdate();
                            return resolve({});
                        }
                        // 有数据，更新 state
                        this.setState(res, resolve as () => void);
                    })
                    .catch((err: Error) => {
                        reject(err); // 捕获错误
                    });
            });

        /**
         * 🔄 是否应该更新组件
         *
         * React 性能优化方法
         *
         * 作用：
         * 决定组件是否需要重新渲染
         *
         * 特殊逻辑：
         * 如果 Schema 发生变化（getSchemaChangedSymbol 返回 true）
         * 且容器支持 rerender，则触发容器级重渲染，当前组件不更新
         *
         * 这是设计态的优化：
         * - Schema 变化时，重渲染整个画布
         * - 避免单个组件的局部更新导致状态不一致
         *
         * @returns boolean - true 表示应该更新，false 表示不更新
         */
        shouldComponentUpdate() {
            // 检查 Schema 是否变化
            if (this.props.getSchemaChangedSymbol?.() && this.props.__container?.rerender) {
                // Schema 变化，触发容器重渲染
                this.props.__container?.rerender();
                return false; // 当前组件不更新
            }
            return true; // 正常更新
        }

        /**
         * 🔄 强制更新组件
         *
         * 重写 React.Component.forceUpdate
         *
         * 作用：
         * 跳过 shouldComponentUpdate，强制重新渲染
         *
         * 优化：
         * 在调用 super.forceUpdate() 前，先检查 shouldComponentUpdate
         * 避免不必要的强制更新
         *
         * 使用场景：
         * - 数据源加载完成但没有数据时
         * - 需要立即刷新视图但 state 没变化时
         */
        forceUpdate() {
            // 只有 shouldComponentUpdate 返回 true 时才强制更新
            if (this.shouldComponentUpdate()) {
                super.forceUpdate(); // 调用父类的 forceUpdate
            }
        }

        /**
         * 🔄 执行生命周期方法（内部方法）
         *
         * 作用：
         * 调用 schema.lifeCycles 中定义的生命周期方法
         *
         * 执行流程：
         * 1. 从 schema.lifeCycles 获取方法
         * 2. 解析 JSExpression 或 JSFunction
         * 3. 绑定 this 上下文
         * 4. 执行方法
         *
         * @param method - 生命周期方法名
         *                 可选值：'constructor', 'componentDidMount', 'componentDidUpdate',
         *                        'componentWillUnmount', 'render' 等
         * @param args - 传递给生命周期方法的参数
         *
         * @PRIVATE 内部方法
         */
        __executeLifeCycleMethod = (method: string, args?: any) => {
            executeLifeCycleMethod(this, this.props.__schema, method, args, this.props.thisRequiredInJSE);
        };

        /**
         * 🔍 获取组件视图（遗留方法）
         *
         * 作用：
         * 根据组件名称获取组件类
         *
         * 历史原因：
         * 早期版本使用单下划线 _ 表示私有方法
         * 现在改用双下划线 __，但保留此方法兼容性
         *
         * @param componentName - 组件名称（如 'Button'）
         * @returns 组件类或 undefined
         *
         * @LEGACY 遗留方法，不推荐使用
         * @deprecated 请使用 this.props.__components[componentName] 代替
         */
        _getComponentView = (componentName: string) => {
            const { __components } = this.props;

            // 如果没有组件映射表，返回 undefined
            if (!__components) {
                return;
            }

            // 返回对应的组件类
            return __components[componentName];
        };

        __bindCustomMethods = (props: IBaseRendererProps) => {
            const { __schema } = props;
            const customMethodsList = Object.keys(__schema.methods || {}) || [];

            (this.__customMethodsList || []).forEach((item: any) => {
                if (!customMethodsList.includes(item)) {
                    delete this[item];
                }
            });

            this.__customMethodsList = customMethodsList;

            forEach(__schema.methods, (val: any, key: string) => {
                let value = val;
                if (isJSExpression(value) || isJSFunction(value)) {
                    value = this.__parseExpression(value, this);
                }
                if (typeof value !== 'function') {
                    logger.error(`custom method ${key} can not be parsed to a valid function`, value);
                    return;
                }
                this[key] = value.bind(this);
            });
        };

        __generateCtx = (ctx: Record<string, any>) => {
            const { pageContext, compContext } = this.context;
            const obj = {
                page: pageContext,
                component: compContext,
                ...ctx,
            };
            forEach(obj, (val: any, key: string) => {
                this[key] = val;
            });
        };

        __parseData = (data: any, ctx?: Record<string, any>) => {
            const { __ctx, thisRequiredInJSE, componentName } = this.props;
            return parseData(data, ctx || __ctx || this, { thisRequiredInJSE, logScope: componentName });
        };

        __initDataSource = (props: IBaseRendererProps) => {
            if (!props) {
                return;
            }

            const schema = props.__schema || {};
            const defaultDataSource: DataSource = {
                list: [],
            };
            const dataSource = schema.dataSource || defaultDataSource;
            // requestHandlersMap 存在才走数据源引擎方案
            // TODO: 下面if else 抽成独立函数
            const useDataSourceEngine = !!props.__appHelper?.requestHandlersMap;

            if (useDataSourceEngine) {
                this.__dataHelper = {
                    updateConfig: (updateDataSource: any) => {
                        const { dataSourceMap, reloadDataSource } = createDataSourceEngine(
                            updateDataSource ?? {},
                            this,
                            props.__appHelper.requestHandlersMap
                                ? { requestHandlersMap: props.__appHelper.requestHandlersMap }
                                : undefined,
                        );

                        this.reloadDataSource = () => new Promise((resolve) => {
                                this.__debug('reload data source');
                                reloadDataSource().then(() => {
                                    resolve({});
                                });
                            });
                        return dataSourceMap;
                    },
                };
                this.dataSourceMap = this.__dataHelper.updateConfig(dataSource);
            } else {
                const appHelper = props.__appHelper;
                this.__dataHelper = new DataHelper(this, dataSource, appHelper, (config: any) => this.__parseData(config));
                this.dataSourceMap = this.__dataHelper.dataSourceMap;
                this.reloadDataSource = () => new Promise((resolve, reject) => {
                        this.__debug('reload data source');
                        if (!this.__dataHelper) {
                            return resolve({});
                        }
                        this.__dataHelper
                            .getInitData()
                            .then((res: any) => {
                                if (isEmpty(res)) {
                                    return resolve({});
                                }
                                this.setState(res, resolve as () => void);
                            })
                            .catch((err: Error) => {
                                reject(err);
                            });
                    });
            }
        };

        /**
         * init i18n apis
         * @PRIVATE
         */
        __initI18nAPIs = () => {
            this.i18n = (key: string, values = {}) => {
                const { locale, messages } = this.props;
                return getI18n(key, values, locale, messages);
            };
            this.getLocale = () => this.props.locale;
            this.setLocale = (loc: string) => {
                const setLocaleFn = this.appHelper?.utils?.i18n?.setLocale;
                if (!setLocaleFn || typeof setLocaleFn !== 'function') {
                    logger.warn('initI18nAPIs Failed, i18n only works when appHelper.utils.i18n.setLocale() exists');
                    return undefined;
                }
                return setLocaleFn(loc);
            };
        };

        /**
         * write props.__schema.css to document as a style element,
         * which will be added once and only once.
         * @PRIVATE
         */
        __writeCss = (props: IBaseRendererProps) => {
            const css = getValue(props.__schema, 'css', '');
            this.__debug('create this.styleElement with css', css);
            let style = this.__styleElement;
            if (!this.__styleElement) {
                style = document.createElement('style');
                style.type = 'text/css';
                style.setAttribute('from', 'style-sheet');

                const head = document.head || document.getElementsByTagName('head')[0];
                head.appendChild(style);
                this.__styleElement = style;
                this.__debug('this.styleElement is created', this.__styleElement);
            }

            if (style.innerHTML === css) {
                return;
            }

            style.innerHTML = css;
        };

        __render = () => {
            const schema = this.props.__schema;
            this.__executeLifeCycleMethod('render');
            this.__writeCss(this.props);

            const { engine } = this.context;
            if (engine) {
                engine.props.onCompGetCtx(schema, this);
                // 画布场景才需要每次渲染bind自定义方法
                if (this.__designModeIsDesign) {
                    this.__bindCustomMethods(this.props);
                    this.dataSourceMap = this.__dataHelper?.updateConfig(schema.dataSource);
                }
            }
        };

        __getRef = (ref: any) => {
            const { engine } = this.context;
            const { __schema } = this.props;
            ref && engine?.props?.onCompGetRef(__schema, ref);
            this.__ref = ref;
        };

        /**
         * 创建 DOM 结构
         * 根组件的入口方法，开始递归渲染整个组件树
         */
        __createDom = () => {
            const { __schema, __ctx, __components = {} } = this.props;
            // 合并默认属性和传入属性
            const scopeProps = {
                ...__schema.defaultProps,
                ...this.props,
            };
            // 创建作用域对象，用于表达式解析
            const scope: any = {
                props: scopeProps,
            };
            // 设置原型链，使得可以访问 this 上下文
            scope.__proto__ = __ctx || this;

            const _children = getSchemaChildren(__schema);
            let Comp = __components[__schema.componentName];

            if (!Comp) {
                this.__debug(`${__schema.componentName} is invalid!`);
            }
            const parentNodeInfo = {
                schema: __schema,
                Comp: this.__getHOCWrappedComponent(Comp, __schema, scope),
            } as INodeInfo;
            return this.__createVirtualDom(_children, scope, parentNodeInfo);
        };

        /**
         * 核心 Schema 转换引擎
         * 递归地将 Schema 结构转换为 React 虚拟 DOM
         * 这是整个渲染器的核心方法，处理各种类型的 Schema 节点
         *
         * @param originalSchema - 原始 Schema 数据，可以是：
         *                        - 单个节点对象
         *                        - 节点数组
         *                        - JSExpression/JSFunction
         *                        - 基础类型（string/number/boolean）
         * @param originalScope - 当前作用域，包含：
         *                       - props: 组件属性
         *                       - state: 组件状态
         *                       - this: 组件实例
         *                       - 循环变量（item, index 等）
         * @param parentInfo - 父组件信息，包含父组件的 schema 和 Comp
         * @param idx - 循环索引，用于生成唯一的 React key
         * @returns React 元素、元素数组或 null
         */
        __createVirtualDom = (
            originalSchema: IPublicTypeNodeData | IPublicTypeNodeData[] | undefined,
            originalScope: any,
            parentInfo: INodeInfo,
            idx: string | number = '',
        ): any => {
            if (originalSchema === null || originalSchema === undefined) {
                return null;
            }
            let scope = originalScope;
            let schema = originalSchema;
            const { engine } = this.context || {};
            if (!engine) {
                this.__debug('this.context.engine is invalid!');
                return null;
            }
            try {
                const { __appHelper: appHelper, __components: components = {} } = this.props || {};

                // ========== 处理特殊类型的 Schema ==========

                // 1. JSExpression: JavaScript 表达式
                // 例如: { type: 'JSExpression', value: 'this.state.count + 1' }
                if (isJSExpression(schema)) {
                    return this.__parseExpression(schema, scope);
                }

                // 2. 国际化数据
                // 例如: { type: 'i18n', key: 'app.title' }
                if (isI18nData(schema)) {
                    return parseI18n(schema, scope);
                }

                // 3. 插槽
                // 例如: { type: 'JSSlot', value: [...] }
                if (isJSSlot(schema)) {
                    return this.__createVirtualDom(schema.value, scope, parentInfo);
                }

                // ========== 处理基础类型 ==========

                // 4. 字符串：直接作为文本节点返回
                if (typeof schema === 'string') {
                    return schema;
                }

                // 5. 数字和布尔值：转换为字符串
                if (typeof schema === 'number' || typeof schema === 'boolean') {
                    return String(schema);
                }

                // 6. 数组：递归处理每个元素
                if (Array.isArray(schema)) {
                    // 优化：只有一个元素时直接返回
                    if (schema.length === 1) {
                        return this.__createVirtualDom(schema[0], scope, parentInfo);
                    }
                    // 递归处理每个子元素
                    return schema.map((item, idy) => this.__createVirtualDom(
                            item,
                            scope,
                            parentInfo,
                            // 如果有自定义 key 则使用，否则使用索引
                            (item as IPublicTypeNodeSchema)?.__ctx?.lceKey ? '' : String(idy),
                        ));
                }

                // @ts-expect-error 如果直接转换好了，可以返回
                if (schema.$$typeof) {
                    return schema;
                }

                const _children = getSchemaChildren(schema);
                if (!schema.componentName) {
                    logger.error('The componentName in the schema is invalid, please check the schema: ', schema);
                    return;
                }
                // 解析占位组件
                if (schema.componentName === 'Fragment' && _children) {
                    const tarChildren = isJSExpression(_children)
                        ? this.__parseExpression(_children, scope)
                        : _children;
                    return this.__createVirtualDom(tarChildren, scope, parentInfo);
                }

                if (schema.componentName === 'Text' && typeof schema.props?.text === 'string') {
                    const text: string = schema.props?.text;
                    schema = { ...schema };
                    schema.children = [text];
                }

                if (!isSchema(schema)) {
                    return null;
                }
                let Comp =
                    components[schema.componentName] || this.props.__container?.components?.[schema.componentName];

                // 容器类组件的上下文通过props传递，避免context传递带来的嵌套问题
                const otherProps: any = isFileSchema(schema)
                    ? {
                          __schema: schema,
                          __appHelper: appHelper,
                          __components: components,
                      }
                    : {};

                if (!Comp) {
                    logger.error(
                        `${schema.componentName} component is not found in components list! component list is:`,
                        components || this.props.__container?.components,
                    );
                    return engine.createElement(
                        engine.getNotFoundComponent(),
                        {
                            componentName: schema.componentName,
                            componentId: schema.id,
                            enableStrictNotFoundMode: engine.props.enableStrictNotFoundMode,
                            ref: (ref: any) => {
                                ref && engine.props?.onCompGetRef(schema, ref);
                            },
                        },
                        this.__getSchemaChildrenVirtualDom(schema, scope, Comp),
                    );
                }

                // ========== 处理循环渲染 ==========
                // 如果存在 loop 属性，表示需要循环渲染该组件
                if (schema.loop != null) {
                    // 解析循环数据，可能是数组或表达式
                    const loop = this.__parseData(schema.loop, scope);
                    // 空数组不渲染
                    if (Array.isArray(loop) && loop.length === 0) return null;
                    const useLoop = isUseLoop(loop, this.__designModeIsDesign);
                    if (useLoop) {
                        // 进入循环渲染逻辑
                        return this.__createLoopVirtualDom(
                            {
                                ...schema,
                                loop,
                            },
                            scope,
                            parentInfo,
                            idx,
                        );
                    }
                }
                const condition = schema.condition == null ? true : this.__parseData(schema.condition, scope);

                // DesignMode 为 design 情况下，需要进入 leaf Hoc，进行相关事件注册
                const displayInHook = this.__designModeIsDesign;
                if (!condition && !displayInHook) {
                    return null;
                }

                let scopeKey = '';
                // 判断组件是否需要生成scope，且只生成一次，挂在this.__compScopes上
                if (Comp.generateScope) {
                    const key = this.__parseExpression(schema.props?.key, scope);
                    if (key) {
                        // 如果组件自己设置key则使用组件自己的key
                        scopeKey = key;
                    } else if (!schema.__ctx) {
                        // 在生产环境schema没有__ctx上下文，需要手动生成一个lceKey
                        schema.__ctx = {
                            lceKey: `lce${++scopeIdx}`,
                        };
                        scopeKey = schema.__ctx.lceKey;
                    } else {
                        // 需要判断循环的情况
                        scopeKey = schema.__ctx.lceKey + (idx !== undefined ? `_${idx}` : '');
                    }
                    if (!this.__compScopes[scopeKey]) {
                        this.__compScopes[scopeKey] = Comp.generateScope(this, schema);
                    }
                }
                // 如果组件有设置scope，需要为组件生成一个新的scope上下文
                if (scopeKey && this.__compScopes[scopeKey]) {
                    const compSelf = { ...this.__compScopes[scopeKey] };
                    compSelf.__proto__ = scope;
                    scope = compSelf;
                }

                if (engine.props?.designMode) {
                    otherProps.__designMode = engine.props.designMode;
                }
                if (this.__designModeIsDesign) {
                    otherProps.__tag = Math.random();
                }
                const componentInfo: any = {};
                const props: any =
                    this.__getComponentProps(schema, scope, Comp, {
                        ...componentInfo,
                        props: transformArrayToMap(componentInfo.props, 'name'),
                    }) || {};

                this.__componentHOCs.forEach((ComponentConstruct: IComponentConstruct) => {
                    Comp = ComponentConstruct(Comp, {
                        schema,
                        componentInfo,
                        baseRenderer: this,
                        scope,
                    });
                });

                otherProps.ref = (ref: any) => {
                    this.$(props.fieldId || props.ref, ref); // 收集ref
                    const refProps = props.ref;
                    if (refProps && typeof refProps === 'string') {
                        this[refProps] = ref;
                    }
                    ref && engine.props?.onCompGetRef(schema, ref);
                };

                // scope需要传入到组件上
                if (scopeKey && this.__compScopes[scopeKey]) {
                    props.__scope = this.__compScopes[scopeKey];
                }
                if (schema?.__ctx?.lceKey) {
                    if (!isFileSchema(schema)) {
                        engine.props?.onCompGetCtx(schema, scope);
                    }
                    props.key =
                        props.key || `${schema.__ctx.lceKey}_${schema.__ctx.idx || 0}_${idx !== undefined ? idx : ''}`;
                } else if ((typeof idx === 'number' || typeof idx === 'string') && !props.key) {
                    // 仅当循环场景走这里
                    props.key = idx;
                }

                props.__id = schema.id;
                if (!props.key) {
                    props.key = props.__id;
                }

                let child = this.__getSchemaChildrenVirtualDom(schema, scope, Comp, condition);
                const renderComp = (innerProps: any) => engine.createElement(Comp, innerProps, child);
                // 设计模式下的特殊处理
                if (engine && [DESIGN_MODE.EXTEND, DESIGN_MODE.BORDER].includes(engine.props.designMode)) {
                    // 对于overlay,dialog等组件为了使其在设计模式下显示，外层需要增加一个div容器
                    if (OVERLAY_LIST.includes(schema.componentName)) {
                        const { ref, ...overlayProps } = otherProps;
                        return createElement(
                            Div,
                            {
                                ref,
                                __designMode: engine.props.designMode,
                            },
                            renderComp({ ...props, ...overlayProps }),
                        );
                    }
                    // 虚拟dom显示
                    if (componentInfo?.parentRule) {
                        const parentList = componentInfo.parentRule.split(',');
                        const { schema: parentSchema = { componentName: '' }, Comp: parentComp } = parentInfo;
                        if (
                            !parentList.includes(parentSchema.componentName) ||
                            parentComp !== components[parentSchema.componentName]
                        ) {
                            props.__componentName = schema.componentName;
                            Comp = VisualDom;
                        } else {
                            // 若虚拟dom在正常的渲染上下文中，就不显示设计模式了
                            props.__disableDesignMode = true;
                        }
                    }
                }
                return renderComp({
                    ...props,
                    ...otherProps,
                    __inner__: {
                        hidden: schema.hidden,
                        condition,
                    },
                });
            } catch (e) {
                return engine.createElement(engine.getFaultComponent(), {
                    error: e,
                    schema,
                    self: scope,
                    parentInfo,
                    idx,
                });
            }
        };

        /**
         * get Component HOCs
         *
         * @readonly
         * @type {IComponentConstruct[]}
         */
        get __componentHOCs(): IComponentConstruct[] {
            if (this.__designModeIsDesign) {
                return [leafWrapper, compWrapper];
            }
            return [compWrapper];
        }

        __getSchemaChildrenVirtualDom = (
            schema: IPublicTypeNodeSchema | undefined,
            scope: any,
            Comp: any,
            condition = true,
        ) => {
            let children = condition ? getSchemaChildren(schema) : null;

            // @todo 补完这里的 Element 定义 @承虎
            let result: any = [];
            if (children) {
                if (!Array.isArray(children)) {
                    children = [children];
                }

                children.forEach((child: any) => {
                    const childVirtualDom = this.__createVirtualDom(
                        isJSExpression(child) ? this.__parseExpression(child, scope) : child,
                        scope,
                        {
                            schema,
                            Comp,
                        },
                    );

                    result.push(childVirtualDom);
                });
            }

            if (result && result.length > 0) {
                return result;
            }
            return null;
        };

        __getComponentProps = (
            schema: IPublicTypeNodeSchema | undefined,
            scope: any,
            Comp: any,
            componentInfo?: any,
        ) => {
            if (!schema) {
                return {};
            }
            return (
                this.__parseProps(schema?.props, scope, '', {
                    schema,
                    Comp,
                    componentInfo: {
                        ...(componentInfo || {}),
                        props: transformArrayToMap((componentInfo || {}).props, 'name'),
                    },
                }) || {}
            );
        };

        __createLoopVirtualDom = (
            schema: IPublicTypeNodeSchema,
            scope: any,
            parentInfo: INodeInfo,
            idx: number | string,
        ) => {
            if (isFileSchema(schema)) {
                logger.warn('file type not support Loop');
                return null;
            }
            if (!Array.isArray(schema.loop)) {
                return null;
            }
            const itemArg = (schema.loopArgs && schema.loopArgs[0]) || DEFAULT_LOOP_ARG_ITEM;
            const indexArg = (schema.loopArgs && schema.loopArgs[1]) || DEFAULT_LOOP_ARG_INDEX;
            const { loop } = schema;
            return loop.map((item: IPublicTypeJSONValue | IPublicTypeCompositeValue, i: number) => {
                const loopSelf: any = {
                    [itemArg]: item,
                    [indexArg]: i,
                };
                loopSelf.__proto__ = scope;
                return this.__createVirtualDom(
                    {
                        ...schema,
                        loop: undefined,
                        props: {
                            ...schema.props,
                            // 循环下 key 不能为常量，这样会造成 key 值重复，渲染异常
                            key: isJSExpression(schema.props?.key) ? schema.props?.key : null,
                        },
                    },
                    loopSelf,
                    parentInfo,
                    idx ? `${idx}_${i}` : i,
                );
            });
        };

        get __designModeIsDesign() {
            const { engine } = this.context || {};
            return engine?.props?.designMode === 'design';
        }

        __parseProps = (originalProps: any, scope: any, path: string, info: INodeInfo): any => {
            let props = originalProps;
            const { schema, Comp, componentInfo = {} } = info;
            const propInfo = getValue(componentInfo.props, path);
            // FIXME: 将这行逻辑外置，解耦，线上环境不要验证参数，调试环境可以有，通过传参自定义
            const propType = propInfo?.extra?.propType;

            const checkProps = (value: any) => {
                if (!propType) {
                    return value;
                }
                return checkPropTypes(value, path, propType, componentInfo.name) ? value : undefined;
            };

            const parseReactNode = (data: any, params: any) => {
                if (isEmpty(params)) {
                    const virtualDom = this.__createVirtualDom(data, scope, { schema, Comp } as INodeInfo);
                    return checkProps(virtualDom);
                }
                return checkProps((...argValues: any[]) => {
                    const args: any = {};
                    if (Array.isArray(params) && params.length) {
                        params.forEach((item, idx) => {
                            if (typeof item === 'string') {
                                args[item] = argValues[idx];
                            } else if (item && typeof item === 'object') {
                                args[item.name] = argValues[idx];
                            }
                        });
                    }
                    args.__proto__ = scope;
                    return scope.__createVirtualDom(data, args, { schema, Comp } as INodeInfo);
                });
            };

            if (isJSExpression(props)) {
                props = this.__parseExpression(props, scope);
                // 只有当变量解析出来为模型结构的时候才会继续解析
                if (!isSchema(props) && !isJSSlot(props)) {
                    return checkProps(props);
                }
            }

            const handleI18nData = (innerProps: any) => innerProps[innerProps.use || (this.getLocale && this.getLocale()) || 'zh-CN'];

            // @LEGACY 兼容老平台设计态 i18n 数据
            if (isI18nData(props)) {
                const i18nProp = handleI18nData(props);
                if (i18nProp) {
                    props = i18nProp;
                } else {
                    return parseI18n(props, scope);
                }
            }

            // @LEGACY 兼容老平台设计态的变量绑定
            if (isVariable(props)) {
                props = props.value;
                if (isI18nData(props)) {
                    props = handleI18nData(props);
                }
            }

            if (isJSFunction(props)) {
                props = transformStringToFunction(props.value);
            }
            if (isJSSlot(props)) {
                const { params, value } = props;
                if (!isSchema(value) || isEmpty(value)) {
                    return undefined;
                }
                return parseReactNode(value, params);
            }

            // 兼容通过componentInfo判断的情况
            if (isSchema(props)) {
                const isReactNodeFunction = !!(propInfo?.type === 'ReactNode' && propInfo?.props?.type === 'function');

                const isMixinReactNodeFunction = !!(
                    propInfo?.type === 'Mixin' &&
                    propInfo?.props?.types?.indexOf('ReactNode') > -1 &&
                    propInfo?.props?.reactNodeProps?.type === 'function'
                );

                let params = null;
                if (isReactNodeFunction) {
                    params = propInfo?.props?.params;
                } else if (isMixinReactNodeFunction) {
                    params = propInfo?.props?.reactNodeProps?.params;
                }
                return parseReactNode(props, params);
            }
            if (Array.isArray(props)) {
                return checkProps(
                    props.map((item, idx) => this.__parseProps(item, scope, path ? `${path}.${idx}` : `${idx}`, info)),
                );
            }
            if (typeof props === 'function') {
                return checkProps(props.bind(scope));
            }
            if (props && typeof props === 'object') {
                if (props.$$typeof) {
                    return checkProps(props);
                }
                const res: any = {};
                forEach(props, (val: any, key: string) => {
                    if (key.startsWith('__')) {
                        res[key] = val;
                        return;
                    }
                    res[key] = this.__parseProps(val, scope, path ? `${path}.${key}` : key, info);
                });
                return checkProps(res);
            }
            return checkProps(props);
        };

        $(filedId: string, instance?: any) {
            this.__instanceMap = this.__instanceMap || {};
            if (!filedId || typeof filedId !== 'string') {
                return this.__instanceMap;
            }
            if (instance) {
                this.__instanceMap[filedId] = instance;
            }
            return this.__instanceMap[filedId];
        }

        __debug = (...args: any[]) => {
            logger.debug(...args);
        };

        __renderContextProvider = (customProps?: object, children?: any) => {
            return createElement(AppContext.Provider, {
                value: {
                    ...this.context,
                    blockContext: this,
                    ...(customProps || {}),
                },
                children: children || this.__createDom(),
            });
        };

        __renderContextConsumer = (children: any) => {
            return createElement(AppContext.Consumer, {}, children);
        };

        __getHOCWrappedComponent(OriginalComp: any, schema: any, scope: any) {
            let Comp = OriginalComp;
            this.__componentHOCs.forEach((ComponentConstruct: IComponentConstruct) => {
                Comp = ComponentConstruct(Comp || Div, {
                    schema,
                    componentInfo: {},
                    baseRenderer: this,
                    scope,
                });
            });

            return Comp;
        }

        __renderComp(OriginalComp: any, ctxProps: object) {
            let Comp = OriginalComp;
            const { __schema, __ctx } = this.props;
            const scope: any = {};
            scope.__proto__ = __ctx || this;
            Comp = this.__getHOCWrappedComponent(Comp, __schema, scope);
            const data = this.__parseProps(__schema?.props, scope, '', {
                schema: __schema,
                Comp,
                componentInfo: {},
            });
            const { className } = data;
            const otherProps: any = {};
            const { engine } = this.context || {};
            if (!engine) {
                return null;
            }

            if (this.__designModeIsDesign) {
                otherProps.__tag = Math.random();
            }

            const child = engine.createElement(
                Comp,
                {
                    ...data,
                    ...this.props,
                    ref: this.__getRef,
                    className: classnames(getFileCssName(__schema?.fileName), className, this.props.className),
                    __id: __schema?.id,
                    ...otherProps,
                },
                this.__createDom(),
            );
            return this.__renderContextProvider(ctxProps, child);
        }

        __renderContent(children: any) {
            const { __schema } = this.props;
            const parsedProps = this.__parseData(__schema.props);
            const className = classnames(
                `lce-${this.__namespace}`,
                getFileCssName(__schema.fileName),
                parsedProps.className,
                this.props.className,
            );
            const style = {
                ...(parsedProps.style || {}),
                ...(typeof this.props.style === 'object' ? this.props.style : {}),
            };
            const id = this.props.id || parsedProps.id;
            return createElement(
                'div',
                {
                    ref: this.__getRef,
                    className,
                    id,
                    style,
                },
                children,
            );
        }

        __checkSchema = (
            schema: IPublicTypeNodeSchema | undefined,
            originalExtraComponents: string | string[] = [],
        ) => {
            let extraComponents = originalExtraComponents;
            if (typeof extraComponents === 'string') {
                extraComponents = [extraComponents];
            }

            const builtin = capitalizeFirstLetter(this.__namespace);
            const componentNames = [builtin, ...extraComponents];
            return !isSchema(schema) || !componentNames.includes(schema?.componentName ?? '');
        };

        get appHelper(): IRendererAppHelper {
            return this.props.__appHelper;
        }

        get requestHandlersMap() {
            return this.appHelper?.requestHandlersMap;
        }

        get utils() {
            return this.appHelper?.utils;
        }

        get constants() {
            return this.appHelper?.constants;
        }

        get history() {
            return this.appHelper?.history;
        }

        get location() {
            return this.appHelper?.location;
        }

        get match() {
            return this.appHelper?.match;
        }

        render() {
            return null;
        }
    };
}
