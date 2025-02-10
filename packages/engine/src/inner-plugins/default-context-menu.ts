/**
 * @Author  : zhouming
 * @Date    : 2024-09-03 19:44:44
 * 主要负责定义和管理低代码编辑器中的默认上下文菜单（右键菜单）。
 * 通过插件上下文 (IPublicModelPluginContext) 提供的接口，添加和配置各种上下文菜单项，以支持节点的选择、复制、粘贴、删除等操作。
 */
import {Message} from '@alifd/next';

import {
    IPublicEnumContextMenuType,
    IPublicEnumDragObjectType,
    IPublicEnumTransformStage,
    IPublicModelNode,
    IPublicModelPluginContext,
    IPublicTypeDragNodeDataObject,
    IPublicTypeNodeSchema,
} from '../../../types/src';
import {isProjectSchema} from '../../../utils/src';
import {intl} from '../locale';

function getNodesSchema(nodes: IPublicModelNode[]) {
    const componentsTree = nodes.map((node) => node?.exportSchema(IPublicEnumTransformStage.Clone));
    const data = {type: 'nodeSchema', componentsMap: {}, componentsTree};
    return data;
}

async function getClipboardText(): Promise<IPublicTypeNodeSchema[]> {
    return new Promise((resolve, reject) => {
        // 使用 Clipboard API 读取剪贴板内容
        navigator.clipboard.readText().then(
            (text) => {
                try {
                    const data = JSON.parse(text);
                    if (isProjectSchema(data)) {
                        resolve(data.componentsTree);
                    } else {
                        Message.error(intl('NotValidNodeData'));
                        reject(new Error(intl('NotValidNodeData')));
                    }
                } catch (error) {
                    Message.error(intl('NotValidNodeData'));
                    reject(error);
                }
            },
            (err) => {
                reject(err);
            },
        );
    });
}

export const defaultContextMenu = (ctx: IPublicModelPluginContext) => {
    const {material, canvas, common} = ctx;
    const {clipboard} = canvas;
    const {intl: utilsIntl} = common.utils;

    return {
        init() {
            /**
             * 只有当选中单个节点时才显示此选项
             * 不执行特定操作，只是作为一个菜单容器。
             */
            material.addContextMenuOption({
                name: 'selectComponent',
                title: intl('SelectComponents'),
                condition: (nodes = []) => {
                    return nodes.length === 1;
                },
                // 子菜单项或生成子节点的函数，可选，仅支持两级
                items: [
                    {
                        name: 'nodeTree',
                        type: IPublicEnumContextMenuType.NODE_TREE,
                    },
                ],
            });

            /**
             * 复制并粘贴
             */
            material.addContextMenuOption({
                name: 'copyAndPaste',
                title: intl('CopyAndPaste'),
                disabled: (nodes = []) => {
                    return nodes?.filter((node) => !node?.canPerformAction('copy')).length > 0;
                },
                condition: (nodes) => {
                    return nodes?.length === 1;
                },
                action(nodes) {
                    const node = nodes?.[0];
                    if (!node) {
                        return;
                    }
                    const {document: doc, parent, index} = node;
                    const data = getNodesSchema(nodes);
                    clipboard.setData(data);

                    if (parent) {
                        const newNode = doc?.insertNode(parent, node, (index ?? 0) + 1, true);
                        newNode?.select();
                    }
                },
            });

            /**
             * 复制 (copy)
             */
            material.addContextMenuOption({
                name: 'copy',
                title: intl('Copy'),
                disabled: (nodes = []) => {
                    return nodes?.filter((node) => !node?.canPerformAction('copy')).length > 0;
                },
                condition(nodes = []) {
                    return nodes?.length > 0;
                },
                action(nodes) {
                    if (!nodes || nodes.length < 1) {
                        return;
                    }

                    const data = getNodesSchema(nodes);
                    clipboard.setData(data);
                },
            });

            /**
             * 粘贴到底部 (pasteToBottom)
             */
            material.addContextMenuOption({
                name: 'pasteToBottom',
                title: intl('PasteToTheBottom'),
                condition: (nodes) => {
                    return nodes?.length === 1;
                },
                async action(nodes) {
                    if (!nodes || nodes.length < 1) {
                        return;
                    }

                    const node = nodes[0];
                    const {document: doc, parent, index} = node;

                    try {
                        const nodeSchema = await getClipboardText();
                        if (nodeSchema.length === 0) {
                            return;
                        }
                        if (parent) {
                            let canAddNodes = nodeSchema.filter((nodeSchema: IPublicTypeNodeSchema) => {
                                const dragNodeObject: IPublicTypeDragNodeDataObject = {
                                    type: IPublicEnumDragObjectType.NodeData,
                                    data: nodeSchema,
                                };
                                return doc?.checkNesting(parent, dragNodeObject);
                            });
                            if (canAddNodes.length === 0) {
                                Message.error(
                                    `${nodeSchema
                                        .map((d) => utilsIntl(d.title || d.componentName))
                                        .join(',')}等组件无法放置到${utilsIntl(
                                        parent.title || (parent.componentName as any),
                                    )}内`,
                                );
                                return;
                            }
                            const nodes: IPublicModelNode[] = [];
                            canAddNodes.forEach((schema, schemaIndex) => {
                                const node = doc?.insertNode(parent, schema, (index ?? 0) + 1 + schemaIndex, true);
                                node && nodes.push(node);
                            });
                            doc?.selection.selectAll(nodes.map((node) => node?.id));
                        }
                    } catch (error) {
                        console.error(error);
                    }
                },
            });

            material.addContextMenuOption({
                name: 'pasteToInner',
                title: intl('PasteToTheInside'),
                condition: (nodes) => {
                    return nodes?.length === 1;
                },
                disabled: (nodes = []) => {
                    // 获取粘贴数据
                    const node = nodes?.[0];
                    return !node.isContainerNode;
                },
                async action(nodes) {
                    const node = nodes?.[0];
                    if (!node) {
                        return;
                    }
                    const {document: doc} = node;

                    try {
                        const nodeSchema = await getClipboardText();
                        const index = node.children?.size || 0;
                        if (nodeSchema.length === 0) {
                            return;
                        }
                        let canAddNodes = nodeSchema.filter((nodeSchema: IPublicTypeNodeSchema) => {
                            const dragNodeObject: IPublicTypeDragNodeDataObject = {
                                type: IPublicEnumDragObjectType.NodeData,
                                data: nodeSchema,
                            };
                            return doc?.checkNesting(node, dragNodeObject);
                        });
                        if (canAddNodes.length === 0) {
                            Message.error(
                                `${nodeSchema
                                    .map((d) => utilsIntl(d.title || d.componentName))
                                    .join(',')}等组件无法放置到${utilsIntl(
                                    node.title || (node.componentName as any),
                                )}内`,
                            );
                            return;
                        }

                        const nodes: IPublicModelNode[] = [];
                        nodeSchema.forEach((schema, schemaIndex) => {
                            const newNode = doc?.insertNode(node, schema, (index ?? 0) + 1 + schemaIndex, true);
                            newNode && nodes.push(newNode);
                        });
                        doc?.selection.selectAll(nodes.map((node) => node?.id));
                    } catch (error) {
                        console.error(error);
                    }
                },
            });

            material.addContextMenuOption({
                name: 'delete',
                title: intl('Delete'),
                disabled(nodes = []) {
                    return nodes?.filter((node) => !node?.canPerformAction('remove')).length > 0;
                },
                condition(nodes = []) {
                    return nodes.length > 0;
                },
                action(nodes) {
                    nodes?.forEach((node) => {
                        node.remove();
                    });
                },
            });
        },
    };
};

defaultContextMenu.pluginName = '___default_context_menu___';
