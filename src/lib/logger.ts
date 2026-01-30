/**
 * 统一的日志工具模块
 * 支持不同级别的日志输出,并可在生产环境中禁用调试日志
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

class Logger {
  private minLevel: LogLevel = LogLevel.DEBUG
  private prefix: string = '[AnotherMonkey]'

  constructor() {
    // 在生产构建中,只显示警告和错误
    // Plasmo 会在构建时注入 __DEV__ 变量
    if (typeof globalThis !== 'undefined' && !(globalThis as any).__DEV__) {
      this.minLevel = LogLevel.WARN
    }
  }

  /**
   * 设置最小日志级别
   */
  setMinLevel(level: LogLevel) {
    this.minLevel = level
  }

  /**
   * 格式化日志消息
   */
  private format(level: string, color: string, args: any[]): any[] {
    const timestamp = new Date().toISOString().substring(11, 23)
    return [
      `%c${this.prefix}%c [${timestamp}] %c${level}%c`,
      'color: #10b981; font-weight: bold',
      'color: #6b7280',
      `color: ${color}; font-weight: bold`,
      'color: inherit',
      ...args
    ]
  }

  /**
   * 调试日志 - 仅开发环境
   */
  debug(...args: any[]) {
    if (this.minLevel <= LogLevel.DEBUG) {
      console.log(...this.format('DEBUG', '#3b82f6', args))
    }
  }

  /**
   * 信息日志
   */
  info(...args: any[]) {
    if (this.minLevel <= LogLevel.INFO) {
      console.log(...this.format('INFO', '#10b981', args))
    }
  }

  /**
   * 警告日志
   */
  warn(...args: any[]) {
    if (this.minLevel <= LogLevel.WARN) {
      console.warn(...this.format('WARN', '#f59e0b', args))
    }
  }

  /**
   * 错误日志
   */
  error(...args: any[]) {
    if (this.minLevel <= LogLevel.ERROR) {
      console.error(...this.format('ERROR', '#ef4444', args))
    }
  }

  /**
   * GM_log 样式的日志输出
   */
  gmLog(message: string) {
    if (this.minLevel <= LogLevel.INFO) {
      console.log(
        `%c${this.prefix}%c [GM_log] ${message}`,
        'color: #10b981; font-weight: bold',
        'color: inherit'
      )
    }
  }
}

// 导出单例
export const logger = new Logger()

// 也导出类以便需要时创建独立实例
export { Logger }
