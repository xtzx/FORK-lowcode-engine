/**
 * @file 默认配置注册器
 * @description 注册组件元数据转换器（Transducer），用于处理和增强组件元数据
 *
 * 作用：
 * - 注册默认的元数据转换器
 * - 处理组件元数据的特殊格式（如函数字符串）
 * - 合并平台和插件的自定义配置
 *
 * 核心概念：
 * - Transducer（转换器）：对组件元数据进行转换和增强的函数
 * - 执行顺序：按优先级数字从小到大执行
 * - 链式处理：上一个转换器的输出是下一个的输入
 *
 * 转换器列表：
 * 1. parseJSFunc (优先级1): 解析 JS 函数字符串
 * 2. parseProps (优先级5): 解析属性配置
 * 3. addonCombine (优先级10): 合并插件和平台配置
 *
 * 使用场景：
 * - 引擎初始化时自动注册
 * - 作为内置插件加载
 *
 * @example
 * ```typescript
 * // 在引擎初始化时
 * const engine = new Engine();
 * engine.registerPlugin(registerDefaults);
 * ```
 */

import parseJSFunc from './transducers/parse-func';  // 解析 JS 函数转换器
import parseProps from './transducers/parse-props';  // 解析属性转换器
import addonCombine from './transducers/addon-combine';  // 合并配置转换器
import { IPublicModelPluginContext } from '@alilc/lowcode-types';

/**
 * 注册默认配置的插件函数
 *
 * @param ctx - 插件上下文对象
 * @returns 插件对象，包含 init 方法
 *
 * 插件上下文提供：
 * - material: 物料管理器，用于注册转换器
 * - editor: 编辑器实例
 * - skeleton: 骨架实例
 * - ... 其他 API
 *
 * 工作流程：
 * 1. 引擎调用 registerDefaults(ctx)
 * 2. 返回插件对象
 * 3. 引擎调用 plugin.init()
 * 4. 注册所有转换器
 * 5. 转换器在加载组件元数据时自动执行
 *
 * 转换器的作用举例：
 *
 * 输入元数据（原始）：
 * ```typescript
 * {
 *   componentName: 'Button',
 *   configure: {
 *     props: [
 *       {
 *         name: 'onClick',
 *         setter: 'FunctionSetter',
 *         defaultValue: 'function() { console.log("click"); }'  // 字符串
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * 经过 parseJSFunc 转换后：
 * ```typescript
 * {
 *   componentName: 'Button',
 *   configure: {
 *     props: [
 *       {
 *         name: 'onClick',
 *         setter: 'FunctionSetter',
 *         defaultValue: function() { console.log("click"); }  // 真实函数
 *       }
 *     ]
 *   }
 * }
 * ```
 */
export const registerDefaults = (ctx: IPublicModelPluginContext) => {
  // 从上下文获取 material 物料管理器
  const { material } = ctx;

  // 返回插件对象
  return {
    /**
     * 插件初始化方法
     *
     * 注册顺序：
     * 1. parseJSFunc (优先级1) - 最先执行
     * 2. parseProps (优先级5) - 中间执行
     * 3. addonCombine (优先级10) - 最后执行
     *
     * 为什么有优先级？
     * - 有些转换依赖其他转换的结果
     * - 例如：必须先解析函数，再合并配置
     *
     * 优先级数字越小，越先执行
     */
    init() {
      // ===== 转换器1：解析 JS 函数 =====
      /**
       * 将函数字符串转换为真实的函数对象
       *
       * 应用场景：
       * - defaultValue: 'function() {...}'
       * - condition: 'function(target) { return true; }'
       *
       * 优先级：1（最高优先级，最先执行）
       *
       * 为什么优先级最高？
       * - 其他转换器可能需要执行函数来获取结果
       * - 必须先把字符串转换为函数
       */
      material.registerMetadataTransducer(parseJSFunc, 1, 'parse-func');

      // ===== 转换器2：解析属性配置 =====
      /**
       * 处理属性配置的特殊格式
       *
       * 应用场景：
       * - 属性的动态显示/隐藏
       * - 属性的条件渲染
       * - 属性的默认值计算
       *
       * 优先级：5（中等优先级）
       */
      material.registerMetadataTransducer(parseProps, 5, 'parse-props');

      // ===== 转换器3：合并插件配置 =====
      /**
       * 合并平台和插件提供的自定义配置
       *
       * 应用场景：
       * - 平台定制：添加平台特有的属性
       * - 插件扩展：插件可以修改组件配置
       * - 配置覆盖：后注册的配置覆盖先注册的
       *
       * 优先级：10（最低优先级，最后执行）
       *
       * 为什么优先级最低？
       * - 需要在所有基础转换完成后再合并
       * - 确保合并的是完整处理过的配置
       */
      material.registerMetadataTransducer(addonCombine, 10, 'combine-props');
    },
  };
};

/**
 * 插件名称
 *
 * 三个下划线表示内部插件
 * - 不会在插件列表中显示
 * - 不允许用户卸载
 * - 引擎自动加载
 */
registerDefaults.pluginName = '___register_defaults___';
