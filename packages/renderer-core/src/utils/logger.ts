/**
 * ========================================
 * 渲染器日志模块
 * ========================================
 *
 * 🎯 核心职责：
 * 提供统一的日志记录器，用于渲染器的调试和错误追踪
 *
 * 📋 日志级别：
 * - debug: 详细调试信息
 * - log: 一般日志信息
 * - info: 提示性信息
 * - warn: 警告信息（当前级别）
 * - error: 错误信息
 *
 * 🔧 配置说明：
 * - level: 'warn' - 只输出 warn 和 error 级别的日志
 * - bizName: 'renderer' - 业务标识，日志会带上 [renderer] 前缀
 *
 * 💡 使用方式：
 * import logger from './logger';
 * logger.warn('组件未找到', componentName);
 * logger.error('渲染异常', error);
 */

import { Logger } from '@alilc/lowcode-utils';

// 📤 导出渲染器专用的日志实例
export default new Logger({
  level: 'warn',      // 日志级别：warn（生产环境减少日志输出）
  bizName: 'renderer' // 业务名称：用于日志分类和过滤
});