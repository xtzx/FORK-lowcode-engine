/* eslint-disable react/jsx-indent-props */
/* eslint-disable react/jsx-indent */
/**
 * @Author  : zhouming
 * @Date    : 2024-09-03 19:44:44
 * 1. 界面渲染：ProjectView 组件负责渲染整个项目的视图，包括所有的设计元素和组件。它提供了一个视觉上的画布，用户可以在这个画布上进行拖拽、选择和编辑操作。
 * 2. 交互管理：该组件处理用户与设计元素的所有交互，如选择、移动和配置组件的属性。这些交互是通过内部逻辑和与其他组件（如 Designer 和 Dragon）的协作来实现的。
 * 3. 状态同步：ProjectView 组件与设计器的状态紧密同步，确保界面上显示的内容总是反映最新的设计状态。这包括响应设计数据的变更，更新视图以匹配设计的最新状态。
 * 4. 事件处理：它监听并处理来自设计工具其他部分的事件，如拖拽事件、属性更改事件等。这确保了用户操作的响应性和准确性。
 */
import { Component } from 'react';
import { observer, engineConfig } from '@alilc/lowcode-editor-core';
import { Designer } from '../designer';
import { BuiltinSimulatorHostView } from '../builtin-simulator';
import './project.less';

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

@observer
export class ProjectView extends Component<{ designer: Designer }> {
    componentDidMount() {
        const { designer } = this.props;
        const { project } = designer;

        project.onRendererReady(() => {
            this.forceUpdate();
        });
    }

    render() {
        const { designer } = this.props;
        const { project, projectSimulatorProps: simulatorProps } = designer;
        const Simulator = designer.simulatorComponent || BuiltinSimulatorHostView;
        const Loading = engineConfig.get('loadingComponent', BuiltinLoading);

        return (
            <div className="lc-project">
                <div className="lc-simulator-shell">
                    {!project?.simulator?.renderer && <Loading />}
                    <Simulator {...simulatorProps} />
                </div>
            </div>
        );
    }
}
