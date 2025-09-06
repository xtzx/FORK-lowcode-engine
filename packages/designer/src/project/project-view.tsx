/* eslint-disable react/jsx-indent-props */
/* eslint-disable react/jsx-indent */
/**
 * @Author  : zhouming
 * @Date    : 2024-09-03 19:44:44
 *
 * ProjectView 组件 - 项目视图容器
 *
 * 核心职责：
 * 1. 界面渲染：ProjectView 组件负责渲染整个项目的视图，包括所有的设计元素和组件。它提供了一个视觉上的画布，用户可以在这个画布上进行拖拽、选择和编辑操作。
 * 2. 交互管理：该组件处理用户与设计元素的所有交互，如选择、移动和配置组件的属性。这些交互是通过内部逻辑和与其他组件（如 Designer 和 Dragon）的协作来实现的。
 * 3. 状态同步：ProjectView 组件与设计器的状态紧密同步，确保界面上显示的内容总是反映最新的设计状态。这包括响应设计数据的变更，更新视图以匹配设计的最新状态。
 * 4. 事件处理：它监听并处理来自设计工具其他部分的事件，如拖拽事件、属性更改事件等。这确保了用户操作的响应性和准确性。
 *
 * Simulator 组件选择策略：
 * - 优先使用自定义 simulatorComponent（如果提供）
 * - 默认使用 BuiltinSimulatorHostView（内置模拟器）
 * - 支持动态切换不同的模拟器组件
 */
import React,{ Component } from 'react';
import { observer, engineConfig } from '@alilc/lowcode-editor-core';
import { Designer } from '../designer';
import { BuiltinSimulatorHostView } from '../builtin-simulator';
import './project.less';

/**
 * BuiltinLoading - 内置加载组件
 * 在模拟器渲染器未就绪时显示的加载动画
 * 可通过 engineConfig 配置自定义加载组件
 */
export class BuiltinLoading extends Component {
    render() {
        return (
            <div id="engine-loading-wrapper">
                <img
                    width="154"
                    height="100"
                    src="https://img.alicdn.com/tfs/TB1CmVgayERMeJjy0FcXXc7opXa-308-200.gif"
                />
            </div>
        );
    }
}

/**
 * ProjectView - 项目视图主组件
 * 使用 @observer 装饰器使组件响应 MobX observable 数据变化
 */
@observer
export class ProjectView extends Component<{ designer: Designer }> {
    /**
     * 组件挂载后的生命周期
     * 监听渲染器就绪事件，确保 iframe 内容加载完成后刷新视图
     */
    componentDidMount() {
        const { designer } = this.props;
        const { project } = designer;

        // 监听渲染器就绪事件
        // 当 iframe 内的 SimulatorRendererContainer 初始化完成后触发
        // 触发强制更新以隐藏 Loading 组件
        project.onRendererReady(() => {
            this.forceUpdate();
        });
    }

    render() {
        const { designer } = this.props;
        // 从 designer 解构项目实例和模拟器属性
        const { project, projectSimulatorProps: simulatorProps } = designer;

        /**
         * 🔥 核心逻辑：Simulator 组件选择
         *
         * 场景1：自定义模拟器（designer.simulatorComponent）
         * - 来源：通过 Designer 构造时的 props.simulatorComponent 传入
         * - 使用场景：
         *   a. 需要完全自定义预览效果（如移动端模拟器、特殊设备模拟）
         *   b. 集成第三方渲染框架（如 Vue、Angular）
         *   c. 实现特殊的交互逻辑（如 3D 场景、游戏引擎）
         * - 职责：完全替代内置模拟器，自行管理 iframe、渲染、通信等
         *
         * 场景2：内置模拟器（BuiltinSimulatorHostView）
         * - 来源：@alilc/lowcode-designer 包内置组件
         * - 使用场景：标准的低代码编辑场景（99% 的情况）
         * - 职责：
         *   a. 创建和管理 iframe 容器
         *   b. 建立与 SimulatorRendererContainer 的通信
         *   c. 提供设备模拟、缩放、BEM 工具等功能
         *   d. 处理拖拽、选择等设计态交互
         */
        const Simulator = designer.simulatorComponent || BuiltinSimulatorHostView;

        // 获取加载组件，支持自定义配置
        // 通过 engineConfig.set('loadingComponent', CustomLoading) 设置
        const Loading = engineConfig.get('loadingComponent', BuiltinLoading);

        return (
            {/* 项目容器 */}
            <div className="lc-project">
                {/* 模拟器外壳，提供布局和样式 */}
                <div className="lc-simulator-shell">
                    {/*
                     * 条件渲染 Loading 组件
                     * 当 renderer 未就绪时显示加载动画
                     * renderer 是 iframe 内的 SimulatorRendererContainer 实例
                     */}
                    {!project?.simulator?.renderer && <Loading />}

                    {/*
                     * 渲染 Simulator 组件
                     * simulatorProps 包含：
                     * - library: 组件库代码
                     * - utilsMetadata: 工具函数
                     * - extraEnvironment: 额外环境变量
                     * - renderEnv: 渲染环境（React/Rax）
                     * - device: 设备类型
                     * - locale: 语言设置
                     * - designMode: 设计模式（design/preview）
                     * - deviceClassName: 设备样式类
                     * - simulatorUrl: iframe 的 src URL
                     * - requestHandlersMap: 请求处理映射
                     */}
                    <Simulator {...simulatorProps} />
                </div>
            </div>
        );
    }
}
