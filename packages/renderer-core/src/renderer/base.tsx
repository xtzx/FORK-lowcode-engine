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
 * execute method in schema.lifeCycles with context
 * @PRIVATE
 */
export function executeLifeCycleMethod(
    context: any,
    schema: IPublicTypeNodeSchema,
    method: string,
    args: any,
    thisRequiredInJSE: boolean | undefined,
): any {
    if (!context || !isSchema(schema) || !method) {
        return;
    }
    const lifeCycleMethods = getValue(schema, 'lifeCycles', {});
    let fn = lifeCycleMethods[method];

    if (!fn) {
        return;
    }

    // TODO: cache
    if (isJSExpression(fn) || isJSFunction(fn)) {
        fn = thisRequiredInJSE ? parseThisRequiredExpression(fn, context) : parseExpression(fn, context);
    }

    if (typeof fn !== 'function') {
        logger.error(`生命周期${method}类型不符`, fn);
        return;
    }

    try {
        return fn.apply(context, args);
    } catch (e) {
        logger.error(`[${schema.componentName}]生命周期${method}出错`, e);
    }
}

/**
 * get children from a node schema
 * @PRIVATE
 */
export function getSchemaChildren(schema: IPublicTypeNodeSchema | undefined) {
    if (!schema) {
        return;
    }

    if (!schema.props) {
        return schema.children;
    }

    if (!schema.children) {
        return schema.props.children;
    }

    if (!schema.props.children) {
        return schema.children;
    }

    let result = ([] as IPublicTypeNodeData[]).concat(schema.children);
    if (Array.isArray(schema.props.children)) {
        result = result.concat(schema.props.children);
    } else {
        result.push(schema.props.children);
    }
    return result;
}

export default function baseRendererFactory(): IBaseRenderComponent {
    //  现在无 BaseRenderer 的初始化逻辑,所以肯定不存在
    const { BaseRenderer: customBaseRenderer } = adapter.getRenderers();

    if (customBaseRenderer) {
        return customBaseRenderer;
    }

    const { Component, createElement } = adapter.getRuntime();
    const Div = divFactory();
    const VisualDom = visualDomFactory();
    const AppContext = contextFactory();

    const DESIGN_MODE = {
        EXTEND: 'extend',
        BORDER: 'border',
        PREVIEW: 'preview',
    };

    const OVERLAY_LIST = ['Dialog', 'Overlay', 'Animate', 'ConfigProvider'];
    const DEFAULT_LOOP_ARG_ITEM = 'item';
    const DEFAULT_LOOP_ARG_INDEX = 'index';
    let scopeIdx = 0;

    return class BaseRenderer extends Component<IBaseRendererProps, Record<string, any>> {
        [key: string]: any;

        static displayName = 'BaseRenderer';

        static defaultProps = {
            __schema: {},
        };

        static contextType = AppContext;

        i18n: any;
        getLocale: any;
        setLocale: any;
        dataSourceMap: Record<string, any> = {};

        __namespace = 'base';
        __compScopes: Record<string, any> = {};
        __instanceMap: Record<string, any> = {};
        __dataHelper: any;

        /**
         * keep track of customMethods added to this context
         */
        __customMethodsList: any[] = [];
        __parseExpression: any;
        __ref: any;

        /**
         * reference of style element contains schema.css
         */
        __styleElement: any;

        constructor(props: IBaseRendererProps, context: IBaseRendererContext) {
            super(props, context);

            this.context = context;

            this.__parseExpression = (str: string, self: any) => {
                return parseExpression({
                    str,
                    self,
                    thisRequired: props?.thisRequiredInJSE,
                    logScope: props.componentName,
                });
            };

            this.__beforeInit(props);
            this.__init(props);
            this.__afterInit(props);
            this.__debug(`constructor - ${props?.__schema?.fileName}`);
        }

        __beforeInit(_props: IBaseRendererProps) {}

        __init(props: IBaseRendererProps) {
            this.__compScopes = {};
            this.__instanceMap = {};
            this.__bindCustomMethods(props);
            this.__initI18nAPIs();
        }

        __afterInit(_props: IBaseRendererProps) {}

        static getDerivedStateFromProps(props: IBaseRendererProps, state: any) {
            const result = executeLifeCycleMethod(
                this,
                props?.__schema,
                'getDerivedStateFromProps',
                [props, state],
                props.thisRequiredInJSE,
            );

            return result === undefined ? null : result;
        }

        async getSnapshotBeforeUpdate(...args: any[]) {
            this.__executeLifeCycleMethod('getSnapshotBeforeUpdate', args);
            this.__debug(`getSnapshotBeforeUpdate - ${this.props?.__schema?.fileName}`);
        }

        async componentDidMount(...args: any[]) {
            this.reloadDataSource();
            this.__executeLifeCycleMethod('componentDidMount', args);
            this.__debug(`componentDidMount - ${this.props?.__schema?.fileName}`);
        }

        async componentDidUpdate(...args: any[]) {
            this.__executeLifeCycleMethod('componentDidUpdate', args);
            this.__debug(`componentDidUpdate - ${this.props.__schema.fileName}`);
        }

        async componentWillUnmount(...args: any[]) {
            this.__executeLifeCycleMethod('componentWillUnmount', args);
            this.__debug(`componentWillUnmount - ${this.props?.__schema?.fileName}`);
        }

        async componentDidCatch(...args: any[]) {
            this.__executeLifeCycleMethod('componentDidCatch', args);
            logger.warn(args);
        }

        reloadDataSource = () => new Promise((resolve, reject) => {
                this.__debug('reload data source');

                if (!this.__dataHelper) {
                    return resolve({});
                }

                this.__dataHelper
                    .getInitData()
                    .then((res: any) => {
                        if (isEmpty(res)) {
                            this.forceUpdate();
                            return resolve({});
                        }
                        this.setState(res, resolve as () => void);
                    })
                    .catch((err: Error) => {
                        reject(err);
                    });
            });

        shouldComponentUpdate() {
            if (this.props.getSchemaChangedSymbol?.() && this.props.__container?.rerender) {
                this.props.__container?.rerender();
                return false;
            }
            return true;
        }

        forceUpdate() {
            if (this.shouldComponentUpdate()) {
                super.forceUpdate();
            }
        }

        /**
         * execute method in schema.lifeCycles
         * @PRIVATE
         */
        __executeLifeCycleMethod = (method: string, args?: any) => {
            executeLifeCycleMethod(this, this.props.__schema, method, args, this.props.thisRequiredInJSE);
        };

        /**
         * this method is for legacy purpose only, which used _ prefix instead of __ as private for some historical reasons
         * @LEGACY
         */
        _getComponentView = (componentName: string) => {
            const { __components } = this.props;

            if (!__components) {
                return;
            }

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

                // 3. JSSlot 插槽处理
                // 例如: { type: 'JSSlot', value: [...] }
                // 🔥 关键差异点：JSSlot的渲染逻辑
                if (isJSSlot(schema)) {
                    // 直接递归渲染JSSlot的value内容
                    // ✅ 如果value=[ComponentA]，会渲染ComponentA
                    // ❌ 如果value=[]，什么都不渲染
                    // 💡 注意：这里不会创建Slot容器节点，只是渲染内容
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
