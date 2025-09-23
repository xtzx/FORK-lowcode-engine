import { ReactInstance, Fragment, Component, createElement } from 'react';
import { Router, Route, Switch } from 'react-router';
import cn from 'classnames';
import { Node } from '@alilc/lowcode-designer';
import LowCodeRenderer from '@alilc/lowcode-react-renderer';
import { observer } from 'mobx-react';
import { getClosestNode, isFromVC, isReactComponent } from '@alilc/lowcode-utils';
import { GlobalEvent } from '@alilc/lowcode-types';
import { SimulatorRendererContainer, DocumentInstance } from './renderer';
import { host } from './host';
import { isRendererDetached } from './utils/misc';
import './renderer.less';
import { createIntl } from './locale';

// patch cloneElement avoid lost keyProps
const originCloneElement = window.React.cloneElement;
(window as any).React.cloneElement = (child: any, { _leaf, ...props }: any = {}, ...rest: any[]) => {
  if (child.ref && props.ref) {
    const dRef = props.ref;
    const cRef = child.ref;
    props.ref = (x: any) => {
      if (cRef) {
        if (typeof cRef === 'function') {
          cRef(x);
        } else {
          try {
            cRef.current = x;
          } catch (e) {
            console.error(e);
          }
        }
      }
      if (dRef) {
        if (typeof dRef === 'function') {
          dRef(x);
        } else {
          try {
            dRef.current = x;
          } catch (e) {
            console.error(e);
          }
        }
      }
    };
  }
  return originCloneElement(child, props, ...rest);
};

/**
 * 模拟器渲染视图主组件
 * 作为渲染器的根组件，负责：
 * 1. 设置路由系统
 * 2. 应用全局布局
 * 3. 渲染路由内容
 */
export default class SimulatorRendererView extends Component<{ rendererContainer: SimulatorRendererContainer }> {
  render() {
    const { rendererContainer } = this.props;
    return (
      // 使用内存路由管理多文档切换
      <Router history={rendererContainer.history}>
        {/* Layout 提供全局布局容器 */}
        <Layout rendererContainer={rendererContainer}>
          {/* Routes 根据路由渲染对应文档 */}
          <Routes rendererContainer={rendererContainer} />
        </Layout>
      </Router>
    );
  }
}

/**
 * 路由配置组件
 * 为每个文档实例创建对应的路由
 * 使用 MobX observer 响应文档变化
 */
@observer
export class Routes extends Component<{ rendererContainer: SimulatorRendererContainer }> {
  render() {
    const { rendererContainer } = this.props;
    return (
      <Switch>
        {rendererContainer.documentInstances.map((instance) => {
          return (
            <Route
              path={instance.path}
              key={instance.id}
              render={(routeProps) => <Renderer documentInstance={instance} rendererContainer={rendererContainer} {...routeProps} />}
            />
          );
        })}
      </Switch>
    );
  }
}
function ucfirst(s: string) {
  return s.charAt(0).toUpperCase() + s.substring(1);
}
function getDeviceView(view: any, device: string, mode: string) {
  if (!view || typeof view === 'string') {
    return view;
  }

  // compatible vision Mobile | Preview
  device = ucfirst(device);
  if (device === 'Mobile' && view.hasOwnProperty(device)) {
    view = view[device];
  }
  mode = ucfirst(mode);
  if (mode === 'Preview' && view.hasOwnProperty(mode)) {
    view = view[mode];
  }
  return view;
}

@observer
class Layout extends Component<{ rendererContainer: SimulatorRendererContainer }> {
  render() {
    const { rendererContainer, children } = this.props;
    const { layout } = rendererContainer;
    if (layout) {
      const { Component, props, componentName } = layout;
      if (Component) {
        return <Component key="layout" props={props}>{children}</Component>;
      }
      if (componentName && rendererContainer.getComponent(componentName)) {
        return createElement(
          rendererContainer.getComponent(componentName),
          {
            ...props,
            rendererContainer,
            key: 'layout',
          },
          [children],
        );
      }
    }

    return <Fragment>{children}</Fragment>;
  }
}

/**
 * 核心渲染组件
 * 负责将单个文档的 Schema 渲染为 React 组件树
 * 使用 LowCodeRenderer 完成实际的 Schema 转换
 */
@observer
class Renderer extends Component<{
  rendererContainer: SimulatorRendererContainer;
  documentInstance: DocumentInstance;
}> {
  // 渲染开始时间，用于性能监控
  startTime: number | null = null;
  // Schema 是否变化标记，用于优化渲染
  schemaChangedSymbol = false;

  componentDidUpdate() {
    this.recordTime();
  }

  recordTime() {
    if (this.startTime) {
      const time = Date.now() - this.startTime;
      const nodeCount = host.designer.currentDocument?.getNodeCount?.();
      host.designer.editor?.eventBus.emit(GlobalEvent.Node.Rerender, {
        componentName: 'Renderer',
        type: 'All',
        time,
        nodeCount,
      });
    }
  }

  componentDidMount() {
    this.recordTime();
  }

  getSchemaChangedSymbol = () => {
    return this.schemaChangedSymbol;
  };

  setSchemaChangedSymbol = (symbol: boolean) => {
    this.schemaChangedSymbol = symbol;
  };

  render() {
    const { documentInstance, rendererContainer: renderer } = this.props;
    const { container, document } = documentInstance;
    const { designMode, device, locale } = container;
    const messages = container.context?.utils?.i18n?.messages || {};
    // 记录渲染开始时间
    this.startTime = Date.now();
    // 重置 Schema 变化标记
    this.schemaChangedSymbol = false;

    if (!container.autoRender || isRendererDetached()) {
      return null;
    }

    const { intl } = createIntl(locale);

    return (
      // LowCodeRenderer 是核心渲染器，负责将 Schema 转换为 React 组件
      <LowCodeRenderer
        locale={locale}                                    // 语言设置
        messages={messages}                                // 国际化消息
        schema={documentInstance.schema}                   // 页面 Schema
        components={container.components}                  // 组件库
        appHelper={container.context}                      // 应用上下文（utils、constants 等）
        designMode={designMode}                            // 设计模式（design/preview）
        device={device}                                    // 设备类型
        documentId={document.id}                           // 文档 ID
        suspended={renderer.suspended}                     // 是否暂停渲染
        self={renderer.scope}                              // 作用域
        getSchemaChangedSymbol={this.getSchemaChangedSymbol}  // 获取 Schema 变化标记
        setSchemaChangedSymbol={this.setSchemaChangedSymbol}  // 设置 Schema 变化标记
        getNode={(id: string) => documentInstance.getNode(id) as Node}  // 获取节点方法
        rendererName="PageRenderer"                        // 渲染器名称
        thisRequiredInJSE={host.thisRequiredInJSE}        // JSExpression 中是否需要 this
        notFoundComponent={host.notFoundComponent}         // 组件未找到时的备用组件
        faultComponent={host.faultComponent}               // 组件渲染出错时的备用组件
        faultComponentMap={host.faultComponentMap}         // 特定组件的错误备用组件
        // 🎨 自定义 createElement 方法，用于设计态特殊处理
        // 这是实现设计态事件拦截和特殊渲染逻辑的核心入口
        customCreateElement={(Component: any, props: any, children: any) => {
          // 提取组件ID，其余属性作为渲染属性
          const { __id, ...viewProps } = props;
          viewProps.componentId = __id;  // 设置组件ID，用于事件处理时定位节点

          // 获取对应的节点实例，包含组件元信息和状态
          const leaf = documentInstance.getNode(__id) as Node;

          // 如果是低代码组件，添加节点引用
          if (isFromVC(leaf?.componentMeta)) {
            viewProps._leaf = leaf.internalToShellNode();
          }

          // 设置组件名称，用于调试和特殊处理
          viewProps._componentName = leaf?.componentName;
          // 🎯 空容器占位符逻辑：为空容器添加可视化占位，方便设计时拖拽操作
          if (
            !viewProps.dataSource &&                                // 无数据源
            leaf?.isContainer() &&                                   // 是容器组件
            (children == null || (Array.isArray(children) && !children.length)) && // 无子元素
            (!viewProps.style || Object.keys(viewProps.style).length === 0)        // 无自定义样式
          ) {
            // 设置默认占位文本
            let defaultPlaceholder = intl('Drag and drop components or templates here');

            // 检查是否存在锁定的父节点
            const lockedNode = getClosestNode(leaf, (node) => {
              return node?.getExtraProp('isLocked')?.getValue() === true;
            });

            // 如果节点被锁定，显示锁定提示
            if (lockedNode) {
              defaultPlaceholder = intl('Locked elements and child elements cannot be edited');
            }

            // 创建占位符元素，提供可视化的拖拽目标区域
            children = (
              <div className={cn('lc-container-placeholder', { 'lc-container-locked': !!lockedNode })} style={viewProps.placeholderStyle}>
                {viewProps.placeholder || defaultPlaceholder}
              </div>
            );
          }
          // 🛡️ 设计态事件拦截：防止特定组件在设计态执行真实的业务逻辑

          // 链接组件：移除href属性，防止设计态跳转
          if (viewProps._componentName === 'a') {
            delete viewProps.href;  // 阻止设计态下的页面跳转
          }

          // 菜单组件：设计态事件拦截示例
          // FIXME: 渲染仍有问题
          if (viewProps._componentName === 'Menu') {
            Object.assign(viewProps, {
              _componentName: 'Menu',
              className: '_css_pesudo_menu_kbrzyh0f',
              context: { VE: (window as any).VisualEngine },
              direction: undefined,
              events: { ignored: true },              // 🚫 忽略所有事件，防止设计态触发业务逻辑
              fieldId: 'menu_kbrzyh0f',
              footer: '',
              header: '',
              mode: 'inline',
              onItemClick: { ignored: true },         // 🚫 忽略点击事件
              onSelect: { ignored: true },           // 🚫 忽略选择事件
              popupAlign: 'follow',
              selectMode: false,
              triggerType: 'click',
            });
          }

          // 💡 这里可以添加更多组件的设计态事件拦截逻辑
          // 典型的拦截模式：
          // if (designMode === 'design') {
          //   if (viewProps.onClick) {
          //     viewProps.onClick = (e) => {
          //       e.stopPropagation();
          //       // 触发设计器选中逻辑而不是原始事件
          //       designer.selectNode(leaf.id);
          //     };
          //   }
          // }

          // 🔍 组件有效性检查
          if (!isReactComponent(Component)) {
            console.error(`${viewProps._componentName} is not a react component!`);
            return null;
          }

          // 🎨 最终渲染：应用设备视图和所有设计态处理后的属性
          return createElement(
            getDeviceView(Component, device, designMode),  // 获取适配设备的组件视图
            viewProps,                                      // 经过设计态处理的属性
            // 容器组件需要规范化children格式，确保始终是数组
            leaf?.isContainer() ? (children == null ? [] : Array.isArray(children) ? children : [children]) : children,
          );
        }}
        __host={host}
        __container={container}
        onCompGetRef={(schema: any, ref: ReactInstance | null) => {
          documentInstance.mountInstance(schema.id, ref);
        }}
        enableStrictNotFoundMode={host.enableStrictNotFoundMode}
      />
    );
  }
}
