/**
 * @file 杂项工具函数
 * @description 提供各种辅助功能函数
 *
 * 作用：
 * - getProjectUtils: 获取项目自定义工具函数（未完全实现）
 * - isRendererDetached: 检测渲染器是否从父窗口分离
 *
 * 使用场景：
 * - 注入自定义工具函数到应用上下文
 * - 检测 iframe 是否仍然有效（未被移除）
 */

/**
 * 工具函数元数据接口
 *
 * 用于描述需要注入的工具函数的配置信息
 *
 * 结构：
 * - name: 工具函数名称
 * - npm: npm 包信息
 *   - package: 包名（如 'lodash'）
 *   - version: 版本号（可选）
 *   - exportName: 导出的变量名
 *   - subName: 子属性名（可选，用于访问 lodash.get 这样的子方法）
 *   - destructuring: 是否解构导出（可选）
 *   - main: 主文件路径（可选）
 */
interface UtilsMetadata {
  name: string;
  npm: {
    package: string;
    version?: string;
    exportName: string;
    subName?: string;
    destructuring?: boolean;
    main?: string;
  };
}

/**
 * 组件库映射表接口
 *
 * 格式：{ 包名: window 全局变量名 }
 *
 * 示例：
 * ```typescript
 * {
 *   'lodash': '_',
 *   'moment': 'moment',
 *   '@alifd/next': 'Next'
 * }
 * ```
 */
interface LibrayMap {
  [key: string]: string;
}

/**
 * 获取项目自定义工具函数
 *
 * @param librayMap - 组件库映射表
 * @param utilsMetadata - 工具函数元数据数组
 * @returns 工具函数对象（当前返回 undefined，未完全实现）
 *
 * 功能：
 * 根据元数据配置，从 window 全局对象获取工具函数
 *
 * 设计意图：
 * 1. 设计器配置需要注入的工具函数
 * 2. 渲染器根据配置从全局对象获取
 * 3. 注入到应用上下文（appContext.utils）
 * 4. 供低代码 JSExpression 使用
 *
 * 当前状态：
 * - ⚠️ 未完全实现（没有返回值）
 * - 只是遍历元数据，没有实际构建工具对象
 *
 * 预期实现：
 * ```typescript
 * export function getProjectUtils(librayMap, utilsMetadata) {
 *   const projectUtils = {};
 *   if (utilsMetadata) {
 *     utilsMetadata.forEach(meta => {
 *       const globalName = librayMap[meta.npm.package];
 *       if (globalName) {
 *         const lib = window[globalName];
 *         if (lib) {
 *           if (meta.npm.subName) {
 *             projectUtils[meta.name] = lib[meta.npm.subName];
 *           } else {
 *             projectUtils[meta.name] = lib;
 *           }
 *         }
 *       }
 *     });
 *   }
 *   return projectUtils;
 * }
 * ```
 *
 * @example
 * ```typescript
 * const librayMap = { 'lodash': '_' };
 * const utilsMetadata = [{
 *   name: 'get',
 *   npm: {
 *     package: 'lodash',
 *     exportName: '_',
 *     subName: 'get'
 *   }
 * }];
 *
 * const utils = getProjectUtils(librayMap, utilsMetadata);
 * // 预期：{ get: _.get }
 * // 实际：undefined（未实现）
 * ```
 */
export function getProjectUtils(librayMap: LibrayMap, utilsMetadata: UtilsMetadata[]) {
  // 初始化项目工具函数对象
  const projectUtils: { [packageName: string]: any } = {};

  // 如果有元数据配置
  if (utilsMetadata) {
    // 遍历所有工具函数配置
    utilsMetadata.forEach(meta => {
      // 检查该包是否在映射表中
      if (librayMap[meta?.npm.package]) {
        // 从 window 全局对象获取库
        const lib = window[librayMap[meta?.npm.package] as any];

        // ⚠️ 这里应该有后续处理逻辑
        // 但当前实现不完整，仅获取了 lib 但未使用
      }
    });
  }

  // ⚠️ 当前没有返回值（应该返回 projectUtils）
}

/**
 * 判断当前模拟器渲染器是否已从父窗口分离
 *
 * @returns 如果已分离返回 true，否则返回 false
 *
 * 使用场景：
 * - 检测 iframe 是否仍然有效
 * - 避免在 iframe 被移除后继续渲染
 * - 防止内存泄漏和错误
 *
 * 实现原理：
 * - iframe 在文档中时：window.parent 存在（指向父窗口）
 * - iframe 被移除后：window.parent 变为 undefined
 *
 * 典型场景：
 * ```typescript
 * // 用户关闭设计器或切换项目
 * // iframe 被从 DOM 移除
 * // 此时 window.parent 为 undefined
 *
 * if (isRendererDetached()) {
 *   // 停止渲染，避免错误
 *   return null;
 * }
 * ```
 *
 * 注意事项：
 * - 在 renderer-view.tsx 的 Renderer 组件中使用
 * - 用于提前返回，避免无效渲染
 *
 * @example
 * ```typescript
 * // 正常情况（iframe 在文档中）
 * console.log(window.parent);  // Window 对象
 * isRendererDetached();  // false
 *
 * // iframe 被移除后
 * console.log(window.parent);  // undefined
 * isRendererDetached();  // true
 * ```
 */
export function isRendererDetached() {
  // 如果当前 iframe 从宿主文档分离，window.parent 将为 undefined
  // !window.parent 会在 parent 为 undefined 时返回 true
  return !window.parent;
}