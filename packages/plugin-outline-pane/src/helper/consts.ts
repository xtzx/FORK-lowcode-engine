/**
 * @file 大纲树插件常量定义
 * @description 定义插件使用的常量，主要是面板名称
 *
 * 作用：
 * - 统一管理面板名称
 * - 避免硬编码字符串
 * - 便于维护和重构
 *
 * 面板说明：
 * - MasterPane: 主面板，显示在左侧区域
 * - BackupPane: 备份面板，显示在右侧区域
 */

/**
 * 备份面板名称常量
 *
 * 值：'outline-backup-pane'
 *
 * 用途：
 * - 创建备份面板时使用
 * - 显示/隐藏备份面板时使用
 * - 事件监听中判断面板类型
 *
 * 备份面板特点：
 * - 位于右侧区域
 * - 初始隐藏
 * - 拖拽时自动显示
 * - 与主面板共享数据
 */
export const BackupPaneName = 'outline-backup-pane';

/**
 * 主面板名称常量
 *
 * 值：'outline-master-pane'
 *
 * 用途：
 * - 创建主面板时使用
 * - 显示/隐藏主面板时使用
 * - 事件监听中判断面板类型
 *
 * 主面板特点：
 * - 位于左侧区域
 * - 默认显示
 * - 用户可以固定或浮动
 * - 常驻面板
 */
export const MasterPaneName = 'outline-master-pane';