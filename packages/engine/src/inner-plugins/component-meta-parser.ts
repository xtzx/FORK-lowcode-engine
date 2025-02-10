import { IPublicModelPluginContext } from '@alilc/lowcode-types';

export const componentMetaParser = (designer: any) => {
  const fun = (ctx: IPublicModelPluginContext) => {
    return {
      init() {
        const { material } = ctx;

        // 监听资产包变化的事件
        // 当资产包中新增加了组件,能够及时更新渲染成组件到 designer 中
        material.onChangeAssets(() => {
          const assets = material.getAssets();
          const { components = [] } = assets;

          // 实现了组件元数据的构建和管理功能
          designer.buildComponentMetasMap(components);
        });
      },
    };
  };

  fun.pluginName = '___component_meta_parser___';

  return fun;
};
