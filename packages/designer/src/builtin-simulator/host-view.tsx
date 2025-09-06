/* eslint-disable react/jsx-indent-props */
/* eslint-disable react/jsx-indent */
import React, { Component } from 'react';
import { observer } from '@alilc/lowcode-editor-core';
import { BuiltinSimulatorHost, BuiltinSimulatorProps } from './host';
import { BemTools } from './bem-tools';
import { Project } from '../project';
import './host.less';

/**
 * ========================================
 * 🎯 模拟器视图架构说明
 * ========================================
 *
 * 层级结构（从外到内）：
 * 1. Simulator 模拟器容器：可替换部件，有协议约束，包含画布的容器，使用场景：当 Canvas 大小变化时，用来居中处理或定位 Canvas
 * 2. Canvas(DeviceShell) 设备壳层：通过背景图片来模拟，通过设备预设样式改变宽度、高度及定位 CanvasViewport
 * 3. CanvasViewport 视口层：页面编排场景中宽高不可溢出 Canvas 区
 * 4. Content(Shell) 内容外层：宽高紧贴 CanvasViewport，禁用边框，禁用 margin
 * 5. BemTools 辅助显示层：初始相对 Content 位置 0,0，紧贴 Canvas，根据 Content 滚动位置，改变相对位置
 *
 * 主要职责：
 * - 创建和管理 iframe 沙箱环境
 * - 提供设备模拟能力（PC、移动端等）
 * - 管理画布缩放和滚动
 * - 提供设计辅助工具（选择框、插入线等）
 */

// 模拟器宿主组件的属性定义
type SimulatorHostProps = BuiltinSimulatorProps & {
    project: Project; // 项目实例，管理文档和页面
    onMount?: (host: BuiltinSimulatorHost) => void; // 挂载完成回调，用于外部获取 host 实例
};

/**
 * 🎯 内置模拟器宿主视图组件
 *
 * 这是低代码引擎的默认模拟器实现，负责：
 * 1. 管理 iframe 容器和渲染环境
 * 2. 处理设备模拟和视口管理
 * 3. 提供设计时的交互能力
 * 4. 协调 BEM 工具和辅助线显示
 */
export class BuiltinSimulatorHostView extends Component<SimulatorHostProps> {
    readonly host: BuiltinSimulatorHost; // 模拟器宿主控制器实例

    constructor(props: any) {
        super(props);
        const { project, onMount, designer } = this.props;

        // 复用已存在的模拟器实例或创建新实例
        // 这确保了模拟器的单例性，避免重复创建
        this.host = (project.simulator as BuiltinSimulatorHost) ||
            new BuiltinSimulatorHost(project, designer);

        // 设置模拟器属性（如设备类型、缩放比例等）
        this.host.setProps(this.props);

        // 触发挂载回调，让外部组件可以访问 host 实例
        onMount?.(this.host);
    }

    /**
     * 生命周期优化：阻止不必要的重新渲染
     * 因为模拟器的状态由 host 内部管理，不需要 React 重新渲染
     */
    shouldComponentUpdate(nextProps: BuiltinSimulatorProps) {
        // 直接将新属性传递给 host，由 host 内部处理更新
        this.host.setProps(nextProps);
        return false; // 永远返回 false，避免 React 重新渲染
    }

    render() {
        return (
            <div className="lc-simulator">
                {/* 模拟器最外层容器 */}
                {/* progressing.visible ? <PreLoaderView /> : null  加载进度条，暂时注释 */}
                <Canvas host={this.host} /> {/* 画布组件，包含设备框架和内容区域 */}
            </div>
        );
    }
}

/**
 * 🖼️ 画布组件
 *
 * 负责渲染设备外框和视口区域
 * 支持不同设备类型的样式切换（PC、平板、手机等）
 */
@observer // MobX 响应式组件，自动响应 host 状态变化
class Canvas extends Component<{ host: BuiltinSimulatorHost }> {
    render() {
        const sim = this.props.host;
        let className = 'lc-simulator-canvas'; // 基础类名

        // 获取设备样式配置
        // canvas: 设备外框样式
        // viewport: 视口样式
        const { canvas = {}, viewport = {} } = sim.deviceStyle || {};

        // 动态添加设备类名
        if (sim.deviceClassName) {
            // 优先使用自定义设备类名
            className += ` ${sim.deviceClassName}`;
        } else if (sim.device) {
            // 使用预设设备类型（如 phone、tablet、desktop）
            className += ` lc-simulator-device-${sim.device}`;
        }

        return (
            <div className={className} style={canvas}>
                {/* 设备外框容器 */}
                <div
                    ref={(elmt) => sim.mountViewport(elmt)} // 挂载视口元素，用于计算滚动和定位
                    className="lc-simulator-canvas-viewport" // 视口容器
                    style={viewport} // 视口样式（宽高等）
                >
                    <BemTools host={sim} /> {/* BEM 辅助工具层：选择框、插入线、调整手柄等 */}
                    <Content host={sim} /> {/* 内容层：包含 iframe */}
                </div>
            </div>
        );
    }
}

/**
 * 📦 内容组件
 *
 * 负责渲染实际的 iframe 容器
 * 管理 iframe 的缩放、禁用交互等状态
 */
@observer // 响应式组件
class Content extends Component<{ host: BuiltinSimulatorHost }> {
    // 组件状态
    state = {
        disabledEvents: false, // 是否禁用事件（拖拽时禁用iframe内部交互）
    };

    private dispose?: () => void; // 事件清理函数

    componentDidMount() {
        const { editor } = this.props.host.designer;

        // 监听禁用事件的开关
        // 在拖拽等操作时，需要临时禁用 iframe 内的鼠标事件
        // 防止拖拽时误触发 iframe 内部的交互
        const onEnableEvents = (type: boolean) => {
            this.setState({
                disabledEvents: type,
            });
        };

        // 注册事件监听器
        editor.eventBus.on('designer.builtinSimulator.disabledEvents', onEnableEvents);

        // 保存清理函数
        this.dispose = () => {
            editor.removeListener('designer.builtinSimulator.disabledEvents', onEnableEvents);
        };
    }

    componentWillUnmount() {
        // 组件卸载时清理事件监听器
        this.dispose?.();
    }

    render() {
        const sim = this.props.host;
        const { disabledEvents } = this.state;
        const { viewport, designer } = sim;

        // 构建 iframe 样式
        const frameStyle: any = {
            transform: `scale(${viewport.scale})`, // 缩放比例（用于适配不同屏幕尺寸）
            height: viewport.contentHeight, // 内容高度
            width: viewport.contentWidth, // 内容宽度
        };

        // 禁用事件时，阻止 iframe 内部的鼠标事件
        if (disabledEvents) {
            frameStyle.pointerEvents = 'none';
        }

        const { viewName } = designer; // 视图名称，用于标识不同的设计器实例

        return (
            <div className="lc-simulator-content">
                {/* 内容容器 */}
                <iframe
                    name={`${viewName}-SimulatorRenderer`} // iframe 名称，用于识别和通信
                    className="lc-simulator-content-frame" // iframe 样式类
                    style={frameStyle} // 动态样式（缩放、尺寸等）
                    ref={(frame) => sim.mountContentFrame(frame)} // 挂载 iframe，触发内容加载
                />
            </div>
        );
    }
}
