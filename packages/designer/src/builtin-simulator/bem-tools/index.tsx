/**
 * ========================================
 * 🎨 BEM 工具集合 - 设计辅助可视化工具
 * ========================================
 *
 * BemTools 是低代码引擎中的可视化设计辅助工具集合，提供：
 * - 🔍 组件悬停检测边框 (BorderDetecting)
 * - ✅ 组件选中状态边框 (BorderSelecting)
 * - 📦 响应式容器边框 (BorderContainer)
 * - 📍 拖拽插入位置指示器 (InsertionView)
 * - 📏 组件尺寸调整边框 (BorderResizing)
 * - 🔧 扩展的自定义 BEM 工具
 */

import React, { Component } from 'react'; // React 核心库
import { observer, engineConfig } from '@alilc/lowcode-editor-core'; // MobX 观察者和引擎配置
import { BorderDetecting } from './border-detecting'; // 鼠标悬停检测边框组件
import { BorderContainer } from './border-container'; // 响应式容器边框组件
import { BuiltinSimulatorHost } from '../host'; // 模拟器宿主控制器类型
import { BorderSelecting } from './border-selecting'; // 选中状态边框组件
import BorderResizing from './border-resizing'; // 尺寸调整边框组件
import { InsertionView } from './insertion'; // 插入位置指示器组件
import './bem-tools.less'; // BEM 工具基础样式
import './borders.less'; // 边框相关样式

/**
 * 🎨 BEM 工具主组件
 *
 * 使用 MobX @observer 装饰器，自动响应模拟器状态变化
 * 负责渲染所有的设计辅助工具，并处理坐标转换和条件显示
 */
@observer
export class BemTools extends Component<{ host: BuiltinSimulatorHost }> {
  render() {
    // 解构获取模拟器宿主实例
    const { host } = this.props;

    // 获取当前设计模式（design/live/preview）
    const { designMode } = host;

    // 获取视口的滚动位置和缩放比例，用于坐标转换
    const { scrollX, scrollY, scale } = host.viewport;

    // 🚫 在实时预览模式下不显示任何设计辅助工具
    // live 模式是纯预览模式，不需要设计交互功能
    if (designMode === 'live') {
      return null;
    }

    // 🎯 渲染 BEM 工具容器
    return (
      <div
        className="lc-bem-tools"
        // 🔄 关键坐标转换：将 iframe 内的坐标转换为画布坐标
        // 通过反向偏移滚动量来保持工具与组件位置同步
        // 使用负值是因为当内容向右滚动时，工具层需要向左偏移来保持对齐
        style={{ transform: `translate(${-scrollX * scale}px,${-scrollY * scale}px)` }}
      >
        {/* 🔍 鼠标悬停检测边框 - 可通过配置禁用 */}
        { !engineConfig.get('disableDetecting') &&
          <BorderDetecting key="hovering" host={host} />
        }

        {/* ✅ 组件选中状态边框 - 始终显示，用于显示当前选中的组件 */}
        <BorderSelecting key="selecting" host={host} />

        {/* 📦 响应式容器边框 - 可通过配置启用，用于显示响应式断点 */}
        { engineConfig.get('enableReactiveContainer') &&
          <BorderContainer key="reactive-container-border" host={host} />
        }

        {/* 📍 插入位置指示器 - 拖拽时显示可插入位置的视觉提示 */}
        <InsertionView key="insertion" host={host} />

        {/* 📏 尺寸调整边框 - 显示可调整尺寸组件的调整手柄 */}
        <BorderResizing key="resizing" host={host} />

        {/* 🔧 扩展的自定义 BEM 工具 - 支持插件注册的额外设计工具 */}
        {
          // 通过设计器的 BEM 工具管理器获取所有已注册的扩展工具
          // 使用类型断言避免 TypeScript 编译错误
          (host.designer as any).bemToolsManager?.getAllBemTools?.()?.map((tools: any) => {
            // 获取工具组件类
            const ToolsCls = tools.item;
            // 渲染工具组件，传入 host 实例用于访问模拟器功能
            return <ToolsCls key={tools.name} host={host} />;
          }) || []
        }
      </div>
    );
  }
}