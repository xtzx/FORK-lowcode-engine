import { Component } from 'react';

// 🔥 Slot：低代码引擎的内置插槽组件
// 用途：将JSSlot属性转换为真正的可渲染容器组件
class Slot extends Component {
  static displayName = 'Slot';

  // 🎉 组件元数据配置：自动注册到低代码引擎
static componentMetadata = {
    componentName: 'Slot', // 固定的组件名
    configure: {
      // 可配置属性
      props: [
        {
          name: '___title',     // 插槽标题（内部属性）
          title: {
            type: 'i18n',
            'en-US': 'Slot Title',
            'zh-CN': '插槽标题',
          },
          setter: 'StringSetter',
          defaultValue: '插槽容器',
        },
        {
          name: '___params',   // 插槽参数（内部属性）
          title: {
            type: 'i18n',
            'en-US': 'Slot Params',
            'zh-CN': '插槽入参',
          },
          setter: {
            componentName: 'ArraySetter',
            props: {
              itemSetter: {
                componentName: 'StringSetter',
                props: {
                  placeholder: {
                    type: 'i18n',
                    'zh-CN': '参数名称',
                    'en-US': 'Argument Name',
                  },
                },
              },
            },
          },
        },
      ],
      component: {
        // 🔥 最关键配置：标记为容器组件
        isContainer: true,  // ✅ 这就是为什么Slot节点能被识别为可拖拽容器
      },
      // 禁用通用特性：事件/类名/样式/通用/指令
      supports: false, // 不支持通用的组件特性配置
    },
  };

  render() {
    const { children } = this.props;
    // 📝 直接渲染children，作为透明容器
    // children来自JSSlot的value内容
    return <>{children}</>;
  }
}

export default Slot;
