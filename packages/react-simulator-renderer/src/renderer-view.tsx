// ==================== 依赖导入 ====================
import { ReactInstance, Fragment, Component, createElement } from 'react';
import { Router, Route, Switch } from 'react-router';  // React Router v5
import cn from 'classnames';  // CSS 类名工具
import { Node } from '@alilc/lowcode-designer';  // 节点模型
import LowCodeRenderer from '@alilc/lowcode-react-renderer';  // 低代码渲染器
import { observer } from 'mobx-react';  // MobX 响应式装饰器
import { getClosestNode, isFromVC, isReactComponent } from '@alilc/lowcode-utils';  // 工具函数
import { GlobalEvent } from '@alilc/lowcode-types';  // 全局事件类型
import { SimulatorRendererContainer, DocumentInstance } from './renderer';  // 渲染器容器
import { host } from './host';  // 宿主对象
import { isRendererDetached } from './utils/misc';  // 工具：检查渲染器是否分离
import './renderer.less';  // 样式文件
import { createIntl } from './locale';  // 国际化工具

// ==================== React.cloneElement 补丁 ====================
/**
 * 🔧 补丁：修复 React.cloneElement 丢失 ref 的问题
 *
 * 问题：React.cloneElement 在某些情况下会导致 ref 丢失
 * 解决：合并父子组件的 ref，确保两个 ref 都能正常工作
 *
 * 注意：_leaf 属性被特殊处理（不传递给克隆元素）
 */
const originCloneElement = window.React.cloneElement;  // 保存原始方法
(window as any).React.cloneElement = (child: any, { _leaf, ...props }: any = {}, ...rest: any[]) => {
  // ===== 处理 ref 合并 =====
  // 如果子元素和新 props 都有 ref，需要合并
  if (child.ref && props.ref) {
    const dRef = props.ref;  // 新的 ref（destination）
    const cRef = child.ref;  // 原有的 ref（child）

    // 创建合并的 ref 函数
    props.ref = (x: any) => {
      // --- 调用子元素的原始 ref ---
      if (cRef) {
        if (typeof cRef === 'function') {
          // 函数式 ref
          cRef(x);
        } else {
          // 对象式 ref (React.createRef 或 useRef)
          try {
            cRef.current = x;
          } catch (e) {
            console.error(e);
          }
        }
      }

      // --- 调用新的 ref ---
      if (dRef) {
        if (typeof dRef === 'function') {
          // 函数式 ref
          dRef(x);
        } else {
          // 对象式 ref
          try {
            dRef.current = x;
          } catch (e) {
            console.error(e);
          }
        }
      }
    };
  }

  // 调用原始的 cloneElement（_leaf 已被过滤掉）
  return originCloneElement(child, props, ...rest);
};

// ==================== 根视图组件 ====================
/**
 * 📱 SimulatorRendererView - 模拟器渲染视图主组件
 *
 * 定位：整个渲染器的根组件
 *
 * 职责：
 * 1. 设置路由系统（Router）
 * 2. 应用全局布局（Layout）
 * 3. 渲染路由内容（Routes）
 *
 * 组件层级：
 * SimulatorRendererView
 * └─ Router（内存路由）
 *    └─ Layout（布局容器）
 *       └─ Routes（路由配置）
 *          └─ Route（具体路由）
 *             └─ Renderer（文档渲染器）
 */
export default class SimulatorRendererView extends Component<{ rendererContainer: SimulatorRendererContainer }> {
  /**
   * 渲染根视图
   *
   * 结构说明：
   * - Router: 提供路由上下文，使用内存路由（不依赖 URL）
   * - Layout: 应用全局布局（如果配置了的话）
   * - Routes: 为每个文档实例创建路由
   */
  render() {
    const { rendererContainer } = this.props;  // 获取渲染器容器引用

    return (
      // ===== 路由容器 =====
      // 使用内存路由管理多文档切换（history 由渲染器容器创建）
      <Router history={rendererContainer.history}>
        {/* ===== 布局容器 ===== */}
        {/* Layout 提供全局布局容器（可选） */}
        <Layout rendererContainer={rendererContainer}>
          {/* ===== 路由配置 ===== */}
          {/* Routes 根据路由渲染对应文档 */}
          <Routes rendererContainer={rendererContainer} />
        </Layout>
      </Router>
    );
  }
}

// ==================== 路由配置组件 ====================
/**
 * 🛤️ Routes - 路由配置组件
 *
 * 职责：为每个文档实例创建对应的路由
 *
 * 响应式：使用 @observer 装饰器，自动响应文档列表变化
 *
 * 工作流程：
 * 1. 从渲染器容器获取所有文档实例
 * 2. 为每个文档实例创建一个 Route
 * 3. 当路由匹配时，渲染对应的 Renderer 组件
 */
@observer
export class Routes extends Component<{ rendererContainer: SimulatorRendererContainer }> {
  /**
   * 渲染所有路由
   *
   * Switch: React Router 组件，确保只渲染第一个匹配的路由
   */
  render() {
    const { rendererContainer } = this.props;  // 获取渲染器容器引用

    return (
      // ===== 路由切换容器 =====
      <Switch>
        {/* ===== 遍历所有文档实例，创建路由 ===== */}
        {rendererContainer.documentInstances.map((instance) => {
          return (
            <Route
              path={instance.path}  // 路由路径（格式：/文档名）
              key={instance.id}  // 唯一标识
              // render 方法：渲染 Renderer 组件，传入文档实例和路由属性
              render={(routeProps) => (
                <Renderer
                  documentInstance={instance}  // 文档实例
                  rendererContainer={rendererContainer}  // 渲染器容器
                  {...routeProps}  // 路由属性（history、location、match）
                />
              )}
            />
          );
        })}
      </Switch>
    );
  }
}

// ==================== 工具函数：首字母大写 ====================
/**
 * 将字符串首字母转为大写
 *
 * @param s - 输入字符串
 * @returns 首字母大写的字符串
 *
 * 示例：'mobile' -> 'Mobile'
 */
function ucfirst(s: string) {
  return s.charAt(0).toUpperCase() + s.substring(1);
}

// ==================== 工具函数：获取设备视图 ====================
/**
 * 获取适配设备和模式的组件视图
 *
 * @param view - 组件或视图配置
 * @param device - 设备类型（'mobile'、'desktop' 等）
 * @param mode - 设计模式（'design'、'preview' 等）
 * @returns 适配的组件视图
 *
 * 工作机制：
 * 1. 如果 view 是简单类型（字符串或空），直接返回
 * 2. 如果 view 是对象，尝试按设备类型获取：view.Mobile
 * 3. 继续尝试按模式获取：view.Preview
 *
 * 示例：
 * view = { Mobile: MobileButton, Preview: PreviewButton }
 * device = 'mobile' -> view.Mobile
 * mode = 'preview' -> view.Preview
 */
function getDeviceView(view: any, device: string, mode: string) {
  // 如果不是对象，直接返回
  if (!view || typeof view === 'string') {
    return view;
  }

  // ===== 按设备类型获取视图 =====
  // compatible vision Mobile | Preview
  device = ucfirst(device);  // 首字母大写
  if (device === 'Mobile' && view.hasOwnProperty(device)) {
    view = view[device];  // 获取移动端视图
  }

  // ===== 按模式获取视图 =====
  mode = ucfirst(mode);  // 首字母大写
  if (mode === 'Preview' && view.hasOwnProperty(mode)) {
    view = view[mode];  // 获取预览态视图
  }

  return view;
}

// ==================== 布局容器组件 ====================
/**
 * 🎨 Layout - 布局容器组件
 *
 * 职责：应用全局布局（如果配置了的话）
 *
 * 响应式：使用 @observer 装饰器，自动响应布局配置变化
 *
 * 布局配置来源：
 * - host.project.get('config').layout
 *
 * 布局配置格式：
 * 1. { Component: React组件, props: 属性 }
 * 2. { componentName: '组件名', props: 属性 }
 * 3. null/undefined - 不使用布局
 */
@observer
class Layout extends Component<{ rendererContainer: SimulatorRendererContainer }> {
  /**
   * 渲染布局
   *
   * 逻辑：
   * 1. 如果配置了布局组件，使用布局组件包裹 children
   * 2. 如果没有配置，使用 Fragment 直接渲染 children
   */
  render() {
    const { rendererContainer, children } = this.props;  // 获取渲染器容器和子元素
    const { layout } = rendererContainer;  // 获取布局配置

    // ===== 情况1：配置了布局 =====
    if (layout) {
      const { Component, props, componentName } = layout;

      // --- 方式1：直接提供组件类 ---
      if (Component) {
        return <Component key="layout" props={props}>{children}</Component>;
      }

      // --- 方式2：通过组件名查找 ---
      if (componentName && rendererContainer.getComponent(componentName)) {
        return createElement(
          rendererContainer.getComponent(componentName),  // 从组件映射表获取组件
          {
            ...props,  // 布局属性
            rendererContainer,  // 传递渲染器容器引用
            key: 'layout',  // React key
          },
          [children],  // 子元素（必须是数组格式）
        );
      }
    }

    // ===== 情况2：没有配置布局 =====
    // 使用 Fragment 直接渲染子元素（无额外包裹）
    return <Fragment>{children}</Fragment>;
  }
}

// ==================== 核心渲染组件 ====================
/**
 * 🎯 Renderer - 核心渲染组件
 *
 * 定位：整个渲染器的核心，负责将 Schema 转换为 React 组件树
 *
 * 职责：
 * 1. 接收文档实例，获取 Schema
 * 2. 使用 LowCodeRenderer 渲染 Schema
 * 3. 自定义 createElement，实现设计态特殊处理
 * 4. 监控渲染性能
 * 5. 挂载组件实例到文档实例
 *
 * 响应式：使用 @observer 装饰器，自动响应 Schema 变化
 *
 * 关键机制：
 * - customCreateElement：拦截组件创建，添加设计态逻辑
 * - onCompGetRef：获取组件实例引用，建立设计器与渲染器的桥梁
 */
@observer
class Renderer extends Component<{
  rendererContainer: SimulatorRendererContainer;  // 渲染器容器引用
  documentInstance: DocumentInstance;  // 文档实例引用
}> {
  // ========== 性能监控属性 ==========
  /**
   * 渲染开始时间戳
   * 用于计算渲染耗时，进行性能监控
   */
  startTime: number | null = null;

  /**
   * Schema 变化标记
   * 用于优化渲染：标记 Schema 是否发生变化
   * false: Schema 未变化，可能是其他原因导致的重渲染
   * true: Schema 变化了，这是一次真正的更新
   */
  schemaChangedSymbol = false;

  // ========== 生命周期：更新后 ==========
  /**
   * 组件更新后钩子
   * 记录渲染时间，用于性能分析
   */
  componentDidUpdate() {
    this.recordTime();
  }

  // ========== 私有方法：记录渲染时间 ==========
  /**
   * 记录并上报渲染时间
   *
   * 上报内容：
   * - componentName: 'Renderer'
   * - type: 'All'（全量渲染）
   * - time: 渲染耗时（毫秒）
   * - nodeCount: 节点数量
   *
   * 用途：性能监控，帮助发现渲染性能问题
   */
  recordTime() {
    if (this.startTime) {
      // 计算渲染耗时
      const time = Date.now() - this.startTime;

      // 获取节点数量
      const nodeCount = host.designer.currentDocument?.getNodeCount?.();

      // 通过事件总线上报
      host.designer.editor?.eventBus.emit(GlobalEvent.Node.Rerender, {
        componentName: 'Renderer',  // 组件名
        type: 'All',  // 渲染类型（全量渲染）
        time,  // 耗时
        nodeCount,  // 节点数量
      });
    }
  }

  // ========== 生命周期：挂载后 ==========
  /**
   * 组件挂载后钩子
   * 记录首次渲染时间
   */
  componentDidMount() {
    this.recordTime();
  }

  // ========== 公开方法：获取 Schema 变化标记 ==========
  /**
   * 获取 Schema 是否变化的标记
   *
   * @returns Schema 变化标记
   *
   * 用途：提供给 LowCodeRenderer，用于优化渲染
   */
  getSchemaChangedSymbol = () => {
    return this.schemaChangedSymbol;
  };

  // ========== 公开方法：设置 Schema 变化标记 ==========
  /**
   * 设置 Schema 是否变化的标记
   *
   * @param symbol - Schema 变化标记
   *
   * 用途：LowCodeRenderer 会调用此方法，标记 Schema 是否变化
   */
  setSchemaChangedSymbol = (symbol: boolean) => {
    this.schemaChangedSymbol = symbol;
  };

  // ========== 渲染方法 ==========
  /**
   * 渲染文档
   *
   * 核心流程：
   * 1. 提取配置和上下文
   * 2. 记录渲染开始时间
   * 3. 检查是否允许渲染
   * 4. 使用 LowCodeRenderer 渲染 Schema
   * 5. 通过 customCreateElement 拦截组件创建
   * 6. 通过 onCompGetRef 挂载组件实例
   */
  render() {
    // ===== 第1步：提取配置 =====
    const { documentInstance, rendererContainer: renderer } = this.props;  // 获取文档实例和渲染器容器
    const { container, document } = documentInstance;  // 获取容器和文档引用
    const { designMode, device, locale } = container;  // 获取设计模式、设备类型、语言环境
    const messages = container.context?.utils?.i18n?.messages || {};  // 获取国际化消息

    // ===== 第2步：性能监控 =====
    // 记录渲染开始时间
    this.startTime = Date.now();
    // 重置 Schema 变化标记
    this.schemaChangedSymbol = false;

    // ===== 第3步：检查是否允许渲染 =====
    // autoRender 为 false 或渲染器已分离时，不渲染
    if (!container.autoRender || isRendererDetached()) {
      return null;
    }

    // ===== 第4步：创建国际化工具 =====
    const { intl } = createIntl(locale);  // 国际化函数

    // ===== 第5步：渲染 LowCodeRenderer =====
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
