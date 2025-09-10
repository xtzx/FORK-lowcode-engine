/**
 * ========================================
 * 📦 依赖导入模块
 * ========================================
 */

// 🔥 核心响应式系统依赖 - MobX 相关
import {
  obx, // MobX 可观察装饰器
  autorun, // 自动运行副作用函数
  reaction, // 响应式计算函数
  computed, // 计算属性装饰器
  getPublicPath, // 获取公共路径工具
  engineConfig, // 引擎配置管理器
  globalLocale, // 全局国际化管理
  IReactionPublic, // 响应式函数接口
  IReactionOptions, // 响应式选项接口
  IReactionDisposer, // 响应式销毁函数接口
  makeObservable, // 使对象可观察
  createModuleEventBus, // 创建模块事件总线
  IEventBus, // 事件总线接口
} from '@alilc/lowcode-editor-core';

// 🎯 模拟器核心接口和类型
import {
  ISimulatorHost, // 模拟器宿主接口
  Component, // React组件类型
  DropContainer, // 拖放容器接口
} from '../simulator';

// 📐 视口管理和模拟器创建
import Viewport from './viewport'; // 视口管理器
import { createSimulator } from './create-simulator'; // 模拟器创建工厂函数

// 📄 文档和节点管理
import { Node, INode, contains, isRootNode, isLowCodeComponent } from '../document';

// 🔗 资源消费者 - 负责加载和管理各种资源
import ResourceConsumer from './resource-consumer';

// 🛠️ 工具函数和类型定义
import {
  AssetLevel, // 资源级别枚举
  Asset, // 资源类型
  AssetList, // 资源列表类型
  assetBundle, // 资源打包工具
  assetItem, // 资源项工具
  AssetType, // 资源类型枚举
  isElement, // DOM元素判断
  isFormEvent, // 表单事件判断
  hasOwnProperty, // 对象属性判断
  UtilsMetadata, // 工具函数元数据类型
  getClosestNode, // 获取最近节点
  transactionManager, // 事务管理器
  isDragAnyObject, // 拖拽对象判断
  isDragNodeObject, // 拖拽节点对象判断
  isLocationData, // 位置数据判断
  Logger, // 日志记录器
} from '@alilc/lowcode-utils';

// 🎨 设计器相关工具和类型
import {
  isShaken, // 抖动判断
  ILocateEvent, // 定位事件接口
  isChildInline, // 内联子元素判断
  isRowContainer, // 行容器判断
  getRectTarget, // 获取矩形目标
  CanvasPoint, // 画布坐标点
  Designer, // 设计器类
  IDesigner, // 设计器接口
} from '../designer';

// 📋 元数据解析和点击处理
import { parseMetadata } from './utils/parse-metadata'; // 元数据解析工具
import { getClosestClickableNode } from './utils/clickable'; // 可点击节点查找

// 🏗️ 公共类型定义
import {
  IPublicTypeComponentMetadata, // 组件元数据接口
  IPublicTypePackage, // 包定义接口
  IPublicEnumTransitionType, // 过渡类型枚举
  IPublicEnumDragObjectType, // 拖拽对象类型枚举
  IPublicTypeNodeInstance, // 节点实例接口
  IPublicTypeComponentInstance, // 组件实例接口
  IPublicTypeLocationChildrenDetail, // 位置子元素详情接口
  IPublicTypeLocationDetailType, // 位置详情类型接口
  IPublicTypeRect, // 矩形接口
  IPublicModelNode, // 节点模型接口
} from '@alilc/lowcode-types';

// 🖥️ 渲染器和相关组件
import { BuiltinSimulatorRenderer } from './renderer'; // 内置模拟器渲染器
import { clipboard } from '../designer/clipboard'; // 剪贴板功能
import { LiveEditing } from './live-editing/live-editing'; // 实时编辑功能

// 📁 项目和滚动管理
import { IProject, Project } from '../project'; // 项目接口和类
import { IScroller } from '../designer/scroller'; // 滚动器接口

// 🔧 辅助工具函数
import { isElementNode, isDOMNodeVisible } from '../utils/misc'; // 节点判断工具
import { debounce } from 'lodash'; // 防抖函数

/**
 * ========================================
 * 📝 全局配置和类型定义
 * ========================================
 */

// 🔍 日志记录器 - 用于调试和错误追踪
const logger = new Logger({ level: 'warn', bizName: 'designer' });

/**
 * 📚 组件库项类型定义
 *
 * 扩展了公共包接口，添加了模拟器特有的属性
 */
export type LibraryItem = IPublicTypePackage & {
  package: string; // 包名称标识
  library: string; // 库名称标识
  urls?: Asset; // 生产环境资源 URL 列表
  editUrls?: Asset; // 编辑环境资源 URL 列表（开发时使用）
};

/**
 * 📱 设备样式属性接口
 *
 * 定义不同设备模拟时的样式配置
 */
export interface DeviceStyleProps {
  canvas?: object; // 画布容器样式（设备外框）
  viewport?: object; // 视口样式（内容区域）
}

/**
 * ⚙️ 内置模拟器属性配置接口
 *
 * 定义模拟器的所有可配置选项
 */
export interface BuiltinSimulatorProps {
  // 从 documentModel 上获取
  // suspended?: boolean;  // 暂停状态（从文档模型继承）

  /** 设计模式配置 */
  designMode?: 'live' | 'design' | 'preview' | 'extend' | 'border';

  /** 设备类型 - 影响画布大小和样式 */
  device?: 'mobile' | 'iphone' | string;

  /** 自定义设备样式类名 */
  deviceClassName?: string;

  /** 环境变量资源 - 基础运行时依赖 */
  environment?: Asset;

  // @TODO 补充类型
  /** 请求处理器配置映射 */
  requestHandlersMap?: any;

  /** 额外环境变量 - 用于扩展运行时能力 */
  extraEnvironment?: Asset;

  /** 组件库列表 - 可用的组件库配置 */
  library?: LibraryItem[];

  /** 工具函数元数据 */
  utilsMetadata?: UtilsMetadata;

  /** 模拟器 HTML 页面资源 URL */
  simulatorUrl?: Asset;

  /** 主题样式资源 */
  theme?: Asset;

  /** 组件资源包 */
  componentsAsset?: Asset;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  /** 允许扩展其他配置项 */
  [key: string]: any;
}

/**
 * 📦 默认模拟器资源 URL 生成器
 *
 * 根据当前运行环境（开发/生产）动态生成模拟器渲染器资源的 URL 地址
 * 这些资源包括 CSS 样式文件和 JavaScript 脚本文件
 */
const defaultSimulatorUrl = (() => {
  // 获取当前应用的公共路径基础 URL
  const publicPath = getPublicPath();
  let urls;
  // 🔍 解析公共路径格式，提取前缀和开发环境标识
  // 正则匹配：提取 prefix（基础路径）和 dev（是否包含 /js 目录）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, prefix = '', dev] = /^(.+?)(\/js)?\/?$/.exec(publicPath) || [];

  if (dev) {
    // 🛠️ 开发环境：使用详细的路径结构
    // 开发时资源通常在 /css 和 /js 目录下，方便调试
    // 示例：http://localhost:5555/js/ReactSimulatorRenderer.js
    //      http://localhost:5555/css/ReactSimulatorRenderer.css
    urls = [
      `${prefix}/css/react-simulator-renderer.css`, // CSS 样式文件
      // `${prefix}/css/ReactSimulatorRenderer.css`, // 备用命名格式（已注释）
      `${prefix}/js/react-simulator-renderer.js`, // JavaScript 脚本文件
      // `${prefix}/js/ReactSimulatorRenderer.js`, // 备用命名格式（已注释）
    ];
  } else if (process.env.NODE_ENV === 'production') {
    // 🚀 生产环境：使用压缩优化的资源文件
    urls = [`${prefix}/react-simulator-renderer.css`, `${prefix}/react-simulator-renderer.js`];
  } else {
    // 🧪 其他环境（测试/预发布）：使用与生产环境相同的配置
    urls = [`${prefix}/react-simulator-renderer.css`, `${prefix}/react-simulator-renderer.js`];
  }

  return urls; // 返回资源 URL 数组
})();

/**
 * 🌐 默认环境变量注入资源
 *
 * 为 iframe 内部环境注入必要的运行时依赖和全局变量
 * 这些资源确保 iframe 内可以正常运行 React 应用和开发工具
 */
const defaultEnvironment = [
  // 📚 CDN 资源示例注释：
  // https://g.alicdn.com/mylib/??react/16.11.0/umd/react.production.min.js,react-dom/16.8.6/umd/react-dom.production.min.js,prop-types/15.7.2/prop-types.min.js

  // 🔥 React 核心库注入：将父窗口的 React 实例共享给 iframe
  assetItem(
    AssetType.JSText, // 资源类型：JavaScript 代码文本
    'window.React=parent.React;window.ReactDOM=parent.ReactDOM;window.__is_simulator_env__=true;', // 注入代码
    undefined, // 版本信息（未指定）
    'react', // 资源标识名
  ),

  // 🛠️ PropTypes 和开发工具支持：确保类型检查和调试工具正常工作
  assetItem(
    AssetType.JSText, // 资源类型：JavaScript 代码文本
    'window.PropTypes=parent.PropTypes;React.PropTypes=parent.PropTypes; window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = window.parent.__REACT_DEVTOOLS_GLOBAL_HOOK__;', // 注入代码
  ),
];

/**
 * ========================================
 * 🏗️ BuiltinSimulatorHost 核心控制器类
 * ========================================
 *
 * 低代码引擎内置模拟器的核心控制中心，负责：
 * - 🎯 iframe 生命周期管理（创建、挂载、销毁）
 * - 📦 资源管理（组件库、主题、环境变量）
 * - 🎮 事件处理（拖拽、点击、悬停、右键菜单）
 * - 📱 设备模拟（移动端、桌面端适配）
 * - 🔄 渲染协调（与 iframe 内渲染器通信）
 * - 📐 坐标转换（画布坐标与 iframe 坐标互转）
 */
export class BuiltinSimulatorHost implements ISimulatorHost<BuiltinSimulatorProps> {
  // 🏷️ 类型标识：标记这是一个模拟器实例
  readonly isSimulator = true;

  // 📋 项目管理器：提供项目级别的数据和操作接口
  readonly project: IProject;

  // 🎨 设计器实例：提供设计时的核心功能和状态管理
  readonly designer: IDesigner;

  // 📱 视口管理器：处理画布的缩放、滚动、尺寸计算等
  readonly viewport = new Viewport();

  // 📜 滚动器：处理画布的滚动行为和平滑动画
  readonly scroller: IScroller;

  // 📡 事件总线：模拟器内部的事件通信中心，用于组件间解耦通信
  readonly emitter: IEventBus = createModuleEventBus('BuiltinSimulatorHost');

  // 📦 组件资源消费者：专门处理组件库资源的加载和更新
  readonly componentsConsumer: ResourceConsumer;

  // 💉 注入资源消费者：处理应用辅助工具和全局对象的注入
  readonly injectionConsumer: ResourceConsumer;

  // 🌍 国际化资源消费者：处理多语言资源的加载和切换
  readonly i18nConsumer: ResourceConsumer;

  /**
   * 🎛️ 自动渲染控制开关
   *
   * 控制画布是否自动响应数据变化进行重新渲染
   * true: 数据变化时自动触发重渲染（默认行为）
   * false: 需要手动触发渲染，用于性能优化场景
   */
  autoRender = true;

  /**
   * 📄 当前活跃文档获取器
   *
   * 返回项目中当前正在编辑的文档实例
   * 文档包含了页面的完整 Schema 结构、组件树、选中状态等信息
   */
  get currentDocument() {
    return this.project.currentDocument;
  }

  /**
   * 🎭 渲染环境计算属性
   *
   * 获取当前的渲染环境类型，影响渲染器的行为和兼容性
   * 可能的值：'react'、'rax'、'vue'、'default' 等
   * 注意：Rax 环境在 v1.3.0+ 版本已不再支持
   */
  @computed get renderEnv(): string {
    return this.get('renderEnv') || 'default';
  }

  /**
   * 📱 设备类型计算属性
   *
   * 获取当前模拟的设备类型，用于设备样式适配
   * 支持通过 deviceMapper 进行设备类型转换和映射
   * 默认值：'default'（桌面端）
   */
  @computed get device(): string {
    return this.get('device') || 'default';
  }

  /**
   * 🌍 语言环境计算属性
   *
   * 获取当前的语言环境设置，用于国际化显示
   * 优先使用用户设置的语言，其次使用全局语言配置
   */
  @computed get locale(): string {
    return this.get('locale') || globalLocale.getLocale();
  }

  /**
   * 🎨 设备样式类名计算属性
   *
   * 获取设备特定的 CSS 类名，用于应用设备相关的样式
   * 例如：'mobile-device'、'tablet-device' 等
   */
  @computed get deviceClassName(): string | undefined {
    return this.get('deviceClassName');
  }

  /**
   * ⚙️ 设计模式计算属性
   *
   * 获取当前的设计模式，控制编辑器的交互行为：
   * - 'design': 设计模式 - 完整的编辑功能
   * - 'live': 实时模式 - 仅预览，无编辑功能
   * - 'preview': 预览模式 - 部分交互功能
   */
  @computed get designMode(): 'live' | 'design' | 'preview' {
    // renderer 依赖
    // TODO: 需要根据 design mode 不同切换鼠标响应情况
    return this.get('designMode') || 'design';
  }

  /**
   * 🔌 请求处理器映射表计算属性
   *
   * 获取用于处理 HTTP 请求的处理器映射表
   * 用于在 iframe 内模拟 API 调用和数据请求
   * renderer 依赖
   * TODO: 需要根据 design mode 不同切换鼠标响应情况
   */
  @computed get requestHandlersMap(): any {
    return this.get('requestHandlersMap') || null;
  }

  /**
   * 🔧 JSX 表达式 this 绑定要求
   *
   * 控制在 JSX 表达式中是否需要显式的 this 绑定
   * true: 需要 this.xxx 形式 （默认，兼容性更好）
   * false: 可以直接使用 xxx 形式
   */
  get thisRequiredInJSE(): boolean {
    return engineConfig.get('thisRequiredInJSE') ?? true;
  }

  /**
   * ⚠️ 严格未找到组件模式
   *
   * 控制当组件未找到时的处理策略
   * true: 严格模式，抛出错误或显示错误信息
   * false: 宽松模式，使用降级组件或忽略
   */
  get enableStrictNotFoundMode(): any {
    return engineConfig.get('enableStrictNotFoundMode') ?? false;
  }

  /**
   * 🔍 未找到组件时的降级组件
   *
   * 当请求的组件不存在时，使用此组件作为替代显示
   * 通常是一个错误提示组件或占位符组件
   */
  get notFoundComponent(): any {
    return engineConfig.get('notFoundComponent') ?? null;
  }

  /**
   * 💥 组件错误时的降级组件
   *
   * 当组件渲染发生错误时，使用此组件作为错误边界
   * 类似于 React Error Boundary 的概念
   */
  get faultComponent(): any {
    return engineConfig.get('faultComponent') ?? null;
  }

  /**
   * 🗺️ 组件错误映射表
   *
   * 为不同的组件指定不同的错误降级策略
   * 键为组件名称，值为对应的降级组件
   */
  get faultComponentMap(): any {
    return engineConfig.get('faultComponentMap') ?? null;
  }

  /**
   * 📦 组件资源包计算属性
   *
   * 获取组件相关的资源包（JS、CSS 文件等）
   * 用于动态加载组件库到 iframe 环境
   */
  @computed get componentsAsset(): Asset | undefined {
    return this.get('componentsAsset');
  }

  /**
   * 🎨 主题资源计算属性
   *
   * 获取当前应用的主题资源（CSS 文件）
   * 支持动态主题切换和自定义主题包
   */
  @computed get theme(): Asset | undefined {
    return this.get('theme');
  }

  /**
   * 🧩 组件映射表计算属性
   *
   * 获取设计器维护的组件名称到组件实例的映射关系
   * 由设计器统一管理，供渲染器和模拟器使用
   * renderer 依赖
   */
  @computed get componentsMap() {
    return this.designer.componentsMap;
  }

  /**
   * 📐 设备样式配置计算属性
   *
   * 获取当前设备的样式配置，包括画布和视口的样式定义
   * 用于实现不同设备的视觉效果模拟
   */
  @computed get deviceStyle(): DeviceStyleProps | undefined {
    return this.get('deviceStyle');
  }

  // ========================================
  // 🔄 响应式状态属性
  // ========================================

  /** 📋 模拟器属性配置 - MobX 可观察引用，存储所有配置选项 */
  @obx.ref _props: BuiltinSimulatorProps = {};

  /** 🖼️ iframe 内容窗口 - MobX 可观察引用，指向 iframe 的 window 对象 */
  @obx.ref private _contentWindow?: Window;

  /**
   * 🪟 iframe 内容窗口获取器
   *
   * 获取 iframe 的 window 对象，用于跨框架通信和操作
   * 只有在 iframe 成功加载后才会有值
   */
  get contentWindow() {
    return this._contentWindow;
  }

  /** 📄 iframe 内容文档 - MobX 可观察引用，指向 iframe 的 document 对象 */
  @obx.ref private _contentDocument?: Document;

  /** 🛠️ 应用辅助工具 - MobX 可观察引用，存储应用级的辅助工具实例 */
  @obx.ref private _appHelper?: any;

  /**
   * 📑 iframe 内容文档获取器
   *
   * 获取 iframe 的 document 对象，用于 DOM 操作和事件绑定
   * 只有在 iframe 成功加载后才会有值
   */
  get contentDocument() {
    return this._contentDocument;
  }

  /** 🎭 渲染器实例 - 私有属性，指向 iframe 内部的渲染器控制器 */
  private _renderer?: BuiltinSimulatorRenderer;

  /**
   * 🎨 渲染器获取器
   *
   * 获取 iframe 内部的渲染器实例，用于渲染控制和通信
   * 渲染器负责在 iframe 内部将 Schema 转换为实际的 React 组件
   */
  get renderer() {
    return this._renderer;
  }

  // ========================================
  // 📚 资源映射和缓存管理
  // ========================================

  /** 🔄 异步库映射表 - 存储需要异步加载的组件库配置 */
  readonly asyncLibraryMap: { [key: string]: {} } = {};

  /** 📖 库映射表 - 存储包名到库名的映射关系，用于模块解析 */
  readonly libraryMap: { [key: string]: string } = {};

  // ========================================
  // 🖼️ iframe 相关私有状态
  // ========================================

  /** 🖼️ iframe DOM 元素引用 - 指向实际的 iframe 元素 */
  private _iframe?: HTMLIFrameElement;

  /** 🚫 禁用悬停功能函数 - 用于清理悬停事件监听器的回调函数 */
  private disableHovering?: () => void;

  /** 🚫 禁用检测功能函数 - 用于清理检测事件监听器的回调函数 */
  private disableDetecting?: () => void;

  // ========================================
  // 🎮 交互功能模块
  // ========================================

  /** ✏️ 实时编辑功能模块 - 支持双击进入文本编辑模式 */
  readonly liveEditing = new LiveEditing();

  /** 🗂️ 组件实例映射表 - MobX 可观察对象，按文档 ID 组织的组件实例缓存 */
  @obx private instancesMap: {
    [docId: string]: Map<string, IPublicTypeComponentInstance[]>;
  } = {};

  // ========================================
  // 🎯 交互状态控制
  // ========================================

  /** 📍 重试滚动定时器 - 存储滚动重试的定时器 ID，用于处理滚动失败场景 */
  private tryScrollAgain: number | null = null;

  /** 🎯 传感器可用状态 - 控制拖拽传感器的启用/禁用状态 */
  private _sensorAvailable = true;

  /**
   * 🎯 传感器可用性获取器
   *
   * 获取拖拽传感器的当前可用状态
   * 当传感器不可用时，拖拽功能会被禁用
   *
   * @see IPublicModelSensor
   */
  get sensorAvailable(): boolean {
    return this._sensorAvailable;
  }

  /** 🔍 感知状态标志 - 标记当前是否正在进行拖拽感知操作 */
  private sensing = false;

  /**
   * ========================================
   * 🏗️ 构造函数 - 模拟器初始化核心流程
   * ========================================
   *
   * 初始化模拟器的所有核心组件和服务，建立响应式系统和事件监听
   *
   * @param project - 项目管理器实例，提供文档、Schema、状态管理
   * @param designer - 设计器实例，提供组件元数据、拖拽系统、事件总线
   */
  constructor(project: Project, designer: Designer) {
    // 🔄 启用 MobX 响应式系统：让类的属性变为可观察对象
    // 这是响应式架构的基础，所有标记了 @obx/@computed 的属性都会自动响应变化
    makeObservable(this);

    // 🏗️ 核心依赖注入：建立与项目和设计器的关联
    this.project = project; // 注入项目管理器，获得文档、Schema 访问能力
    this.designer = designer; // 注入设计器，获得组件元数据、拖拽、事件能力

    // 📜 滚动器初始化：为当前视口创建专用的滚动控制器
    // 滚动器处理画布的平滑滚动、滚动边界检查、自动滚动等功能
    this.scroller = this.designer.createScroller(this.viewport);

    // 🎛️ 自动渲染配置：根据引擎配置决定是否启用自动渲染
    // 自动渲染默认开启，可通过配置关闭来优化性能
    this.autoRender = !engineConfig.get('disableAutoRender', false);

    // 🛠️ 应用辅助工具获取：从引擎配置中读取应用级辅助工具
    // appHelper 提供应用级的工具函数和全局对象
    this._appHelper = engineConfig.get('appHelper');

    // ========================================
    // 📦 资源消费者初始化
    // ========================================

    // 🧩 组件资源消费者：响应式监听组件资源变化
    // 当 componentsAsset 属性变化时，自动触发资源重新加载
    this.componentsConsumer = new ResourceConsumer<Asset | undefined>(() => this.componentsAsset);

    // 💉 注入资源消费者：处理应用辅助工具的动态注入
    // 提供响应式的全局对象注入能力，支持运行时更新
    this.injectionConsumer = new ResourceConsumer(() => {
      return {
        appHelper: this._appHelper, // 将应用辅助工具包装为注入对象
      };
    });

    // 🔄 应用辅助工具动态更新：监听引擎配置变化
    engineConfig.onGot('appHelper', (data) => {
      // 当 appHelper 被 config.set 修改后，触发 injectionConsumer.consume 回调
      // 实现了配置的热更新机制
      this._appHelper = data;
    });

    // 🌍 国际化资源消费者：响应式监听项目的国际化配置变化
    // 当项目的语言设置变化时，自动更新 iframe 内的多语言资源
    this.i18nConsumer = new ResourceConsumer(() => this.project.i18n);

    // ========================================
    // 🎭 事务管理和性能优化
    // ========================================

    // 🚫 事务开始时停止自动重绘：在批量操作开始时暂停节点重绘
    // 避免中间状态的无效渲染，提升批量操作性能
    transactionManager.onStartTransaction(() => {
      this.stopAutoRepaintNode();
    }, IPublicEnumTransitionType.REPAINT);

    // ⚡ 防抖渲染优化：防止批量调用 transaction 时执行多次 rerender
    // 28ms 的防抖时间是经过优化的，平衡响应速度和性能
    const rerender = debounce(this.rerender.bind(this), 28);

    // 🎯 事务结束时恢复自动重绘：批量操作结束后，触发一次完整的重渲染
    // 确保所有变更都能正确反映到视图上
    transactionManager.onEndTransaction(() => {
      rerender(); // 执行防抖渲染
      this.enableAutoRepaintNode(); // 恢复自动重绘模式
    }, IPublicEnumTransitionType.REPAINT);
  }

  /**
   * ⏸️ 停止节点自动重绘
   *
   * 暂停 iframe 内渲染器的自动重绘功能
   * 通常在批量操作开始时调用，避免频繁的中间状态渲染
   * 提升批量操作的性能表现
   */
  stopAutoRepaintNode() {
    this.renderer?.stopAutoRepaintNode();
  }

  /**
   * ▶️ 启用节点自动重绘
   *
   * 恢复 iframe 内渲染器的自动重绘功能
   * 通常在批量操作结束时调用，恢复正常的响应式渲染
   */
  enableAutoRepaintNode() {
    this.renderer?.enableAutoRepaintNode();
  }

  /**
   * ⚙️ 设置模拟器属性配置
   *
   * 更新模拟器的配置属性，触发相关的响应式更新
   * 这是模拟器的主要配置入口，支持运行时动态配置
   *
   * @param props - 新的属性配置对象
   * @see ISimulator
   */
  setProps(props: BuiltinSimulatorProps) {
    this._props = props; // 直接替换整个属性对象，触发 MobX 响应
  }

  /**
   * 🔧 设置单个配置属性
   *
   * 设置模拟器的单个配置项，保持其他配置不变
   * 使用对象展开语法确保引用变化，触发 MobX 响应
   *
   * @param key - 配置项键名
   * @param value - 配置项值
   */
  set(key: string, value: any) {
    this._props = {
      ...this._props, // 保持现有配置
      [key]: value, // 更新指定配置项
    };
  }

  /**
   * 🔍 获取配置属性值
   *
   * 获取模拟器的配置项值，支持特殊的设备映射处理
   * device 属性会通过 deviceMapper 进行转换，其他属性直接返回
   *
   * @param key - 配置项键名
   * @returns 配置项的值
   */
  get(key: string): any {
    if (key === 'device') {
      // 🔄 设备映射转换：支持通过 deviceMapper 对设备类型进行转换
      // 例如将 'mobile' 转换为具体的设备型号
      return (
        this.designer?.editor?.get('deviceMapper')?.transform?.(this._props.device) ||
        this._props.device // 如果没有映射器或转换失败，返回原始值
      );
    }
    return this._props[key]; // 直接返回配置值
  }

  /**
   * 🔗 渲染器连接建立
   *
   * 当 iframe 内部的渲染器初始化完成后，建立宿主与渲染器的通信连接
   * 设置 MobX 自动运行机制，实现宿主状态变化自动同步到渲染器
   *
   * @param renderer - iframe 内部的渲染器实例
   * @param effect - 响应式副作用函数，当状态变化时自动执行
   * @param options - 自动运行选项配置
   * @returns 响应式销毁函数，用于清理连接
   */
  connect(
    renderer: BuiltinSimulatorRenderer,
    effect: (reaction: IReactionPublic) => void,
    options?: IReactionOptions,
  ) {
    // 🎭 保存渲染器实例引用，建立宿主与渲染器的关联
    this._renderer = renderer;

    // 🔄 建立自动运行机制：当宿主状态变化时，自动触发渲染器更新
    // 这是跨 iframe 响应式同步的核心机制
    return autorun(effect, options);
  }

  /**
   * 🎯 创建响应式计算
   *
   * 创建一个响应式计算，当表达式依赖的可观察数据变化时自动执行副作用
   * 这是 MobX reaction 的包装，提供给外部组件使用
   *
   * @param expression - 计算表达式函数
   * @param effect - 副作用执行函数
   * @param opts - 响应式选项配置
   * @returns 响应式销毁函数
   */
  reaction(expression: (reaction: IReactionPublic) => unknown, effect: (value: unknown, prev: unknown, reaction: IReactionPublic) => void,
    opts?: IReactionOptions | undefined): IReactionDisposer {
    return reaction(expression, effect, opts);
  }

  /**
   * 🔄 创建自动运行副作用
   *
   * 创建一个自动运行的副作用函数，当函数内依赖的可观察数据变化时自动重新执行
   * 这是 MobX autorun 的包装，提供给外部组件使用
   *
   * @param effect - 副作用执行函数
   * @param options - 自动运行选项配置
   * @returns 响应式销毁函数
   */
  autorun(effect: (reaction: IReactionPublic) => void, options?: IReactionOptions): IReactionDisposer {
    return autorun(effect, options);
  }

  /**
   * 🗑️ 清理和销毁
   *
   * 清理模拟器占用的资源，包括事件监听器、响应式连接等
   * 目前仅为占位实现，后续需要补充具体的清理逻辑
   *
   * TODO: 实现完整的资源清理逻辑
   */
  purge(): void {
    // todo
  }

  /**
   * 📱 挂载视口元素
   *
   * 将 DOM 元素作为视口容器挂载到视口管理器
   * 视口管理器将基于此元素进行尺寸计算和坐标转换
   *
   * @param viewport - 视口容器的 DOM 元素
   */
  mountViewport(viewport: HTMLElement | null) {
    this.viewport.mount(viewport);
  }

  /**
   * ========================================
   * 📚 构建组件库资源包 - 核心资源加载方法
   * ========================================
   *
   * 将组件库配置转换为可加载的资源包，支持多种导出模式和异步加载
   * 这是组件库集成的核心方法，处理从配置到实际加载的完整流程
   *
   * 📋 LibraryItem 配置格式示例：
   * ```json
   * {
   *   "title": "BizCharts",           // 组件库显示名称
   *   "package": "bizcharts",         // npm 包名，用于模块解析
   *   "exportName": "bizcharts",      // UMD 导出别名，兼容不同命名约定
   *   "version": "4.0.14",            // 版本号，用于缓存和版本管理
   *   "urls": [                       // CDN 资源地址列表
   *     "https://g.alicdn.com/code/lib/bizcharts/4.0.14/BizCharts.js"
   *   ],
   *   "library": "BizCharts",         // UMD 全局变量名
   *   "async": false,                 // 是否异步加载
   *   "exportMode": "default",        // 导出模式：default|functionCall
   *   "editUrls": [...],              // 开发环境专用资源
   *   "exportSourceLibrary": "..."    // 函数调用模式的源库
   * }
   * ```
   *
   * 📝 配置字段说明：
   * - package：npm 包名，用于模块标识和解析
   * - exportName：UMD 导出别名，解决 define name 不一致问题
   * - version：版本号，用于缓存控制和依赖管理
   * - urls：CDN 地址，必须是 UMD 格式，支持 .js 和 .css
   * - library：UMD 全局变量名，直接挂载到 window 对象
   * - async：是否异步加载，异步库会在基础环境就绪后加载
   * - exportMode：导出模式，支持直接导出和函数调用模式
   *
   * @param library - 可选的组件库配置数组，不传则使用 props 中的配置
   * @returns 资源包列表，可直接用于 AssetLoader 加载
   */
  buildLibrary(library?: LibraryItem[]) {
    // 🎯 获取库配置：优先使用参数，否则从 props 获取
    const _library = library || (this.get('library') as LibraryItem[]);

    // 📦 初始化资源收集容器
    const libraryAsset: AssetList = []; // 最终的资源包列表
    const libraryExportList: string[] = []; // 库导出代码片段列表
    const functionCallLibraryExportList: string[] = []; // 函数调用导出代码片段列表

    if (_library && _library.length) {
      // 🔄 遍历处理每个组件库配置
      _library.forEach((item) => {
        // 🔍 解构获取导出配置
        const { exportMode, exportSourceLibrary } = item;

        // 🗺️ 建立包名到库名的映射关系：用于后续的模块解析
        this.libraryMap[item.package] = item.library;

        // ⏰ 异步库处理：将异步加载的库单独管理
        if (item.async) {
          this.asyncLibraryMap[item.package] = item;
        }

        // 🏷️ 导出别名处理：为库创建别名，解决命名兼容问题
        // 例如：Object.defineProperty(window,'bizcharts',{get:()=>window.BizCharts});
        if (item.exportName && item.library) {
          libraryExportList.push(
            `Object.defineProperty(window,'${item.exportName}',{get:()=>window.${item.library}});`,
          );
        }

        // 📞 函数调用模式处理：通过函数调用方式获取库实例
        // 例如：window["MyLib"] = window["SourceLib"]("MyLib", "my-package");
        if (exportMode === 'functionCall' && exportSourceLibrary) {
          functionCallLibraryExportList.push(
            `window["${item.library}"] = window["${exportSourceLibrary}"]("${item.library}", "${item.package}");`,
          );
        }

        // 📦 资源 URL 收集：优先使用开发环境资源，否则使用生产资源
        if (item.editUrls) {
          libraryAsset.push(item.editUrls); // 开发环境资源（通常未压缩，便于调试）
        } else if (item.urls) {
          libraryAsset.push(item.urls); // 生产环境资源（通常已压缩）
        }
      });
    }

    // 🏗️ 组装最终资源包：按执行顺序组织代码片段
    libraryAsset.unshift(assetItem(AssetType.JSText, libraryExportList.join(''))); // 在开头插入导出别名代码
    libraryAsset.push(assetItem(AssetType.JSText, functionCallLibraryExportList.join(''))); // 在末尾追加函数调用代码

    return libraryAsset; // 返回完整的资源包列表
  }

  /**
   * 🎨 重新渲染画布
   *
   * 触发完整的画布重新渲染，包括组件元数据刷新和 iframe 内容重绘
   * 通常在组件库变更、主题切换或重大配置变化时调用
   */
  rerender() {
    // 🔄 刷新设计器的组件元数据映射表
    // 确保新加载的组件能够被正确识别和使用
    this.designer.refreshComponentMetasMap();

    // 🎭 触发 iframe 内渲染器的重新渲染
    // 使用可选链调用，避免渲染器未初始化时的错误
    this.renderer?.rerender?.();
  }

  /**
   * ========================================
   * 🖼️ 挂载内容框架 - 模拟器启动的核心流程
   * ========================================
   *
   * 这是模拟器最重要的初始化方法，完整的 iframe 环境搭建流程：
   * 1. 🎯 iframe 元素设置和引用建立
   * 2. 📦 组件库资源构建和依赖注入
   * 3. 🎭 模拟器渲染器创建和启动
   * 4. ⏳ 资源加载等待和状态同步
   * 5. 🎮 事件系统建立和交互启用
   * 6. ⌨️ 快捷键和剪贴板功能绑定
   *
   * @param iframe - 要挂载的 iframe DOM 元素
   * @returns Promise<void> - 异步完成，返回空 Promise
   */
  async mountContentFrame(iframe: HTMLIFrameElement | null): Promise<void> {
    // 🚪 入参验证：检查 iframe 有效性和重复挂载
    if (!iframe || this._iframe === iframe) {
      return; // iframe 无效或已挂载，直接返回
    }

    // 🎯 建立 iframe 引用：保存 iframe 元素，建立宿主与 iframe 的关联
    this._iframe = iframe;

    // 🪟 获取 iframe 的 window 和 document 对象：建立跨框架访问能力
    this._contentWindow = iframe.contentWindow!; // 获取 iframe 的 window 对象
    this._contentDocument = this._contentWindow.document; // 获取 iframe 的 document 对象

    // 📚 构建组件库资源包：将库配置转换为可加载的资源列表
    const libraryAsset: AssetList = this.buildLibrary();

    // ⚠️ Rax 环境兼容性检查：Rax 渲染环境已在 v1.3.0+ 版本弃用
    if (this.renderEnv === 'rax') {
      logger.error('After LowcodeEngine v1.3.0, Rax is no longer supported.');
    }

    // ========================================
    // 📦 资源包构建阶段：按优先级组织所有需要的资源
    // ========================================

    const vendors = [
      // 🌐 基础环境资源包（必需，一次性加载）
      // 包含 React、ReactDOM、PropTypes 等基础运行时
      assetBundle(
        this.get('environment') || // 用户自定义环境 或
        defaultEnvironment, // 默认 React 环境
        AssetLevel.Environment, // 环境级别：最高优先级
      ),

      // 🔧 扩展环境资源包（必需，一次性加载）
      // 用户可以通过此配置注入额外的全局依赖
      assetBundle(this.get('extraEnvironment'), AssetLevel.Environment),

      // 📚 组件库资源包（必需，一次性加载）
      // 包含所有组件库的 JS 和 CSS 文件
      assetBundle(libraryAsset, AssetLevel.Library),

      // 🎨 主题资源包（必需，支持动态更新）
      // TODO: 考虑实现主题的热更新机制
      assetBundle(this.theme, AssetLevel.Theme),

      // 🎭 模拟器渲染器资源包（必需，一次性加载）
      // 包含 SimulatorRenderer 的核心渲染逻辑
      assetBundle(
        this.get('simulatorUrl') || // 用户自定义渲染器 或
        defaultSimulatorUrl, // 内置渲染器
        AssetLevel.Runtime, // 运行时级别
      ),
    ];

    // ========================================
    // 🏗️ 模拟器创建阶段：创建 iframe 环境和渲染器
    // ========================================

    // 🎯 创建模拟器：注入资源包，初始化 iframe 内容，返回渲染器实例
    // 这个过程包括：生成 HTML 模板、注入依赖、建立通信机制
    const renderer = await createSimulator(this, iframe, vendors);

    // TODO: !!! 思考重载机制的实现
    // TODO: 考虑 iframe reload 时的处理逻辑

    // ========================================
    // ⏳ 资源等待阶段：确保所有必要资源已准备就绪
    // ========================================

    // 📦 等待组件资源首次消费：确保组件库资源已加载完成
    // 如果不等待，渲染时可能找不到组件导致渲染错误
    await this.componentsConsumer.waitFirstConsume();

    // 🛠️ 等待注入资源首次消费：确保 appHelper 等运行时上下文已准备
    // 运行时上下文包含应用级的工具函数和全局对象
    await this.injectionConsumer.waitFirstConsume();

    // ⏰ 异步库加载处理：处理标记为异步的组件库
    if (Object.keys(this.asyncLibraryMap).length > 0) {
      // 🔄 加载异步组件库：在基础环境就绪后再加载异步依赖
      await renderer.loadAsyncLibrary(this.asyncLibraryMap);

      // 🧹 清理异步库映射：加载完成后从映射表中移除，避免重复加载
      Object.keys(this.asyncLibraryMap).forEach((key) => {
        delete this.asyncLibraryMap[key];
      });
    }

    // ========================================
    // 🎬 渲染启动阶段：启动 iframe 内的实际渲染
    // ========================================

    // 🎯 启动渲染器：所有资源就绪后，开始渲染 Schema 到 React 组件
    renderer.run();

    // ========================================
    // 🎮 交互系统初始化阶段：建立用户交互能力
    // ========================================

    // 📱 设置视口滚动目标：将 iframe 的 window 设为滚动控制目标
    this.viewport.setScrollTarget(this._contentWindow);

    // 🎯 初始化事件系统：建立拖拽、点击、悬停、右键菜单等交互事件
    this.setupEvents();

    // ========================================
    // ⌨️ 辅助功能绑定阶段：绑定快捷键和剪贴板
    // ========================================

    // ⌨️ 绑定快捷键系统：将编辑器的快捷键功能扩展到 iframe 内
    const hotkey = this.designer.editor.get('innerHotkey');
    hotkey.mount(this._contentWindow);

    // 🎯 绑定焦点追踪器：跟踪 iframe 内的焦点状态，同步到编辑器
    const innerSkeleton = this.designer.editor.get('skeleton');
    innerSkeleton.focusTracker.mount(this._contentWindow);

    // 📋 注入剪贴板功能：支持在 iframe 内进行复制粘贴操作
    clipboard.injectCopyPaster(this._contentDocument);

    // TODO: 实现绑定的清理机制，避免内存泄漏
    // TODO: dispose the bindings
  }

  async setupComponents(library: LibraryItem[]) {
    const libraryAsset: AssetList = this.buildLibrary(library);
    await this.renderer?.load(libraryAsset);
    if (Object.keys(this.asyncLibraryMap).length > 0) {
      // 加载异步 Library
      await this.renderer?.loadAsyncLibrary(this.asyncLibraryMap);
      Object.keys(this.asyncLibraryMap).forEach((key) => {
        delete this.asyncLibraryMap[key];
      });
    }
  }

  setupEvents() {
    // TODO: Thinkof move events control to simulator renderer
    //       just listen special callback
    // because iframe maybe reload
    this.setupDragAndClick();
    this.setupDetecting();
    this.setupLiveEditing();
    this.setupContextMenu();
  }

  postEvent(eventName: string, ...data: any[]) {
    this.emitter.emit(eventName, ...data);
  }

  setupDragAndClick() {
    const { designer } = this;
    const doc = this.contentDocument!;

    // TODO: think of lock when edit a node
    // 事件路由
    doc.addEventListener(
      'mousedown',
      (downEvent: MouseEvent) => {
        // fix for popups close logic
        document.dispatchEvent(new Event('mousedown'));
        const documentModel = this.project.currentDocument;
        if (this.liveEditing.editing || !documentModel) {
          return;
        }
        const { selection } = documentModel;
        let isMulti = false;
        if (this.designMode === 'design') {
          isMulti = downEvent.metaKey || downEvent.ctrlKey;
        } else if (!downEvent.metaKey) {
          return;
        }
        // FIXME: dirty fix remove label-for fro liveEditing
        downEvent.target?.removeAttribute('for');
        const nodeInst = this.getNodeInstanceFromElement(downEvent.target);
        const { focusNode } = documentModel;
        const node = getClosestClickableNode(nodeInst?.node || focusNode, downEvent);
        // 如果找不到可点击的节点，直接返回
        if (!node) {
          return;
        }
        // 触发 onMouseDownHook 钩子
        const onMouseDownHook = node.componentMeta.advanced.callbacks?.onMouseDownHook;
        if (onMouseDownHook) {
          onMouseDownHook(downEvent, node.internalToShellNode());
        }

        // 断开

        const rglNode = node?.getParent();
        const isRGLNode = rglNode?.isRGLContainer;
        if (isRGLNode) {
          // 如果拖拽的是磁铁块的右下角 handle，则直接跳过
          if (downEvent.target?.classList.contains('react-resizable-handle')) return;
          // 禁止多选
          isMulti = false;
          designer.dragon.emitter.emit('rgl.switch', {
            action: 'start',
            rglNode,
          });
        } else {
          // stop response document focus event
          // 禁止原生拖拽
          downEvent.stopPropagation();
          downEvent.preventDefault();
        }
        // if (!node?.isValidComponent()) {
        //   // 对于未注册组件直接返回
        //   return;
        // }
        const isLeftButton = downEvent.which === 1 || downEvent.button === 0;
        const checkSelect = (e: MouseEvent) => {
          doc.removeEventListener('mouseup', checkSelect, true);
          // 取消移动;
          designer.dragon.emitter.emit('rgl.switch', {
            action: 'end',
            rglNode,
          });
          // 鼠标是否移动 ? - 鼠标抖动应该也需要支持选中事件，偶尔点击不能选中，磁帖块移除 shaken 检测
          if (!isShaken(downEvent, e) || isRGLNode) {
            let { id } = node;
            designer.activeTracker.track({ node, instance: nodeInst?.instance });
            if (isMulti && focusNode && !node.contains(focusNode) && selection.has(id)) {
              selection.remove(id);
            } else {
              // TODO: 避免选中 Page 组件，默认选中第一个子节点；新增规则 或 判断 Live 模式
              if (node.isPage() && node.getChildren()?.notEmpty() && this.designMode === 'live') {
                const firstChildId = node.getChildren()?.get(0)?.getId();
                if (firstChildId) id = firstChildId;
              }
              if (focusNode) {
                selection.select(node.contains(focusNode) ? focusNode.id : id);
              }

              // dirty code should refector
              const editor = this.designer?.editor;
              const npm = node?.componentMeta?.npm;
              const selected =
                [npm?.package, npm?.componentName].filter((item) => !!item).join('-') ||
                node?.componentMeta?.componentName ||
                '';
              editor?.eventBus.emit('designer.builtinSimulator.select', {
                selected,
              });
            }
          }
        };

        if (isLeftButton && focusNode && !node.contains(focusNode)) {
          let nodes: INode[] = [node];
          let ignoreUpSelected = false;
          if (isMulti) {
            // multi select mode, directily add
            if (!selection.has(node.id)) {
              designer.activeTracker.track({ node, instance: nodeInst?.instance });
              selection.add(node.id);
              ignoreUpSelected = true;
            }
            focusNode?.id && selection.remove(focusNode.id);
            // 获得顶层 nodes
            nodes = selection.getTopNodes();
          } else if (selection.containsNode(node, true)) {
            nodes = selection.getTopNodes();
          } else {
            // will clear current selection & select dragment in dragstart
          }
          designer.dragon.boost(
            {
              type: IPublicEnumDragObjectType.Node,
              nodes,
            },
            downEvent,
            isRGLNode ? rglNode : undefined,
          );
          if (ignoreUpSelected) {
            // multi select mode has add selected, should return
            return;
          }
        }

        doc.addEventListener('mouseup', checkSelect, true);
      },
      true,
    );

    doc.addEventListener(
      'click',
      (e) => {
        // fix for popups close logic
        const x = new Event('click');
        x.initEvent('click', true);
        this._iframe?.dispatchEvent(x);
        const { target } = e;

        const customizeIgnoreSelectors = engineConfig.get('customizeIgnoreSelectors');
        // TODO: need more elegant solution to ignore click events of components in designer
        const defaultIgnoreSelectors: string[] = [
          '.next-input-group',
          '.next-checkbox-group',
          '.next-checkbox-wrapper',
          '.next-date-picker',
          '.next-input',
          '.next-month-picker',
          '.next-number-picker',
          '.next-radio-group',
          '.next-range',
          '.next-range-picker',
          '.next-rating',
          '.next-select',
          '.next-switch',
          '.next-time-picker',
          '.next-upload',
          '.next-year-picker',
          '.next-breadcrumb-item',
          '.next-calendar-header',
          '.next-calendar-table',
          '.editor-container', // 富文本组件
        ];
        const ignoreSelectors = customizeIgnoreSelectors?.(defaultIgnoreSelectors, e) || defaultIgnoreSelectors;
        const ignoreSelectorsString = ignoreSelectors.join(',');
        // 提供了 customizeIgnoreSelectors 的情况下，忽略 isFormEvent() 判断
        if ((!customizeIgnoreSelectors && isFormEvent(e)) || target?.closest(ignoreSelectorsString)) {
          e.preventDefault();
          e.stopPropagation();
        }
        // stop response document click event
        // todo: catch link redirect
      },
      true,
    );
  }

  /**
   * 设置悬停处理
   */
  setupDetecting() {
    const doc = this.contentDocument!;
    const { detecting, dragon } = this.designer;
    const hover = (e: MouseEvent) => {
      if (!detecting.enable || this.designMode !== 'design') {
        return;
      }
      const nodeInst = this.getNodeInstanceFromElement(e.target as Element);
      if (nodeInst?.node) {
        let { node } = nodeInst;
        const focusNode = node.document?.focusNode;
        if (focusNode && node.contains(focusNode)) {
          node = focusNode;
        }
        detecting.capture(node);
      } else {
        detecting.capture(null);
      }
      if (!engineConfig.get('enableMouseEventPropagationInCanvas', false) || dragon.dragging) {
        e.stopPropagation();
      }
    };
    const leave = () => {
      this.project.currentDocument && detecting.leave(this.project.currentDocument);
    };

    doc.addEventListener('mouseover', hover, true);
    doc.addEventListener('mouseleave', leave, false);

    // TODO: refactor this line, contains click, mousedown, mousemove
    doc.addEventListener(
      'mousemove',
      (e: Event) => {
        if (!engineConfig.get('enableMouseEventPropagationInCanvas', false) || dragon.dragging) {
          e.stopPropagation();
        }
      },
      true,
    );

    // this.disableDetecting = () => {
    //   detecting.leave(this.project.currentDocument);
    //   doc.removeEventListener('mouseover', hover, true);
    //   doc.removeEventListener('mouseleave', leave, false);
    //   this.disableDetecting = undefined;
    // };
  }

  setupLiveEditing() {
    const doc = this.contentDocument!;
    // cause edit
    doc.addEventListener(
      'dblclick',
      (e: MouseEvent) => {
        // stop response document dblclick event
        e.stopPropagation();
        e.preventDefault();

        const targetElement = e.target as HTMLElement;
        const nodeInst = this.getNodeInstanceFromElement(targetElement);
        if (!nodeInst) {
          return;
        }
        const focusNode = this.project.currentDocument?.focusNode;
        const node = nodeInst.node || focusNode;
        if (!node || isLowCodeComponent(node)) {
          return;
        }

        const rootElement = this.findDOMNodes(
          nodeInst.instance,
          node.componentMeta.rootSelector,
        )?.find(
          (item) =>
            // 可能是 [null];
            item && item.contains(targetElement),
        ) as HTMLElement;
        if (!rootElement) {
          return;
        }

        this.liveEditing.apply({
          node,
          rootElement,
          event: e,
        });
      },
      true,
    );
  }

  /**
   * @see ISimulator
   */
  setSuspense(/** _suspended: boolean */) {
    return false;
    // if (suspended) {
    //   /*
    //   if (this.disableDetecting) {
    //     this.disableDetecting();
    //   }
    //   */
    //   // sleep some autorun reaction
    // } else {
    //   // weekup some autorun reaction
    //   /*
    //   if (!this.disableDetecting) {
    //     this.setupDetecting();
    //   }
    //   */
    // }
  }

  setupContextMenu() {
    const doc = this.contentDocument!;
    doc.addEventListener('contextmenu', (e: MouseEvent) => {
      const targetElement = e.target as HTMLElement;
      const nodeInst = this.getNodeInstanceFromElement(targetElement);
      const editor = this.designer?.editor;
      if (!nodeInst) {
        editor?.eventBus.emit('designer.builtinSimulator.contextmenu', {
          originalEvent: e,
        });
        return;
      }
      const node = nodeInst.node || this.project.currentDocument?.focusNode;
      if (!node) {
        editor?.eventBus.emit('designer.builtinSimulator.contextmenu', {
          originalEvent: e,
        });
        return;
      }

      // dirty code should refector
      const npm = node?.componentMeta?.npm;
      const selected =
        [npm?.package, npm?.componentName].filter((item) => !!item).join('-') ||
        node?.componentMeta?.componentName ||
        '';
      editor?.eventBus.emit('designer.builtinSimulator.contextmenu', {
        selected,
        ...nodeInst,
        instanceRect: this.computeComponentInstanceRect(nodeInst.instance),
        originalEvent: e,
      });
    });
  }

  /**
   * @see ISimulator
   */
  generateComponentMetadata(componentName: string): IPublicTypeComponentMetadata {
    // if html tags
    if (isHTMLTag(componentName)) {
      return {
        componentName,
        // TODO: read builtins html metadata
      };
    }

    const component = this.getComponent(componentName);

    if (!component) {
      return {
        componentName,
      };
    }

    // TODO:
    // 1. generate builtin div/p/h1/h2
    // 2. read propTypes

    return {
      componentName,
      ...parseMetadata(component),
    };
  }

  /**
   * @see ISimulator
   */
  getComponent(componentName: string): Component | null {
    return this.renderer?.getComponent(componentName) || null;
  }

  createComponent(/** _schema: IPublicTypeComponentSchema */): Component | null {
    return null;
    // return this.renderer?.createComponent(schema) || null;
  }

  setInstance(docId: string, id: string, instances: IPublicTypeComponentInstance[] | null) {
    if (!hasOwnProperty(this.instancesMap, docId)) {
      this.instancesMap[docId] = new Map();
    }
    if (instances == null) {
      this.instancesMap[docId].delete(id);
    } else {
      this.instancesMap[docId].set(id, instances.slice());
    }
  }

  /**
   * @see ISimulator
   */
  getComponentInstances(node: INode, context?: IPublicTypeNodeInstance): IPublicTypeComponentInstance[] | null {
    const docId = node.document?.id;
    if (!docId) {
      return null;
    }

    const instances = this.instancesMap[docId]?.get(node.id) || null;
    if (!instances || !context) {
      return instances;
    }

    // filter with context
    return instances.filter((instance) => {
      return this.getClosestNodeInstance(instance, context?.nodeId)?.instance === context.instance;
    });
  }

  /**
   * @see ISimulator
   */
  getComponentContext(/* node: Node */): any {
    throw new Error('Method not implemented.');
  }

  /**
   * @see ISimulator
   */
  getClosestNodeInstance(
    from: IPublicTypeComponentInstance,
    specId?: string,
  ): IPublicTypeNodeInstance<IPublicTypeComponentInstance> | null {
    return this.renderer?.getClosestNodeInstance(from, specId) || null;
  }

  /**
   * @see ISimulator
   */
  computeRect(node: INode): IPublicTypeRect | null {
    const instances = this.getComponentInstances(node);
    if (!instances) {
      return null;
    }
    return this.computeComponentInstanceRect(instances[0], node.componentMeta.rootSelector);
  }

  /**
   * @see ISimulator
   */
  computeComponentInstanceRect(instance: IPublicTypeComponentInstance, selector?: string): IPublicTypeRect | null {
    const renderer = this.renderer!;
    const elements = this.findDOMNodes(instance, selector);
    if (!elements) {
      return null;
    }

    const elems = elements.slice();
    let rects: DOMRect[] | undefined;
    let last: { x: number; y: number; r: number; b: number } | undefined;
    let _computed = false;
    while (true) {
      if (!rects || rects.length < 1) {
        const elem = elems.pop();
        if (!elem) {
          break;
        }
        rects = renderer.getClientRects(elem);
      }
      const rect = rects.pop();
      if (!rect) {
        break;
      }
      if (rect.width === 0 && rect.height === 0) {
        continue;
      }
      if (!last) {
        last = {
          x: rect.left,
          y: rect.top,
          r: rect.right,
          b: rect.bottom,
        };
        continue;
      }
      if (rect.left < last.x) {
        last.x = rect.left;
        _computed = true;
      }
      if (rect.top < last.y) {
        last.y = rect.top;
        _computed = true;
      }
      if (rect.right > last.r) {
        last.r = rect.right;
        _computed = true;
      }
      if (rect.bottom > last.b) {
        last.b = rect.bottom;
        _computed = true;
      }
    }

    if (last) {
      const r: IPublicTypeRect = new DOMRect(last.x, last.y, last.r - last.x, last.b - last.y);
      r.elements = elements;
      r.computed = _computed;
      return r;
    }

    return null;
  }

  /**
   * @see ISimulator
   */
  findDOMNodes(instance: IPublicTypeComponentInstance, selector?: string): Array<Element | Text> | null {
    const elements = this._renderer?.findDOMNodes(instance);
    if (!elements) {
      return null;
    }

    if (selector) {
      const matched = getMatched(elements, selector);
      if (!matched) {
        return null;
      }
      return [matched];
    }
    return elements;
  }

  /**
   * 通过 DOM 节点获取节点，依赖 simulator 的接口
   */
  getNodeInstanceFromElement(target: Element | null): IPublicTypeNodeInstance<IPublicTypeComponentInstance, INode> | null {
    if (!target) {
      return null;
    }

    const nodeInstance = this.getClosestNodeInstance(target);
    if (!nodeInstance) {
      return null;
    }
    const { docId } = nodeInstance;
    const doc = this.project.getDocument(docId)!;
    const node = doc.getNode(nodeInstance.nodeId);
    return {
      ...nodeInstance,
      node,
    };
  }

  /**
   * @see ISimulator
   */
  /* istanbul ignore next */
  scrollToNode(node: Node, detail?: any /* , tryTimes = 0 */) {
    this.tryScrollAgain = null;
    if (this.sensing) {
      // active sensor
      return;
    }

    const opt: any = {};
    let scroll = false;

    const componentInstance = this.getComponentInstances(detail?.near?.node || node)?.[0];
    if (!componentInstance) return;
    const domNode = this.findDOMNodes(componentInstance)?.[0] as Element;
    if (!domNode) return;
    if (isElementNode(domNode) && !isDOMNodeVisible(domNode, this.viewport)) {
      const { left, top } = domNode.getBoundingClientRect();
      const { scrollTop = 0, scrollLeft = 0 } = this.contentDocument?.documentElement || {};
      opt.left = left + scrollLeft;
      opt.top = top + scrollTop;
      scroll = true;
    }

    if (scroll && this.scroller) {
      this.scroller.scrollTo(opt);
    }
  }

  // #region ========= drag and drop helpers =============
  /**
   * @see ISimulator
   */
  setNativeSelection(enableFlag: boolean) {
    this.renderer?.setNativeSelection(enableFlag);
  }

  /**
   * @see ISimulator
   */
  setDraggingState(state: boolean) {
    this.renderer?.setDraggingState(state);
  }

  /**
   * @see ISimulator
   */
  setCopyState(state: boolean) {
    this.renderer?.setCopyState(state);
  }

  /**
   * @see ISimulator
   */
  clearState() {
    this.renderer?.clearState();
  }

  /**
   * @see IPublicModelSensor
   */
  fixEvent(e: ILocateEvent): ILocateEvent {
    if (e.fixed) {
      return e;
    }

    const notMyEvent = e.originalEvent.view?.document !== this.contentDocument;
    // fix canvasX canvasY : 当前激活文档画布坐标系
    if (notMyEvent || !('canvasX' in e) || !('canvasY' in e)) {
      const l = this.viewport.toLocalPoint({
        clientX: e.globalX,
        clientY: e.globalY,
      });
      e.canvasX = l.clientX;
      e.canvasY = l.clientY;
    }

    // fix target : 浏览器事件响应目标
    if (!e.target || notMyEvent) {
      if (!isNaN(e.canvasX!) && !isNaN(e.canvasY!)) {
        e.target = this.contentDocument?.elementFromPoint(e.canvasX!, e.canvasY!);
      }
    }

    // 事件已订正
    e.fixed = true;
    return e;
  }

  /**
   * @see IPublicModelSensor
   */
  isEnter(e: ILocateEvent): boolean {
    const rect = this.viewport.bounds;
    return (
      e.globalY >= rect.top &&
      e.globalY <= rect.bottom &&
      e.globalX >= rect.left &&
      e.globalX <= rect.right
    );
  }

  /**
   * @see IPublicModelSensor
   */
  deactiveSensor() {
    this.sensing = false;
    this.scroller.cancel();
  }

  // ========= drag location logic: helper for locate ==========

  /**
   * 🎯 拖拽定位核心方法 - 传感器接口实现
   *
   * 📋 主要职责：
   * 1. 验证拖拽对象是否可移动
   * 2. 查找合适的投放容器
   * 3. 计算精确的插入位置
   * 4. 创建并返回位置数据对象
   *
   * @param e - 定位事件，包含拖拽对象、目标元素、鼠标坐标等信息
   * @returns DropLocation | null - 投放位置对象或null
   *
   * @see IPublicModelSensor
   */
  locate(e: ILocateEvent): any {
    // 📦 1. 提取拖拽对象信息
    const { dragObject } = e; // 从定位事件中提取拖拽对象（可能是现有节点或新组件数据）

    const nodes = dragObject?.nodes; // 获取被拖拽的节点数组（仅当拖拽现有节点时存在）

    // 🔍 2. 过滤出可操作的节点（检查移动权限）
    const operationalNodes = nodes?.filter((node) => {
      // 🎣 检查节点自身的移动钩子函数
      const onMoveHook = node.componentMeta?.advanced.callbacks?.onMoveHook;
      // 调用移动钩子函数，如果未定义则默认允许移动
      const canMove = onMoveHook && typeof onMoveHook === 'function' ? onMoveHook(node.internalToShellNode()) : true;

      // 🔍 查找父级容器节点
      let parentContainerNode: INode | null = null;
      let parentNode = node.parent;

      // 向上遍历节点树，找到第一个容器节点
      while (parentNode) {
        if (parentNode.isContainer()) {
          parentContainerNode = parentNode; // 找到父级容器节点
          break;
        }
        parentNode = parentNode.parent; // 继续向上查找
      }

      // 🎣 检查父级容器的子节点移动钩子函数
      const onChildMoveHook = parentContainerNode?.componentMeta?.advanced.callbacks?.onChildMoveHook;
      // 调用子节点移动钩子，检查父级容器是否允许该子节点移动
      const childrenCanMove = onChildMoveHook && parentContainerNode && typeof onChildMoveHook === 'function'
        ? onChildMoveHook(node.internalToShellNode(), parentContainerNode.internalToShellNode())
        : true;

      // ✅ 只有同时满足节点可移动和父级允许子节点移动时，才允许操作
      return canMove && childrenCanMove;
    });

    // 🚫 如果没有可操作的节点，直接返回，阻止拖拽操作
    if (nodes && (!operationalNodes || operationalNodes.length === 0)) {
      return; // 提前退出，不进行后续的定位计算
    }

    // 📡 3. 激活传感器和滚动处理
    this.sensing = true; // 标记传感器处于活跃状态
    this.scroller.scrolling(e); // 处理拖拽时的自动滚动逻辑

    // 📄 4. 获取当前文档实例
    const document = this.project.currentDocument; // 获取当前活跃的文档对象
    if (!document) {
      return null; // 没有文档时无法进行定位，直接返回
    }

    // 🎯 5. 核心：查找投放容器（这是判断拖入容器还是画布的关键步骤）
    const dropContainer = this.getDropContainer(e); // 🔥 调用核心方法查找合适的投放容器

    // 🔒 6. 检查容器是否被锁定
    const lockedNode = getClosestNode(dropContainer?.container, (node) => node.isLocked);
    if (lockedNode) return null; // 如果找到锁定的节点，阻止拖拽

    // ❌ 7. 容器查找失败的处理
    if (!dropContainer) {
      return null; // 没有找到合适的容器，拖拽操作无效
    }

    if (isLocationData(dropContainer)) {
      return this.designer.createLocation(dropContainer);
    }

    const { container, instance: containerInstance } = dropContainer;

    const edge = this.computeComponentInstanceRect(
      containerInstance,
      container.componentMeta.rootSelector,
    );

    if (!edge) {
      return null;
    }

    const { children } = container;

    const detail: IPublicTypeLocationChildrenDetail = {
      type: IPublicTypeLocationDetailType.Children,
      index: 0,
      edge,
    };

    const locationData = {
      target: container,
      detail,
      source: `simulator${document.id}`,
      event: e,
    };

    if (
      e.dragObject &&
      e.dragObject.nodes &&
      e.dragObject.nodes.length &&
      e.dragObject.nodes[0].componentMeta.isModal &&
      document.focusNode
    ) {
      return this.designer.createLocation({
        target: document.focusNode,
        detail,
        source: `simulator${document.id}`,
        event: e,
      });
    }

    if (!children || children.size < 1 || !edge) {
      return this.designer.createLocation(locationData);
    }

    let nearRect: IPublicTypeRect | null = null;
    let nearIndex: number = 0;
    let nearNode: INode | null = null;
    let nearDistance: number | null = null;
    let minTop: number | null = null;
    let maxBottom: number | null = null;

    for (let i = 0, l = children.size; i < l; i++) {
      const node = children.get(i)!;
      const index = i;
      const instances = this.getComponentInstances(node);
      const inst = instances
        ? instances.length > 1
          ? instances.find(
            (_inst) => this.getClosestNodeInstance(_inst, container.id)?.instance === containerInstance,
          )
          : instances[0]
        : null;
      const rect = inst
        ? this.computeComponentInstanceRect(inst, node.componentMeta.rootSelector)
        : null;

      if (!rect) {
        continue;
      }

      const distance = isPointInRect(e as any, rect) ? 0 : distanceToRect(e as any, rect);

      if (distance === 0) {
        nearDistance = distance;
        nearNode = node;
        nearIndex = index;
        nearRect = rect;
        break;
      }

      // 标记子节点最顶
      if (minTop === null || rect.top < minTop) {
        minTop = rect.top;
      }
      // 标记子节点最底
      if (maxBottom === null || rect.bottom > maxBottom) {
        maxBottom = rect.bottom;
      }

      if (nearDistance === null || distance < nearDistance) {
        nearDistance = distance;
        nearNode = node;
        nearIndex = index;
        nearRect = rect;
      }
    }

    detail.index = nearIndex;

    if (nearNode && nearRect) {
      const el = getRectTarget(nearRect);
      const inline = el ? isChildInline(el) : false;
      const row = el ? isRowContainer(el.parentElement!) : false;
      const vertical = inline || row;

      // TODO: fix type
      const near: {
        node: IPublicModelNode;
        pos: 'before' | 'after' | 'replace';
        rect?: IPublicTypeRect;
        align?: 'V' | 'H';
      } = {
        node: nearNode.internalToShellNode()!,
        pos: 'before',
        align: vertical ? 'V' : 'H',
      };
      detail.near = near;
      if (isNearAfter(e as any, nearRect, vertical)) {
        near.pos = 'after';
        detail.index = nearIndex + 1;
      }
      if (!row && nearDistance !== 0) {
        const edgeDistance = distanceToEdge(e as any, edge);
        if (edgeDistance.distance < nearDistance!) {
          const { nearAfter } = edgeDistance;
          if (minTop == null) {
            minTop = edge.top;
          }
          if (maxBottom == null) {
            maxBottom = edge.bottom;
          }
          near.rect = new DOMRect(edge.left, minTop, edge.width, maxBottom - minTop);
          near.align = 'H';
          near.pos = nearAfter ? 'after' : 'before';
          detail.index = nearAfter ? children.size : 0;
        }
      }
    }

    return this.designer.createLocation(locationData);
  }

  /**
   * 🎯 查找合适的投放容器 - 容器判断核心逻辑
   *
   * 📋 这个方法是判断「拖入容器」还是「拖入画布」的关键所在！
   *
   * 🔍 判断流程：
   * 1. DOM元素 → 节点映射：从鼠标位置的DOM元素找到对应的低代码节点
   * 2. 容器类型检查：判断节点是否为容器类型（meta.isContainer）
   * 3. 父级查找：非容器节点向上查找父级容器
   * 4. 冲突避免：防止节点拖拽到自己内部造成循环
   * 5. 权限验证：通过handleAccept验证容器是否可接受拖拽
   *
   * @param e - 定位事件，包含target(DOM元素)和dragObject(拖拽对象)
   * @returns DropContainer | null - 找到的投放容器或null
   */
  getDropContainer(e: ILocateEvent): DropContainer | null {
    // 📦 1. 提取核心数据
    const { target, dragObject } = e; // target: 鼠标所在的DOM元素, dragObject: 被拖拽的对象
    const isAny = isDragAnyObject(dragObject); // 判断是否为特殊拖拽对象（非节点和组件数据）
    const document = this.project.currentDocument!; // 获取当前文档实例
    const { currentRoot } = document; // 获取文档根节点，作为最终兜底容器
    let container: INode | null; // 候选容器节点
    let nodeInstance: IPublicTypeNodeInstance<IPublicTypeComponentInstance, INode> | undefined; // DOM实例引用

    // 🎯 2. 核心：DOM元素到节点的映射（判断拖入位置的第一步）
    if (target) {
      // 🔑 关键调用：从DOM元素查找对应的低代码节点
      const ref = this.getNodeInstanceFromElement(target); // 这是DOM→节点映射的核心方法

      if (ref?.node) {
        // ✅ 成功映射：找到了对应的节点
        nodeInstance = ref; // 保存节点实例引用
        container = ref.node; // 将找到的节点作为候选容器
      } else if (isAny) {
        // ❌ 特殊拖拽对象但无法映射节点
        return null; // 直接返回null，不支持此类操作
      } else {
        // 🏠 兜底策略：映射失败时使用根节点作为容器
        container = currentRoot; // 将拖拽目标设为根节点（整个画布）
      }
    } else if (isAny) {
      // 🚫 没有目标元素且为特殊拖拽对象
      return null; // 无法处理，返回null
    } else {
      // 🏠 没有目标元素时的兜底策略
      container = currentRoot; // 默认拖入根节点（画布）
    }

    // 🏗️ 3. 容器类型检查与修正
    if (!container?.isParental()) {
      // 🔍 如果当前节点不是容器类型，向上查找父级容器
      // isParental() 检查节点是否可以包含子节点
      container = container?.parent || currentRoot; // 使用父节点或根节点作为容器
    }

    // 🚧 4. 特殊拖拽对象的早期退出
    // TODO: use spec container to accept specialData
    if (isAny) {
      // will return locationData
      return null; // 特殊拖拽对象暂不支持复杂的容器查找逻辑
    }

    // 🔄 5. 防止循环拖拽：避免节点拖拽到自己内部
    // get common parent, avoid drop container contains by dragObject
    const drillDownExcludes = new Set<INode>(); // 记录需要排除的节点
    if (isDragNodeObject(dragObject)) {
      // 只有拖拽现有节点时才需要检查循环拖拽
      const { nodes } = dragObject; // 获取被拖拽的节点列表
      let i = nodes.length;
      let p: any = container; // 从当前容器开始检查

      // 遍历所有被拖拽的节点
      while (i-- > 0) {
        if (contains(nodes[i], p)) {
          // 🚫 发现循环：容器包含在被拖拽的节点内
          p = nodes[i].parent; // 向上移动到被拖拽节点的父级
        }
      }

      if (p !== container) {
        // 🔧 修正容器：使用安全的父级节点或焦点节点
        container = p || document.focusNode; // 使用修正后的容器
        container && drillDownExcludes.add(container); // 记录排除的节点
      }
    }

    // 🎯 6. 获取组件实例（React实例，用于后续的位置计算）
    let instance: any;
    if (nodeInstance) {
      // 情况1: 有节点实例引用
      if (nodeInstance.node === container) {
        // 节点实例直接对应当前容器
        instance = nodeInstance.instance; // 直接使用实例
      } else {
        // 节点实例与容器不匹配，需要查找最近的实例
        instance = this.getClosestNodeInstance(
          nodeInstance.instance as any,
          container?.id,
        )?.instance; // 查找容器对应的React实例
      }
    } else {
      // 情况2: 没有节点实例引用，直接获取容器的组件实例
      instance = container && this.getComponentInstances(container)?.[0]; // 获取容器的第一个组件实例
    }

    // 🏗️ 7. 构建投放容器对象
    let dropContainer: DropContainer = {
      container: container as any, // 低代码节点
      instance, // React组件实例
    };

    // 🔍 8. 容器接受验证循环（向上查找可接受的容器）
    let res: any; // 验证结果
    let upward: DropContainer | null = null; // 向上查找的容器

    while (container) {
      // 🎯 关键验证：检查容器是否可以接受拖拽
      res = this.handleAccept(dropContainer, e); // 🔥 调用容器接受验证方法

      // if (isLocationData(res)) {
      //   return res;
      // }

      if (res === true) {
        // ✅ 容器接受验证通过
        return dropContainer; // 返回找到的有效容器
      }

      if (!res) {
        // ❌ 当前容器不接受拖拽，尝试向上查找父级容器
        drillDownExcludes.add(container); // 记录已检查的容器，避免重复

        if (upward) {
          // 使用预设的向上查找容器
          dropContainer = upward;
          container = dropContainer.container;
          upward = null;
        } else if (container.parent) {
          // 向上查找父级容器
          container = container.parent; // 移动到父级节点

          // 获取父级容器对应的组件实例
          instance = this.getClosestNodeInstance(dropContainer.instance, container.id)?.instance;

          // 构建新的投放容器对象
          dropContainer = {
            container,
            instance,
          };
        } else {
          // 🚫 已经到达根节点仍未找到可接受的容器
          return null; // 拖拽操作无效
        }
      }
    }

    // 🚫 所有容器都不接受拖拽
    return null; // 返回null，表示拖拽无法完成
  }

  isAcceptable(): boolean {
    return false;
  }

  /**
   * 🎯 容器接受验证 - 最终判断容器是否可接受拖拽的关键方法
   *
   * 📋 这里是「拖入容器」vs「拖入画布」判断的最终验证！
   *
   * 🔍 验证逻辑：
   * 1. 根节点或焦点容器：使用文档级嵌套检查
   * 2. 普通容器：检查 meta.isContainer 标志
   * 3. 特殊容器：通过 isAcceptable 方法自定义验证
   * 4. 嵌套规则：检查父子组件兼容性
   *
   * ⚠️  关键点：meta.isContainer = false 的组件将被拒绝！
   *
   * @param dropContainer - 候选投放容器（包含节点和实例）
   * @param e - 定位事件（包含拖拽对象）
   * @returns boolean - true表示接受拖拽，false表示拒绝
   */
  handleAccept({ container }: DropContainer, e: ILocateEvent): boolean {
    // 📦 1. 提取验证所需数据
    const { dragObject } = e; // 获取拖拽对象（组件数据或现有节点）
    const document = this.currentDocument!; // 获取当前文档实例
    const { focusNode } = document; // 获取当前焦点节点

    // 🏠 2. 根节点和焦点容器的特殊处理
    if (isRootNode(container) || container.contains(focusNode)) {
      // 如果是根节点或包含焦点节点的容器，使用文档级的嵌套检查
      // 这种情况下会检查更复杂的嵌套规则和组件兼容性
      return document.checkNesting(focusNode!, dragObject as any);
    }

    // 📋 3. 获取组件元数据 - 这里是关键的容器类型检查！
    const meta = (container as Node).componentMeta; // 获取组件的元数据配置

    // 🔧 4. 自定义可接受性检查（扩展点）
    // FIXME: get containerInstance for accept logic use
    const acceptable: boolean = this.isAcceptable(container); // 调用自定义接受检查

    // 🎯 5. 核心判断：检查是否为容器组件
    if (!meta.isContainer && !acceptable) {
      // ❌ 关键检查：如果组件的 meta.isContainer 为 false 且不被自定义逻辑接受
      // 这就是为什么 JSSlot 拖拽失败的原因！JSSlot 组件通常 meta.isContainer = false
      return false; // 拒绝拖拽，返回 false
    }

    // ✅ 通过容器检查，继续进行嵌套规则验证

    // 🔗 6. 最终的嵌套兼容性检查
    // check nesting - 检查父子组件的兼容性（如 Button 不能包含 Button）
    return document.checkNesting(container, dragObject as any); // 返回嵌套规则检查结果
  }

  /**
   * 查找邻近容器
   */
  getNearByContainer(
    { container, instance }: DropContainer,
    drillDownExcludes: Set<INode>,
  ) {
    const { children } = container;
    if (!children || children.isEmpty()) {
      return null;
    }

    const nearBy: any = null;
    for (let i = 0, l = children.size; i < l; i++) {
      let child = children.get(i);

      if (!child) {
        continue;
      }
      if (child.conditionGroup) {
        const bn = child.conditionGroup;
        i = (bn.index || 0) + bn.length - 1;
        child = bn.visibleNode;
      }
      if (!child.isParental() || drillDownExcludes.has(child)) {
        continue;
      }
      // TODO:
      this.findDOMNodes(instance);
      this.getComponentInstances(child);
      const rect = this.computeRect(child);
      if (!rect) {
        continue;
      }
    }

    return nearBy;
  }
  // #endregion
}

function isHTMLTag(name: string) {
  return /^[a-z]\w*$/.test(name);
}

function isPointInRect(point: CanvasPoint, rect: IPublicTypeRect) {
  return (
    point.canvasY >= rect.top &&
    point.canvasY <= rect.bottom &&
    point.canvasX >= rect.left &&
    point.canvasX <= rect.right
  );
}

function distanceToRect(point: CanvasPoint, rect: IPublicTypeRect) {
  let minX = Math.min(Math.abs(point.canvasX - rect.left), Math.abs(point.canvasX - rect.right));
  let minY = Math.min(Math.abs(point.canvasY - rect.top), Math.abs(point.canvasY - rect.bottom));
  if (point.canvasX >= rect.left && point.canvasX <= rect.right) {
    minX = 0;
  }
  if (point.canvasY >= rect.top && point.canvasY <= rect.bottom) {
    minY = 0;
  }

  return Math.sqrt(minX ** 2 + minY ** 2);
}

function distanceToEdge(point: CanvasPoint, rect: IPublicTypeRect) {
  const distanceTop = Math.abs(point.canvasY - rect.top);
  const distanceBottom = Math.abs(point.canvasY - rect.bottom);

  return {
    distance: Math.min(distanceTop, distanceBottom),
    nearAfter: distanceBottom < distanceTop,
  };
}

function isNearAfter(point: CanvasPoint, rect: IPublicTypeRect, inline: boolean) {
  if (inline) {
    return (
      Math.abs(point.canvasX - rect.left) + Math.abs(point.canvasY - rect.top) >
      Math.abs(point.canvasX - rect.right) + Math.abs(point.canvasY - rect.bottom)
    );
  }
  return Math.abs(point.canvasY - rect.top) > Math.abs(point.canvasY - rect.bottom);
}

function getMatched(elements: Array<Element | Text>, selector: string): Element | null {
  let firstQueried: Element | null = null;
  for (const elem of elements) {
    if (isElement(elem)) {
      if (elem.matches(selector)) {
        return elem;
      }

      if (!firstQueried) {
        firstQueried = elem.querySelector(selector);
      }
    }
  }
  return firstQueried;
}
