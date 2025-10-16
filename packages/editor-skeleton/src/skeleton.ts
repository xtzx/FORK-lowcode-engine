/**
 * @file Skeleton 骨架核心类
 * @description 低代码编辑器的骨架系统，管理所有布局区域和 Widget
 *
 * 核心职责：
 * 1. 区域管理：创建和管理 7 个布局区域
 * 2. Widget 管理：添加、移除、显示、隐藏各种 Widget
 * 3. Panel 管理：管理所有面板的生命周期
 * 4. 布局配置：支持从配置构建整个布局
 * 5. 事件系统：发送 Widget 和 Panel 的生命周期事件
 *
 * 编辑器布局结构：
 * ```
 * ┌────────────────────────────────────────┐
 * │           topArea (顶部区域)            │
 * ├────────────────────────────────────────┤
 * │         subTopArea (子顶部区域)         │
 * ├────────────────────────────────────────┤
 * │           toolbar (工具栏)              │
 * ├───────┬─────────────────────┬──────────┤
 * │       │                     │          │
 * │ left  │    mainArea (主区)  │  right   │
 * │ Area  │                     │  Area    │
 * │       │  stages (舞台列表)  │          │
 * │       │                     │          │
 * ├───────┴─────────────────────┴──────────┤
 * │        bottomArea (底部区域)            │
 * └────────────────────────────────────────┘
 *
 * leftArea 细分：
 * - leftFixedArea: 固定面板区域
 * - leftFloatArea: 浮动面板区域
 * ```
 *
 * 关键概念：
 * - Skeleton: 骨架，整个布局的管理器
 * - Area: 区域，布局的一个区块
 * - Widget: 组件，区域内的内容单元
 * - Panel: 面板，一种特殊的 Widget
 * - Dock: 停靠容器，可以包含多个 Widget
 * - Stage: 舞台，用于渲染低代码画布
 *
 * 设计模式：
 * - 单例模式：每个编辑器实例对应一个 Skeleton
 * - 观察者模式：通过事件系统通知状态变化
 * - 工厂模式：提供各种 create 方法创建 Widget
 *
 * 技术架构：
 * - 响应式：使用 MobX 实现状态管理
 * - 类型安全：完整的 TypeScript 类型定义
 * - 可扩展：支持自定义 Widget 和 Transducer
 *
 * @example
 * ```typescript
 * // 创建骨架
 * const skeleton = new Skeleton(editor);
 *
 * // 添加左侧面板
 * skeleton.add({
 *   area: 'leftArea',
 *   type: 'PanelDock',
 *   name: 'outline',
 *   content: OutlinePanel,
 *   props: { title: '大纲树' }
 * });
 *
 * // 添加工具栏按钮
 * skeleton.add({
 *   area: 'toolbar',
 *   type: 'Widget',
 *   name: 'save',
 *   content: <SaveButton />
 * });
 *
 * // 渲染编辑器
 * <Workbench skeleton={skeleton} />
 * ```
 */

// ==================== 依赖导入 ====================
import { action, makeObservable, obx, engineConfig, IEditor, FocusTracker } from '@alilc/lowcode-editor-core';
import {
  DockConfig,  // Dock 配置类型
  WidgetConfig,  // Widget 配置类型
  PanelDockConfig,  // 面板 Dock 配置类型
  DialogDockConfig,  // 对话框 Dock 配置类型
  isDockConfig,  // Dock 类型守卫
  isPanelDockConfig,  // PanelDock 类型守卫
  isPanelConfig,  // Panel 类型守卫
  DividerConfig,  // 分割线配置类型
  isDividerConfig,  // Divider 类型守卫
} from './types';
import { isPanel, Panel } from './widget/panel';
import { WidgetContainer } from './widget/widget-container';
import { Area } from './area';
import { isWidget, IWidget, Widget } from './widget/widget';
import { PanelDock } from './widget/panel-dock';
import { Dock } from './widget/dock';
import { Stage, StageConfig } from './widget/stage';
import { isValidElement } from 'react';
import { isPlainObject, uniqueId, Logger } from '@alilc/lowcode-utils';
import { Divider } from '@alifd/next';
import {
  EditorConfig,  // 编辑器配置类型
  PluginClassSet,  // 插件类集合
  IPublicTypeWidgetBaseConfig,  // Widget 基础配置
  IPublicTypeWidgetConfigArea,  // Widget 区域类型
  IPublicTypeSkeletonConfig,  // Skeleton 配置类型
  IPublicApiSkeleton,  // Skeleton API 接口
  IPublicTypeConfigTransducer,  // 配置转换器类型
  IPublicTypePanelConfig,  // Panel 配置类型
} from '@alilc/lowcode-types';

/**
 * Logger 实例
 *
 * 配置：
 * - level: 'warn' - 只记录警告和错误级别
 * - bizName: 'skeleton' - 业务标识
 *
 * 用途：
 * - 记录 Widget 重复添加警告
 * - 记录配置错误
 * - 辅助调试
 */
const logger = new Logger({ level: 'warn', bizName: 'skeleton' });

// ==================== Skeleton 事件枚举 ====================
/**
 * Skeleton 事件类型枚举
 *
 * 事件系统的作用：
 * - 通知外部组件 Skeleton 的状态变化
 * - 实现松耦合的组件通信
 * - 支持插件监听和响应事件
 *
 * 事件分类：
 *
 * PanelDock 事件：
 * - PANEL_DOCK_ACTIVE: 面板 Dock 激活（切换标签页）
 * - PANEL_DOCK_UNACTIVE: 面板 Dock 取消激活
 *
 * Panel 事件：
 * - PANEL_SHOW: 面板显示
 * - PANEL_HIDE: 面板隐藏
 *
 * Widget 事件：
 * - WIDGET_SHOW: Widget 显示
 * - WIDGET_HIDE: Widget 隐藏
 * - WIDGET_DISABLE: Widget 禁用
 * - WIDGET_ENABLE: Widget 启用
 *
 * 使用场景：
 * ```typescript
 * // 监听面板显示事件
 * skeleton.editor.on(SkeletonEvents.PANEL_SHOW, (panelName) => {
 *   console.log(`面板 ${panelName} 显示了`);
 * });
 *
 * // 监听 Widget 禁用事件
 * skeleton.editor.on(SkeletonEvents.WIDGET_DISABLE, (widgetName) => {
 *   console.log(`Widget ${widgetName} 被禁用了`);
 * });
 * ```
 */
export enum SkeletonEvents {
  PANEL_DOCK_ACTIVE = 'skeleton.panel-dock.active',  // 面板 Dock 激活
  PANEL_DOCK_UNACTIVE = 'skeleton.panel-dock.unactive',  // 面板 Dock 取消激活
  PANEL_SHOW = 'skeleton.panel.show',  // 面板显示
  PANEL_HIDE = 'skeleton.panel.hide',  // 面板隐藏
  WIDGET_SHOW = 'skeleton.widget.show',  // Widget 显示
  WIDGET_HIDE = 'skeleton.widget.hide',  // Widget 隐藏
  WIDGET_DISABLE = 'skeleton.widget.disable',  // Widget 禁用
  WIDGET_ENABLE = 'skeleton.widget.enable',  // Widget 启用
}

// ==================== ISkeleton 接口 ====================
/**
 * Skeleton 接口定义
 *
 * 继承关系：
 * - 继承 IPublicApiSkeleton（公开 API 接口）
 * - Omit 移除了部分方法（实现类会重新定义）
 *
 * 为什么要 Omit 一些方法？
 * - 内部实现的方法签名可能与公开 API 稍有不同
 * - 内部需要更多的灵活性
 * - 公开 API 通过适配器层暴露
 */
export interface ISkeleton extends Omit<IPublicApiSkeleton,
  'showPanel' |
  'hidePanel' |
  'showWidget' |
  'enableWidget' |
  'hideWidget' |
  'disableWidget' |
  'showArea' |
  'onShowPanel' |
  'onHidePanel' |
  'onShowWidget' |
  'onHideWidget' |
  'remove' |
  'hideArea' |
  'add'
> {
  // ========== 编辑器引用 ==========
  /**
   * 编辑器实例引用
   *
   * 用途：
   * - 访问编辑器的其他模块（designer、project 等）
   * - 发送事件（editor.emit）
   * - 获取配置（editor.config）
   */
  editor: IEditor;

  // ========== 区域属性（7个布局区域） ==========

  /**
   * 左侧区域
   *
   * 特点：
   * - 独占模式（exclusive=true）
   * - 显示为标签页切换
   * - 常用于：大纲树、组件库、数据源等面板
   *
   * 支持的 Widget 类型：
   * - Dock: 基础停靠容器
   * - PanelDock: 面板停靠容器（最常用）
   * - DialogDock: 对话框停靠容器
   */
  readonly leftArea: Area<DockConfig | PanelDockConfig | DialogDockConfig>;

  /**
   * 顶部区域
   *
   * 特点：
   * - 普通模式（所有 Widget 同时显示）
   * - 常用于：Logo、标题、全局操作按钮
   *
   * 支持的 Widget 类型：
   * - Dock: 基础停靠容器
   * - Divider: 分割线
   * - PanelDock: 面板停靠容器
   * - DialogDockConfig: 对话框停靠容器
   */
  readonly topArea: Area<DockConfig | DividerConfig | PanelDockConfig | DialogDockConfig>;

  /**
   * 子顶部区域
   *
   * 特点：
   * - 位于 topArea 下方，toolbar 上方
   * - 可选区域，不是所有编辑器都使用
   * - 用于扩展顶部功能
   */
  readonly subTopArea: Area<DockConfig | DividerConfig | PanelDockConfig | DialogDockConfig>;

  /**
   * 工具栏区域
   *
   * 特点：
   * - 普通模式
   * - 常用于：保存、预览、撤销、重做等操作按钮
   *
   * 支持的 Widget 类型：
   * - Dock: 基础停靠容器
   * - Divider: 分割线（分隔不同功能组）
   * - PanelDock: 面板停靠容器
   * - DialogDock: 对话框停靠容器
   */
  readonly toolbar: Area<DockConfig | DividerConfig | PanelDockConfig | DialogDockConfig>;

  /**
   * 左侧固定面板区域
   *
   * 特点：
   * - leftArea 的一部分
   * - 固定显示，不可关闭
   * - 只支持 Panel 类型
   */
  readonly leftFixedArea: Area<IPublicTypePanelConfig, Panel>;

  /**
   * 左侧浮动面板区域
   *
   * 特点：
   * - leftArea 的一部分
   * - 可以拖拽、关闭
   * - 只支持 Panel 类型
   */
  readonly leftFloatArea: Area<IPublicTypePanelConfig, Panel>;

  /**
   * 右侧区域
   *
   * 特点：
   * - 独占模式
   * - 常用于：属性设置、样式设置等面板
   * - 只支持 Panel 类型
   */
  readonly rightArea: Area<IPublicTypePanelConfig, Panel>;

  /**
   * 主区域
   *
   * 特点：
   * - 编辑器的核心区域
   * - 用于渲染画布（Canvas）
   * - 支持多个 Stage（舞台）
   *
   * 支持的 Widget 类型：
   * - Widget: 基础 Widget
   * - Panel: 面板
   */
  readonly mainArea: Area<WidgetConfig | IPublicTypePanelConfig, Widget | Panel>;

  /**
   * 底部区域
   *
   * 特点：
   * - 独占模式
   * - 常用于：控制台、网络请求、源码查看等面板
   * - 只支持 Panel 类型
   */
  readonly bottomArea: Area<IPublicTypePanelConfig, Panel>;

  /**
   * 舞台区域
   *
   * 特点：
   * - 用于管理多个 Stage（画布）
   * - 支持多页面编辑
   * - 只支持 Stage 类型
   */
  readonly stages: Area<StageConfig, Stage>;

  // ========== Widget 列表 ==========
  /**
   * 所有 Widget 的数组
   *
   * 用途：
   * - 快速访问所有 Widget
   * - 遍历所有 Widget
   * - 统计 Widget 数量
   */
  readonly widgets: IWidget[];

  // ========== 焦点追踪器 ==========
  /**
   * 焦点追踪器
   *
   * 用途：
   * - 追踪当前焦点所在的区域
   * - 管理键盘事件
   * - 实现快捷键功能
   */
  readonly focusTracker: FocusTracker;

  // ========== 方法定义 ==========

  /**
   * 根据名称获取 Panel
   *
   * @param name - Panel 名称
   * @returns Panel 实例或 undefined
   */
  getPanel(name: string): Panel | undefined;

  /**
   * 根据名称获取 Widget
   *
   * @param name - Widget 名称
   * @returns Widget 实例或 undefined
   */
  getWidget(name: string): IWidget | undefined;

  /**
   * 从配置构建布局
   *
   * @param config - 编辑器配置
   * @param components - 插件类集合
   *
   * 用途：
   * - 批量添加 Widget
   * - 从配置文件恢复布局
   * - 实现布局的序列化和反序列化
   */
  buildFromConfig(config?: EditorConfig, components?: PluginClassSet): void;

  /**
   * 创建舞台
   *
   * @param config - 舞台配置
   * @returns 舞台名称或 undefined
   */
  createStage(config: any): string | undefined;

  /**
   * 获取舞台
   *
   * @param name - 舞台名称
   * @returns Stage 实例或 null
   */
  getStage(name: string): Stage | null;

  /**
   * 创建 Widget 容器
   *
   * @param name - 容器名称
   * @param handle - Widget 处理函数
   * @param exclusive - 是否独占模式
   * @param checkVisible - 可见性检查函数
   * @param defaultSetCurrent - 是否默认设置当前
   * @returns WidgetContainer 实例
   */
  createContainer(
    name: string,
    handle: (item: any) => any,
    exclusive?: boolean,
    checkVisible?: () => boolean,
    defaultSetCurrent?: boolean,
  ): WidgetContainer;

  /**
   * 创建面板
   *
   * @param config - 面板配置
   * @returns Panel 实例
   */
  createPanel(config: IPublicTypePanelConfig): Panel;

  /**
   * 添加 Widget 到 Skeleton
   *
   * @param config - Skeleton 配置
   * @param extraConfig - 额外配置
   * @returns Widget 实例或 undefined
   *
   * 这是 Skeleton 最核心的方法！
   * - 根据配置的 type 创建对应的 Widget
   * - 添加到对应的区域（area）
   * - 返回创建的 Widget 实例
   */
  add(config: IPublicTypeSkeletonConfig, extraConfig?: Record<string, any>): IWidget | Widget | Panel | Stage | Dock | PanelDock | undefined;
}

// ==================== Skeleton 类实现 ====================
/**
 * Skeleton 骨架类
 *
 * 职责：
 * - 管理编辑器的所有布局区域
 * - 提供 Widget 的增删改查
 * - 处理布局配置的序列化和反序列化
 * - 发送布局相关的事件
 *
 * 核心属性：
 * - 7 个布局区域：leftArea、topArea、toolbar 等
 * - panels Map：所有 Panel 的索引
 * - containers Map：所有容器的索引
 * - widgets 数组：所有 Widget 的列表
 *
 * 核心方法：
 * - add: 添加 Widget（最常用）
 * - getPanel/getWidget: 查找 Widget
 * - createPanel/createWidget: 创建 Widget
 * - buildFromConfig: 批量构建布局
 */
export class Skeleton implements ISkeleton {
  // ========== 私有属性：Panel 索引 ==========
  /**
   * Panel 索引 Map
   *
   * 结构：{ panelName: Panel 实例 }
   *
   * 用途：
   * - 快速查找 Panel（O(1) 时间复杂度）
   * - 全局 Panel 去重
   * - 跨区域访问 Panel
   *
   * 为什么需要全局索引？
   * ```typescript
   * // 场景：获取任意位置的 Panel
   * const panel = skeleton.getPanel('属性设置');
   * // 不需要知道 Panel 在哪个区域
   * // 直接从全局索引获取
   * ```
   */
  private panels = new Map<string, Panel>();

  // ========== 私有属性：配置转换器列表 ==========
  /**
   * 配置转换器数组
   *
   * 用途：
   * - 存储所有注册的转换器
   * - 在添加 Widget 前处理配置
   * - 支持配置的预处理和增强
   *
   * Transducer 的作用：
   * ```typescript
   * // 示例：自动添加默认属性
   * function defaultPropsTransducer(config) {
   *   return {
   *     ...config,
   *     props: {
   *       className: 'default-widget',
   *       ...config.props
   *     }
   *   };
   * }
   *
   * skeleton.registerConfigTransducer(defaultPropsTransducer);
   * ```
   */
  private configTransducers: IPublicTypeConfigTransducer[] = [];

  // ========== 私有属性：容器索引 ==========
  /**
   * Widget 容器索引 Map
   *
   * 结构：{ containerName: WidgetContainer 实例 }
   *
   * 用途：
   * - 快速查找容器
   * - 管理所有容器的生命周期
   *
   * 容器 vs 区域：
   * - Area: 对外的抽象概念（左侧区域、工具栏等）
   * - WidgetContainer: 内部的实现，管理 Widget 列表
   * - 一个 Area 对应一个 WidgetContainer
   */
  private containers = new Map<string, WidgetContainer<any>>();

  // ========== 区域属性定义 ==========
  // 注意：这些属性在构造函数中初始化
  // 只读属性，不能被重新赋值

  /**
   * 左侧区域
   * 非独占模式（可以同时显示多个 Dock）
   */
  readonly leftArea: Area<DockConfig | PanelDockConfig | DialogDockConfig>;

  /**
   * 顶部区域
   * 非独占模式
   */
  readonly topArea: Area<DockConfig | DividerConfig | PanelDockConfig | DialogDockConfig>;

  /**
   * 子顶部区域
   * 非独占模式
   */
  readonly subTopArea: Area<DockConfig | DividerConfig | PanelDockConfig | DialogDockConfig>;

  /**
   * 工具栏区域
   * 非独占模式
   */
  readonly toolbar: Area<DockConfig | DividerConfig | PanelDockConfig | DialogDockConfig>;

  /**
   * 左侧固定面板区域
   * 独占模式（同一时间只显示一个 Panel）
   */
  readonly leftFixedArea: Area<IPublicTypePanelConfig, Panel>;

  /**
   * 左侧浮动面板区域
   * 独占模式
   */
  readonly leftFloatArea: Area<IPublicTypePanelConfig, Panel>;

  /**
   * 右侧区域
   * 独占模式（同一时间只显示一个 Panel）
   */
  readonly rightArea: Area<IPublicTypePanelConfig, Panel>;

  /**
   * 主区域
   *
   * @obx 装饰器：
   * - MobX 可观察属性
   * - 变化时自动触发视图更新
   *
   * 为什么只有 mainArea 用 @obx？
   * - mainArea 可能动态变化（添加/移除 Stage）
   * - 其他区域通常在初始化时确定
   * - 优化性能，减少不必要的响应式追踪
   */
  @obx readonly mainArea: Area<WidgetConfig | IPublicTypePanelConfig, Widget | Panel>;

  /**
   * 底部区域
   * 独占模式
   */
  readonly bottomArea: Area<IPublicTypePanelConfig, Panel>;

  /**
   * 舞台区域
   * 用于管理多个画布 Stage
   */
  readonly stages: Area<StageConfig, Stage>;

  // ========== Widget 列表 ==========
  /**
   * 所有 Widget 的数组
   *
   * 只读数组，但可以修改数组内容（push、splice 等）
   */
  readonly widgets: IWidget[] = [];

  // ========== 焦点追踪器 ==========
  /**
   * 焦点追踪器实例
   *
   * 功能：
   * - 追踪当前焦点在哪个 Widget
   * - 管理键盘快捷键
   * - 实现焦点相关的交互
   */
  readonly focusTracker = new FocusTracker();

  // ========== 构造函数 ==========
  /**
   * 构造 Skeleton 实例
   *
   * @param editor - 编辑器实例（只读）
   * @param viewName - 视图名称（只读），默认 'global'
   *
   * 初始化流程：
   * 1. 启用 MobX 响应式
   * 2. 创建所有区域（Area）
   * 3. 为每个区域配置处理函数（handle）
   *
   * 区域初始化策略：
   * - 独占区域：exclusive=true，同时只显示一个 Widget
   * - 普通区域：exclusive=false，所有 Widget 同时显示
   */
  constructor(readonly editor: IEditor, readonly viewName: string = 'global') {
    // ===== 第1步：启用 MobX 响应式 =====
    // 激活 @obx 和 @computed 装饰器
    makeObservable(this);

    // ===== 第2步：创建所有区域 =====

    // --- 创建 leftArea（左侧区域）---
    /**
     * 配置：
     * - name: 'leftArea'
     * - exclusive: false（非独占，可以同时显示多个 Dock）
     * - handle: 配置转换函数
     *
     * handle 函数逻辑：
     * - 如果已经是 Widget 实例 -> 直接返回
     * - 如果是配置对象 -> 调用 createWidget 创建
     *
     * 为什么要检查 isWidget？
     * - 支持传入已创建的 Widget 实例
     * - 避免重复创建
     */
    this.leftArea = new Area(
      this,  // skeleton 引用
      'leftArea',  // 区域名称
      (config) => {
        if (isWidget(config)) {
          return config;  // 已是实例，直接返回
        }
        return this.createWidget(config);  // 配置 -> 实例
      },
      false,  // exclusive=false，非独占模式
    );

    // --- 创建 topArea（顶部区域）---
    /**
     * 配置同 leftArea
     * 用于：Logo、标题、全局操作等
     */
    this.topArea = new Area(
      this,
      'topArea',
      (config) => {
        if (isWidget(config)) {
          return config;
        }
        return this.createWidget(config);
      },
      false,  // 非独占
    );

    // --- 创建 subTopArea（子顶部区域）---
    /**
     * 配置同 topArea
     * 位于 topArea 和 toolbar 之间
     */
    this.subTopArea = new Area(
      this,
      'subTopArea',
      (config) => {
        if (isWidget(config)) {
          return config;
        }
        return this.createWidget(config);
      },
      false,  // 非独占
    );

    // --- 创建 toolbar（工具栏）---
    /**
     * 配置同 topArea
     * 用于：保存、预览、撤销、重做等按钮
     */
    this.toolbar = new Area(
      this,
      'toolbar',
      (config) => {
        if (isWidget(config)) {
          return config;
        }
        return this.createWidget(config);
      },
      false,  // 非独占
    );

    // --- 创建 leftFixedArea（左侧固定面板区域）---
    /**
     * 配置：
     * - exclusive: true（独占模式，同时只显示一个）
     * - 只接受 Panel 类型
     *
     * handle 函数：
     * - 检查 isPanel 而不是 isWidget
     * - 调用 createPanel 而不是 createWidget
     *
     * 用于：固定的面板（不可关闭）
     */
    this.leftFixedArea = new Area(
      this,
      'leftFixedArea',
      (config) => {
        if (isPanel(config)) {
          return config;  // 已是 Panel 实例
        }
        return this.createPanel(config);  // 创建 Panel
      },
      true,  // exclusive=true，独占模式
    );

    // --- 创建 leftFloatArea（左侧浮动面板区域）---
    /**
     * 配置同 leftFixedArea
     * 用于：可拖拽、可关闭的面板
     */
    this.leftFloatArea = new Area(
      this,
      'leftFloatArea',
      (config) => {
        if (isPanel(config)) {
          return config;
        }
        return this.createPanel(config);
      },
      true,  // 独占模式
    );

    // --- 创建 rightArea（右侧区域）---
    /**
     * 配置：
     * - exclusive: false（非独占模式！）
     * - defaultSetCurrent: true（默认激活第一个）
     *
     * 注意：
     * - 虽然 exclusive=false，但通常只有一个 Panel
     * - defaultSetCurrent=true 确保首个 Panel 自动激活
     *
     * 用于：属性设置、样式设置等
     */
    this.rightArea = new Area(
      this,
      'rightArea',
      (config) => {
        if (isPanel(config)) {
          return config;
        }
        return this.createPanel(config);
      },
      false,  // 非独占（注意！与 leftFixedArea 不同）
      true,  // defaultSetCurrent=true，自动激活第一个
    );

    // --- 创建 mainArea（主区域）---
    /**
     * 配置：
     * - exclusive: true（独占模式）
     * - defaultSetCurrent: true（默认激活第一个）
     *
     * 支持类型：
     * - Widget: 基础 Widget
     * - Panel: 面板
     *
     * 用于：画布（Canvas）渲染
     */
    this.mainArea = new Area(
      this,
      'mainArea',
      (config) => {
        if (isWidget(config)) {
          return config as Widget;  // 类型断言
        }
        return this.createWidget(config) as Widget;
      },
      true,  // 独占模式
      true,  // defaultSetCurrent=true
    );

    // --- 创建 bottomArea（底部区域）---
    /**
     * 配置：
     * - exclusive: true（独占模式）
     * - 只接受 Panel 类型
     *
     * 用于：控制台、网络请求等工具面板
     */
    this.bottomArea = new Area(
      this,
      'bottomArea',
      (config) => {
        if (isPanel(config)) {
          return config;
        }
        return this.createPanel(config);
      },
      true,  // 独占模式
    );

    // --- 创建 stages（舞台区域）---
    /**
     * 配置：
     * - 只接受 Stage 类型
     * - 直接 new Stage() 而不是调用 createWidget
     *
     * Stage 的特殊性：
     * - Stage 是特殊的 Widget，用于渲染画布
     * - 支持多个 Stage（多页面编辑）
     * - 每个 Stage 对应一个文档
     */
    this.stages = new Area(this, 'stages', (config) => {
      if (isWidget(config)) {
        return config;
      }
      return new Stage(this, config);  // 直接创建 Stage 实例
    });

    // ===== 第3步：设置插件 =====
    // 初始化插件系统（如果有配置的话）
    this.setupPlugins();

    // ===== 第4步：设置事件监听 =====
    // 监听面板显示事件，处理固定/浮动状态
    this.setupEvents();

    // ===== 第5步：挂载焦点追踪器 =====
    // 追踪全局焦点，管理键盘事件
    this.focusTracker.mount(window);
  }

  // ========== 私有方法：设置事件监听 ==========
  /**
   * 设置事件监听
   *
   * 功能：
   * - 监听面板显示事件
   * - 自动调整面板的固定/浮动状态
   * - 从用户偏好恢复状态
   *
   * 业务逻辑：
   * 1. 用户上次将面板设置为浮动
   * 2. 保存到用户偏好（engineConfig）
   * 3. 下次打开编辑器
   * 4. 监听面板显示事件
   * 5. 检查偏好配置
   * 6. 如果当前状态与偏好不符，自动调整
   *
   * 使用场景：
   * ```typescript
   * // 场景：用户将"属性设置"面板从固定改为浮动
   * // 1. 用户操作 -> toggleFloatStatus()
   * // 2. 保存偏好：'属性设置-pinned-status-isFloat' = true
   * // 3. 关闭编辑器
   * // 4. 再次打开编辑器
   * // 5. 面板显示时触发 PANEL_SHOW 事件
   * // 6. 从偏好读取状态
   * // 7. 如果不符，自动调整
   * ```
   */
  setupEvents() {
    // 监听面板显示事件
    this.editor.eventBus.on(SkeletonEvents.PANEL_SHOW, (panelName, panel) => {
      // ===== 构建偏好 key =====
      // 格式：面板名-pinned-status-isFloat
      // 例如：'outline-pinned-status-isFloat'
      const panelNameKey = `${panelName}-pinned-status-isFloat`;

      // ===== 检查偏好是否存在 =====
      // engineConfig.getPreference() 获取用户偏好配置
      // contains() 检查是否有该配置项
      const isInFloatAreaPreferenceExists = engineConfig.getPreference()?.contains(panelNameKey, 'skeleton');

      if (isInFloatAreaPreferenceExists) {
        // ===== 从偏好读取状态 =====
        // true: 上次是浮动状态
        // false: 上次是固定状态
        const isInFloatAreaFromPreference = engineConfig.getPreference()?.get(panelNameKey, 'skeleton');

        // ===== 获取当前状态 =====
        // panel.isChildOfFloatArea() 判断面板是否在浮动区域
        const isCurrentInFloatArea = panel?.isChildOfFloatArea();

        // ===== 状态不符，自动调整 =====
        if (isInFloatAreaFromPreference !== isCurrentInFloatArea) {
          this.toggleFloatStatus(panel);
        }
      }
    });
  }

  // ========== 公开方法：切换浮动状态 ==========
  /**
   * 切换面板的固定/浮动状态
   *
   * @param panel - 要切换的面板
   *
   * @action 装饰器：
   * - MobX action，用于修改状态
   * - 确保状态变更的原子性
   *
   * 功能：
   * - 固定面板 -> 浮动面板
   * - 浮动面板 -> 固定面板
   *
   * 实现原理：
   * - 从当前区域移除面板配置
   * - 添加到目标区域
   * - 保存用户偏好
   *
   * 使用场景：
   * ```typescript
   * // 用户右键点击面板标题
   * // 菜单中选择"浮动显示"
   * skeleton.toggleFloatStatus(panel);
   *
   * // 效果：
   * // - 面板从 leftFixedArea 移动到 leftFloatArea
   * // - 面板变为可拖拽
   * // - 保存偏好，下次打开保持状态
   * ```
   */
  @action
  toggleFloatStatus(panel: Panel) {
    // ===== 判断当前状态 =====
    // 通过 parent.name 判断面板在哪个区域
    const isFloat = panel?.parent?.name === 'leftFloatArea';

    if (isFloat) {
      // --- 当前是浮动 -> 切换到固定 ---
      // 1. 从浮动区域移除
      this.leftFloatArea.remove(panel);
      // 2. 添加到固定区域
      this.leftFixedArea.add(panel);
      // 3. 激活该面板
      this.leftFixedArea.container.active(panel);
    } else {
      // --- 当前是固定 -> 切换到浮动 ---
      // 1. 从固定区域移除
      this.leftFixedArea.remove(panel);
      // 2. 添加到浮动区域
      this.leftFloatArea.add(panel);
      // 3. 激活该面板
      this.leftFloatArea.container.active(panel);
    }

    // ===== 保存用户偏好 =====
    // 保存到 engineConfig，下次打开时恢复
    // key: '面板名-pinned-status-isFloat'
    // value: !isFloat（切换后的状态）
    engineConfig.getPreference().set(`${panel.name}-pinned-status-isFloat`, !isFloat, 'skeleton');
  }

  // ========== 公开方法：从配置构建布局 ==========
  /**
   * 从配置构建整个编辑器布局
   *
   * @param config - 编辑器配置
   * @param components - 插件组件集合
   *
   * 功能：
   * - 初始化编辑器配置
   * - 批量添加插件和 Widget
   *
   * 使用场景：
   * ```typescript
   * // 从配置文件构建编辑器
   * const config = {
   *   plugins: {
   *     leftArea: [
   *       { pluginKey: 'outline', type: 'Panel', ... }
   *     ],
   *     toolbar: [
   *       { pluginKey: 'save', type: 'Widget', ... }
   *     ]
   *   }
   * };
   *
   * skeleton.buildFromConfig(config, {
   *   outline: OutlinePanel,
   *   save: SaveButton
   * });
   * ```
   */
  buildFromConfig(config?: EditorConfig, components: PluginClassSet = {}) {
    if (config) {
      // 初始化编辑器配置
      this.editor.init(config, components);
    }
    // 设置插件（从配置中提取并添加）
    this.setupPlugins();
  }

  // ========== 私有方法：设置插件 ==========
  /**
   * 从编辑器配置中提取插件配置并添加到 Skeleton
   *
   * 功能：
   * - 读取 editor.config.plugins
   * - 将插件配置转换为 Widget 配置
   * - 批量添加到对应区域
   *
   * 配置格式：
   * ```typescript
   * plugins: {
   *   leftArea: [
   *     {
   *       pluginKey: 'outline',
   *       type: 'TabPanel',
   *       props: { ... },
   *       pluginProps: { ... }
   *     }
   *   ]
   * }
   * ```
   *
   * 转换规则：
   * - TabPanel -> Panel
   * - XXXIcon -> XXXDock（如 SettingsIcon -> SettingsDock）
   */
  private setupPlugins() {
    // 获取编辑器配置和组件
    const { config, components = {} } = this.editor;
    if (!config) {
      return;  // 无配置，直接返回
    }

    // 获取插件配置
    const { plugins } = config;
    if (!plugins) {
      return;  // 无插件，直接返回
    }

    // 遍历所有区域
    Object.keys(plugins).forEach((area) => {
      // 遍历该区域的所有插件配置
      plugins[area].forEach((item) => {
        // ===== 提取插件配置 =====
        const { pluginKey, type, props = {}, pluginProps } = item;

        // ===== 构建 Widget 配置 =====
        const config: IPublicTypeWidgetBaseConfig = {
          area: area as IPublicTypeWidgetConfigArea,  // 区域名
          type: 'Widget',  // 默认类型
          name: pluginKey,  // Widget 名称
          contentProps: pluginProps,  // 内容组件的属性
        };

        // ===== 提取特殊属性 =====
        // 从 props 中分离出特殊配置
        const { dialogProps, balloonProps, panelProps, linkProps, ...restProps } = props;
        config.props = restProps;  // 通用属性

        // 分别设置特殊属性
        if (dialogProps) {
          config.dialogProps = dialogProps;  // 对话框属性
        }
        if (balloonProps) {
          config.balloonProps = balloonProps;  // 气泡属性
        }
        if (panelProps) {
          config.panelProps = panelProps;  // 面板属性
        }
        if (linkProps) {
          config.linkProps = linkProps;  // 链接属性
        }

        // ===== 类型转换 =====
        // 兼容旧版本的类型命名
        if (type === 'TabPanel') {
          config.type = 'Panel';  // TabPanel -> Panel
        } else if (/Icon$/.test(type)) {
          // XXXIcon -> XXXDock
          // 例如：SettingsIcon -> SettingsDock
          config.type = type.replace('Icon', 'Dock');
        }

        // ===== 设置内容组件 =====
        // 从 components 中获取实际的 React 组件
        if (pluginKey in components) {
          config.content = components[pluginKey];
        }

        // ===== 添加到 Skeleton =====
        this.add(config);
      });
    });
  }

  // ========== 公开方法：发送事件 ==========
  /**
   * 发送 Skeleton 事件
   *
   * @param event - 事件类型
   * @param args - 事件参数
   *
   * 实现：
   * - 委托给 editor.eventBus.emit
   *
   * 使用场景：
   * ```typescript
   * // Widget 显示时
   * skeleton.postEvent(SkeletonEvents.WIDGET_SHOW, widgetName);
   *
   * // Panel 隐藏时
   * skeleton.postEvent(SkeletonEvents.PANEL_HIDE, panelName, panel);
   * ```
   */
  postEvent(event: SkeletonEvents, ...args: any[]) {
    this.editor.eventBus.emit(event, ...args);
  }

  // ========== 公开方法：创建 Widget ==========
  /**
   * 创建 Widget 实例
   *
   * @param config - Widget 配置或已有实例
   * @returns Widget 实例
   *
   * 功能：
   * - 根据配置的 type 创建对应的 Widget
   * - 支持多种 Widget 类型
   *
   * 类型映射：
   * - PanelDock -> PanelDock 实例
   * - DialogDock -> DialogDock 实例
   * - Dock -> Dock 实例
   * - Divider -> Divider 组件
   * - Widget -> Widget 实例
   * - Panel -> Panel 实例
   */
  createWidget(config: IPublicTypeWidgetBaseConfig | IWidget) {
    // 如果已经是 Widget 实例，直接返回
    if (isWidget(config)) {
      return config;
    }

    // ===== 第1步：解析配置 =====
    // 应用配置转换器，处理特殊格式
    config = this.parseConfig(config);

    // ===== 第2步：根据类型创建 Widget =====
    let widget: IWidget;

    if (isDockConfig(config)) {
      // --- Dock 类型 ---
      if (isPanelDockConfig(config)) {
        // PanelDock: 面板停靠容器（最常用）
        widget = new PanelDock(this, config);
      } else if (false) {
        // DialogDock: 对话框停靠容器（预留，未实现）
        // 未来可以在这里添加 DialogDock 的创建逻辑
      } else {
        // 其他 Dock: 基础停靠容器
        widget = new Dock(this, config);
      }
    } else if (isDividerConfig(config)) {
      // --- Divider 类型 ---
      // 分割线比较特殊，包装成 Widget
      // content 设置为 Fusion 的 Divider 组件
      widget = new Widget(this, {
        ...config,
        type: 'Widget',
        content: Divider,  // 使用 @alifd/next 的 Divider
      });
    } else if (isPanelConfig(config)) {
      // --- Panel 类型 ---
      // 调用 createPanel 创建面板
      widget = this.createPanel(config);
    } else {
      // --- Widget 类型（默认）---
      // 基础 Widget
      widget = new Widget(this, config as WidgetConfig);
    }

    // ===== 第3步：添加到 widgets 数组 =====
    // 全局 Widget 列表，用于快速查找
    this.widgets.push(widget);

    // ===== 第4步：返回 Widget 实例 =====
    return widget;
  }

  // ========== 公开方法：获取 Widget ==========
  /**
   * 根据名称获取 Widget
   *
   * @param name - Widget 名称
   * @returns Widget 实例或 undefined
   *
   * 实现：
   * - 在 widgets 数组中查找
   * - 使用 Array.find() 遍历查找
   *
   * 时间复杂度：O(n)
   *
   * @example
   * ```typescript
   * const saveWidget = skeleton.getWidget('save');
   * if (saveWidget) {
   *   saveWidget.show();
   * }
   * ```
   */
  getWidget(name: string): IWidget | undefined {
    return this.widgets.find(widget => widget.name === name);
  }

  // ========== 公开方法：创建 Panel ==========
  /**
   * 创建 Panel 实例
   *
   * @param config - Panel 配置
   * @returns Panel 实例
   *
   * 流程：
   * 1. 解析配置（应用转换器）
   * 2. 创建 Panel 实例
   * 3. 添加到全局 panels Map
   * 4. 记录调试日志
   *
   * 为什么 Panel 需要全局索引？
   * - 面板可能在多个区域（leftArea、rightArea、bottomArea）
   * - 需要快速查找任意位置的面板
   * - 使用 Map 而不是数组，O(1) 查找
   *
   * @example
   * ```typescript
   * const panel = skeleton.createPanel({
   *   type: 'Panel',
   *   name: 'settings',
   *   content: SettingsPanel,
   *   props: { title: '设置' }
   * });
   * ```
   */
  createPanel(config: IPublicTypePanelConfig) {
    // 解析配置
    const parsedConfig = this.parseConfig(config);

    // 创建 Panel 实例
    const panel = new Panel(this, parsedConfig as IPublicTypePanelConfig);

    // 添加到全局索引
    this.panels.set(panel.name, panel);

    // 记录调试日志
    logger.debug(`Panel created with name: ${panel.name} \nconfig:`, config, '\n current panels: ', this.panels);

    return panel;
  }

  // ========== 公开方法：获取 Panel ==========
  /**
   * 根据名称获取 Panel
   *
   * @param name - Panel 名称
   * @returns Panel 实例或 undefined
   *
   * 实现：
   * - 从 panels Map 获取
   *
   * 时间复杂度：O(1)（使用 Map）
   *
   * @example
   * ```typescript
   * const panel = skeleton.getPanel('outline');
   * if (panel) {
   *   panel.show();
   * }
   * ```
   */
  getPanel(name: string): Panel | undefined {
    return this.panels.get(name);
  }

  // ========== 公开方法：获取 Stage ==========
  /**
   * 根据名称获取 Stage
   *
   * @param name - Stage 名称
   * @returns Stage 实例或 null
   *
   * 实现：
   * - 从 stages.container 获取
   *
   * @example
   * ```typescript
   * const stage = skeleton.getStage('stage-1');
   * if (stage) {
   *   stage.setContainer(canvasElement);
   * }
   * ```
   */
  getStage(name: string) {
    return this.stages.container.get(name);
  }

  // ========== 公开方法：创建 Stage ==========
  /**
   * 创建 Stage（舞台/画布）
   *
   * @param config - Stage 配置
   * @returns Stage 名称或 undefined
   *
   * 功能：
   * - 生成唯一的 stage 名称
   * - 添加到 stages 区域
   * - 返回名称供后续引用
   *
   * 为什么返回名称而不是实例？
   * - 名称是稳定的标识符
   * - 实例可能在内部更新
   * - 通过名称可以随时获取最新实例
   *
   * @example
   * ```typescript
   * // 创建画布
   * const stageName = skeleton.createStage({
   *   type: 'Stage',
   *   content: CanvasComponent
   * });
   *
   * // 后续使用
   * const stage = skeleton.getStage(stageName);
   * ```
   */
  createStage(config: any) {
    // 调用 add 方法添加 Stage
    const stage = this.add({
      name: uniqueId('stage'),  // 生成唯一 ID：'stage_1', 'stage_2'...
      area: 'stages',  // 添加到 stages 区域
      ...config,
    });
    // 返回 Stage 名称
    return stage?.getName?.();
  }

  // ========== 公开方法：创建容器 ==========
  /**
   * 创建 Widget 容器
   *
   * @param name - 容器名称
   * @param handle - Widget 处理函数
   * @param exclusive - 是否独占模式
   * @param checkVisible - 可见性检查函数
   * @param defaultSetCurrent - 是否默认激活第一个
   * @returns WidgetContainer 实例
   *
   * 功能：
   * - 创建一个新的 WidgetContainer
   * - 添加到全局容器索引
   *
   * 使用场景：
   * - Area 构造函数中调用
   * - 自定义区域时可能需要
   *
   * @example
   * ```typescript
   * // 在 Area 中使用
   * this.container = skeleton.createContainer(
   *   'myArea',
   *   (config) => this.createWidget(config),
   *   true
   * );
   * ```
   */
  createContainer(
    name: string,
    handle: (item: any) => any,
    exclusive = false,
    checkVisible: () => boolean = () => true,
    defaultSetCurrent = false,
  ) {
    // 创建容器实例
    const container = new WidgetContainer(name, handle, exclusive, checkVisible, defaultSetCurrent);

    // 添加到全局索引
    this.containers.set(name, container);

    return container;
  }

  // ========== 私有方法：解析配置 ==========
  /**
   * 解析和转换 Widget 配置
   *
   * @param config - 原始配置
   * @returns 解析后的配置
   *
   * 功能：
   * 1. 应用所有配置转换器（configTransducers）
   * 2. 处理特殊格式的 content
   * 3. 合并 content 中的属性到配置对象
   * 4. 标记为已解析（避免重复解析）
   *
   * 特殊格式处理：
   * ```typescript
   * // 输入：
   * {
   *   content: {
   *     dialogProps: { title: '设置' },
   *     panelProps: { width: 300 }
   *   }
   * }
   *
   * // 输出：
   * {
   *   dialogProps: { title: '设置' },
   *   panelProps: { width: 300 }
   * }
   * ```
   *
   * 为什么要这样处理？
   * - 支持更灵活的配置格式
   * - 向后兼容旧版本配置
   * - 简化配置书写
   */
  private parseConfig(config: IPublicTypeWidgetBaseConfig) {
    // ===== 检查是否已解析 =====
    // 避免重复解析（性能优化）
    if (config.parsed) {
      return config;
    }

    // ===== 提取 content =====
    const { content, ...restConfig } = config;

    // ===== 处理 content =====
    if (content) {
      // 判断 content 是否为普通对象（且不是 React 元素）
      if (isPlainObject(content) && !isValidElement(content)) {
        // --- content 是配置对象 ---
        // 将 content 的属性合并到 restConfig
        Object.keys(content).forEach((key) => {
          if (/props$/i.test(key) && restConfig[key]) {
            // --- 属性名以 'props' 结尾 ---
            // 例如：dialogProps、panelProps
            // 合并而不是覆盖
            restConfig[key] = {
              ...restConfig[key],  // 保留原有属性
              ...content[key],  // 合并 content 中的属性
            };
          } else {
            // --- 其他属性 ---
            // 直接赋值
            restConfig[key] = content[key];
          }
        });
      } else {
        // --- content 是组件或元素 ---
        // 直接设置为 content
        restConfig.content = content;
      }
    }

    // ===== 设置 pluginKey =====
    // pluginKey 用于标识插件来源
    restConfig.pluginKey = restConfig.name;

    // ===== 标记为已解析 =====
    // 避免重复解析
    restConfig.parsed = true;

    return restConfig;
  }

  // ========== 公开方法：注册配置转换器 ==========
  /**
   * 注册配置转换器
   *
   * @param transducer - 转换器函数
   * @param level - 优先级（数字越小越先执行）
   * @param id - 转换器 ID（可选）
   *
   * 功能：
   * - 注册一个配置转换器
   * - 转换器会在 add() 时自动应用
   * - 按优先级排序执行
   *
   * 转换器的作用：
   * ```typescript
   * // 示例：自动添加默认样式
   * skeleton.registerConfigTransducer((config) => {
   *   return {
   *     ...config,
   *     props: {
   *       ...config.props,
   *       className: 'my-widget'
   *     }
   *   };
   * }, 50);
   * ```
   *
   * 优先级说明：
   * - 数字越小，越先执行
   * - 建议范围：1-100
   * - register-defaults.ts 使用 1、5、10
   */
  registerConfigTransducer(
    transducer: IPublicTypeConfigTransducer,
    level = 100,
    id?: string,
  ) {
    // ===== 第1步：设置转换器元信息 =====
    // 将 level 和 id 附加到转换器函数对象上
    transducer.level = level;
    transducer.id = id;

    // ===== 第2步：按优先级插入 =====
    // 查找第一个优先级大于当前 level 的位置
    // findIndex 返回索引，未找到返回 -1
    const i = this.configTransducers.findIndex((item) => item.level != null && item.level > level);

    if (i < 0) {
      // 没找到更大的 level，追加到末尾
      this.configTransducers.push(transducer);
    } else {
      // 找到了，插入到该位置之前
      // splice(i, 0, transducer) 在索引 i 处插入，不删除元素
      this.configTransducers.splice(i, 0, transducer);
    }

    // 结果：configTransducers 始终按 level 从小到大排序
    // 例如：[level=1, level=5, level=10, level=100]
  }

  // ========== 公开方法：获取已注册的转换器 ==========
  /**
   * 获取所有已注册的配置转换器
   *
   * @returns 转换器数组（按优先级排序）
   *
   * 用途：
   * - 在 add() 方法中获取并应用转换器
   * - 调试：查看有哪些转换器
   */
  getRegisteredConfigTransducers(): IPublicTypeConfigTransducer[] {
    return this.configTransducers;
  }

  // ========== 核心方法：添加 Widget ==========
  /**
   * 添加 Widget 到 Skeleton（最核心的方法！）
   *
   * @param config - Widget 配置
   * @param extraConfig - 额外配置（可选）
   * @returns Widget 实例或 undefined
   *
   * 这是 Skeleton 使用频率最高的方法！
   *
   * 完整流程：
   * 1. 应用所有配置转换器
   * 2. 解析配置格式
   * 3. 确定目标区域（area）
   * 4. 委托给对应区域的 add 方法
   * 5. 区域内部调用 handle 函数创建 Widget
   * 6. 返回创建的 Widget 实例
   *
   * 默认区域规则：
   * - Panel 类型：默认添加到 leftFloatArea
   * - Widget 类型：默认添加到 mainArea
   * - 其他类型：默认添加到 leftArea
   *
   * 支持的区域别名：
   * - left/leftArea
   * - right/rightArea
   * - top/topArea
   * - main/mainArea/center/centerArea
   * - bottom/bottomArea
   *
   * @example
   * ```typescript
   * // 示例1：添加左侧面板
   * skeleton.add({
   *   area: 'leftArea',
   *   type: 'PanelDock',
   *   name: 'outline',
   *   content: OutlinePanel,
   *   props: { title: '大纲树' }
   * });
   *
   * // 示例2：添加工具栏按钮
   * skeleton.add({
   *   area: 'toolbar',
   *   type: 'Widget',
   *   name: 'save',
   *   content: <SaveButton />
   * });
   *
   * // 示例3：使用默认区域（省略 area）
   * skeleton.add({
   *   type: 'Panel',  // 自动添加到 leftFloatArea
   *   name: 'custom',
   *   content: MyPanel
   * });
   * ```
   */
  add(config: IPublicTypeSkeletonConfig, extraConfig?: Record<string, any>): IWidget | Widget | Panel | Stage | Dock | PanelDock | undefined {
    // ===== 第1步：获取所有转换器 =====
    const registeredTransducers = this.getRegisteredConfigTransducers();

    // ===== 第2步：应用所有转换器 =====
    // 使用 reduce 链式应用转换器
    // 每个转换器的输出是下一个转换器的输入
    const parsedConfig = registeredTransducers.reduce((prevConfig, current) => {
      return current(prevConfig);  // 应用转换器
    }, {
      ...this.parseConfig(config),  // 初始配置（已解析）
      ...extraConfig,  // 额外配置（优先级最高）
    });

    // ===== 第3步：确定目标区域 =====
    let { area } = parsedConfig;

    // 如果未指定 area，根据 type 使用默认区域
    if (!area) {
      if (parsedConfig.type === 'Panel') {
        area = 'leftFloatArea';  // Panel -> 左侧浮动区域
      } else if (parsedConfig.type === 'Widget') {
        area = 'mainArea';  // Widget -> 主区域
      } else {
        area = 'leftArea';  // 其他 -> 左侧区域
      }
    }

    // ===== 第4步：根据区域添加 Widget =====
    // 使用 switch 路由到对应的区域
    // 支持多个别名（left/leftArea、right/rightArea 等）
    switch (area) {
      case 'leftArea':
      case 'left':
        // 左侧区域：支持 PanelDock、DialogDock、Dock
        return this.leftArea.add(parsedConfig as PanelDockConfig);

      case 'rightArea':
      case 'right':
        // 右侧区域：只支持 Panel
        return this.rightArea.add(parsedConfig as IPublicTypePanelConfig);

      case 'topArea':
      case 'top':
        // 顶部区域：支持多种类型
        return this.topArea.add(parsedConfig as PanelDockConfig);

      case 'subTopArea':
        // 子顶部区域
        return this.subTopArea.add(parsedConfig as PanelDockConfig);

      case 'toolbar':
        // 工具栏：通常是按钮和分割线
        return this.toolbar.add(parsedConfig as PanelDockConfig);

      case 'mainArea':
      case 'main':
      case 'center':
      case 'centerArea':
        // 主区域：画布渲染区域
        return this.mainArea.add(parsedConfig as IPublicTypePanelConfig);

      case 'bottomArea':
      case 'bottom':
        // 底部区域：工具面板
        return this.bottomArea.add(parsedConfig as IPublicTypePanelConfig);

      case 'leftFixedArea':
        // 左侧固定面板区域
        return this.leftFixedArea.add(parsedConfig as IPublicTypePanelConfig);

      case 'leftFloatArea':
        // 左侧浮动面板区域
        return this.leftFloatArea.add(parsedConfig as IPublicTypePanelConfig);

      case 'stages':
        // 舞台区域：管理多个画布
        return this.stages.add(parsedConfig as StageConfig);

      default:
        // 未知区域，不处理
        // 可能是配置错误或未来扩展的区域
    }
  }
}
