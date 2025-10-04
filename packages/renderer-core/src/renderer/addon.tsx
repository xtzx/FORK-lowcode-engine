/**
 * ========================================
 * Addon 渲染器工厂模块
 * ========================================
 *
 * 🎯 核心职责：
 * 创建专门处理 componentName === 'Addon' 的渲染器类
 *
 * 🔌 Addon（插件）概念：
 * Addon 是一种特殊的组件，可以通过 appHelper.addons[key] 全局访问
 * 类似于单例模式，整个应用共享同一个实例
 *
 * 🧩 Addon Schema 结构示例：
 * {
 *   componentName: 'Addon',
 *   fileName: 'NotificationCenter',
 *   config: {
 *     addonKey: 'notificationCenter'  // 🔑 必需：插件的全局唯一标识
 *   },
 *   state: {
 *     messages: []
 *   },
 *   methods: {
 *     show() { this.setState({ visible: true }) },
 *     hide() { this.setState({ visible: false }) }
 *   },
 *   children: [...]
 * }
 *
 * 💡 使用场景：
 * 1. 全局通知中心：appHelper.addons.notificationCenter.show('消息')
 * 2. 全局对话框：appHelper.addons.confirmDialog.open({ title: '确认' })
 * 3. 全局加载器：appHelper.addons.loader.start()
 *
 * 🔑 关键特性：
 * 1. 全局单例：通过 addonKey 注册到 appHelper.addons
 * 2. 跨组件访问：任何组件都可以通过 this.appHelper.addons[key] 访问
 * 3. 生命周期管理：卸载时自动从 addons 注销
 * 4. 默认方法：提供 open()、close() 方法（可被覆盖）
 */

import PropTypes from 'prop-types';
import baseRendererFactory from './base';
import { isEmpty } from '../utils';
import { IRendererAppHelper, IBaseRendererProps, IBaseRenderComponent } from '../types';
import logger from '../utils/logger';

/**
 * 🏭 Addon 渲染器工厂函数
 *
 * @returns AddonRenderer 类（继承自 BaseRenderer）
 */
export default function addonRendererFactory(): IBaseRenderComponent {
  // 🏗️ 获取基础渲染器类
  const BaseRenderer = baseRendererFactory();

  /**
   * 🔌 AddonRenderer 类
   * 插件渲染器，支持全局访问的组件
   */
  return class AddonRenderer extends BaseRenderer {
    // 🏷️ 组件显示名称
    static displayName = 'AddonRenderer';

    // 🔖 命名空间标识：用于生成 CSS 类名（lce-addon）
    __namespace = 'addon';

    // ✅ PropTypes 验证：定义组件的属性类型
    static propTypes = {
      config: PropTypes.object,   // 插件配置对象（必须包含 addonKey）
      __schema: PropTypes.object, // Schema 数据
    };

    // 📝 默认属性值
    static defaultProps = {
      config: {},
      __schema: {},
    };

    // ========== 实例属性 ==========

    // 🔑 插件的全局唯一标识（来自 config.addonKey）
    addonKey: any;

    // 🛠️ 应用辅助工具引用
    appHelper: IRendererAppHelper;

    // 📂 插件默认方法（可被 schema.methods 覆盖）
    open: () => any;   // 打开插件的方法
    close: () => any;  // 关闭插件的方法

    /**
     * 🔧 初始化后处理钩子
     *
     * 核心流程：
     * 1. 生成组件上下文
     * 2. 初始化状态
     * 3. 验证配置（必须有 addonKey）
     * 4. 注册插件到 appHelper.addons
     * 5. 初始化数据源
     * 6. 设置默认方法
     *
     * @param props - 渲染器属性
     */
    __afterInit(props: IBaseRendererProps) {
      // 🌍 生成组件上下文
      this.__generateCtx({
        component: this,  // 注入 component 对象
      });

      const schema = props.__schema || {};

      // 📊 初始化状态
      this.state = this.__parseData(schema.state || {});

      // ✅ 配置验证：addonKey 是必需的
      if (isEmpty(props.config) || !props.config?.addonKey) {
        logger.warn('lce addon has wrong config');
        this.setState({
          __hasError: true,  // 标记错误状态
        });
        return;
      }

      // 🔑 注册插件到全局
      this.addonKey = props.config.addonKey;  // 保存插件 key
      this.appHelper.addons = this.appHelper.addons || {};  // 确保 addons 对象存在
      this.appHelper.addons[this.addonKey] = this;  // 🔥 注册插件实例

      // 📡 初始化数据源
      this.__initDataSource(props);

      // 📂 设置默认方法（如果 schema.methods 未定义）
      this.open = this.open || (() => { });   // 默认的 open 方法（空函数）
      this.close = this.close || (() => { }); // 默认的 close 方法（空函数）

      // 🎯 执行构造函数生命周期
      this.__executeLifeCycleMethod('constructor', [...arguments]);
    }

    /**
     * 🗑️ 组件卸载钩子
     *
     * 作用：从 appHelper.addons 注销插件，避免内存泄漏
     *
     * 场景：
     * - 页面卸载时
     * - 插件动态移除时
     */
    async componentWillUnmount() {
      // 🔗 调用父类的卸载逻辑
      super.componentWillUnmount?.apply(this, [...arguments] as any);

      // 🧹 从全局注销插件
      const config = this.props.config || {};
      if (config && this.appHelper.addons) {
        delete this.appHelper.addons[config.addonKey];  // 🔥 移除插件引用
      }
    }

    /**
     * 🛠️ 获取工具函数集合
     *
     * 作用：合并全局 utils 和 context 中的 utils
     *
     * @returns 合并后的工具函数对象
     */
    get utils() {
      const { utils = {} } = this.context.config || {};
      return { ...this.appHelper.utils, ...utils };  // 合并两个来源的 utils
    }

    /**
     * 🎨 渲染方法
     *
     * 核心流程：
     * 1. 验证 Schema 结构
     * 2. 生成组件上下文
     * 3. 执行渲染前处理
     * 4. 渲染内容
     */
    render() {
      const { __schema } = this.props;

      // ✅ Schema 结构验证
      if (this.__checkSchema(__schema)) {
        return '插件 schema 结构异常！';
      }

      // 📋 调试日志
      this.__debug(`${AddonRenderer.displayName} render - ${__schema.fileName}`);

      // 🌍 生成组件上下文
      this.__generateCtx({
        component: this,
      });

      // 🎨 执行渲染前处理
      this.__render();

      // 🏠 渲染内容：使用默认 div 容器
      // 注入 compContext，子组件可以访问插件实例
      return this.__renderContent(this.__renderContextProvider({ compContext: this }));
    }
  };
}
