/**
 * ========================================
 * VisualDom 虚拟 DOM 组件工厂模块
 * ========================================
 *
 * 🎯 核心职责：
 * 在设计态下，当组件不在正确的父容器中时，显示虚拟 DOM 占位符
 *
 * 🔍 什么是虚拟 DOM 显示？
 * 某些组件有 parentRule 配置，要求必须在特定父组件中使用
 * 例如：TabItem 必须在 Tab 组件中，TableColumn 必须在 Table 中
 *
 * 💡 使用场景示例：
 *
 * 正确情况：
 * <Tab>
 *   <TabItem title="标签1" />  ← 正常渲染
 *   <TabItem title="标签2" />
 * </Tab>
 *
 * 错误情况（TabItem 在 Div 中）：
 * <Div>
 *   <TabItem title="标签1" />  ← 显示为虚拟 DOM（不能正常工作）
 * </Div>
 *
 * 虚拟 DOM 渲染结果：
 * ┌─────────────────────┐
 * │  TabItem            │  ← 标题显示组件名
 * │  ┌───────────────┐  │
 * │  │ (内部内容)    │  │  ← 子内容显示但不交互
 * │  └───────────────┘  │
 * └─────────────────────┘
 *
 * 🎨 视觉效果：
 * - 带边框的面板
 * - 显示组件名称
 * - 内容可见但交互受限
 * - 提示用户组件放置不正确
 */

import PropTypes from 'prop-types';

import adapter from '../../adapter';
import {IGeneralConstructor} from '../../types';

// 🎨 引入样式文件（定义虚拟 DOM 的外观）
import './index.css';

/**
 * 🏭 VisualDom 工厂函数
 *
 * @returns VisualDom 组件类
 */
export default function visualDomFactory(): IGeneralConstructor {
    // 🔧 从适配器获取运行时 API
    const {PureComponent, createElement} = adapter.getRuntime();

    /**
     * 🔲 VisualDom 组件类
     * 虚拟 DOM 占位符组件
     */
    return class VisualDom extends PureComponent {
        // 🏷️ 组件显示名称
        static displayName = 'VisualDom';

        // ✅ PropTypes 验证
        static propTypes = {
            children: PropTypes.oneOfType([PropTypes.element, PropTypes.arrayOf(PropTypes.element)]),
        };

        // 📝 默认属性
        static defaultProps = {
            children: null,
        };

        /**
         * 🎨 渲染方法
         *
         * 结构：
         * <div className="visual-dom">
         *   <div className="panel-container">
         *     <span className="title">{组件名}</span>
         *     <div className="content">{子内容}</div>
         *   </div>
         * </div>
         */
        render() {
            const {children, cell, title, label, text, __componentName} = this.props;

            // 🎯 确定主内容
            let mainContent = children;

            // 🔧 如果提供了 cell 函数，调用函数获取内容
            // cell: () => ReactNode 模式
            if (cell && typeof cell === 'function') {
                mainContent = cell();
            }

            // 🏗️ 构建虚拟 DOM 结构（纯 createElement，无 JSX）
            return createElement(
                'div',                          // 外层容器
                {className: 'visual-dom'},      // 样式类名
                createElement('div', {className: 'panel-container'}, [  // 面板容器
                    // 📌 标题区域：显示组件名称
                    createElement(
                        'span',
                        {className: 'title'},
                        title || label || text || __componentName  // 优先级：title > label > text > __componentName
                    ),
                    // 📦 内容区域：显示子元素
                    createElement('div', {className: 'content'}, mainContent),
                ]),
            );
        }
    };
}
