/**
 * ========================================
 * 循环渲染判断工具函数
 * ========================================
 *
 * 🎯 核心职责：
 * 判断是否应该使用循环渲染模式
 *
 * 🔄 循环渲染（Loop Rendering）概念：
 * 当 schema.loop 存在时，组件会被循环渲染多次
 * 类似于 React 中的 array.map((item, index) => <Component {...} />)
 *
 * 💡 判断逻辑：
 *
 * 1️⃣ 生产环境（isDesignMode = false）：
 *    - loop 是任何类型都使用循环模式
 *    - 即使 loop = []，也进入循环逻辑（渲染 0 个组件）
 *
 * 2️⃣ 设计态（isDesignMode = true）：
 *    - loop 是 JSExpression：使用循环模式（表达式可能返回数组）
 *    - loop 是空数组：不使用循环模式（为了在设计器中显示占位符）
 *    - loop 是非空数组：使用循环模式
 *
 * 🔍 为什么设计态要特殊处理？
 *
 * 场景：用户在设计器中配置循环组件
 *
 * 问题：如果 loop = []（空数组），循环渲染会得到 0 个组件
 *       → 画布中什么都看不到
 *       → 用户无法继续编辑该组件
 *
 * 解决方案：设计态下，空数组不使用循环模式
 *          → 渲染单个组件作为占位符
 *          → 用户可以看到和编辑组件
 *
 * 📊 判断矩阵：
 *
 * | loop 类型 | isDesignMode | 结果 | 原因 |
 * |-----------|-------------|------|------|
 * | JSExpression | true/false | true | 表达式可能返回数组 |
 * | [] | false | true | 生产环境渲染 0 个组件 |
 * | [] | true | false | 设计态显示占位符 |
 * | [1,2,3] | true/false | true | 渲染 3 个组件 |
 * | null | true/false | false | 不使用循环 |
 */

import { IPublicTypeJSExpression } from '@alilc/lowcode-types';
import { isJSExpression } from '@alilc/lowcode-utils';

/**
 * 🔍 判断是否使用循环渲染模式
 *
 * @param loop - 循环数据（可以是数组、表达式或 null）
 * @param isDesignMode - 是否为设计模式
 * @returns boolean - true 表示使用循环模式
 */
export default function isUseLoop(
  loop: null | any[] | IPublicTypeJSExpression,
  isDesignMode: boolean
): boolean {
  // 1️⃣ JSExpression: 始终使用循环模式
  // 原因：表达式的值在运行时才能确定，可能是数组
  // 例如：{ type: 'JSExpression', value: 'this.state.list' }
  if (isJSExpression(loop)) {
    return true;
  }

  // 2️⃣ 生产环境：始终使用循环模式
  // 原因：生产环境不需要显示占位符，空数组就是 0 个组件
  if (!isDesignMode) {
    return true;
  }

  // 3️⃣ 设计态：非数组类型不使用循环模式
  // 例如：loop = null、loop = undefined
  if (!Array.isArray(loop)) {
    return false;
  }

  // 4️⃣ 设计态：只有非空数组才使用循环模式
  // 空数组返回 false → 渲染单个占位符组件
  // 非空数组返回 true → 正常循环渲染
  return loop.length > 0;
}
