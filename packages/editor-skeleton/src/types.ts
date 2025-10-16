/**
 * @file Skeleton 类型定义
 * @description 定义骨架系统中各种 Widget 的配置类型和类型守卫函数
 *
 * 核心概念：
 * - Widget: 最基础的组件类型，可以是任何内容
 * - Dock: 停靠容器，可以包含多个 Widget
 * - PanelDock: 面板停靠容器，支持多个面板切换
 * - DialogDock: 对话框停靠容器，点击按钮弹出对话框
 * - Divider: 分割线，用于区分不同区域
 *
 * 使用场景：
 * - 定义面板配置时使用对应的类型
 * - 运行时通过类型守卫函数判断配置类型
 * - 实现不同类型的 Widget 渲染逻辑
 *
 * 设计模式：
 * - 策略模式：根据 type 字段决定渲染方式
 * - 类型守卫：提供 TypeScript 类型收窄
 */

import { ReactElement, ComponentType } from 'react';
import {
  IPublicTypeTitleContent,  // 标题内容类型（字符串、ReactNode 等）
  IPublicTypeWidgetConfigArea,  // Widget 所在区域类型
  IPublicTypeWidgetBaseConfig,  // Widget 基础配置
  IPublicTypePanelDockProps,  // 面板停靠属性
  IPublicTypePanelConfigProps,  // 面板配置属性
  IPublicTypePanelConfig,  // 面板配置
} from '@alilc/lowcode-types';
import { IWidget } from './widget/widget';

// ==================== Widget 配置 ====================
/**
 * Widget 配置接口
 *
 * Widget 是最基础的组件类型，可以渲染任何内容
 *
 * 继承：IPublicTypeWidgetBaseConfig（包含 name、area 等基础字段）
 *
 * 扩展字段：
 * - type: 'Widget' - 类型标识
 * - props: Widget 的属性配置
 * - content: Widget 的内容（可以是组件、元素、字符串）
 *
 * 使用场景：
 * - 添加简单的工具按钮
 * - 添加文本或图标
 * - 添加自定义内容
 *
 * @example
 * ```typescript
 * const widgetConfig: WidgetConfig = {
 *   type: 'Widget',
 *   name: 'logo',
 *   area: 'topArea',
 *   props: {
 *     align: 'left',
 *     onInit: (widget) => console.log('Widget 初始化')
 *   },
 *   content: <img src="logo.png" />
 * };
 *
 * skeleton.add(widgetConfig);
 * ```
 */
export interface WidgetConfig extends IPublicTypeWidgetBaseConfig {
  type: 'Widget';  // 类型标识，用于运行时判断
  props?: {
    align?: 'left' | 'right' | 'bottom' | 'center' | 'top';  // 对齐方式
    onInit?: (widget: IWidget) => void;  // 初始化回调
    title?: IPublicTypeTitleContent | null;  // 标题
  };
  content?: string | ReactElement | ComponentType<any>;  // Widget 内容（children）
}

/**
 * Widget 配置类型守卫函数
 *
 * @param obj - 要判断的对象
 * @returns 如果是 WidgetConfig 返回 true
 *
 * 类型守卫的作用：
 * - 运行时类型判断
 * - TypeScript 类型收窄
 *
 * 实现原理：
 * - 检查 obj 存在
 * - 检查 obj.type === 'Widget'
 *
 * @example
 * ```typescript
 * function handleConfig(config: any) {
 *   if (isWidgetConfig(config)) {
 *     // TypeScript 知道 config 是 WidgetConfig 类型
 *     console.log(config.content);  // ✅ 类型安全
 *   }
 * }
 * ```
 */
export function isWidgetConfig(obj: any): obj is WidgetConfig {
  return obj && obj.type === 'Widget';
}

// ==================== Dock Props ====================
/**
 * Dock 属性接口
 *
 * 继承：IPublicTypePanelDockProps
 *
 * 说明：
 * - 当前为空接口，仅做类型别名
 * - 继承父接口的所有属性
 * - 预留扩展点
 */
export interface DockProps extends IPublicTypePanelDockProps {
}

// ==================== Divider 配置 ====================
/**
 * 分割线配置接口
 *
 * Divider 用于在区域中添加视觉分割
 *
 * 使用场景：
 * - 工具栏中分隔不同功能组
 * - 左侧面板中分隔不同区块
 *
 * @example
 * ```typescript
 * const dividerConfig: DividerConfig = {
 *   type: 'Divider',
 *   name: 'divider-1',
 *   area: 'toolbar',
 *   props: {
 *     align: 'center'
 *   }
 * };
 * ```
 */
export interface DividerConfig extends IPublicTypeWidgetBaseConfig {
  type: 'Divider';  // 类型标识
  props?: {
    align?: 'left' | 'right' | 'center';  // 对齐方式
  };
}

/**
 * Divider 配置类型守卫函数
 *
 * @param obj - 要判断的对象
 * @returns 如果是 DividerConfig 返回 true
 */
export function isDividerConfig(obj: any): obj is DividerConfig {
  return obj && obj.type === 'Divider';
}

// ==================== Dock 基础配置 ====================
/**
 * Dock 基础配置接口
 *
 * Dock 是可以停靠多个内容的容器
 *
 * 继承关系：
 * - DockConfig: 基础 Dock
 * - DialogDockConfig: 对话框 Dock
 * - PanelDockConfig: 面板 Dock
 */
export interface IDockBaseConfig extends IPublicTypeWidgetBaseConfig {
  props?: DockProps & {
    align?: 'left' | 'right' | 'bottom' | 'center' | 'top';  // 对齐方式
    onInit?: (widget: IWidget) => void;  // 初始化回调
  };
}

// ==================== Dock 配置 ====================
/**
 * Dock 配置接口
 *
 * 基础的停靠容器，可以包含任意内容
 *
 * @example
 * ```typescript
 * const dockConfig: DockConfig = {
 *   type: 'Dock',
 *   name: 'custom-dock',
 *   area: 'leftArea',
 *   content: <MyComponent />
 * };
 * ```
 */
export interface DockConfig extends IDockBaseConfig {
  type: 'Dock';  // 类型标识
  content?: string | ReactElement | ComponentType<any>;  // Dock 的内容
}

/**
 * Dock 配置类型守卫函数
 *
 * @param obj - 要判断的对象
 * @returns 如果是 Dock 相关配置返回 true
 *
 * 实现原理：
 * - 使用正则表达式 /Dock$/ 匹配以 'Dock' 结尾的类型
 * - 支持 'Dock'、'PanelDock'、'DialogDock' 等所有 Dock 类型
 *
 * 为什么用正则？
 * - 避免为每种 Dock 写单独的判断
 * - 支持未来扩展新的 Dock 类型
 */
export function isDockConfig(obj: any): obj is DockConfig {
  return obj && /Dock$/.test(obj.type);
}

// ==================== DialogDock 配置 ====================
/**
 * 对话框 Dock 配置接口
 *
 * DialogDock 是一个特殊的 Dock：
 * - 显示为一个按钮
 * - 点击按钮弹出对话框
 * - 对话框中显示内容
 *
 * 使用场景：
 * - 设置面板（点击按钮弹出设置）
 * - 帮助文档（点击按钮显示帮助）
 * - 不常用的功能（节省空间）
 *
 * @example
 * ```typescript
 * const dialogDockConfig: DialogDockConfig = {
 *   type: 'DialogDock',
 *   name: 'settings',
 *   area: 'topArea',
 *   dialogProps: {
 *     title: '设置',
 *     width: 600,
 *     height: 400
 *   },
 *   content: <SettingsPanel />
 * };
 * ```
 */
export interface DialogDockConfig extends IDockBaseConfig {
  type: 'DialogDock';  // 类型标识：对话框 Dock
  dialogProps?: {
    [key: string]: any;  // 对话框的任意属性
    title?: IPublicTypeTitleContent;  // 对话框标题
  };
}

/**
 * DialogDock 配置类型守卫函数
 *
 * @param obj - 要判断的对象
 * @returns 如果是 DialogDockConfig 返回 true
 */
export function isDialogDockConfig(obj: any): obj is DialogDockConfig {
  return obj && obj.type === 'DialogDock';
}

/**
 * Panel 配置类型守卫函数
 *
 * @param obj - 要判断的对象
 * @returns 如果是 PanelConfig 返回 true
 */
export function isPanelConfig(obj: any): obj is IPublicTypePanelConfig {
  return obj && obj.type === 'Panel';
}

// ==================== PanelDock 配置 ====================
/**
 * 面板 Dock 配置接口
 *
 * PanelDock 是最常用的 Dock 类型：
 * - 可以包含多个面板（Panel）
 * - 通过标签页（Tab）切换面板
 * - 支持面板的显示/隐藏
 * - 支持面板拖拽排序
 *
 * 使用场景：
 * - 左侧区域：大纲树、组件库、数据源等多个面板
 * - 右侧区域：属性设置、样式设置等多个面板
 * - 底部区域：日志、网络请求等多个面板
 *
 * 与 Panel 的关系：
 * - PanelDock 是容器，Panel 是内容
 * - 一个 PanelDock 可以包含多个 Panel
 * - Panel 显示为标签页（Tab）
 *
 * content 的两种用法：
 * 1. 直接提供内容：content: <MyPanel />
 * 2. 提供 Panel 配置数组：content: [{ type: 'Panel', name: 'panel1', ... }]
 *
 * @example
 * ```typescript
 * // 用法1：直接内容
 * const panelDockConfig: PanelDockConfig = {
 *   type: 'PanelDock',
 *   name: 'leftDock',
 *   area: 'leftArea',
 *   panelName: 'outline',
 *   panelProps: {
 *     title: '大纲树'
 *   },
 *   content: <OutlineTree />
 * };
 *
 * // 用法2：多个 Panel
 * const panelDockConfig: PanelDockConfig = {
 *   type: 'PanelDock',
 *   name: 'leftDock',
 *   area: 'leftArea',
 *   content: [
 *     {
 *       type: 'Panel',
 *       name: 'outline',
 *       content: <OutlineTree />,
 *       props: { title: '大纲树' }
 *     },
 *     {
 *       type: 'Panel',
 *       name: 'components',
 *       content: <ComponentList />,
 *       props: { title: '组件库' }
 *     }
 *   ]
 * };
 * ```
 */
export interface PanelDockConfig extends IDockBaseConfig {
  type: 'PanelDock';  // 类型标识：面板 Dock
  panelName?: string;  // 面板名称（当 content 不是数组时使用）
  panelProps?: IPublicTypePanelConfigProps & {
    area?: IPublicTypeWidgetConfigArea;  // 面板所在区域
  };
  content?: string | ReactElement | ComponentType<any> | IPublicTypePanelConfig[];  // 面板内容或 Panel 配置数组
}

/**
 * PanelDock 配置类型守卫函数
 *
 * @param obj - 要判断的对象
 * @returns 如果是 PanelDockConfig 返回 true
 *
 * 使用场景：
 * - 在渲染 Widget 时判断类型
 * - 根据类型选择对应的渲染逻辑
 *
 * @example
 * ```typescript
 * function renderWidget(config: any) {
 *   if (isPanelDockConfig(config)) {
 *     // TypeScript 知道 config 是 PanelDockConfig
 *     return <PanelDock {...config} />;
 *   }
 * }
 * ```
 */
export function isPanelDockConfig(obj: any): obj is PanelDockConfig {
  return obj && obj.type === 'PanelDock';
}
