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

        /**
         * 🔗 绑定自定义方法
         *
         * 作用：
         * 将 schema.methods 中定义的方法绑定到渲染器实例（this）上
         *
         * 执行流程：
         * 1. 清理旧方法：删除不再存在的方法（防止内存泄漏）
         * 2. 更新方法列表：记录当前方法名称
         * 3. 绑定新方法：将每个方法绑定 this 并挂载到实例上
         *
         * 为什么需要清理旧方法？
         * - 设计态下，用户可能删除某些方法
         * - 如果不清理，旧方法仍然存在，可能导致意外行为
         *
         * 方法解析：
         * - JSExpression: 解析为函数
         * - JSFunction: 解析为函数
         * - 普通函数: 直接使用
         *
         * @param props - 渲染器属性
         *
         * 示例：
         * schema.methods = {
         *   handleClick: { type: 'JSFunction', value: 'function() { console.log(this.state); }' },
         *   getData: { type: 'JSFunction', value: 'function() { return this.dataSourceMap.list; }' }
         * }
         *
         * 结果：
         * this.handleClick() // 可以直接调用
         * this.getData()     // 可以直接调用
         */
        __bindCustomMethods = (props: IBaseRendererProps) => {
            const { __schema } = props;
            // 获取当前 schema.methods 中的所有方法名
            const customMethodsList = Object.keys(__schema.methods || {}) || [];

            // 🧹 清理旧方法：遍历之前绑定的方法列表
            (this.__customMethodsList || []).forEach((item: any) => {
                // 如果方法不在新的方法列表中，删除它
                if (!customMethodsList.includes(item)) {
                    delete this[item]; // 从实例上删除方法
                }
            });

            // 更新方法列表（用于下次清理）
            this.__customMethodsList = customMethodsList;

            // 🔗 绑定新方法：遍历 schema.methods
            forEach(__schema.methods, (val: any, key: string) => {
                let value = val;

                // 如果是 JSExpression 或 JSFunction，需要先解析
                if (isJSExpression(value) || isJSFunction(value)) {
                    value = this.__parseExpression(value, this);
                }

                // 类型检查：确保解析后是函数
                if (typeof value !== 'function') {
                    logger.error(`custom method ${key} can not be parsed to a valid function`, value);
                    return;
                }

                // 绑定 this 并挂载到实例上
                // 例如：this.handleClick = function() { ... }.bind(this)
                this[key] = value.bind(this);
            });
        };

        /**
         * 🌍 生成上下文对象
         *
         * 作用：
         * 将上下文对象（page、component 等）注入到渲染器实例上
         *
         * 执行流程：
         * 1. 从 AppContext 获取 pageContext 和 compContext
         * 2. 合并传入的 ctx 参数
         * 3. 将所有上下文对象挂载到 this 上
         *
         * 上下文来源：
         * - pageContext: 来自最近的 PageRenderer
         * - compContext: 来自最近的 ComponentRenderer
         * - ctx: 子类传入的上下文（如 { page: this } 或 { component: this }）
         *
         * 结果：
         * - PageRenderer: this.page = this（自己）
         * - ComponentRenderer: this.component = this（自己）
         * - BlockRenderer: this.page = 父级 PageRenderer（如果存在）
         *
         * @param ctx - 额外的上下文对象
         *
         * 示例：
         * // PageRenderer 中调用
         * this.__generateCtx({ page: this });
         * // 结果：this.page = this
         *
         * // BlockRenderer 中调用
         * this.__generateCtx({});
         * // 结果：this.page = 父级 PageRenderer（通过 Context 传递）
         */
        __generateCtx = (ctx: Record<string, any>) => {
            // 从 AppContext 获取父级上下文
            const { pageContext, compContext } = this.context;

            // 合并上下文对象
            const obj = {
                page: pageContext,        // 父级 Page 实例
                component: compContext,   // 父级 Component 实例
                ...ctx,                   // 当前传入的上下文（会覆盖上面的）
            };

            // 将上下文对象挂载到 this 上
            forEach(obj, (val: any, key: string) => {
                this[key] = val;
            });
        };

        /**
         * 🔄 解析数据
         *
         * 作用：
         * 递归解析 Schema 中的数据，将 JSExpression 等特殊类型转换为实际值
         *
         * 支持的类型：
         * - JSExpression: 执行表达式，返回结果
         * - i18n: 国际化转换
         * - 基础类型: 直接返回
         * - 数组: 递归解析每个元素
         * - 对象: 递归解析每个属性
         *
         * @param data - 要解析的数据
         * @param ctx - 执行上下文（默认使用 this.props.__ctx 或 this）
         * @returns 解析后的数据
         *
         * 示例：
         * const data = {
         *   count: { type: 'JSExpression', value: 'this.state.count + 1' },
         *   list: [
         *     { type: 'JSExpression', value: 'this.state.item1' },
         *     { type: 'JSExpression', value: 'this.state.item2' }
         *   ]
         * };
         * const result = this.__parseData(data);
         * // result = { count: 6, list: ['项目1', '项目2'] }
         */
        __parseData = (data: any, ctx?: Record<string, any>) => {
            const { __ctx, thisRequiredInJSE, componentName } = this.props;
            // 调用工具函数 parseData，传入上下文和选项
            return parseData(data, ctx || __ctx || this, { thisRequiredInJSE, logScope: componentName });
        };

        /**
         * 📡 初始化数据源
         *
         * 作用：
         * 根据 schema.dataSource 配置，初始化数据源助手
         *
         * 两种数据源方案：
         * 1. **数据源引擎（DataSourceEngine）**：新方案，推荐使用
         *    - 条件：appHelper.requestHandlersMap 存在
         *    - 特点：更强大的数据源管理，支持依赖关系
         *
         * 2. **数据助手（DataHelper）**：旧方案，兼容性好
         *    - 条件：appHelper.requestHandlersMap 不存在
         *    - 特点：简单的数据源请求和管理
         *
         * 初始化内容：
         * - this.__dataHelper: 数据源助手实例
         * - this.dataSourceMap: 数据源映射表（key: 数据源 id, value: 数据）
         * - this.reloadDataSource: 重新加载数据源的方法
         *
         * @param props - 渲染器属性
         *
         * Schema 示例：
         * {
         *   dataSource: {
         *     list: [
         *       {
         *         id: 'userInfo',
         *         isInit: true,          // 组件挂载时自动请求
         *         type: 'fetch',
         *         options: {
         *           uri: '/api/user',
         *           method: 'GET',
         *           params: { id: 1 }
         *         },
         *         dataHandler: {         // 数据处理函数
         *           type: 'JSFunction',
         *           value: 'function(res) { return res.data; }'
         *         }
         *       }
         *     ]
         *   }
         * }
         *
         * 使用：
         * // 在 componentDidMount 中自动调用 reloadDataSource()
         * // 数据加载完成后，可通过 this.dataSourceMap.userInfo 访问
         */
        __initDataSource = (props: IBaseRendererProps) => {
            // 参数校验
            if (!props) {
                return;
            }

            const schema = props.__schema || {};
            // 默认空数据源
            const defaultDataSource: DataSource = {
                list: [],
            };
            const dataSource = schema.dataSource || defaultDataSource;

            // 判断使用哪种数据源方案
            // requestHandlersMap 存在才走数据源引擎方案
            // TODO: 下面 if else 抽成独立函数
            const useDataSourceEngine = !!props.__appHelper?.requestHandlersMap;

            // ========== 方案 1：数据源引擎（新方案）==========
            if (useDataSourceEngine) {
                // 创建数据助手对象（只有 updateConfig 方法）
                this.__dataHelper = {
                    /**
                     * 更新数据源配置
                     * @param updateDataSource - 新的数据源配置
                     * @returns dataSourceMap - 数据源映射表
                     */
                    updateConfig: (updateDataSource: any) => {
                        // 🔥 调用数据源引擎创建函数
                        const { dataSourceMap, reloadDataSource } = createDataSourceEngine(
                            updateDataSource ?? {},   // 数据源配置
                            this,                      // 当前渲染器实例（作为上下文）
                            props.__appHelper.requestHandlersMap
                                ? { requestHandlersMap: props.__appHelper.requestHandlersMap }
                                : undefined,
                        );

                        // 重写 reloadDataSource 方法
                        this.reloadDataSource = () => new Promise((resolve) => {
                                this.__debug('reload data source');
                                // 调用数据源引擎的 reloadDataSource
                                reloadDataSource().then(() => {
                                    resolve({});
                                });
                            });

                        // 返回数据源映射表
                        return dataSourceMap;
                    },
                };

                // 初始化数据源映射表
                this.dataSourceMap = this.__dataHelper.updateConfig(dataSource);

            // ========== 方案 2：数据助手（旧方案）==========
            } else {
                const appHelper = props.__appHelper;

                // 创建 DataHelper 实例
                this.__dataHelper = new DataHelper(
                    this,                                          // 当前渲染器实例
                    dataSource,                                    // 数据源配置
                    appHelper,                                     // appHelper（提供工具方法）
                    (config: any) => this.__parseData(config)     // 配置解析函数
                );

                // 获取数据源映射表
                this.dataSourceMap = this.__dataHelper.dataSourceMap;

                // 定义 reloadDataSource 方法
                this.reloadDataSource = () => new Promise((resolve, reject) => {
                        this.__debug('reload data source');

                        // 如果没有数据助手，直接 resolve
                        if (!this.__dataHelper) {
                            return resolve({});
                        }

                        // 获取初始数据（isInit: true 的数据源）
                        this.__dataHelper
                            .getInitData()
                            .then((res: any) => {
                                // 如果没有数据，直接 resolve
                                if (isEmpty(res)) {
                                    return resolve({});
                                }
                                // 有数据，更新 state
                                this.setState(res, resolve as () => void);
                            })
                            .catch((err: Error) => {
                                // 捕获错误
                                reject(err);
                            });
                    });
            }
        };

        /**
         * 🌐 初始化国际化 API
         *
         * 作用：
         * 在渲染器实例上挂载国际化相关的方法
         *
         * 挂载的方法：
         * 1. this.i18n(key, values): 翻译文本
         * 2. this.getLocale(): 获取当前语言
         * 3. this.setLocale(locale): 设置当前语言
         *
         * 使用场景：
         * - schema.methods 中调用 this.i18n('app.title')
         * - schema.lifeCycles 中调用 this.getLocale()
         * - 切换语言时调用 this.setLocale('en-US')
         *
         * @PRIVATE 内部方法
         *
         * 示例：
         * // Schema 中使用
         * {
         *   methods: {
         *     showWelcome() {
         *       const welcome = this.i18n('welcome', { name: 'User' });
         *       console.log(welcome); // "欢迎，User"（根据当前语言）
         *     },
         *     switchLanguage() {
         *       const currentLang = this.getLocale(); // "zh-CN"
         *       this.setLocale('en-US'); // 切换为英文
         *     }
         *   }
         * }
         */
        __initI18nAPIs = () => {
            /**
             * 翻译文本
             * @param key - 翻译 key（如 'app.title'）
             * @param values - 插值变量（如 { name: 'User' }）
             * @returns 翻译后的文本
             */
            this.i18n = (key: string, values = {}) => {
                const { locale, messages } = this.props;
                return getI18n(key, values, locale, messages);
            };

            /**
             * 获取当前语言
             * @returns 当前语言代码（如 'zh-CN'、'en-US'）
             */
            this.getLocale = () => this.props.locale;

            /**
             * 设置当前语言
             * @param loc - 语言代码（如 'zh-CN'、'en-US'）
             * @returns 设置结果（依赖 appHelper.utils.i18n.setLocale 的实现）
             */
            this.setLocale = (loc: string) => {
                // 从 appHelper 获取 setLocale 方法
                const setLocaleFn = this.appHelper?.utils?.i18n?.setLocale;

                // 校验方法是否存在
                if (!setLocaleFn || typeof setLocaleFn !== 'function') {
                    logger.warn('initI18nAPIs Failed, i18n only works when appHelper.utils.i18n.setLocale() exists');
                    return undefined;
                }

                // 调用 setLocale 方法
                return setLocaleFn(loc);
            };
        };

        /**
         * 🎨 写入 CSS 样式
         *
         * 作用：
         * 将 schema.css 中定义的样式注入到 document 的 <head> 中
         *
         * 执行时机：
         * - 每次 render 时调用（__render 方法中）
         *
         * 特点：
         * - 只创建一次 <style> 元素
         * - CSS 内容变化时更新 innerHTML
         * - CSS 内容相同时跳过更新（性能优化）
         *
         * @param props - 渲染器属性
         *
         * @PRIVATE 内部方法
         *
         * Schema 示例：
         * {
         *   componentName: 'Page',
         *   css: `
         *     .my-page {
         *       background: #f5f5f5;
         *     }
         *     .my-page .title {
         *       font-size: 24px;
         *       color: #333;
         *     }
         *   `,
         *   children: [...]
         * }
         *
         * 结果：
         * <head>
         *   <style type="text/css" from="style-sheet">
         *     .my-page { background: #f5f5f5; }
         *     .my-page .title { font-size: 24px; color: #333; }
         *   </style>
         * </head>
         */
        __writeCss = (props: IBaseRendererProps) => {
            // 获取 schema.css
            const css = getValue(props.__schema, 'css', '');
            this.__debug('create this.styleElement with css', css);

            let style = this.__styleElement;

            // 如果 style 元素不存在，创建它
            if (!this.__styleElement) {
                style = document.createElement('style');
                style.type = 'text/css';
                style.setAttribute('from', 'style-sheet'); // 标记来源

                // 添加到 <head>
                const head = document.head || document.getElementsByTagName('head')[0];
                head.appendChild(style);

                // 保存引用
                this.__styleElement = style;
                this.__debug('this.styleElement is created', this.__styleElement);
            }

            // 如果 CSS 内容相同，跳过更新（性能优化）
            if (style.innerHTML === css) {
                return;
            }

            // 更新 CSS 内容
            style.innerHTML = css;
        };

        /**
         * 🎨 渲染前处理
         *
         * 作用：
         * 在每次渲染前执行必要的处理逻辑
         *
         * 执行内容：
         * 1. 执行用户定义的 render 生命周期
         * 2. 写入 CSS 样式
         * 3. 通知 engine（设计器）获取上下文
         * 4. 设计态下重新绑定自定义方法
         * 5. 设计态下更新数据源配置
         *
         * 调用时机：
         * - 子类（PageRenderer、ComponentRenderer 等）的 render 方法中调用
         *
         * 为什么设计态需要重新绑定方法？
         * - 用户可能在设计器中修改了 schema.methods
         * - 需要实时应用这些变化
         *
         * @PRIVATE 内部方法
         */
        __render = () => {
            const schema = this.props.__schema;

            // 1. 执行用户定义的 render 生命周期
            this.__executeLifeCycleMethod('render');

            // 2. 写入 CSS 样式
            this.__writeCss(this.props);

            const { engine } = this.context;
            if (engine) {
                // 3. 通知 engine 获取上下文（设计器需要）
                engine.props.onCompGetCtx(schema, this);

                // 设计态特殊处理
                if (this.__designModeIsDesign) {
                    // 4. 重新绑定自定义方法（应用 schema.methods 的变化）
                    this.__bindCustomMethods(this.props);

                    // 5. 更新数据源配置（应用 schema.dataSource 的变化）
                    this.dataSourceMap = this.__dataHelper?.updateConfig(schema.dataSource);
                }
            }
        };

        /**
         * 🔗 获取 ref 回调
         *
         * 作用：
         * 当组件的 ref 被赋值时调用
         *
         * 执行内容：
         * 1. 通知 engine（设计器）获取 ref
         * 2. 保存 ref 到 this.__ref
         *
         * 使用场景：
         * - 设计器需要访问组件的 DOM 节点或实例
         * - 调试和开发工具需要组件引用
         *
         * @param ref - 组件 ref（DOM 节点或组件实例）
         *
         * @PRIVATE 内部方法
         */
        __getRef = (ref: any) => {
            const { engine } = this.context;
            const { __schema } = this.props;

            // 通知 engine 获取 ref（设计器可能需要）
            ref && engine?.props?.onCompGetRef(__schema, ref);

            // 保存 ref 引用
            this.__ref = ref;
        };

        /**
         * 🏗️ 创建 DOM 结构
         *
         * 作用：
         * 根组件的入口方法，开始递归渲染整个组件树
         *
         * 执行流程：
         * 1. 合并默认属性和传入属性
         * 2. 创建作用域对象（scope）
         * 3. 设置原型链（scope.__proto__ = this，使表达式可访问 this）
         * 4. 获取子节点
         * 5. 获取根组件类（如 Page、Component、Block）
         * 6. 应用 HOC 包装（leafWrapper + compWrapper）
         * 7. 调用 __createVirtualDom 递归转换子节点
         *
         * 调用时机：
         * - 子类的 render 方法中调用（如 PageRenderer.render → __renderContent → __createDom）
         *
         * 作用域链：
         * scope = { props: { ... } }
         * scope.__proto__ = this（渲染器实例）
         *
         * 这样表达式中就可以访问：
         * - this.state（渲染器的 state）
         * - this.page（Page 实例）
         * - this.methods（自定义方法）
         * - props（组件 props）
         *
         * @returns React 虚拟 DOM（子节点的渲染结果）
         *
         * @PRIVATE 内部方法
         */
        __createDom = () => {
            const { __schema, __ctx, __components = {} } = this.props;

            // 1. 合并默认属性和传入属性
            const scopeProps = {
                ...__schema.defaultProps,  // schema 中定义的默认属性
                ...this.props,             // 外部传入的属性
            };

            // 2. 创建作用域对象，用于表达式解析
            const scope: any = {
                props: scopeProps,  // 挂载 props
            };

            // 3. 设置原型链，使得可以访问 this 上下文
            // scope.__proto__ = this 后，表达式中的 this.state 等于 渲染器实例.state
            scope.__proto__ = __ctx || this;

            // 4. 获取子节点
            const _children = getSchemaChildren(__schema);

            // 5. 获取根组件类
            let Comp = __components[__schema.componentName];

            if (!Comp) {
                this.__debug(`${__schema.componentName} is invalid!`);
            }

            // 6. 应用 HOC 包装（leafWrapper + compWrapper）
            // 7. 创建父节点信息
            const parentNodeInfo = {
                schema: __schema,
                Comp: this.__getHOCWrappedComponent(Comp, __schema, scope),
            } as INodeInfo;

            // 8. 递归转换子节点为虚拟 DOM
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
         * 🎭 获取组件 HOC 列表
         *
         * 作用：
         * 返回要应用到组件上的高阶组件（HOC）列表
         *
         * HOC 作用：
         * 1. **leafWrapper**: 设计态响应式更新包装器
         *    - 监听 Schema 变化（props、children、visible）
         *    - 实现最小渲染单元优化
         *    - 只在设计态应用
         *
         * 2. **compWrapper**: 错误边界包装器
         *    - 捕获组件渲染错误
         *    - 防止单个组件错误导致整个应用崩溃
         *    - 设计态和运行态都应用
         *
         * 应用顺序：
         * 设计态：[leafWrapper, compWrapper] - 先应用 leafWrapper，再应用 compWrapper
         * 运行态：[compWrapper] - 只应用 compWrapper
         *
         * @returns HOC 构造函数数组
         *
         * @readonly 只读属性（getter）
         * @type {IComponentConstruct[]}
         */
        get __componentHOCs(): IComponentConstruct[] {
            // 设计态：应用 leafWrapper 和 compWrapper
            if (this.__designModeIsDesign) {
                return [leafWrapper, compWrapper];
            }
            // 运行态：只应用 compWrapper
            return [compWrapper];
        }

        /**
         * 👶 获取 Schema 子节点的虚拟 DOM
         *
         * 作用：
         * 将 schema.children 转换为 React 虚拟 DOM 数组
         *
         * 执行流程：
         * 1. 检查 condition：条件为 false 时返回 null（不渲染子节点）
         * 2. 获取子节点：调用 getSchemaChildren(schema)
         * 3. 标准化为数组：确保 children 是数组格式
         * 4. 递归转换：对每个子节点调用 __createVirtualDom
         * 5. 处理表达式：如果子节点是 JSExpression，先解析
         *
         * @param schema - 父节点 Schema
         * @param scope - 作用域对象
         * @param Comp - 父组件类
         * @param condition - 条件（默认 true）
         * @returns 子节点虚拟 DOM 数组或 null
         *
         * 示例：
         * schema.children = [
         *   { componentName: 'Button', props: { children: '按钮1' } },
         *   { componentName: 'Button', props: { children: '按钮2' } }
         * ]
         *
         * 返回：
         * [
         *   <Button>按钮1</Button>,  // React 元素
         *   <Button>按钮2</Button>   // React 元素
         * ]
         */
        __getSchemaChildrenVirtualDom = (
            schema: IPublicTypeNodeSchema | undefined,
            scope: any,
            Comp: any,
            condition = true,
        ) => {
            // 条件为 false，不渲染子节点
            let children = condition ? getSchemaChildren(schema) : null;

            // @todo 补完这里的 Element 定义 @承虎
            let result: any = [];

            if (children) {
                // 标准化为数组
                if (!Array.isArray(children)) {
                    children = [children];
                }

                // 递归转换每个子节点
                children.forEach((child: any) => {
                    // 如果是 JSExpression，先解析
                    const childVirtualDom = this.__createVirtualDom(
                        isJSExpression(child) ? this.__parseExpression(child, scope) : child,
                        scope,
                        {
                            schema,  // 父节点 schema
                            Comp,    // 父组件类
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

        /**
         * 📋 获取组件属性
         *
         * 作用：
         * 从 schema.props 中提取并解析组件的属性
         *
         * 执行流程：
         * 1. 校验 schema 是否存在
         * 2. 调用 __parseProps 递归解析 schema.props
         * 3. 传递组件元信息（componentInfo）
         * 4. 返回解析后的 props 对象
         *
         * componentInfo 的作用：
         * - 提供组件的 setter 配置（属性类型、校验规则等）
         * - 用于属性类型检查（checkPropTypes）
         * - 用于 ReactNode 类型的特殊处理
         *
         * @param schema - Schema 节点对象
         * @param scope - 作用域对象
         * @param Comp - 组件类
         * @param componentInfo - 组件元信息（可选）
         * @returns 解析后的 props 对象
         *
         * 示例：
         * schema.props = {
         *   title: { type: 'JSExpression', value: 'this.state.title' },
         *   disabled: { type: 'JSExpression', value: 'this.state.loading' },
         *   onClick: { type: 'JSFunction', value: 'function() { this.handleClick(); }' }
         * }
         *
         * 返回：
         * {
         *   title: '页面标题',  // 表达式计算结果
         *   disabled: false,
         *   onClick: function() { ... }  // 绑定后的函数
         * }
         */
        __getComponentProps = (
            schema: IPublicTypeNodeSchema | undefined,
            scope: any,
            Comp: any,
            componentInfo?: any,
        ) => {
            // schema 不存在，返回空对象
            if (!schema) {
                return {};
            }

            // 调用 __parseProps 递归解析 schema.props
            return (
                this.__parseProps(schema?.props, scope, '', {
                    schema,
                    Comp,
                    componentInfo: {
                        ...(componentInfo || {}),
                        // 将 componentInfo.props 数组转换为以 name 为 key 的对象
                        // 方便通过 path 快速查找属性信息
                        props: transformArrayToMap((componentInfo || {}).props, 'name'),
                    },
                }) || {}
            );
        };

        /**
         * 🔁 创建循环虚拟 DOM
         *
         * 作用：
         * 处理带有 loop 属性的 Schema，循环渲染多个组件实例
         *
         * 执行流程：
         * 1. 校验：文件类型（Page/Component/Block）不支持 loop
         * 2. 校验：loop 必须是数组
         * 3. 获取循环参数名（loopArgs，默认 ['item', 'index']）
         * 4. 遍历 loop 数组，为每个元素创建独立的作用域
         * 5. 递归调用 __createVirtualDom 渲染每个实例
         *
         * 循环作用域：
         * loopSelf = {
         *   item: 循环项数据,
         *   index: 循环索引,
         *   __proto__: 父级 scope
         * }
         *
         * 这样表达式中可以访问：
         * - item（当前循环项）
         * - index（当前索引）
         * - 父级作用域的所有变量
         *
         * @param schema - Schema 节点对象（包含 loop 属性）
         * @param scope - 父级作用域对象
         * @param parentInfo - 父组件信息
         * @param idx - 父级循环索引（用于嵌套循环）
         * @returns React 元素数组
         *
         * Schema 示例：
         * {
         *   componentName: 'Button',
         *   loop: [
         *     { id: 1, name: '按钮1' },
         *     { id: 2, name: '按钮2' },
         *     { id: 3, name: '按钮3' }
         *   ],
         *   loopArgs: ['item', 'index'], // 可选，默认 ['item', 'index']
         *   props: {
         *     key: { type: 'JSExpression', value: 'item.id' },
         *     children: { type: 'JSExpression', value: 'item.name' }
         *   }
         * }
         *
         * 结果：
         * [
         *   <Button key="1">按钮1</Button>,
         *   <Button key="2">按钮2</Button>,
         *   <Button key="3">按钮3</Button>
         * ]
         */
        __createLoopVirtualDom = (
            schema: IPublicTypeNodeSchema,
            scope: any,
            parentInfo: INodeInfo,
            idx: number | string,
        ) => {
            // 校验：文件类型（Page/Component/Block）不支持 loop
            if (isFileSchema(schema)) {
                logger.warn('file type not support Loop');
                return null;
            }

            // 校验：loop 必须是数组
            if (!Array.isArray(schema.loop)) {
                return null;
            }

            // 获取循环参数名（默认 ['item', 'index']）
            const itemArg = (schema.loopArgs && schema.loopArgs[0]) || DEFAULT_LOOP_ARG_ITEM;
            const indexArg = (schema.loopArgs && schema.loopArgs[1]) || DEFAULT_LOOP_ARG_INDEX;
            const { loop } = schema;

            // 遍历 loop 数组，渲染每个实例
            return loop.map((item: IPublicTypeJSONValue | IPublicTypeCompositeValue, i: number) => {
                // 创建循环作用域
                const loopSelf: any = {
                    [itemArg]: item,     // 当前循环项（默认变量名：item）
                    [indexArg]: i,       // 当前索引（默认变量名：index）
                };
                // 设置原型链，继承父级作用域
                loopSelf.__proto__ = scope;

                // 递归渲染当前循环项
                return this.__createVirtualDom(
                    {
                        ...schema,
                        loop: undefined,  // 移除 loop 属性（避免无限循环）
                        props: {
                            ...schema.props,
                            // 循环下 key 不能为常量，这样会造成 key 值重复，渲染异常
                            // 如果 key 是表达式（如 item.id），保留；否则设为 null，由后续逻辑生成
                            key: isJSExpression(schema.props?.key) ? schema.props?.key : null,
                        },
                    },
                    loopSelf,      // 循环作用域（包含 item 和 index）
                    parentInfo,
                    idx ? `${idx}_${i}` : i,  // 嵌套循环时，key 为 父索引_当前索引
                );
            });
        };

        /**
         * 🎨 判断是否为设计态
         *
         * 作用：
         * 判断当前是否处于设计态（designMode === 'design'）
         *
         * 设计态 vs 运行态：
         * - 设计态：低代码编辑器的画布区域
         *   - 应用 leafWrapper（响应式更新）
         *   - 每次渲染重新绑定方法和数据源
         *   - 支持实时预览
         *
         * - 运行态：生产环境
         *   - 不应用 leafWrapper（性能更好）
         *   - 只绑定一次方法和数据源
         *   - 普通 React 应用
         *
         * @returns boolean - true 表示设计态，false 表示运行态
         *
         * @readonly 只读属性（getter）
         */
        get __designModeIsDesign() {
            const { engine } = this.context || {};
            return engine?.props?.designMode === 'design';
        }

        /**
         * 🔧 解析属性（核心属性转换引擎）
         *
         * 作用：
         * 递归解析组件的属性，将各种特殊类型转换为实际值
         *
         * 支持的类型：
         * 1. JSExpression - 执行表达式
         * 2. i18n - 国际化数据
         * 3. variable - 变量绑定（旧平台兼容）
         * 4. JSFunction - 转换为函数
         * 5. JSSlot - 插槽（转换为 ReactNode 或 render props）
         * 6. Schema - 组件对象（转换为 ReactNode）
         * 7. Array - 数组（递归解析每个元素）
         * 8. Function - 函数（绑定 scope）
         * 9. Object - 对象（递归解析每个属性）
         * 10. 基础类型 - 直接返回
         *
         * @param originalProps - 原始属性值
         * @param scope - 作用域对象
         * @param path - 属性路径（如 'style.color'，用于属性类型检查）
         * @param info - 节点信息（包含 schema、Comp、componentInfo）
         * @returns 解析后的属性值
         *
         * 示例 1：JSExpression
         * props = { type: 'JSExpression', value: 'this.state.count + 1' }
         * 返回：6（假设 this.state.count = 5）
         *
         * 示例 2：JSSlot（插槽）
         * props = {
         *   type: 'JSSlot',
         *   params: ['data', 'index'],
         *   value: { componentName: 'Button', props: { children: '{{data.name}}' } }
         * }
         * 返回：(data, index) => <Button>{data.name}</Button>
         *
         * 示例 3：对象（递归解析）
         * props = {
         *   style: {
         *     color: { type: 'JSExpression', value: 'this.state.color' },
         *     fontSize: 14
         *   }
         * }
         * 返回：{ style: { color: '#333', fontSize: 14 } }
         */
        __parseProps = (originalProps: any, scope: any, path: string, info: INodeInfo): any => {
            let props = originalProps;
            const { schema, Comp, componentInfo = {} } = info;

            // 获取属性元信息（来自 setter 配置）
            const propInfo = getValue(componentInfo.props, path);

            // FIXME: 将这行逻辑外置，解耦，线上环境不要验证参数，调试环境可以有，通过传参自定义
            const propType = propInfo?.extra?.propType;

            /**
             * 属性类型检查
             * @param value - 属性值
             * @returns 校验通过返回原值，校验失败返回 undefined
             */
            const checkProps = (value: any) => {
                // 如果没有定义 propType，跳过校验
                if (!propType) {
                    return value;
                }
                // 调用 checkPropTypes 进行类型校验
                return checkPropTypes(value, path, propType, componentInfo.name) ? value : undefined;
            };

            /**
             * 解析 ReactNode 类型的属性
             *
             * 两种模式：
             * 1. params 为空：直接渲染 Schema 为 ReactNode
             * 2. params 不为空：返回 render props 函数
             *
             * @param data - Schema 数据
             * @param params - 参数列表（如 ['data', 'index']）
             * @returns ReactNode 或 render props 函数
             *
             * 示例 1：直接渲染
             * parseReactNode({ componentName: 'Button' }, null)
             * 返回：<Button />
             *
             * 示例 2：render props
             * parseReactNode({ componentName: 'Button', props: { children: '{{data.name}}' } }, ['data', 'index'])
             * 返回：(data, index) => <Button>{data.name}</Button>
             */
            const parseReactNode = (data: any, params: any) => {
                // 模式 1：params 为空，直接渲染
                if (isEmpty(params)) {
                    const virtualDom = this.__createVirtualDom(data, scope, { schema, Comp } as INodeInfo);
                    return checkProps(virtualDom);
                }

                // 模式 2：返回 render props 函数
                return checkProps((...argValues: any[]) => {
                    const args: any = {};

                    // 将参数值绑定到参数名
                    if (Array.isArray(params) && params.length) {
                        params.forEach((item, idx) => {
                            if (typeof item === 'string') {
                                // 参数是字符串：args[item] = argValues[idx]
                                args[item] = argValues[idx];
                            } else if (item && typeof item === 'object') {
                                // 参数是对象：args[item.name] = argValues[idx]
                                args[item.name] = argValues[idx];
                            }
                        });
                    }

                    // 设置原型链，继承父级作用域
                    args.__proto__ = scope;

                    // 渲染 Schema，使用新的作用域（包含参数）
                    return scope.__createVirtualDom(data, args, { schema, Comp } as INodeInfo);
                });
            };

            // ========== 类型 1：JSExpression ==========
            // 执行表达式，获取计算结果
            if (isJSExpression(props)) {
                props = this.__parseExpression(props, scope);
                // 只有当变量解析出来为模型结构的时候才会继续解析
                // 如果解析结果不是 Schema 或 JSSlot，直接返回
                if (!isSchema(props) && !isJSSlot(props)) {
                    return checkProps(props);
                }
            }

            /**
             * 处理国际化数据
             * @param innerProps - i18n 对象
             * @returns 当前语言的翻译文本
             */
            const handleI18nData = (innerProps: any) => innerProps[innerProps.use || (this.getLocale && this.getLocale()) || 'zh-CN'];

            // ========== 类型 2：i18n 国际化数据 ==========
            // @LEGACY 兼容老平台设计态 i18n 数据
            if (isI18nData(props)) {
                const i18nProp = handleI18nData(props);
                if (i18nProp) {
                    // 如果有对应语言的翻译，使用翻译值
                    props = i18nProp;
                } else {
                    // 否则调用 parseI18n 解析
                    return parseI18n(props, scope);
                }
            }

            // ========== 类型 3：variable 变量绑定 ==========
            // @LEGACY 兼容老平台设计态的变量绑定
            if (isVariable(props)) {
                props = props.value;  // 提取变量值
                if (isI18nData(props)) {
                    props = handleI18nData(props);  // 如果是 i18n，继续处理
                }
            }

            // ========== 类型 4：JSFunction ==========
            // 将字符串转换为函数
            if (isJSFunction(props)) {
                props = transformStringToFunction(props.value);
            }

            // ========== 类型 5：JSSlot 插槽 ==========
            if (isJSSlot(props)) {
                const { params, value } = props;
                // 校验：value 必须是有效的 Schema
                if (!isSchema(value) || isEmpty(value)) {
                    return undefined;
                }
                // 解析为 ReactNode 或 render props
                return parseReactNode(value, params);
            }

            // ========== 类型 6：Schema 组件对象 ==========
            // 兼容通过 componentInfo 判断的情况
            if (isSchema(props)) {
                // 判断是否为 ReactNode function 类型
                const isReactNodeFunction = !!(propInfo?.type === 'ReactNode' && propInfo?.props?.type === 'function');

                // 判断是否为 Mixin ReactNode function 类型
                const isMixinReactNodeFunction = !!(
                    propInfo?.type === 'Mixin' &&
                    propInfo?.props?.types?.indexOf('ReactNode') > -1 &&
                    propInfo?.props?.reactNodeProps?.type === 'function'
                );

                // 提取参数配置
                let params = null;
                if (isReactNodeFunction) {
                    params = propInfo?.props?.params;
                } else if (isMixinReactNodeFunction) {
                    params = propInfo?.props?.reactNodeProps?.params;
                }

                // 解析为 ReactNode
                return parseReactNode(props, params);
            }

            // ========== 类型 7：Array 数组 ==========
            // 递归解析数组中的每个元素
            if (Array.isArray(props)) {
                return checkProps(
                    props.map((item, idx) => this.__parseProps(item, scope, path ? `${path}.${idx}` : `${idx}`, info)),
                );
            }

            // ========== 类型 8：Function 函数 ==========
            // 绑定作用域
            if (typeof props === 'function') {
                return checkProps(props.bind(scope));
            }

            // ========== 类型 9：Object 对象 ==========
            if (props && typeof props === 'object') {
                // 如果已经是 React 元素，直接返回
                if (props.$$typeof) {
                    return checkProps(props);
                }

                // 递归解析对象的每个属性
                const res: any = {};
                forEach(props, (val: any, key: string) => {
                    // 以 __ 开头的内部属性，不解析，直接复制
                    if (key.startsWith('__')) {
                        res[key] = val;
                        return;
                    }
                    // 递归解析属性值，更新 path
                    res[key] = this.__parseProps(val, scope, path ? `${path}.${key}` : key, info);
                });
                return checkProps(res);
            }

            // ========== 类型 10：基础类型 ==========
            // 字符串、数字、布尔值等，直接返回
            return checkProps(props);
        };

        /**
         * 💾 收集和获取组件实例
         *
         * 作用：
         * 通过 fieldId 或 ref 字符串收集组件实例，方便后续访问
         *
         * 使用方式：
         * 1. 设置实例：this.$('myButton', buttonRef)
         * 2. 获取实例：const buttonRef = this.$('myButton')
         * 3. 获取所有实例：const allRefs = this.$()
         *
         * 调用时机：
         * - 组件的 ref 回调中自动调用（base.tsx:1486）
         *
         * @param filedId - 字段 ID（如 'myButton'）
         * @param instance - 组件实例（可选，传入时为设置，不传为获取）
         * @returns 组件实例或实例映射表
         *
         * Schema 示例：
         * {
         *   componentName: 'Button',
         *   props: {
         *     ref: 'myButton'  // 或 fieldId: 'myButton'
         *   }
         * }
         *
         * 使用：
         * methods: {
         *   handleClick() {
         *     const button = this.$('myButton');  // 获取按钮实例
         *     button.focus();  // 调用按钮方法
         *   }
         * }
         */
        $(filedId: string, instance?: any) {
            // 确保 __instanceMap 存在
            this.__instanceMap = this.__instanceMap || {};

            // 如果没有传 filedId 或 filedId 不是字符串，返回整个映射表
            if (!filedId || typeof filedId !== 'string') {
                return this.__instanceMap;
            }

            // 如果传入了 instance，设置实例
            if (instance) {
                this.__instanceMap[filedId] = instance;
            }

            // 返回对应的实例
            return this.__instanceMap[filedId];
        }

        /**
         * 🐛 调试日志
         *
         * 作用：
         * 输出调试信息到控制台
         *
         * 使用场景：
         * - 开发环境调试
         * - 追踪渲染流程
         *
         * @param args - 日志参数
         *
         * @PRIVATE 内部方法
         */
        __debug = (...args: any[]) => {
            logger.debug(...args);
        };

        /**
         * 🌍 渲染 Context Provider
         *
         * 作用：
         * 创建 AppContext.Provider，向子组件传递上下文
         *
         * 传递的上下文：
         * - this.context：父级上下文（pageContext、compContext）
         * - blockContext: this（当前渲染器实例）
         * - customProps：自定义属性（如 pageContext、compContext）
         *
         * 调用时机：
         * - 子类（PageRenderer、ComponentRenderer）的 render 方法中
         *
         * @param customProps - 自定义属性（可选）
         * @param children - 子节点（可选，默认调用 __createDom()）
         * @returns AppContext.Provider 元素
         *
         * 示例：
         * // PageRenderer 中调用
         * return this.__renderContextProvider(
         *   { pageContext: this },  // 注入 pageContext
         *   <div>{子组件}</div>
         * );
         *
         * 结果：
         * <AppContext.Provider value={{ pageContext: this, blockContext: this, ... }}>
         *   <div>{子组件}</div>
         * </AppContext.Provider>
         */
        __renderContextProvider = (customProps?: object, children?: any) => {
            return createElement(AppContext.Provider, {
                value: {
                    ...this.context,          // 继承父级上下文
                    blockContext: this,       // 当前渲染器实例
                    ...(customProps || {}),   // 自定义属性（会覆盖上面的）
                },
                children: children || this.__createDom(),  // 子节点
            });
        };

        /**
         * 🌍 渲染 Context Consumer
         *
         * 作用：
         * 创建 AppContext.Consumer，消费上下文
         *
         * 使用场景：
         * - 需要访问 AppContext 的组件
         * - 通常不直接使用，而是通过 static contextType 访问
         *
         * @param children - 子节点（render props 函数）
         * @returns AppContext.Consumer 元素
         *
         * 示例：
         * this.__renderContextConsumer((context) => {
         *   return <div>{context.appHelper.utils.formatDate()}</div>;
         * });
         */
        __renderContextConsumer = (children: any) => {
            return createElement(AppContext.Consumer, {}, children);
        };

        /**
         * 🎭 获取 HOC 包装后的组件
         *
         * 作用：
         * 对组件应用所有 HOC（高阶组件）包装
         *
         * 应用的 HOC：
         * - compWrapper：错误边界（设计态和运行态都有）
         * - leafWrapper：响应式更新（只在设计态）
         *
         * 执行流程：
         * 1. 遍历 __componentHOCs
         * 2. 依次应用每个 HOC
         * 3. 返回包装后的组件
         *
         * 包装顺序（设计态）：
         * OriginalComp
         *   ↓ leafWrapper
         * LeafHoc(OriginalComp)
         *   ↓ compWrapper
         * ErrorBoundary(LeafHoc(OriginalComp))
         *
         * @param OriginalComp - 原始组件类
         * @param schema - Schema 对象
         * @param scope - 作用域对象
         * @returns 包装后的组件类
         */
        __getHOCWrappedComponent(OriginalComp: any, schema: any, scope: any) {
            let Comp = OriginalComp;

            // 遍历 HOC 列表，依次应用
            this.__componentHOCs.forEach((ComponentConstruct: IComponentConstruct) => {
                Comp = ComponentConstruct(Comp || Div, {  // 如果 Comp 为空，使用 Div
                    schema,
                    componentInfo: {},
                    baseRenderer: this,
                    scope,
                });
            });

            return Comp;
        }

        /**
         * 🎨 渲染组件（包装版）
         *
         * 作用：
         * 渲染组件并包装 Context Provider
         *
         * 执行流程：
         * 1. 创建作用域对象
         * 2. 应用 HOC 包装
         * 3. 解析组件 props
         * 4. 合并 className
         * 5. 创建组件元素
         * 6. 包装 Context Provider
         *
         * 使用场景：
         * - 某些特殊渲染场景
         * - 需要自定义上下文的场景
         *
         * @param OriginalComp - 原始组件类
         * @param ctxProps - 自定义上下文属性
         * @returns 包装后的 React 元素
         *
         * @PRIVATE 内部方法
         */
        __renderComp(OriginalComp: any, ctxProps: object) {
            let Comp = OriginalComp;
            const { __schema, __ctx } = this.props;

            // 创建作用域对象
            const scope: any = {};
            scope.__proto__ = __ctx || this;

            // 应用 HOC 包装
            Comp = this.__getHOCWrappedComponent(Comp, __schema, scope);

            // 解析 schema.props
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

            // 设计态：添加随机 __tag（用于强制更新）
            if (this.__designModeIsDesign) {
                otherProps.__tag = Math.random();
            }

            // 创建组件元素
            const child = engine.createElement(
                Comp,
                {
                    ...data,           // 解析后的 props
                    ...this.props,     // 外部传入的 props
                    ref: this.__getRef, // ref 回调
                    // 合并 className
                    className: classnames(getFileCssName(__schema?.fileName), className, this.props.className),
                    __id: __schema?.id, // 组件 ID
                    ...otherProps,      // 其他属性
                },
                this.__createDom(),  // 子节点
            );

            // 包装 Context Provider
            return this.__renderContextProvider(ctxProps, child);
        }

        /**
         * 📦 渲染内容（包装 div 容器）
         *
         * 作用：
         * 将子节点包装在一个 div 容器中，应用样式和类名
         *
         * 执行流程：
         * 1. 解析 schema.props（获取 className、style、id）
         * 2. 合并 className：`lce-${namespace}` + fileName + props.className + this.props.className
         * 3. 合并 style：schema.props.style + this.props.style
         * 4. 创建 div 元素，包装子节点
         *
         * 调用时机：
         * - 子类（PageRenderer、ComponentRenderer、BlockRenderer）的 render 方法中
         *
         * @param children - 子节点（通过 __createDom() 生成）
         * @returns div 元素
         *
         * 结果示例：
         * <div
         *   ref={this.__getRef}
         *   className="lce-page page-xxx my-class"
         *   id="page-1"
         *   style={{ background: '#f5f5f5', padding: '20px' }}
         * >
         *   {children}
         * </div>
         */
        __renderContent(children: any) {
            const { __schema } = this.props;

            // 解析 schema.props
            const parsedProps = this.__parseData(__schema.props);

            // 合并 className
            const className = classnames(
                `lce-${this.__namespace}`,          // 命名空间类名（如 lce-page）
                getFileCssName(__schema.fileName),  // 文件名类名（如 page-xxx）
                parsedProps.className,              // schema.props.className
                this.props.className,               // 外部传入的 className
            );

            // 合并 style
            const style = {
                ...(parsedProps.style || {}),                                // schema.props.style
                ...(typeof this.props.style === 'object' ? this.props.style : {}),  // 外部传入的 style
            };

            // 获取 id（优先使用外部传入的）
            const id = this.props.id || parsedProps.id;

            // 创建 div 容器
            return createElement(
                'div',
                {
                    ref: this.__getRef,  // ref 回调
                    className,
                    id,
                    style,
                },
                children,  // 子节点
            );
        }

        /**
         * ✅ 检查 Schema 是否有效
         *
         * 作用：
         * 验证 schema.componentName 是否符合预期
         *
         * 检查逻辑：
         * 1. schema 必须是有效的 Schema 对象
         * 2. schema.componentName 必须在允许的组件名列表中
         *
         * 允许的组件名：
         * - builtin：渲染器的内置组件名（如 Page、Component、Block）
         * - extraComponents：额外允许的组件名
         *
         * @param schema - Schema 对象
         * @param originalExtraComponents - 额外允许的组件名（字符串或数组）
         * @returns boolean - true 表示 Schema 无效，false 表示有效
         *
         * 使用场景：
         * // PageRenderer 中调用
         * if (this.__checkSchema(schema)) {
         *   return null;  // Schema 无效，不渲染
         * }
         *
         * // ComponentRenderer 中调用
         * if (this.__checkSchema(schema, 'Div')) {
         *   return null;  // Schema 必须是 Component 或 Div
         * }
         *
         * @PRIVATE 内部方法
         */
        __checkSchema = (
            schema: IPublicTypeNodeSchema | undefined,
            originalExtraComponents: string | string[] = [],
        ) => {
            let extraComponents = originalExtraComponents;

            // 标准化为数组
            if (typeof extraComponents === 'string') {
                extraComponents = [extraComponents];
            }

            // 获取内置组件名（如 Page、Component、Block）
            const builtin = capitalizeFirstLetter(this.__namespace);

            // 允许的组件名列表
            const componentNames = [builtin, ...extraComponents];

            // 检查 schema 是否有效，以及 componentName 是否在允许列表中
            return !isSchema(schema) || !componentNames.includes(schema?.componentName ?? '');
        };

        /**
         * 🔧 获取 appHelper
         *
         * 作用：
         * 快捷访问 appHelper 对象
         *
         * appHelper 包含：
         * - utils：工具函数集合
         * - constants：常量集合
         * - requestHandlersMap：请求处理器映射（数据源引擎使用）
         * - history：路由历史对象
         * - location：路由位置对象
         * - match：路由匹配对象
         * - addons：插件映射表
         *
         * @returns appHelper 对象
         *
         * @readonly 只读属性（getter）
         *
         * 使用：
         * // 在 schema.methods 中
         * this.appHelper.utils.formatDate(new Date())
         * this.appHelper.constants.API_BASE
         */
        get appHelper(): IRendererAppHelper {
            return this.props.__appHelper;
        }

        /**
         * 🌐 获取请求处理器映射
         *
         * 作用：
         * 快捷访问 requestHandlersMap（数据源引擎使用）
         *
         * requestHandlersMap 示例：
         * {
         *   fetch: (options) => axios(options),
         *   jsonp: (options) => fetchJsonp(options)
         * }
         *
         * @returns 请求处理器映射或 undefined
         *
         * @readonly 只读属性（getter）
         */
        get requestHandlersMap() {
            return this.appHelper?.requestHandlersMap;
        }

        /**
         * 🛠️ 获取工具函数集合
         *
         * 作用：
         * 快捷访问 utils 工具函数
         *
         * utils 示例：
         * {
         *   formatDate: (date) => moment(date).format('YYYY-MM-DD'),
         *   formatMoney: (num) => `¥${num.toFixed(2)}`,
         *   showMessage: (msg) => Message.show(msg),
         *   i18n: { setLocale: (locale) => {...} }
         * }
         *
         * @returns 工具函数集合或 undefined
         *
         * @readonly 只读属性（getter）
         *
         * 使用：
         * // 在 schema.methods 中
         * this.utils.formatDate(this.state.createTime)
         */
        get utils() {
            return this.appHelper?.utils;
        }

        /**
         * 📊 获取常量集合
         *
         * 作用：
         * 快捷访问 constants 常量
         *
         * constants 示例：
         * {
         *   API_BASE: 'https://api.example.com',
         *   PAGE_SIZE: 20,
         *   STATUS_MAP: { 1: '进行中', 2: '已完成' }
         * }
         *
         * @returns 常量集合或 undefined
         *
         * @readonly 只读属性（getter）
         *
         * 使用：
         * // 在 schema.methods 中
         * const api = this.constants.API_BASE + '/users'
         */
        get constants() {
            return this.appHelper?.constants;
        }

        /**
         * 🧭 获取路由 history 对象
         *
         * 作用：
         * 访问路由历史对象（react-router 提供）
         *
         * history 方法：
         * - push(path)：跳转到新路由
         * - replace(path)：替换当前路由
         * - goBack()：返回上一页
         * - go(n)：前进或后退 n 页
         *
         * @returns history 对象或 undefined
         *
         * @readonly 只读属性（getter）
         *
         * 使用：
         * // 在 schema.methods 中
         * this.history.push('/users/123')
         */
        get history() {
            return this.appHelper?.history;
        }

        /**
         * 📍 获取路由 location 对象
         *
         * 作用：
         * 访问当前路由位置信息
         *
         * location 属性：
         * - pathname：路径名（如 '/users/123'）
         * - search：查询字符串（如 '?page=1&size=20'）
         * - hash：hash 值（如 '#section1'）
         * - state：路由状态
         *
         * @returns location 对象或 undefined
         *
         * @readonly 只读属性（getter）
         *
         * 使用：
         * // 在 schema.methods 中
         * const currentPath = this.location.pathname
         */
        get location() {
            return this.appHelper?.location;
        }

        /**
         * 🎯 获取路由 match 对象
         *
         * 作用：
         * 访问路由匹配信息（react-router 提供）
         *
         * match 属性：
         * - params：路径参数（如 { id: '123' }）
         * - isExact：是否精确匹配
         * - path：匹配的路径模式（如 '/users/:id'）
         * - url：匹配的 URL（如 '/users/123'）
         *
         * @returns match 对象或 undefined
         *
         * @readonly 只读属性（getter）
         *
         * 使用：
         * // 在 schema.methods 中
         * const userId = this.match.params.id
         */
        get match() {
            return this.appHelper?.match;
        }

        /**
         * 🎨 渲染方法（基类默认实现）
         *
         * 作用：
         * BaseRenderer 的默认 render 方法
         *
         * 默认行为：
         * 返回 null（不渲染任何内容）
         *
         * 子类重写：
         * - PageRenderer：调用 __renderContent 渲染页面
         * - ComponentRenderer：调用 __renderContent 渲染组件
         * - BlockRenderer：调用 __renderContent 渲染区块
         * - AddonRenderer：根据配置渲染插件
         * - TempRenderer：调用 __renderContent 渲染临时内容
         *
         * @returns null（子类会重写）
         */
        render() {
            return null;
        }
    };
}
