/**
 * ========================================
 * Page 渲染器工厂模块
 * ========================================
 *
 * 🎯 核心职责：
 * 创建专门处理 componentName === 'Page' 的渲染器类
 *
 * 📄 Page Schema 结构示例：
 * {
 *   componentName: 'Page',
 *   fileName: 'HomePage',
 *   state: {                    // 页面级状态
 *     userInfo: {},
 *     loading: false
 *   },
 *   dataSource: {               // 页面级数据源
 *     list: [...]
 *   },
 *   methods: {                  // 页面级自定义方法
 *     handleLogin() { ... }
 *   },
 *   lifeCycles: {               // 页面级生命周期
 *     componentDidMount() { ... }
 *   },
 *   children: [...]             // 页面子组件
 * }
 *
 * 🔑 关键特性：
 * 1. 提供 this.page 上下文（子组件可访问页面实例）
 * 2. 管理页面级 state（schema.state）
 * 3. 管理页面级数据源（schema.dataSource）
 * 4. 绑定页面级自定义方法（schema.methods）
 * 5. 执行页面级生命周期（schema.lifeCycles）
 *
 * 🆚 与其他渲染器的区别：
 * - PageRenderer: this.page、页面级状态
 * - ComponentRenderer: this.component、组件级状态
 * - BlockRenderer: 无特殊上下文，轻量级
 */

import { getLogger } from '@alilc/lowcode-utils';
import baseRendererFactory from './base';
import { IBaseRendererProps, IBaseRenderComponent } from '../types';

// 📋 日志记录器：用于调试和错误追踪
const logger = getLogger({ level: 'warn', bizName: 'renderer-core:page' });

/**
 * 🏭 Page 渲染器工厂函数
 *
 * @returns PageRenderer 类（继承自 BaseRenderer）
 */
export default function pageRendererFactory(): IBaseRenderComponent {
  // 🏗️ 获取基础渲染器类（包含核心的 Schema 转换逻辑）
  const BaseRenderer = baseRendererFactory();

  /**
   * 📄 PageRenderer 类
   * 继承自 BaseRenderer，添加页面级特性
   */
  return class PageRenderer extends BaseRenderer {
    // 🏷️ 组件显示名称（用于 React DevTools）
    static displayName = 'PageRenderer';

    // 🔖 命名空间标识：用于生成 CSS 类名（lce-page）
    __namespace = 'page';

    /**
     * 🔧 初始化后处理钩子
     *
     * 调用时机：构造函数的最后阶段（super() → __beforeInit → __init → __afterInit）
     *
     * 作用：
     * 1. 注入页面上下文（this.page）
     * 2. 初始化页面状态（schema.state）
     * 3. 初始化数据源（schema.dataSource）
     * 4. 执行 schema.lifeCycles.constructor
     *
     * @param props - 渲染器属性
     * @param rest - 额外参数
     */
    __afterInit(props: IBaseRendererProps, ...rest: unknown[]) {
      // 🌍 生成全局上下文：将自身注入为 page
      // 效果：子组件可以通过 this.page 访问页面实例
      // 例如：this.page.setState({ loading: true })
      this.__generateCtx({
        page: this,  // 注入 page 对象
      });

      const schema = props.__schema || {};

      // 📊 初始化页面状态
      // 解析 schema.state 中的表达式和数据
      // 例如：schema.state = { count: { type: 'JSExpression', value: '0' } }
      //       → this.state = { count: 0 }
      this.state = this.__parseData(schema.state || {});

      // 📡 初始化数据源
      // 解析 schema.dataSource，创建 DataHelper 实例
      // 在 componentDidMount 时会自动请求 isInit: true 的数据源
      this.__initDataSource(props);

      // 🎯 执行构造函数生命周期
      // 如果 schema.lifeCycles.constructor 存在，执行用户自定义的构造逻辑
      this.__executeLifeCycleMethod('constructor', [props, ...rest]);
    }

    /**
     * 🔄 组件更新钩子
     *
     * 作用：同步 schema.state 的变化到组件 state
     *
     * 场景：设计态下，用户在属性面板修改 schema.state
     * 效果：组件自动更新 state，触发重渲染
     *
     * @param prevProps - 上一次的 props
     * @param _prevState - 上一次的 state（未使用）
     * @param snapshot - getSnapshotBeforeUpdate 的返回值
     */
    async componentDidUpdate(prevProps: IBaseRendererProps, _prevState: {}, snapshot: unknown) {
      const { __ctx } = this.props;

      // 🔍 检查 schema.state 是否发生变化
      // 使用 JSON.stringify 比较（简单但可能有性能问题）
      if (JSON.stringify(prevProps.__schema.state) != JSON.stringify(this.props.__schema.state)) {
        // 🔄 重新解析新的 state 数据
        const newState = this.__parseData(this.props.__schema.state, __ctx);

        // 📝 更新组件状态
        this.setState(newState);
      }

      // 🔗 调用父类的 componentDidUpdate（执行用户自定义的生命周期）
      super.componentDidUpdate?.(prevProps, _prevState, snapshot);
    }

    /**
     * 📝 重写 setState 方法
     *
     * 作用：添加日志记录，方便调试
     *
     * @param state - 新状态
     * @param callback - 状态更新后的回调函数
     */
    setState(state: any, callback?: () => void) {
      logger.info('page set state', state);  // 📋 记录状态变化
      super.setState(state, callback);       // 调用父类方法
    }

    /**
     * 🎨 渲染方法
     *
     * 核心流程：
     * 1. 验证 Schema 结构
     * 2. 绑定自定义方法（schema.methods）
     * 3. 初始化数据源
     * 4. 生成页面上下文
     * 5. 执行渲染前处理
     * 6. 渲染页面内容
     *
     * 渲染方式：
     * - 如果用户提供了自定义 Page 组件，使用自定义组件包裹
     * - 否则使用默认的 div 容器包裹
     */
    render() {
      const { __schema, __components } = this.props;

      // ✅ Schema 结构验证
      // 检查 schema.componentName 是否为 'Page'
      if (this.__checkSchema(__schema)) {
        return '页面schema结构异常！';  // 返回错误提示
      }

      // 📋 调试日志
      this.__debug(`${PageRenderer.displayName} render - ${__schema.fileName}`);

      // 🔧 绑定自定义方法到组件实例
      // 将 schema.methods 中的方法绑定到 this
      // 例如：schema.methods.handleClick → this.handleClick
      this.__bindCustomMethods(this.props);

      // 📡 初始化数据源
      // 创建 DataHelper 实例，准备数据请求
      this.__initDataSource(this.props);

      // 🌍 生成页面上下文
      // 确保 this.page 指向当前页面实例
      this.__generateCtx({
        page: this,
      });

      // 🎨 执行渲染前处理
      // 写入 CSS、执行 lifeCycles.render、绑定方法等
      this.__render();

      // 🎯 选择渲染方式

      // 方式1：用户提供了自定义 Page 组件
      const { Page } = __components;
      if (Page) {
        // 使用自定义 Page 组件包裹内容
        // 例如：<Page>{...children}</Page>
        return this.__renderComp(Page, { pageContext: this });
      }

      // 方式2：默认渲染（使用 div 容器）
      // 渲染为：<div className="lce-page">{...children}</div>
      return this.__renderContent(
        this.__renderContextProvider({ pageContext: this })  // 注入 pageContext 到 Context
      );
    }
  };
}
