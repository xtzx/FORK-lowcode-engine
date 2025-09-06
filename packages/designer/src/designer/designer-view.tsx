/* eslint-disable react/jsx-indent */
import { Component } from 'react'; // React 基础组件类
import classNames from 'classnames'; // CSS 类名动态组合工具
import BuiltinDragGhostComponent from './drag-ghost'; // 内置拖拽幽灵组件，显示拖拽时的视觉反馈
import { Designer, DesignerProps } from './designer'; // Designer 核心类和其属性类型定义
import { ProjectView } from '../project'; // 项目视图组件，负责渲染具体的项目内容
import './designer.less'; // 设计器样式文件

// DesignerView 组件的属性接口定义
// 继承 DesignerProps 的所有属性，并扩展可选的 designer 实例
type IProps = DesignerProps & {
    designer?: Designer; // 可选的预存在的设计器实例，用于复用场景
};

/**
 * DesignerView 核心职责：
 * 1. 设计器视图容器：提供设计器的主要 UI 框架和布局
 * 2. Designer 实例管理：创建、配置、生命周期管理设计器核心实例
 * 3. 拖拽交互支持：集成拖拽幽灵组件，提供可视化拖拽反馈
 * 4. 项目视图渲染：渲染具体的项目内容和画布区域
 * 5. 性能优化控制：通过 shouldComponentUpdate 控制重渲染时机
 */
export class DesignerView extends Component<IProps> {
    readonly designer: Designer; // 设计器核心实例，只读属性确保实例稳定性
    readonly viewName: string | undefined; // 视图名称，用于标识当前设计器视图

    /**
     * 构造函数：初始化设计器实例和配置
     * 核心逻辑：
     * 1. 决策是复用传入的设计器实例还是创建新实例
     * 2. 保存视图名称用于标识
     * 3. 设置设计器的初始属性配置
     */
    constructor(props: IProps) {
        super(props);
        // 解构属性：将 designer 实例单独提取，其余属性作为 designerProps
        const { designer, ...designerProps } = props;

        // 保存视图名称，用于后续的视图标识和调试
        this.viewName = designer?.viewName;

        // 🔥 关键决策：复用已有实例 vs 创建新实例
        if (designer) {
            // 场景：热更新、实例传递等复用场景
            this.designer = designer; // 直接使用传入的设计器实例
            designer.setProps(designerProps); // 更新现有实例的属性配置
        } else {
            // 场景：首次创建或独立使用场景
            this.designer = new Designer(designerProps); // 创建新的设计器实例
        }
    }

    /**
     * 性能优化方法：控制组件重新渲染的时机
     * 职责：
     * 1. 更新设计器实例的属性（每次 props 变化都要同步）
     * 2. 仅在影响视图的关键属性变化时才重新渲染
     * 3. 避免不必要的重渲染，提升性能
     */
    shouldComponentUpdate(nextProps: DesignerProps) {
        // 🔥 重要：无论是否重新渲染，都要同步属性到设计器实例
        // 确保设计器内部状态与外部 props 保持一致
        this.designer.setProps(nextProps);

        // 获取当前属性，用于对比
        const { props } = this;

        // 🎯 关键判断：只有影响 UI 渲染的属性变化才触发重新渲染
        if (
            nextProps.className !== props.className || // CSS 类名变化
            nextProps.style !== props.style || // 内联样式变化
            nextProps.dragGhostComponent !== props.dragGhostComponent // 拖拽组件变化
        ) {
            return true; // 触发重新渲染
        }
        // 其他属性变化（如配置、数据等）不影响当前组件的渲染
        // 因为这些属性已通过 setProps 同步给设计器实例处理
        return false; // 跳过重新渲染，优化性能
    }

    /**
     * 组件挂载完成回调
     * 职责：
     * 1. 执行用户提供的挂载回调函数
     * 2. 发出设计器挂载事件，通知系统其他部分
     * 3. 标志着设计器视图完全就绪，可以开始交互
     */
    componentDidMount() {
        const { onMount } = this.props; // 获取用户传入的挂载回调

        // 🔥 关键回调：通知外部组件设计器已挂载完成
        // 这是 DesignerPlugin.handleDesignerMount 的触发点
        if (onMount) {
            onMount(this.designer); // 将设计器实例传递给外部处理
        }

        // 发出内部事件：通知设计器系统内部组件挂载完成
        // 其他订阅了 'mount' 事件的组件会收到此通知
        this.designer.postEvent('mount', this.designer);
    }

    /**
     * 组件即将挂载前的清理方法（React 18 中已弃用，但这里保留向后兼容）
     * 职责：清理设计器实例的内部资源，避免内存泄漏
     *
     * 注意：此方法在 React 18+ 中不建议使用，但为了兼容性仍保留
     */
    UNSAFE_componentWillMount() {
        // 清理设计器实例：释放事件监听器、取消订阅、清理缓存等
        this.designer.purge(); // 确保干净的初始化状态
    }

    /**
     * 渲染方法：构建设计器的完整视图结构
     * 职责：
     * 1. 构建设计器的根容器和样式
     * 2. 渲染拖拽幽灵组件，提供拖拽时的视觉反馈
     * 3. 渲染项目视图，显示实际的设计内容
     * 4. 建立设计器的完整 UI 层次结构
     */
    render() {
        // 从 props 中提取视图相关的属性
        const { className, style, dragGhostComponent } = this.props;

        // 🎯 拖拽组件选择：优先使用用户自定义组件，否则使用内置组件
        const DragGhost = dragGhostComponent || BuiltinDragGhostComponent;

        return (
            // 设计器根容器：应用基础样式类和用户自定义样式
            <div className={classNames('lc-designer', className)} style={style}>
                {/* 🔥 拖拽幽灵组件：处理拖拽时的视觉反馈 */}
                {/* 功能：
                    - 跟随鼠标显示正在拖拽的组件预览
                    - 提供拖拽状态的视觉指示
                    - 增强用户拖拽体验
                */}
                <DragGhost designer={this.designer} />

                {/* 🔥 项目视图组件：设计器的核心内容区域 */}
                {/* 功能：
                    - 渲染具体的设计项目内容
                    - 管理设计文档的显示和交互
                    - 包含画布、模拟器、编辑区域等
                    - 处理组件的选中、编辑、布局等核心设计操作
                */}
                <ProjectView designer={this.designer} />
            </div>
        );
    }
}
