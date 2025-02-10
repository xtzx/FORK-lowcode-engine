import { IPublicModelPluginContext } from '../../../types/src';
import { SettingsPrimaryPane } from '../../../editor-skeleton/src';
import DesignerPlugin from '../../../plugin-designer/src';

// 注册默认的面板
export const defaultPanelRegistry = (editor: any) => {
    const fun = (ctx: IPublicModelPluginContext) => {
        return {
            init() {
                const { skeleton, config } = ctx;

                // 编辑态 中间部分
                skeleton.add({
                    area: 'mainArea',
                    name: 'designer',
                    type: 'Widget',
                    content: <DesignerPlugin engineConfig={config} engineEditor={editor} />,
                });

                // 右侧 属性 高级配置部分
                if (!config.get('disableDefaultSettingPanel')) {
                    skeleton.add({
                        area: 'rightArea',
                        name: 'settingsPane',
                        type: 'Panel',
                        content: <SettingsPrimaryPane engineEditor={editor} />,
                        props: {
                            ignoreRoot: true,
                        },
                        panelProps: {
                            ...(config.get('defaultSettingPanelProps') || {}),
                        },
                    });
                }
            },
        };
    };

    fun.pluginName = '___default_panel___';

    return fun;
};

export default defaultPanelRegistry;
