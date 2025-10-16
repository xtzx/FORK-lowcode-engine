/**
 * @file 模拟器渲染器入口文件
 * @description 导出渲染器单例，挂载到 window，监听页面卸载事件
 *
 * 作用：
 * 1. 导出渲染器实例供外部使用
 * 2. 将渲染器挂载到 window.SimulatorRenderer
 * 3. 监听页面卸载事件，清理资源
 * 4. 防止内存泄漏
 *
 * 使用场景：
 * - 这是整个包的对外接口
 * - iframe 加载此文件后会自动初始化
 * - 设计器通过 window.SimulatorRenderer 访问渲染器
 *
 * 生命周期：
 * 1. 加载：创建渲染器实例
 * 2. 挂载：挂载到 window
 * 3. 运行：设计器调用 renderer.run()
 * 4. 卸载：监听 beforeunload，清理资源
 */

import { runInAction } from 'mobx';  // MobX 的 action 包装函数
import renderer from './renderer';  // 渲染器单例

/**
 * 将渲染器挂载到 window 全局对象
 *
 * 为什么要挂载到 window？
 * - iframe 与父窗口通过 window 对象通信
 * - 设计器需要访问渲染器的方法和属性
 * - 便于调试和检查
 *
 * 环境检查：
 * - typeof window !== 'undefined' 确保在浏览器环境
 * - 避免在 Node.js 环境（如 SSR）执行
 */
if (typeof window !== 'undefined') {
  // 将渲染器实例挂载到 window.SimulatorRenderer
  // 设计器会通过 iframe.contentWindow.SimulatorRenderer 访问
  (window as any).SimulatorRenderer = renderer;
}

/**
 * 监听页面卸载事件，清理资源
 *
 * beforeunload 事件触发时机：
 * - 用户关闭标签页
 * - 用户刷新页面
 * - 导航到其他页面
 * - iframe 被从 DOM 移除
 *
 * 为什么需要清理？
 * - 避免内存泄漏
 * - 取消事件监听
 * - 断开与设计器的连接
 * - 卸载 React 组件
 *
 * 使用 runInAction 的原因：
 * - MobX 要求修改 observable 状态必须在 action 中
 * - 确保状态变更的原子性
 * - 避免触发多余的响应式更新
 */
window.addEventListener('beforeunload', () => {
  // 在 MobX action 中执行清理逻辑
  runInAction(() => {
    // ===== 第1步：清空 host 引用 =====
    // LCSimulatorHost 是设计器注入的宿主对象
    // 设置为 null 断开连接，帮助 GC 回收
    (window as any).LCSimulatorHost = null;

    // ===== 第2步：销毁渲染器 =====
    // dispose() 方法会：
    // 1. 执行所有注册的清理函数
    // 2. 销毁所有文档实例
    // 3. 清空组件映射和上下文
    //
    // ?. 可选链操作符：如果 dispose 方法存在才调用
    renderer.dispose?.();

    // ===== 第3步：清空 window 引用 =====
    // 从 window 移除渲染器引用
    // 帮助垃圾回收器回收内存
    (window as any).SimulatorRenderer = null;

    // ===== 第4步：卸载 React 组件 =====
    // unmountComponentAtNode 会：
    // 1. 调用所有组件的 componentWillUnmount
    // 2. 清空容器的 DOM
    // 3. 移除事件监听器
    //
    // 注意：React 18+ 应该使用 root.unmount()
    // 但这里为了兼容性仍使用旧 API
    (window as any).ReactDOM.unmountComponentAtNode(document.getElementById('app'));
  });
});

/**
 * 导出渲染器单例
 *
 * 这是整个包的默认导出
 * 外部可以通过以下方式访问：
 *
 * 1. ES Module 导入：
 * ```typescript
 * import renderer from '@alilc/lowcode-react-simulator-renderer';
 * ```
 *
 * 2. window 全局对象：
 * ```typescript
 * window.SimulatorRenderer
 * ```
 *
 * 3. iframe 引用（设计器中）：
 * ```typescript
 * iframe.contentWindow.SimulatorRenderer
 * ```
 *
 * 渲染器接口：
 * - run(): 启动渲染器
 * - dispose(): 销毁渲染器
 * - rerender(): 刷新渲染
 * - components: 获取组件映射
 * - documentInstances: 获取文档实例
 * - history: 内存路由
 * - ... 其他方法和属性
 */
export default renderer;
