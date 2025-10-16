/**
 * @file Designer 包入口文件
 * @description 导出低代码设计器的所有核心模块
 *
 * 包概述：
 * - 名称：@alilc/lowcode-designer
 * - 职责：低代码编辑器的核心设计器实现
 * - 核心：Designer、Document、Project、Node、Simulator
 *
 * 模块架构：
 * ```
 * Designer (设计器)
 * ├── Project (项目)
 * │   └── Document[] (文档)
 * │       └── Node[] (节点)
 * ├── ComponentMeta (组件元数据)
 * ├── Simulator (模拟器)
 * ├── Dragon (拖拽系统)
 * ├── Selection (选中管理)
 * └── History (历史记录)
 * ```
 *
 * 核心功能：
 * 1. 节点模型：管理页面的节点树
 * 2. 文档模型：管理单个页面
 * 3. 项目模型：管理多个页面
 * 4. 拖拽系统：实现组件拖拽
 * 5. 模拟器：iframe 渲染画布
 * 6. 插件系统：扩展设计器功能
 * 7. 选中管理：管理节点选中状态
 * 8. 历史记录：撤销/重做功能
 */

/**
 * 导出组件元数据相关
 * - ComponentMeta: 组件元信息类
 */
export * from './component-meta';

/**
 * 导出模拟器相关
 * - Simulator 接口和类型
 */
export * from './simulator';

/**
 * 导出设计器核心
 * - Designer: 设计器主类
 * - Dragon: 拖拽系统
 * - ActiveTracker: 激活追踪
 * - Detecting: 检测系统
 * - Location: 位置管理
 */
export * from './designer';

/**
 * 导出文档和节点相关
 * - DocumentModel: 文档模型
 * - Node: 节点类
 * - Selection: 选中管理
 * - History: 历史记录
 */
export * from './document';

/**
 * 导出项目相关
 * - Project: 项目类
 */
export * from './project';

/**
 * 导出内置模拟器
 * - BuiltinSimulatorHost: 内置模拟器宿主
 */
export * from './builtin-simulator';

/**
 * 导出插件系统
 * - Plugin: 插件类
 * - PluginManager: 插件管理器
 */
export * from './plugin';

/**
 * 导出类型定义
 */
export * from './types';

/**
 * 导出右键菜单动作
 */
export * from './context-menu-actions';
