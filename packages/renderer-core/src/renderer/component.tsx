/**
 * ========================================
 * Component 渲染器工厂模块
 * ========================================
 *
 * 🎯 核心职责：
 * 创建专门处理 componentName === 'Component' 的渲染器类
 *
 * 🧩 Component Schema 结构示例：
 * {
 *   componentName: 'Component',
 *   fileName: 'UserCard',
 *   state: {                    // 组件级状态
 *     expanded: false
 *   },
 *   dataSource: {               // 组件级数据源
 *     list: [...]
 *   },
 *   methods: {                  // 组件级自定义方法
 *     toggle() { this.setState({ expanded: !this.state.expanded }) }
 *   },
 *   props: {
 *     noContainer: false        // 特殊配置：是否不需要容器
 *   },
 *   children: [...]             // 组件子元素
 * }
 *
 * 🔑 关键特性：
 * 1. 提供 this.component 上下文（类似 this.page）
 * 2. 管理组件级 state（独立于页面 state）
 * 3. 支持 noContainer 模式（直接渲染子节点，不包裹容器）
 * 4. 可以被其他页面复用（如公共头部、底部组件）
 *
 * 🆚 与 PageRenderer 的区别：
 * - PageRenderer: 页面入口，提供 this.page，通常只有一个
 * - ComponentRenderer: 可复用组件，提供 this.component，可以有多个
 * - 两者都支持 state、dataSource、methods、lifeCycles
 */

import baseRendererFactory from './base';
import { IBaseRendererProps, IBaseRenderComponent } from '../types';

/**
 * 🏭 Component 渲染器工厂函数
 *
 * @returns CompRenderer 类（继承自 BaseRenderer）
 */
export default function componentRendererFactory(): IBaseRenderComponent {
  // 🏗️ 获取基础渲染器类
  const BaseRenderer = baseRendererFactory();

  /**
   * 🧩 CompRenderer 类
   * 专门处理自定义组件的渲染器
   */
  return class CompRenderer extends BaseRenderer {
    // 🏷️ 组件显示名称
    static displayName = 'CompRenderer';

    // 🔖 命名空间标识：用于生成 CSS 类名（lce-component）
    __namespace = 'component';

    /**
     * 🔧 初始化后处理钩子
     *
     * 作用：
     * 1. 注入组件上下文（this.component）
     * 2. 初始化组件状态
     * 3. 初始化数据源
     * 4. 执行构造函数生命周期
     *
     * @param props - 渲染器属性
     */
    __afterInit(props: IBaseRendererProps) {
      // 🌍 生成组件上下文：注入 component 对象
      // 效果：子组件可通过 this.component 访问父组件实例
      // 场景：组件内的子组件调用父组件的方法
      //       this.component.toggle()
      this.__generateCtx({
        component: this,
      });

      const schema = props.__schema || {};

      // 📊 初始化组件状态
      // 解析 schema.state，将表达式转换为实际值
      this.state = this.__parseData(schema.state || {});

      // 📡 初始化数据源
      // 创建 DataHelper，准备数据请求
      this.__initDataSource(props);

      // 🎯 执行构造函数生命周期
      // 如果 schema.lifeCycles.constructor 存在，执行用户定义的初始化逻辑
      this.__executeLifeCycleMethod('constructor', arguments as any);
    }

    /**
     * 🎨 渲染方法
     *
     * 核心流程：
     * 1. 验证 Schema 结构
     * 2. 生成组件上下文
     * 3. 执行渲染前处理
     * 4. 绑定自定义方法
     * 5. 根据配置选择渲染方式
     */
    render() {
      const { __schema, __components } = this.props;

      // ✅ Schema 结构验证
      // 检查 componentName 是否为 'Component'
      if (this.__checkSchema(__schema)) {
        return '自定义组件 schema 结构异常！';
      }

      // 📋 调试日志
      this.__debug(`${CompRenderer.displayName} render - ${__schema.fileName}`);

      // 🌍 生成组件上下文
      this.__generateCtx({
        component: this,
      });

      // 🎨 执行渲染前处理（写入 CSS、执行 lifeCycles.render 等）
      this.__render();

      // 🔍 解析 noContainer 配置
      // noContainer: true 时，直接渲染子节点，不包裹容器
      // 场景：某些组件不需要额外的 div 包裹，直接渲染内容
      const noContainer = this.__parseData(__schema.props?.noContainer);

      // 🔧 绑定自定义方法
      // 将 schema.methods 绑定到 this
      this.__bindCustomMethods(this.props);

      // 🎯 渲染方式1：无容器模式
      if (noContainer) {
        // 直接返回子节点，不包裹任何容器
        // 注入 compContext 到 Context，子组件可访问 this.component
        return this.__renderContextProvider({ compContext: this });
      }

      // 🎯 渲染方式2：使用自定义组件包裹
      const Component = __components?.[__schema?.componentName];

      if (!Component) {
        // 🏠 没有自定义组件，使用默认 div 容器
        // 渲染为：<div className="lce-component">{...children}</div>
        return this.__renderContent(this.__renderContextProvider({ compContext: this }));
      }

      // 🎁 有自定义组件，使用自定义组件包裹
      // 渲染为：<Component>{...children}</Component>
      // 注意：这里的 Component 是用户通过 components prop 传入的
      return this.__renderComp(Component, this.__renderContextProvider({ compContext: this }));
    }
  };
}
