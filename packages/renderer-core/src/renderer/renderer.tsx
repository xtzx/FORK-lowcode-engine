/**
 * @Author liyongjie
 * @Date 2025-01-17
 *
 * 【文件作用】
 * 这是 React Renderer 的核心入口文件，负责 Schema 验证、渲染器路由分发和错误处理。
 *
 * 【实现功能】
 * 1. Schema 结构验证：验证 schema.componentName 是否为 Page、Block、Component、Div
 * 2. 渲染器路由分发：根据 componentName 选择对应的渲染器（PageRenderer、BlockRenderer 等）
 * 3. Context 包装：提供 AppContext 和 ConfigProvider 的嵌套结构
 * 4. 错误处理：提供 NotFoundComponent（组件未找到）和 FaultComponent（渲染异常）的兜底方案
 * 5. 自定义扩展：支持自定义 createElement、faultComponent、notFoundComponent
 *
 * 【实现方式】
 * 1. 通过工厂函数 rendererFactory() 创建 Renderer 类，确保每次调用都基于最新的 adapter 配置
 * 2. 使用 adapter.getRenderers() 获取预注册的渲染器映射表（Page -> PageRenderer）
 * 3. 继承 React.Component，利用生命周期钩子进行调试和错误处理
 * 4. 使用 Context 嵌套模式：AppContext.Provider → ConfigProvider → 实际渲染器
 * 5. 通过 getComp() 方法动态查找渲染器：优先用户传入的 components，其次是内置的 RENDERER_COMPS
 *
 * 【关键设计】
 * - 工厂模式：rendererFactory() 延迟创建，适配不同框架（React/Rax）
 * - 路由分发：根据 schema.componentName 动态选择渲染器
 * - 错误边界：使用 componentDidCatch 捕获子组件渲染错误
 */
import Debug from 'debug';

import adapter from '../adapter';
import contextFactory from '../context';
import {isFileSchema, isEmpty} from '../utils';
import baseRendererFactory from './base';
import divFactory from '../components/Div';
import {IRenderComponent, IRendererProps, IRendererState} from '../types';
import {IPublicTypeNodeSchema, IPublicTypeRootSchema} from '../../../types/src';
import logger from '../utils/logger';

/**
 * 渲染器工厂函数
 *
 * 【作用】
 * 返回基础渲染类 Renderer，这是整个低代码渲染引擎的入口点
 *
 * 【为什么使用工厂函数？】
 * 1. 延迟创建：在调用时才从 adapter 获取运行时（React/Rax），确保使用最新配置
 * 2. 闭包缓存：将 BaseRenderer、AppContext、Div 等依赖缓存在闭包中，避免重复创建
 * 3. 框架解耦：通过 adapter 抽象层，支持 React 和 Rax 两种框架
 *
 * @returns {IRenderComponent} Renderer 类（继承自 React.Component）
 */
export default function rendererFactory(): IRenderComponent {
    // 【步骤 1】从 adapter 获取框架运行时（React 或 Rax 的 API）
    // PureComponent: 纯组件基类（浅比较优化）
    // Component: 普通组件基类
    // createElement: 创建虚拟 DOM 的核心函数（等同于 React.createElement）
    // findDOMNode: 获取组件真实 DOM 节点的函数（已废弃但仍需兼容）
    const {PureComponent, Component, createElement, findDOMNode} = adapter.getRuntime();

    // 【步骤 2】获取预注册的渲染器映射表
    // 结构示例：{ Page: PageRenderer, Block: BlockRenderer, Component: ComponentRenderer }
    // 这些渲染器在 packages/react-renderer/src/index.ts 中通过 adapter.setRenderers() 注册
    const RENDERER_COMPS: any = adapter.getRenderers();

    // 【步骤 3】创建基础渲染器类（BaseRenderer）
    // BaseRenderer 是所有渲染器（Page/Block/Component）的父类，提供通用渲染能力
    const BaseRenderer = baseRendererFactory();

    // 【步骤 4】创建 AppContext（应用上下文）
    // 用于在组件树中传递 appHelper、components、engine 等全局数据
    const AppContext = contextFactory();

    // 【步骤 5】创建 Div 组件（兜底渲染组件）
    // 为了实现项目中没有 JSX 语法，完全通过适配器的 createElement 语法实现一个 div 组件
    // 用于：1) 错误提示容器 2) 组件未找到时的占位符 3) ConfigProvider 的默认实现
    const Div = divFactory();

    // 【步骤 6】获取 ConfigProvider（配置提供者）
    // 用于注入全局配置（如 Fusion 的 device、locale）
    // 如果 adapter 没有提供，则使用 Div 作为透明的包装层
    const ConfigProvider = adapter.getConfigProvider() || Div;

    // 【步骤 7】创建调试日志器
    // 使用 debug 库，可通过 localStorage.debug = 'renderer:entry' 开启日志
    const debug = Debug('renderer:entry');

    /**
     * 【组件故障提示组件】FaultComponent
     *
     * 【作用】
     * 当组件渲染时发生异常（如 JavaScript 错误、数据源请求失败等），显示友好的错误提示
     *
     * 【触发时机】
     * 1. Renderer.componentDidCatch 捕获到子组件错误
     * 2. this.state.engineRenderError = true
     *
     * 【可自定义】
     * 用户可通过 <ReactRenderer faultComponent={CustomFault} /> 自定义错误组件
     * 或通过 faultComponentMap={{ 'MyComponent': CustomFault }} 为特定组件定制错误提示
     *
     * 【Props】
     * - componentName: 出错的组件名称
     * - error: Error 对象（包含错误信息和堆栈）
     */
    class FaultComponent extends PureComponent<IPublicTypeNodeSchema | any> {
        render() {
            // 在控制台输出红色错误日志，便于开发者调试
            // %c 是 console 的占位符，用于设置日志样式
            logger.error(
                `%c${this.props.componentName || ''} 组件渲染异常, 异常原因: ${
                    this.props.error?.message || this.props.error || '未知'
                }`,
                'color: #ff0000;', // 红色文本
            );

            // 返回一个红色边框的错误提示框
            // 使用 createElement 而非 JSX，保持与 adapter 的一致性
            return createElement(
                Div, // 使用自定义的 Div 组件（纯 createElement 实现）
                {
                    style: {
                        width: '100%',         // 占满父容器宽度
                        height: '50px',        // 固定高度
                        lineHeight: '50px',    // 垂直居中文本
                        textAlign: 'center',   // 水平居中文本
                        fontSize: '15px',      // 字体大小
                        color: '#ff0000',      // 红色文本
                        border: '2px solid #ff0000', // 红色边框（警告效果）
                    },
                },
                // 显示组件名称和错误提示
                `${this.props.componentName || ''} 组件渲染异常，请查看控制台日志`,
            );
        }
    }

    /**
     * 【组件未找到提示组件】NotFoundComponent
     *
     * 【作用】
     * 当 schema.componentName 在 components 中找不到对应组件时，显示占位提示
     *
     * 【触发时机】
     * BaseRenderer.__renderComp() 中，如果 components[componentName] 为 undefined
     *
     * 【可自定义】
     * 用户可通过 <ReactRenderer notFoundComponent={CustomNotFound} /> 自定义
     *
     * 【两种模式】
     * 1. enableStrictNotFoundMode=true: 返回纯文本提示（严格模式）
     * 2. enableStrictNotFoundMode=false: 返回 Div 容器，保留 children（宽容模式）
     *
     * 【Props】
     * - componentName: 找不到的组件名称
     * - enableStrictNotFoundMode: 是否启用严格模式
     * - children: 子元素（在宽容模式下会保留）
     */
    class NotFoundComponent extends PureComponent<
        {
            componentName: string; // 找不到的组件名称
        } & IRendererProps
    > {
        render() {
            // 【严格模式】直接返回文本提示，不渲染任何容器
            // 适用于：需要明确提示组件缺失的场景
            if (this.props.enableStrictNotFoundMode) {
                return `${this.props.componentName || ''} Component Not Found`;
            }

            // 【宽容模式】渲染一个 Div 容器，显示提示信息或保留 children
            // 适用于：不想因为单个组件缺失而破坏整体布局的场景
            return createElement(
                Div,
                this.props, // 透传所有 props（如 style、className）
                // 优先显示 children（如果有），否则显示 "Component Not Found" 提示
                this.props.children || `${this.props.componentName || ''} Component Not Found`,
            );
        }
    }

    /**
     * 【核心渲染器类】Renderer
     *
     * 【作用】
     * 这是低代码引擎的入口渲染器，负责：
     * 1. Schema 结构验证
     * 2. 渲染器路由分发（根据 componentName 选择对应的渲染器）
     * 3. Context 包装（AppContext + ConfigProvider）
     * 4. 错误处理（FaultComponent + NotFoundComponent）
     *
     * 【继承关系】
     * React.Component → Renderer
     *
     * 【Props】（IRendererProps）
     * - schema: 根 Schema（componentName 必须是 Page/Block/Component/Div）
     * - components: 用户传入的组件映射表
     * - appHelper: 应用辅助对象（工具函数、数据源等）
     * - designMode: 设计模式标识（如 'design' / 'preview'）
     * - suspended: 暂停渲染标识（用于性能优化）
     * - device: 设备信息（传递给 ConfigProvider）
     * - locale: 国际化配置（传递给 ConfigProvider）
     * - onCompGetRef: 组件 ref 回调
     * - customCreateElement: 自定义 createElement 函数
     * - faultComponent/faultComponentMap: 自定义错误组件
     * - notFoundComponent: 自定义组件未找到提示
     *
     * 【State】
     * - engineRenderError: 是否发生渲染错误
     * - error: 错误对象
     */
    return class Renderer extends Component<IRendererProps> {
        // 组件名称（用于 React DevTools 显示）
        static displayName = 'Renderer';

        // 组件状态（用于错误边界）
        state: Partial<IRendererState> = {};

        // 存储子渲染器的 ref（PageRenderer/BlockRenderer 等）
        __ref: any;

        // 默认 Props（确保必需属性有默认值）
        static defaultProps: IRendererProps = {
            appHelper: undefined,           // 应用辅助对象
            components: {},                 // 用户组件映射表（默认为空对象）
            designMode: '',                 // 设计模式（默认为空，表示运行模式）
            suspended: false,               // 是否暂停渲染（默认不暂停）
            schema: {} as IPublicTypeRootSchema, // 根 Schema
            onCompGetRef: () => {},         // ref 回调（默认空函数）
            onCompGetCtx: () => {},         // context 回调（默认空函数）
            thisRequiredInJSE: true,        // JSExpression 中是否需要 this（默认需要）
        };

        // 静态方法：获取 DOM 节点（兼容旧版本 API）
        static findDOMNode = findDOMNode;

        /**
         * 【构造函数】
         *
         * 【执行时机】
         * React 创建组件实例时自动调用
         *
         * 【作用】
         * 1. 初始化 state
         * 2. 输出调试日志
         */
        constructor(props: IRendererProps, context: any) {
            super(props, context);
            this.state = {}; // 初始化空状态（后续通过 componentDidCatch 更新）
            debug(`entry.constructor - ${props?.schema?.componentName}`);
        }

        /**
         * 【生命周期】组件挂载后
         *
         * 【作用】
         * 输出调试日志，便于追踪渲染流程
         */
        async componentDidMount() {
            debug(`entry.componentDidMount - ${this.props.schema && this.props.schema.componentName}`);
        }

        /**
         * 【生命周期】组件更新后
         *
         * 【作用】
         * 输出调试日志，便于追踪渲染流程
         */
        async componentDidUpdate() {
            debug(`entry.componentDidUpdate - ${this.props?.schema?.componentName}`);
        }

        /**
         * 【生命周期】组件卸载前
         *
         * 【作用】
         * 输出调试日志，便于追踪渲染流程
         */
        async componentWillUnmount() {
            debug(`entry.componentWillUnmount - ${this.props?.schema?.componentName}`);
        }

        /**
         * 【错误边界】捕获子组件错误
         *
         * 【作用】
         * 当任何子组件（PageRenderer/BlockRenderer 等）抛出错误时：
         * 1. 设置 engineRenderError = true
         * 2. 保存错误对象
         * 3. render() 方法会检测到这个标志，渲染 FaultComponent
         *
         * 【注意】
         * 这是 React 16+ 的错误边界特性，只能捕获子组件的渲染错误
         * 无法捕获：事件处理器、异步代码、服务端渲染、自身错误
         *
         * @param {Error} error - 捕获到的错误对象
         */
        componentDidCatch(error: Error) {
            this.state.engineRenderError = true; // 标记发生错误
            this.state.error = error;            // 保存错误对象
        }

        /**
         * 【性能优化】控制组件是否重新渲染
         *
         * 【作用】
         * 当 suspended=true 时，阻止组件重新渲染
         * 用于：拖拽过程中暂停渲染，提升性能
         *
         * @param {IRendererProps} nextProps - 新的 props
         * @returns {boolean} true=重新渲染，false=跳过渲染
         */
        shouldComponentUpdate(nextProps: IRendererProps) {
            return !nextProps.suspended; // suspended=true 时返回 false，跳过渲染
        }

        /**
         * 【Ref 回调】获取子渲染器的 ref
         *
         * 【作用】
         * 1. 缓存子渲染器（PageRenderer/BlockRenderer 等）的实例
         * 2. 触发用户自定义的 onCompGetRef 回调
         *
         * 【用途】
         * 可通过 ref 访问子渲染器的方法和状态
         *
         * @param {any} ref - 子渲染器的实例
         */
        __getRef = (ref: any) => {
            this.__ref = ref; // 缓存到实例属性

            if (ref) {
                // 触发用户回调，传递 schema 和 ref
                this.props.onCompGetRef?.(this.props.schema, ref);
            }
        };

        /**
         * 【组件验证】验证组件是否有效
         *
         * 【作用】
         * 预留的扩展点，目前只是简单返回组件本身
         * 未来可能用于：组件版本校验、权限检查等
         *
         * @param {any} SetComponent - 待验证的组件
         * @returns {any} 验证通过的组件
         */
        isValidComponent(SetComponent: any) {
            return SetComponent;
        }

        /**
         * 【自定义 createElement】支持用户自定义创建元素的方式
         *
         * 【作用】
         * 优先使用用户传入的 customCreateElement，否则使用 adapter 的 createElement
         *
         * 【用途】
         * 可用于：注入额外的 props、包装组件、性能监控等
         *
         * @param {any} SetComponent - 组件类或函数
         * @param {any} props - 组件 props
         * @param {any} children - 子元素
         * @returns {ReactElement} 虚拟 DOM 元素
         */
        createElement(SetComponent: any, props: any, children?: any) {
            return (this.props.customCreateElement || createElement)(SetComponent, props, children);
        }

        /**
         * 【获取 NotFoundComponent】获取组件未找到时的提示组件
         *
         * 【作用】
         * 优先使用用户自定义的 notFoundComponent，否则使用内置的 NotFoundComponent
         *
         * @returns {React.ComponentType} 组件未找到提示组件
         */
        getNotFoundComponent() {
            return this.props.notFoundComponent || NotFoundComponent;
        }

        /**
         * 【获取 FaultComponent】获取错误提示组件（支持细粒度定制）
         *
         * 【作用】
         * 1. 如果提供了 faultComponentMap，优先查找组件特定的错误提示
         * 2. 否则使用全局的 faultComponent
         * 3. 最后使用内置的 FaultComponent
         *
         * 【示例】
         * faultComponentMap={
         *   'MyComponent': MyComponentError,  // MyComponent 专用错误提示
         *   'UserForm': UserFormError         // UserForm 专用错误提示
         * }
         *
         * @returns {React.ComponentType} 错误提示组件
         */
        getFaultComponent() {
            const {faultComponent, faultComponentMap, schema} = this.props;

            if (faultComponentMap) {
                const {componentName} = schema;
                // 按优先级查找：组件特定 → 全局 → 内置
                return faultComponentMap[componentName] || faultComponent || FaultComponent;
            }

            // 如果没有 faultComponentMap，使用全局或内置
            return faultComponent || FaultComponent;
        }

        /**
         * 【核心路由分发】根据 schema.componentName 获取对应的渲染器
         *
         * 【作用】
         * 这是整个渲染引擎的路由核心，负责将 componentName 映射到渲染器类
         *
         * 【查找优先级】
         * 1. 用户传入的 components[componentName]（如果是 BaseRenderer 子类）
         * 2. 内置的 RENDERER_COMPS[componentName]（如 Page → PageRenderer）
         * 3. 内置的 RENDERER_COMPS[`${componentName}Renderer`]（如 Page → PageRenderer）
         *
         * 【示例】
         * schema.componentName = 'Page'
         * ↓
         * 查找 components['Page'] → 未找到
         * ↓
         * 查找 RENDERER_COMPS['Page'] → 找到 PageRenderer
         * ↓
         * 返回 PageRenderer
         *
         * 【为什么要检查 BaseRenderer？】
         * 防止用户传入的同名组件（如 Page）覆盖内置渲染器
         * 只有继承自 BaseRenderer 的组件才被视为渲染器
         *
         * @returns {React.ComponentType | undefined} 渲染器类（未找到返回 undefined）
         */
        getComp() {
            const {schema, components} = this.props;
            const {componentName} = schema; // 如 'Page'、'Block'、'Component'

            // 合并内置渲染器和用户组件（用户组件优先级更高）
            const allComponents = {...RENDERER_COMPS, ...components};

            // 尝试获取组件：
            // 1. allComponents[componentName] - 直接匹配（如 Page）
            // 2. RENDERER_COMPS[`${componentName}Renderer`] - 加 Renderer 后缀（如 PageRenderer）
            let Comp = allComponents[componentName] || RENDERER_COMPS[`${componentName}Renderer`];

            // 【关键验证】如果找到了组件，检查是否是 BaseRenderer 的子类
            if (Comp && Comp.prototype) {
                // 如果不是 BaseRenderer 子类，强制使用内置渲染器
                // 防止用户传入的普通组件（如自定义的 Page 组件）覆盖内置渲染器
                if (!(Comp.prototype instanceof BaseRenderer)) {
                    Comp = RENDERER_COMPS[`${componentName}Renderer`];
                }
            }

            return Comp; // 返回找到的渲染器（可能为 undefined）
        }

        /**
         * 【核心渲染方法】渲染入口
         *
         * 【作用】
         * 这是整个低代码引擎的渲染入口，负责：
         * 1. Schema 验证（结构是否合法）
         * 2. 渲染器选择（根据 componentName 路由）
         * 3. Context 包装（AppContext + ConfigProvider）
         * 4. 错误处理（FaultComponent 兜底）
         *
         * 【渲染流程】
         * Schema 验证 → 选择渲染器 → 包装 Context → 创建渲染器实例 → 渲染
         *
         * 【输出结构】
         * <AppContext.Provider value={{appHelper, components, engine}}>
         *   <ConfigProvider device={...} locale={...}>
         *     <PageRenderer __schema={schema} __components={components} ... />
         *   </ConfigProvider>
         * </AppContext.Provider>
         */
        render() {
            const {schema, designMode, appHelper, components} = this.props;

            // 【步骤 1】Schema 为空验证
            // 使用 lodash 的 isEmpty 方法，检查 schema 是否为空对象/数组/null/undefined
            if (isEmpty(schema)) {
                return null; // 直接返回 null，不渲染任何内容
            }

            // 【步骤 2】Schema 结构验证（核心校验）
            // componentName 必须是以下之一：Page、Block、Component、Div
            // isFileSchema() 检查 schema 是否符合文件 Schema 规范（必须有 componentName 等字段）
            if (schema.componentName !== 'Div' && !isFileSchema(schema)) {
                // 输出错误日志，提示开发者检查 Schema
                logger.error(
                    'The root component name needs to be one of Page、Block、Component, please check the schema: ',
                    schema,
                );
                return '模型结构异常'; // 返回错误提示文本
            }

            // 输出调试日志
            debug('entry.render');

            // 【步骤 3】合并组件映射表
            // 将内置渲染器（RENDERER_COMPS）和用户传入的组件（components）合并
            // 用户传入的组件优先级更高（后面的属性会覆盖前面的）
            const allComponents = {...RENDERER_COMPS, ...components};

            // 【步骤 4】获取对应的渲染器（核心路由）
            // 根据 schema.componentName 选择渲染器
            // 如 'Page' → PageRenderer，'Block' → BlockRenderer
            let Comp = this.getComp();

            // 【步骤 5】错误边界处理
            // 如果之前 componentDidCatch 捕获到错误，渲染错误提示组件
            if (this.state && this.state.engineRenderError) {
                return createElement(this.getFaultComponent(), {
                    ...this.props,      // 透传所有 props
                    error: this.state.error, // 传递错误对象
                });
            }

            // 【步骤 6】正常渲染流程
            // 如果找到了对应的渲染器，开始渲染
            if (Comp) {
                // 【嵌套结构】三层包装
                // 第一层：AppContext.Provider（提供全局应用上下文）
                return createElement(
                    AppContext.Provider,
                    {
                        value: {
                            appHelper,           // 应用辅助对象（工具函数、数据源等）
                            components: allComponents, // 所有可用组件（渲染器 + 用户组件）
                            engine: this,        // Renderer 实例本身（用于访问 createElement 等方法）
                        },
                    },
                    // 第二层：ConfigProvider（提供全局配置，如 Fusion 的 device、locale）
                    createElement(
                        ConfigProvider,
                        {
                            // 传递设备信息（如 'desktop'、'phone'）
                            device: this.props.device,
                            // 传递国际化配置（如 'zh-CN'、'en-US'）
                            locale: this.props.locale,
                        },
                        // 第三层：实际的渲染器（PageRenderer/BlockRenderer 等）
                        createElement(Comp, {
                            // 【关键 key】用于 React 的 diff 算法
                            // 格式：lceKey_idx，如 'root_0'
                            // 当 schema 更新时，key 变化会触发组件重新挂载
                            key: schema.__ctx && `${schema.__ctx.lceKey}_${schema.__ctx.idx || '0'}`,

                            // 【关键 ref】获取渲染器实例
                            ref: this.__getRef,

                            // 【私有 props】以 __ 开头，传递给渲染器
                            __appHelper: appHelper,         // 应用辅助对象
                            __components: allComponents,    // 所有组件
                            __schema: schema,               // 根 Schema
                            __designMode: designMode,       // 设计模式

                            // 【透传所有 props】
                            // 包括：device、locale、onCompGetRef、customCreateElement 等
                            ...this.props,
                        }),
                    ),
                );
            }

            // 【步骤 7】渲染器未找到
            // 如果 getComp() 返回 undefined，说明没有对应的渲染器
            // 返回 null（不渲染任何内容）
            // 注意：这里不会触发 NotFoundComponent，因为这是根节点
            // NotFoundComponent 只在子组件未找到时触发
            return null;
        }
    };
}
