/**
 * @file Editor Skeleton 包入口文件
 * @description 导出骨架系统的所有公开 API
 *
 * 包概述：
 * - 名称：@alilc/lowcode-editor-skeleton
 * - 职责：管理低代码编辑器的面板布局和 Widget 系统
 * - 核心：Skeleton 类 + Area 区域管理 + Widget 组件系统
 *
 * 架构设计：
 * ```
 * Skeleton (骨架)
 * ├── Area (区域)
 * │   ├── leftArea (左侧区域)
 * │   ├── rightArea (右侧区域)
 * │   ├── topArea (顶部区域)
 * │   ├── toolbar (工具栏)
 * │   ├── mainArea (主区域)
 * │   ├── bottomArea (底部区域)
 * │   └── subTopArea (子顶部区域)
 * └── Widget (组件)
 *     ├── Panel (面板)
 *     ├── PanelDock (面板停靠)
 *     └── Stage (舞台)
 * ```
 *
 * 核心功能：
 * 1. 区域管理：定义编辑器的布局区域
 * 2. Widget 管理：动态添加/移除/显示/隐藏面板
 * 3. 布局渲染：提供 Workbench 组件渲染完整布局
 * 4. 响应式更新：支持动态调整布局
 *
 * 使用示例：
 * ```typescript
 * import { Skeleton, Workbench } from '@alilc/lowcode-editor-skeleton';
 *
 * // 1. 创建骨架实例
 * const skeleton = new Skeleton();
 *
 * // 2. 添加面板
 * skeleton.add({
 *   area: 'leftArea',
 *   name: 'outline',
 *   content: OutlinePanel,
 *   props: { title: '大纲树' }
 * });
 *
 * // 3. 渲染工作台
 * <Workbench skeleton={skeleton} />
 * ```
 */

// ==================== 核心导出 ====================

/**
 * 导出区域管理相关
 * - Area 类：区域基类
 * - 各种区域接口和类型
 */
export * from './area';

/**
 * 导出 Workbench 主工作台组件
 * - 编辑器的根布局组件
 * - 整合所有区域和面板
 */
export { Workbench } from './layouts/workbench';

/**
 * 导出 Skeleton 骨架核心
 * - Skeleton 类：骨架管理器
 * - ISkeleton 接口：骨架接口定义
 */
export * from './skeleton';

/**
 * 导出类型定义
 * - WidgetConfigArea：区域配置类型
 * - IWidget：Widget 接口
 * - 各种配置和回调类型
 */
export * from './types';

/**
 * 导出设置面板组件
 * - SettingsPane：设置面板容器
 * - SettingsPrimaryPane：主设置面板
 */
export * from './components/settings';

/**
 * 导出字段组件
 * - Field：字段渲染组件
 * - 用于属性配置面板
 */
export * from './components/field';

/**
 * 导出弹窗组件
 * - Popup：弹窗容器
 */
export * from './components/popup';

/**
 * 导出 Context 上下文
 * - SkeletonContext：Skeleton 的 React Context
 */
export * from './context';

/**
 * 导出默认配置注册函数
 * - registerDefaults：注册默认布局配置
 */
export * from './register-defaults';

/**
 * 导出 Widget 系统
 * - Widget 类：Widget 基类
 * - PanelDock：面板停靠容器
 * - Panel：面板组件
 * - 各种 Widget 相关类型和工具
 */
export * from './widget';

/**
 * 导出布局组件
 * - LeftArea：左侧区域组件
 * - RightArea：右侧区域组件
 * - TopArea：顶部区域组件
 * - Toolbar：工具栏组件
 * - MainArea：主区域组件
 * - BottomArea：底部区域组件
 */
export * from './layouts';
