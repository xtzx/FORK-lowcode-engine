/**
 * @Author  : zhouming
 * @Date    : 2024-09-03 19:44:44
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
 * 返回基础渲染类
 * 渲染的是 schema.componentName 对应的组件
 * Page、Block、Component Div 之一
 */
export default function rendererFactory(): IRenderComponent {
    const {PureComponent, Component, createElement, findDOMNode} = adapter.getRuntime();

    const RENDERER_COMPS: any = adapter.getRenderers();

    const BaseRenderer = baseRendererFactory();
    const AppContext = contextFactory();
    // 为了实现项目中没有 jsx 语法,完全通过适配器的 createElement 语法实现一个 div 组件
    const Div = divFactory();

    const ConfigProvider = adapter.getConfigProvider() || Div;

    const debug = Debug('renderer:entry');

    /**
     * 支持自定义
     * engineRenderError 时候展示错误组件
     */
    class FaultComponent extends PureComponent<IPublicTypeNodeSchema | any> {
        render() {
            logger.error(
                `%c${this.props.componentName || ''} 组件渲染异常, 异常原因: ${
                    this.props.error?.message || this.props.error || '未知'
                }`,
                'color: #ff0000;',
            );
            return createElement(
                Div,
                {
                    style: {
                        width: '100%',
                        height: '50px',
                        lineHeight: '50px',
                        textAlign: 'center',
                        fontSize: '15px',
                        color: '#ff0000',
                        border: '2px solid #ff0000',
                    },
                },
                `${this.props.componentName || ''} 组件渲染异常，请查看控制台日志`,
            );
        }
    }

    /**
     * 支持自定义
     * 组件未找到
     */
    class NotFoundComponent extends PureComponent<
        {
            componentName: string;
        } & IRendererProps
    > {
        render() {
            if (this.props.enableStrictNotFoundMode) {
                return `${this.props.componentName || ''} Component Not Found`;
            }
            return createElement(
                Div,
                this.props,
                this.props.children || `${this.props.componentName || ''} Component Not Found`,
            );
        }
    }

    return class Renderer extends Component<IRendererProps> {
        static displayName = 'Renderer';

        state: Partial<IRendererState> = {};

        __ref: any;

        static defaultProps: IRendererProps = {
            appHelper: undefined,
            components: {},
            designMode: '',
            suspended: false,
            schema: {} as IPublicTypeRootSchema,
            onCompGetRef: () => {},
            onCompGetCtx: () => {},
            thisRequiredInJSE: true,
        };

        static findDOMNode = findDOMNode;

        constructor(props: IRendererProps, context: any) {
            super(props, context);
            this.state = {};
            debug(`entry.constructor - ${props?.schema?.componentName}`);
        }

        async componentDidMount() {
            debug(`entry.componentDidMount - ${this.props.schema && this.props.schema.componentName}`);
        }

        async componentDidUpdate() {
            debug(`entry.componentDidUpdate - ${this.props?.schema?.componentName}`);
        }

        async componentWillUnmount() {
            debug(`entry.componentWillUnmount - ${this.props?.schema?.componentName}`);
        }

        componentDidCatch(error: Error) {
            this.state.engineRenderError = true;
            this.state.error = error;
        }

        shouldComponentUpdate(nextProps: IRendererProps) {
            return !nextProps.suspended;
        }

        __getRef = (ref: any) => {
            this.__ref = ref;

            if (ref) {
                this.props.onCompGetRef?.(this.props.schema, ref);
            }
        };

        /**
         * 意义不明
         */
        isValidComponent(SetComponent: any) {
            return SetComponent;
        }

        createElement(SetComponent: any, props: any, children?: any) {
            return (this.props.customCreateElement || createElement)(SetComponent, props, children);
        }

        getNotFoundComponent() {
            return this.props.notFoundComponent || NotFoundComponent;
        }

        getFaultComponent() {
            const {faultComponent, faultComponentMap, schema} = this.props;

            if (faultComponentMap) {
                const {componentName} = schema;
                return faultComponentMap[componentName] || faultComponent || FaultComponent;
            }

            return faultComponent || FaultComponent;
        }

        getComp() {
            const {schema, components} = this.props;
            const {componentName} = schema;
            const allComponents = {...RENDERER_COMPS, ...components};
            let Comp = allComponents[componentName] || RENDERER_COMPS[`${componentName}Renderer`];

            if (Comp && Comp.prototype) {
                if (!(Comp.prototype instanceof BaseRenderer)) {
                    Comp = RENDERER_COMPS[`${componentName}Renderer`];
                }
            }
            return Comp;
        }

        render() {
            const {schema, designMode, appHelper, components} = this.props;

            // lodash 的 isEmpty 方法
            if (isEmpty(schema)) {
                return null;
            }

            // 兼容乐高区块模板 --> 指的是 Div ?
            // componentName 是 Page、Block、Component Div 之一
            if (schema.componentName !== 'Div' && !isFileSchema(schema)) {
                logger.error(
                    'The root component name needs to be one of Page、Block、Component, please check the schema: ',
                    schema,
                );
                return '模型结构异常';
            }

            debug('entry.render');

            // 渲染器内置的 renderers 和传入的
            const allComponents = {...RENDERER_COMPS, ...components};
            let Comp = this.getComp();

            if (this.state && this.state.engineRenderError) {
                return createElement(this.getFaultComponent(), {
                    ...this.props,
                    error: this.state.error,
                });
            }

            if (Comp) {
                return createElement(
                    AppContext.Provider,
                    {
                        value: {
                            appHelper,
                            components: allComponents,
                            engine: this,
                        },
                    },
                    createElement(
                        ConfigProvider,
                        {
                            // 此处将设备信息传递给了 ConfigProvider
                            device: this.props.device,
                            locale: this.props.locale,
                        },
                        createElement(Comp, {
                            key: schema.__ctx && `${schema.__ctx.lceKey}_${schema.__ctx.idx || '0'}`,
                            ref: this.__getRef,
                            __appHelper: appHelper,
                            __components: allComponents,
                            __schema: schema,
                            __designMode: designMode,
                            ...this.props,
                        }),
                    ),
                );
            }
            return null;
        }
    };
}
