/**
 * @file History 历史记录系统
 * @description 管理操作历史，实现撤销（Undo）和重做（Redo）功能
 *
 * 📌 核心地位：
 * - History 是撤销/重做的核心实现
 * - 自动记录所有操作
 * - 管理历史栈
 *
 * 🎯 核心职责：
 * 1. 自动记录：MobX reaction 自动捕获变化
 * 2. 历史栈：Session 链表管理
 * 3. 撤销操作：go(cursor) 回到指定位置
 * 4. 重做操作：前进到下一个状态
 * 5. 状态管理：保存点、是否可撤销/重做
 * 6. 序列化：Schema 的序列化和反序列化
 *
 * 🏗️ 数据结构：
 * ```
 * History
 * ├── records: Session[]（历史记录数组）
 * │   ├── Session 0（初始状态）
 * │   ├── Session 1（操作1后）
 * │   ├── Session 2（操作2后）
 * │   └── Session 3（操作3后）← cursor
 * ├── cursor: 当前位置指针
 * └── point: 保存点标记
 * ```
 *
 * 🔄 工作流程：
 * ```
 * 1. 用户操作（添加节点）
 * 2. document 状态变化
 * 3. MobX reaction 检测到变化
 * 4. 调用 dataFn() 获取当前 Schema
 * 5. 序列化 Schema
 * 6. 检查是否与上次相同
 * 7. 不同则创建新 Session
 * 8. 添加到 records
 * 9. 更新 cursor
 * ```
 *
 * 🎨 Session 概念：
 * - Session 是一个时间窗口内的操作
 * - 1秒内的多次操作合并为一个 Session
 * - 避免历史记录过多
 *
 * 📚 设计要点：
 * 1. 时间窗口合并（timeGap: 1000ms）
 * 2. 去重（相同状态不记录）
 * 3. 分支裁剪（撤销后操作，清空后续历史）
 * 4. 序列化缓存（JSON.stringify）
 * 5. sleep/wakeup 机制（暂停记录）
 *
 * @example
 * ```typescript
 * // 创建历史记录
 * const history = new History(
 *   () => document.export(),  // 如何获取当前状态
 *   (schema) => document.import(schema),  // 如何恢复状态
 *   document
 * );
 *
 * // 撤销
 * history.back();
 *
 * // 重做
 * history.forward();
 *
 * // 监听状态变化
 * history.onStateChange(() => {
 *   console.log('历史状态变化');
 * });
 * ```
 */

import { reaction, untracked, IEventBus, createModuleEventBus } from '@alilc/lowcode-editor-core';
import { IPublicTypeNodeSchema, IPublicModelHistory, IPublicTypeDisposable } from '@alilc/lowcode-types';
import { Logger } from '@alilc/lowcode-utils';
import { IDocumentModel } from '../designer';

/**
 * History 日志记录器
 *
 * 配置：
 * - level: 'warn' - 只记录警告和错误
 * - bizName: 'history' - 业务标识
 */
const logger = new Logger({ level: 'warn', bizName: 'history' });

// ==================== Serialization 接口 ====================
/**
 * 序列化接口
 *
 * 泛型参数：
 * - K: 数据类型（默认 NodeSchema）
 * - T: 序列化后的类型（默认 string）
 *
 * 方法：
 * - serialize: 数据 -> 字符串
 * - unserialize: 字符串 -> 数据
 *
 * 默认实现：
 * - serialize: JSON.stringify
 * - unserialize: JSON.parse
 *
 * 为什么需要序列化？
 * - 减少内存占用（字符串比对象小）
 * - 便于比较（字符串直接比较）
 * - 便于存储（可以持久化）
 */
export interface Serialization<K = IPublicTypeNodeSchema, T = string> {
  serialize(data: K): T;  // 序列化
  unserialize(data: T): K;  // 反序列化
}

// ==================== IHistory 接口 ====================
/**
 * History 接口
 *
 * 继承：IPublicModelHistory
 *
 * 扩展方法：
 * - onStateChange: 监听历史状态变化
 */
export interface IHistory extends IPublicModelHistory {
  /**
   * 监听历史状态变化
   *
   * @param func - 回调函数
   * @returns 清理函数
   *
   * 触发时机：
   * - 可撤销状态变化
   * - 可重做状态变化
   */
  onStateChange(func: () => any): IPublicTypeDisposable;
}

// ==================== History 类 ====================
/**
 * 历史记录类
 *
 * 职责：
 * - 自动记录操作历史
 * - 提供撤销/重做
 * - 管理历史栈
 *
 * 泛型参数：
 * - T: 记录的数据类型（默认 NodeSchema）
 */
export class History<T = IPublicTypeNodeSchema> implements IHistory {
  /**
   * 当前会话
   *
   * 说明：
   * - 当前时间窗口内的操作
   * - 1秒内的操作合并到一个 Session
   */
  private session: Session;

  /**
   * 历史记录数组
   *
   * 结构：
   * - 每个 Session 是一个历史记录
   * - 按时间顺序排列
   */
  private records: Session[];

  /**
   * 保存点标记
   *
   * 用途：
   * - 标记最后一次保存的位置
   * - 判断是否有未保存的修改
   * - isSavePoint() 使用
   */
  private point = 0;

  /**
   * 事件总线
   *
   * 用途：
   * - 发送 statechange 事件
   * - 通知历史状态变化
   */
  private emitter: IEventBus = createModuleEventBus('History');

  /**
   * 休眠标志
   *
   * 说明：
   * - true: 暂停记录
   * - false: 正常记录
   *
   * 用途：
   * - 撤销/重做时暂停记录
   * - 批量操作时暂停记录
   * - 避免记录不必要的历史
   */
  private asleep = false;

  /**
   * 序列化器
   *
   * 默认实现：
   * - serialize: JSON.stringify
   * - unserialize: JSON.parse
   *
   * 可自定义：
   * - 提供更高效的序列化方式
   * - 如：压缩、二进制等
   */
  private currentSerialization: Serialization<T, string> = {
    serialize(data: T): string {
      return JSON.stringify(data);
    },
    unserialize(data: string) {
      return JSON.parse(data);
    },
  };

  /**
   * 获取当前会话的数据
   *
   * 用途：
   * - 获取最新的序列化数据
   * - 用于比较是否变化
   */
  get hotData() {
    return this.session.data;
  }

  /**
   * 时间窗口间隔（毫秒）
   *
   * 值：1000ms（1秒）
   *
   * 说明：
   * - 1秒内的操作合并为一个 Session
   * - 避免历史记录过多
   *
   * 为什么是1秒？
   * - 用户连续操作通常在1秒内
   * - 撤销时按操作组撤销更合理
   * - 平衡记录粒度和数量
   */
  private timeGap: number = 1000;

  // ========== 构造函数 ==========
  /**
   * 构造 History 实例
   *
   * @param dataFn - 获取当前状态的函数
   * @param redoer - 恢复状态的函数
   * @param document - 文档引用（可选）
   *
   * 初始化：
   * 1. 创建初始 Session
   * 2. 设置 MobX reaction
   * 3. 自动记录状态变化
   *
   * MobX reaction：
   * - 自动追踪 dataFn 的依赖
   * - 依赖变化时自动执行
   * - 实现自动记录
   */
  constructor(
      dataFn: () => T | null,  // 如何获取当前状态
      private redoer: (data: T) => void,  // 如何恢复状态
      private document?: IDocumentModel,  // 文档引用
    ) {
    // 创建初始 Session
    this.session = new Session(0, null, this.timeGap);
    this.records = [this.session];

    // 设置 MobX reaction：自动记录状态变化
    reaction((): any => {
      return dataFn();  // 追踪 dataFn 的依赖
    }, (data: T) => {
      // 休眠中，不记录
      if (this.asleep) return;

      untracked(() => {
        // 序列化数据
        const log = this.currentSerialization.serialize(data);

        // 去重：与上次相同，不记录
        if (this.session.data === log) {
          return;
        }

        // 判断是否在活跃时间窗口内
        if (this.session.isActive()) {
          // 在窗口内，更新当前 Session
          this.session.log(log);
        } else {
          // 超出窗口，创建新 Session
          this.session.end();
          const lastState = this.getState();
          const cursor = this.session.cursor + 1;
          const session = new Session(cursor, log, this.timeGap);
          this.session = session;
          // 裁剪分支：移除 cursor 后的历史
          this.records.splice(cursor, this.records.length - cursor, session);
          const currentState = this.getState();
          // 状态变化，发送事件
          if (currentState !== lastState) {
            this.emitter.emit('statechange', currentState);
          }
        }
      });
    }, { fireImmediately: true });  // 立即执行一次
  }

  setSerialization(serialization: Serialization<T, string>) {
    this.currentSerialization = serialization;
  }

  isSavePoint(): boolean {
    return this.point !== this.session.cursor;
  }

  private sleep() {
    this.asleep = true;
  }

  private wakeup() {
    this.asleep = false;
  }

  go(originalCursor: number) {
    this.session.end();

    let cursor = originalCursor;
    cursor = +cursor;
    if (cursor < 0) {
      cursor = 0;
    } else if (cursor >= this.records.length) {
      cursor = this.records.length - 1;
    }

    const currentCursor = this.session.cursor;
    if (cursor === currentCursor) {
      return;
    }

    const session = this.records[cursor];
    const hotData = session.data;

    this.sleep();
    try {
      this.redoer(this.currentSerialization.unserialize(hotData));
      this.emitter.emit('cursor', hotData);
    } catch (e) /* istanbul ignore next */ {
      logger.error(e);
    }

    this.wakeup();
    this.session = session;

    this.emitter.emit('statechange', this.getState());
  }

  back() {
    if (!this.session) {
      return;
    }
    const cursor = this.session.cursor - 1;
    this.go(cursor);
    const editor = this.document?.designer.editor;
    if (!editor) {
      return;
    }
    editor.eventBus.emit('history.back', cursor);
  }

  forward() {
    if (!this.session) {
      return;
    }
    const cursor = this.session.cursor + 1;
    this.go(cursor);
    const editor = this.document?.designer.editor;
    if (!editor) {
      return;
    }
    editor.eventBus.emit('history.forward', cursor);
  }

  savePoint() {
    if (!this.session) {
      return;
    }
    this.session.end();
    this.point = this.session.cursor;
    this.emitter.emit('statechange', this.getState());
  }

  /**
   *  |    1     |     1    |    1     |
   *  | -------- | -------- | -------- |
   *  | modified | redoable | undoable |
   */
  getState(): number {
    const { cursor } = this.session;
    let state = 7;
    // undoable ?
    if (cursor <= 0) {
      state -= 1;
    }
    // redoable ?
    if (cursor >= this.records.length - 1) {
      state -= 2;
    }
    // modified ?
    if (this.point === cursor) {
      state -= 4;
    }
    return state;
  }

  /**
   * 监听 state 变更事件
   * @param func
   * @returns
   */
  onChangeState(func: () => any): IPublicTypeDisposable {
    return this.onStateChange(func);
  }

  onStateChange(func: () => any): IPublicTypeDisposable {
    this.emitter.on('statechange', func);
    return () => {
      this.emitter.removeListener('statechange', func);
    };
  }

  /**
   * 监听历史记录游标位置变更事件
   * @param func
   * @returns
   */
  onChangeCursor(func: () => any): IPublicTypeDisposable {
    return this.onCursor(func);
  }

  onCursor(func: () => any): () => void {
    this.emitter.on('cursor', func);
    return () => {
      this.emitter.removeListener('cursor', func);
    };
  }

  destroy() {
    this.emitter.removeAllListeners();
    this.records = [];
  }

  /**
   *
   * @deprecated
   * @returns
   * @memberof History
   */
  isModified() {
    return this.isSavePoint();
  }
}

export class Session {
  private _data: any;

  private activeTimer: any;

  get data() {
    return this._data;
  }

  constructor(readonly cursor: number, data: any, private timeGap: number = 1000) {
    this.setTimer();
    this.log(data);
  }

  log(data: any) {
    if (!this.isActive()) {
      return;
    }
    this._data = data;
    this.setTimer();
  }

  isActive() {
    return this.activeTimer != null;
  }

  end() {
    if (this.isActive()) {
      this.clearTimer();
    }
  }

  private setTimer() {
    this.clearTimer();
    this.activeTimer = setTimeout(() => this.end(), this.timeGap);
  }

  private clearTimer() {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
    }
    this.activeTimer = null;
  }
}
