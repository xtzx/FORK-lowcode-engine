/**
 * @Author  : zhouming
 * @Date    : 2024-09-03 19:44:44
 * 定义和处理低代码编辑器中的快捷键操作。
 * 些快捷键操作允许用户通过键盘快捷方式执行常见任务，如节点的移动、选择和编辑等。
 */
import {isFormEvent, isNodeSchema, isNode} from '../../../utils/src';
import {
    IPublicModelPluginContext,
    IPublicEnumTransformStage,
    IPublicModelNode,
    IPublicTypeNodeSchema,
    IPublicTypeNodeData,
    IPublicEnumDragObjectType,
    IPublicTypeDragNodeObject,
} from '../../../types/src';

function insertChild(
    container: IPublicModelNode,
    originalChild: IPublicModelNode | IPublicTypeNodeData,
    at?: number | null,
): IPublicModelNode | null {
    let child = originalChild;
    if (isNode(child) && (child as IPublicModelNode).isSlotNode) {
        child = (child as IPublicModelNode).exportSchema(IPublicEnumTransformStage.Clone);
    }
    let node = null;
    if (isNode(child)) {
        node = child as IPublicModelNode;
        container.children?.insert(node, at);
    } else {
        node = container.document?.createNode(child) || null;
        if (node) {
            container.children?.insert(node, at);
        }
    }

    return (node as IPublicModelNode) || null;
}

function insertChildren(
    container: IPublicModelNode,
    nodes: IPublicModelNode[] | IPublicTypeNodeData[],
    at?: number | null,
): IPublicModelNode[] {
    let index = at;
    let node: any;
    const results: IPublicModelNode[] = [];
    // eslint-disable-next-line no-cond-assign
    while ((node = nodes.pop())) {
        node = insertChild(container, node, index);
        results.push(node);
        index = node.index;
    }
    return results;
}

/**
 * 获得合适的插入位置
 */
function getSuitableInsertion(
    pluginContext: IPublicModelPluginContext,
    insertNode?: IPublicModelNode | IPublicTypeNodeSchema | IPublicTypeNodeSchema[],
): {target: IPublicModelNode; index?: number} | null {
    const {project, material} = pluginContext;
    const activeDoc = project.currentDocument;
    if (!activeDoc) {
        return null;
    }
    if (
        Array.isArray(insertNode) &&
        isNodeSchema(insertNode[0]) &&
        material.getComponentMeta(insertNode[0].componentName)?.isModal
    ) {
        if (!activeDoc.root) {
            return null;
        }

        return {
            target: activeDoc.root,
        };
    }

    const focusNode = activeDoc.focusNode!;
    const nodes = activeDoc.selection.getNodes();
    const refNode = nodes.find((item) => focusNode.contains(item));
    let target;
    let index: number | undefined;
    if (!refNode || refNode === focusNode) {
        target = focusNode;
    } else if (refNode.componentMeta?.isContainer) {
        target = refNode;
    } else {
        // FIXME!!, parent maybe null
        target = refNode.parent!;
        index = refNode.index + 1;
    }

    if (target && insertNode && !target.componentMeta?.checkNestingDown(target, insertNode)) {
        return null;
    }

    return {target, index};
}

/* istanbul ignore next */
function getNextForSelect(next: IPublicModelNode | null, head?: any, parent?: IPublicModelNode | null): any {
    if (next) {
        if (!head) {
            return next;
        }

        let ret;
        if (next.isContainerNode) {
            const {children} = next;
            if (children && !children.isEmptyNode) {
                ret = getNextForSelect(children.get(0));
                if (ret) {
                    return ret;
                }
            }
        }

        ret = getNextForSelect(next.nextSibling);
        if (ret) {
            return ret;
        }
    }

    if (parent) {
        return getNextForSelect(parent.nextSibling, false, parent?.parent);
    }

    return null;
}

/* istanbul ignore next */
function getPrevForSelect(prev: IPublicModelNode | null, head?: any, parent?: IPublicModelNode | null): any {
    if (prev) {
        let ret;
        if (!head && prev.isContainerNode) {
            const {children} = prev;
            const lastChild = children && !children.isEmptyNode ? children.get(children.size - 1) : null;

            ret = getPrevForSelect(lastChild);
            if (ret) {
                return ret;
            }
        }

        if (!head) {
            return prev;
        }

        ret = getPrevForSelect(prev.prevSibling);
        if (ret) {
            return ret;
        }
    }

    if (parent) {
        return parent;
    }

    return null;
}

function getSuitablePlaceForNode(targetNode: IPublicModelNode, node: IPublicModelNode, ref: any): any {
    const {document} = targetNode;
    if (!document) {
        return null;
    }

    const dragNodeObject: IPublicTypeDragNodeObject = {
        type: IPublicEnumDragObjectType.Node,
        nodes: [node],
    };

    const focusNode = document?.focusNode;
    // 如果节点是模态框，插入到根节点下
    if (node?.componentMeta?.isModal) {
        return {container: focusNode, ref};
    }

    if (!ref && focusNode && targetNode.contains(focusNode)) {
        if (document.checkNesting(focusNode, dragNodeObject)) {
            return {container: focusNode};
        }

        return null;
    }

    if (targetNode.isRootNode && targetNode.children) {
        const dropElement = targetNode.children.filter((c) => {
            if (!c.isContainerNode) {
                return false;
            }
            if (document.checkNesting(c, dragNodeObject)) {
                return true;
            }
            return false;
        })[0];

        if (dropElement) {
            return {container: dropElement, ref};
        }

        if (document.checkNesting(targetNode, dragNodeObject)) {
            return {container: targetNode, ref};
        }

        return null;
    }

    if (targetNode.isContainerNode) {
        if (document.checkNesting(targetNode, dragNodeObject)) {
            return {container: targetNode, ref};
        }
    }

    if (targetNode.parent) {
        return getSuitablePlaceForNode(targetNode.parent, node, {index: targetNode.index});
    }

    return null;
}

export const builtinHotkey = (ctx: IPublicModelPluginContext) => {
    return {
        init() {
            const {hotkey, project, logger, canvas} = ctx;

            // 全局剪贴板实例
            const {clipboard} = canvas;

            // 绑定删除功能
            hotkey.bind(['backspace', 'del'], (e: KeyboardEvent, action) => {
                logger.info(`action ${action} is triggered`);

                // 在实时编辑模式下，用户可能正在直接编辑文本或其他输入元素，此时不应触发快捷键操作，以避免干扰用户输入
                if (canvas.isInLiveEditing) {
                    return;
                }

                // TODO: use focus-tracker
                const doc = project.currentDocument;

                // 用于检查触发事件的元素是否为表单元素（如输入框、选择框等）。
                // 这是因为在表单元素中，按键如 backspace 和 delete 可能用于文本编辑等默认行为，而不是用于执行快捷键指定的操作（如删除节点）。
                if (isFormEvent(e) || !doc) {
                    return;
                }

                // 为了确保快捷键操作不会触发浏览器的默认键盘事件，如滚动页面等。
                e.preventDefault();

                const sel = doc.selection;
                // 获取选区的顶层节点
                // 处理的是组件相互嵌套的情况，如：A(B(C))，删除C时，会把B一起删除
                const topItems = sel.getTopNodes();

                // TODO: check can remove
                topItems.forEach((node) => {
                    if (node?.canPerformAction('remove')) {
                        node && doc.removeNode(node);
                    }
                });

                // 取消选中所有选中节点，不会删除组件
                sel.clear();
            });

            // 绑定esc功能
            hotkey.bind('escape', (e: KeyboardEvent, action) => {
                logger.info(`action ${action} is triggered`);

                if (canvas.isInLiveEditing) {
                    return;
                }
                const sel = project.currentDocument?.selection;
                if (isFormEvent(e) || !sel) {
                    return;
                }
                e.preventDefault();

                sel.clear();
            });

            // 绑定command + c copy  command + x cut
            hotkey.bind(['command+c', 'ctrl+c', 'command+x', 'ctrl+x'], (e, action) => {
                logger.info(`action ${action} is triggered`);
                if (canvas.isInLiveEditing) {
                    return;
                }
                const doc = project.currentDocument;
                if (isFormEvent(e) || !doc) {
                    return;
                }

                // anchorNode: 返回选区开始位置所属的节点
                // nodeValue: 包含当前节点值（如果有）的字符串。
                // 对于文档节点来说，nodeValue 返回 null，对于文本节点、注释节点和 CDATA 节点，nodeValue 返回该节点的文本内容。
                // 对于属性节点，返回属性的值。
                const anchorValue = document.getSelection()?.anchorNode?.nodeValue;

                // 说明是在输入文本
                if (anchorValue && typeof anchorValue === 'string') {
                    return;
                }

                e.preventDefault();

                let selected = doc.selection.getTopNodes(true);
                selected = selected.filter((node) => {
                    return node?.canPerformAction('copy');
                });
                if (!selected || selected.length < 1) {
                    return;
                }

                const componentsMap = {};
                const componentsTree = selected.map((item) => item?.exportSchema(IPublicEnumTransformStage.Clone));

                // FIXME: clear node.id

                const data = {type: 'nodeSchema', componentsMap, componentsTree};

                // 给剪贴板赋值
                clipboard.setData(data);

                // 剪切操作需要移出
                const cutMode = action && action.indexOf('x') > 0;
                if (cutMode) {
                    selected.forEach((node) => {
                        const parentNode = node?.parent;
                        parentNode?.select();
                        node?.remove();
                    });
                }
            });

            // 绑定command + v paste
            hotkey.bind(['command+v', 'ctrl+v'], (e, action) => {
                logger.info(`action ${action} is triggered`);
                if (canvas.isInLiveEditing) {
                    return;
                }
                // TODO
                const doc = project?.currentDocument;
                if (isFormEvent(e) || !doc) {
                    return;
                }
                /* istanbul ignore next */
                clipboard.waitPasteData(e, ({componentsTree}) => {
                    if (componentsTree) {
                        const {target, index} = getSuitableInsertion(ctx, componentsTree) || {};
                        if (!target) {
                            return;
                        }
                        let canAddComponentsTree = componentsTree.filter((node: IPublicModelNode) => {
                            const dragNodeObject: IPublicTypeDragNodeObject = {
                                type: IPublicEnumDragObjectType.Node,
                                nodes: [node],
                            };
                            return doc.checkNesting(target, dragNodeObject);
                        });
                        if (canAddComponentsTree.length === 0) {
                            return;
                        }
                        const nodes = insertChildren(target, canAddComponentsTree, index);
                        if (nodes) {
                            doc.selection.selectAll(nodes.map((o) => o.id));
                            setTimeout(() => canvas.activeTracker?.track(nodes[0]), 10);
                        }
                    }
                });
            });

            // command + z
            hotkey.bind(['command+z', 'ctrl+z'], (e, action) => {
                logger.info(`action ${action} is triggered`);
                if (canvas.isInLiveEditing) {
                    return;
                }
                const history = project.currentDocument?.history;
                if (isFormEvent(e) || !history) {
                    return;
                }

                e.preventDefault();
                const selection = project.currentDocument?.selection;
                const curSelected = selection?.selected && Array.from(selection?.selected);
                history.back();
                selection?.selectAll(curSelected);
            });

            // command + shift + z redo
            hotkey.bind(['command+y', 'ctrl+y', 'command+shift+z'], (e, action) => {
                logger.info(`action ${action} is triggered`);
                if (canvas.isInLiveEditing) {
                    return;
                }
                const history = project.currentDocument?.history;
                if (isFormEvent(e) || !history) {
                    return;
                }
                e.preventDefault();
                const selection = project.currentDocument?.selection;
                const curSelected = selection?.selected && Array.from(selection?.selected);
                history.forward();
                selection?.selectAll(curSelected);
            });

            // sibling selection
            hotkey.bind(['left', 'right'], (e, action) => {
                logger.info(`action ${action} is triggered`);
                if (canvas.isInLiveEditing) {
                    return;
                }
                const doc = project.currentDocument;
                if (isFormEvent(e) || !doc) {
                    return;
                }
                e.preventDefault();
                const selected = doc.selection.getTopNodes(true);
                if (!selected || selected.length < 1) {
                    return;
                }
                const firstNode = selected[0];
                const silbing = action === 'left' ? firstNode?.prevSibling : firstNode?.nextSibling;
                silbing?.select();
            });

            hotkey.bind(['up', 'down'], (e, action) => {
                logger.info(`action ${action} is triggered`);
                if (canvas.isInLiveEditing) {
                    return;
                }
                const doc = project.currentDocument;
                if (isFormEvent(e) || !doc) {
                    return;
                }
                e.preventDefault();
                const selected = doc.selection.getTopNodes(true);
                if (!selected || selected.length < 1) {
                    return;
                }
                const firstNode = selected[0];

                if (action === 'down') {
                    const next = getNextForSelect(firstNode, true, firstNode?.parent);
                    next?.select();
                } else if (action === 'up') {
                    const prev = getPrevForSelect(firstNode, true, firstNode?.parent);
                    prev?.select();
                }
            });

            hotkey.bind(['option+left', 'option+right'], (e, action) => {
                logger.info(`action ${action} is triggered`);
                if (canvas.isInLiveEditing) {
                    return;
                }
                const doc = project.currentDocument;
                if (isFormEvent(e) || !doc) {
                    return;
                }
                e.preventDefault();
                const selected = doc.selection.getTopNodes(true);
                if (!selected || selected.length < 1) {
                    return;
                }
                // TODO: 此处需要增加判断当前节点是否可被操作移动，原ve里是用 node.canOperating()来判断
                // TODO: 移动逻辑也需要重新梳理，对于移动目标位置的选择，是否可以移入，需要增加判断

                const firstNode = selected[0];
                const parent = firstNode?.parent;
                if (!parent) return;

                const isPrev = action && /(left)$/.test(action);

                const silbing = isPrev ? firstNode.prevSibling : firstNode.nextSibling;
                if (silbing) {
                    if (isPrev) {
                        parent.insertBefore(firstNode, silbing, true);
                    } else {
                        parent.insertAfter(firstNode, silbing, true);
                    }
                    firstNode?.select();
                }
            });

            hotkey.bind(['option+up'], (e, action) => {
                logger.info(`action ${action} is triggered`);
                if (canvas.isInLiveEditing) {
                    return;
                }
                const doc = project.currentDocument;
                if (isFormEvent(e) || !doc) {
                    return;
                }
                e.preventDefault();
                const selected = doc.selection.getTopNodes(true);
                if (!selected || selected.length < 1) {
                    return;
                }
                // TODO: 此处需要增加判断当前节点是否可被操作移动，原ve里是用 node.canOperating()来判断
                // TODO: 移动逻辑也需要重新梳理，对于移动目标位置的选择，是否可以移入，需要增加判断

                const firstNode = selected[0];
                const parent = firstNode?.parent;
                if (!parent) {
                    return;
                }

                const silbing = firstNode.prevSibling;
                if (silbing) {
                    if (silbing.isContainerNode) {
                        const place = getSuitablePlaceForNode(silbing, firstNode, null);
                        silbing.insertAfter(firstNode, place.ref, true);
                    } else {
                        parent.insertBefore(firstNode, silbing, true);
                    }
                    firstNode?.select();
                } else {
                    const place = getSuitablePlaceForNode(parent, firstNode, null); // upwards
                    if (place) {
                        const container = place.container.internalToShellNode();
                        container.insertBefore(firstNode, place.ref);
                        firstNode?.select();
                    }
                }
            });

            hotkey.bind(['option+down'], (e, action) => {
                logger.info(`action ${action} is triggered`);
                if (canvas.isInLiveEditing) {
                    return;
                }
                const doc = project.getCurrentDocument();
                if (isFormEvent(e) || !doc) {
                    return;
                }
                e.preventDefault();
                const selected = doc.selection.getTopNodes(true);
                if (!selected || selected.length < 1) {
                    return;
                }
                // TODO: 此处需要增加判断当前节点是否可被操作移动，原 ve 里是用 node.canOperating() 来判断
                // TODO: 移动逻辑也需要重新梳理，对于移动目标位置的选择，是否可以移入，需要增加判断

                const firstNode = selected[0];
                const parent = firstNode?.parent;
                if (!parent) {
                    return;
                }

                const silbing = firstNode.nextSibling;
                if (silbing) {
                    if (silbing.isContainerNode) {
                        silbing.insertBefore(firstNode, undefined);
                    } else {
                        parent.insertAfter(firstNode, silbing, true);
                    }
                    firstNode?.select();
                } else {
                    const place = getSuitablePlaceForNode(parent, firstNode, null); // upwards
                    if (place) {
                        const container = place.container.internalToShellNode();
                        container.insertAfter(firstNode, place.ref, true);
                        firstNode?.select();
                    }
                }
            });
        },
    };
};

builtinHotkey.pluginName = '___builtin_hotkey___';
