/**
 * @file Skeleton Context 上下文
 * @description 创建 React Context 用于在组件树中传递 Skeleton 实例
 *
 * 作用：
 * - 提供 Skeleton 实例的全局访问
 * - 避免 props 层层传递（prop drilling）
 * - 实现组件与 Skeleton 的解耦
 *
 * 使用场景：
 * - Workbench 组件提供 Context.Provider
 * - 子组件通过 useContext(SkeletonContext) 获取 skeleton 实例
 * - 面板、Widget 等组件需要访问 skeleton 方法
 *
 * 技术要点：
 * - React Context API
 * - TypeScript 泛型约束
 * - 默认值为空对象（需要断言）
 *
 * @example
 * ```tsx
 * // 提供 Context
 * <SkeletonContext.Provider value={skeleton}>
 *   <Workbench />
 * </SkeletonContext.Provider>
 *
 * // 使用 Context
 * function MyPanel() {
 *   const skeleton = useContext(SkeletonContext);
 *   skeleton.add({ area: 'leftArea', ... });
 * }
 * ```
 */

import { createContext } from 'react';
import { ISkeleton } from './skeleton';

/**
 * Skeleton Context 上下文对象
 *
 * 类型参数：
 * - ISkeleton: Skeleton 接口类型
 *
 * 默认值：
 * - {} as any: 空对象作为默认值（类型断言）
 * - 实际使用时必须提供真实的 Skeleton 实例
 *
 * 为什么默认值是空对象？
 * - React Context 要求提供默认值
 * - Skeleton 实例在运行时创建，编译时无法提供
 * - 使用 as any 绕过类型检查
 *
 * 注意事项：
 * - 必须在 Provider 中提供真实的 skeleton 实例
 * - 否则组件会获取到空对象，导致运行时错误
 * - 可以通过 useContext 时检查是否为空来增强健壮性
 *
 * 改进建议：
 * ```typescript
 * // 更安全的使用方式
 * function useSkeleton() {
 *   const skeleton = useContext(SkeletonContext);
 *   if (!skeleton || !skeleton.add) {
 *     throw new Error('SkeletonContext must be used within a Provider');
 *   }
 *   return skeleton;
 * }
 * ```
 */
export const SkeletonContext = createContext<ISkeleton>({} as any);
