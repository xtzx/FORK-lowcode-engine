/* eslint-disable react/jsx-indent */
import { Component } from 'react';
import classNames from 'classnames';
import BuiltinDragGhostComponent from './drag-ghost';
import { Designer, DesignerProps } from './designer';
import { ProjectView } from '../project';
import './designer.less';

type IProps = DesignerProps & {
    designer?: Designer;
};

export class DesignerView extends Component<IProps> {
    readonly designer: Designer;
    readonly viewName: string | undefined;

    constructor(props: IProps) {
        super(props);
        const { designer, ...designerProps } = props;
        this.viewName = designer?.viewName;
        if (designer) {
            this.designer = designer;
            designer.setProps(designerProps);
        } else {
            this.designer = new Designer(designerProps);
        }
    }

    shouldComponentUpdate(nextProps: DesignerProps) {
        this.designer.setProps(nextProps);
        const { props } = this;
        if (
            nextProps.className !== props.className ||
            nextProps.style !== props.style ||
            nextProps.dragGhostComponent !== props.dragGhostComponent
        ) {
            return true;
        }
        return false;
    }

    componentDidMount() {
        const { onMount } = this.props;
        if (onMount) {
            onMount(this.designer);
        }
        this.designer.postEvent('mount', this.designer);
    }

    UNSAFE_componentWillMount() {
        this.designer.purge();
    }

    render() {
        const { className, style, dragGhostComponent } = this.props;
        const DragGhost = dragGhostComponent || BuiltinDragGhostComponent;

        return (
            <div className={classNames('lc-designer', className)} style={style}>
                {/* 拖拽幽灵组件 */}
                <DragGhost designer={this.designer} />
                {/* 主要负责展示和管理设计项目的视图。这个组件是设计界面的主要部分，用于渲染和交互设计文档中的各种组件和布局。 */}
                <ProjectView designer={this.designer} />
            </div>
        );
    }
}
