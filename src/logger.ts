/**
 * 统一日志系统
 * 支持环境变量控制和不同日志级别
 * 
 * @fileoverview 提供统一的日志接口，支持生产环境日志控制
 * @author Augment Agent
 * @version 1.0.0
 */

/** 日志级别枚举 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

/** 日志配置接口 */
export interface LoggerConfig {
  /** 当前日志级别 */
  level: LogLevel;
  /** 是否启用时间戳 */
  enableTimestamp: boolean;
  /** 是否启用颜色输出 */
  enableColors: boolean;
  /** 日志前缀 */
  prefix?: string;
}

/** 默认日志配置 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  enableTimestamp: true,
  enableColors: true,
  prefix: ''
};

/**
 * 统一日志工具类
 * 根据环境变量自动调整日志级别
 */
export class Logger {
  private static config: LoggerConfig = { ...DEFAULT_CONFIG };
  private static isInitialized = false;

  /**
   * 初始化日志系统
   * 根据环境变量设置日志级别
   */
  private static init(): void {
    if (this.isInitialized) return;

    // 根据环境变量设置日志级别
    const envLevel = typeof globalThis !== 'undefined' && 
                    globalThis.process?.env?.LOG_LEVEL;
    
    if (envLevel) {
      switch (envLevel.toUpperCase()) {
        case 'DEBUG':
          this.config.level = LogLevel.DEBUG;
          break;
        case 'INFO':
          this.config.level = LogLevel.INFO;
          break;
        case 'WARN':
          this.config.level = LogLevel.WARN;
          break;
        case 'ERROR':
          this.config.level = LogLevel.ERROR;
          break;
        case 'NONE':
          this.config.level = LogLevel.NONE;
          break;
        default:
          this.config.level = LogLevel.INFO;
      }
    } else {
      // 生产环境默认只显示警告和错误
      this.config.level = LogLevel.WARN;
    }

    this.isInitialized = true;
  }

  /**
   * 设置日志配置
   */
  static configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    this.isInitialized = true;
  }

  /**
   * 格式化日志消息
   */
  private static formatMessage(level: string, message: string, prefix?: string): string {
    const parts: string[] = [];

    if (this.config.enableTimestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    parts.push(`[${level}]`);

    if (prefix || this.config.prefix) {
      parts.push(`[${prefix || this.config.prefix}]`);
    }

    parts.push(message);

    return parts.join(' ');
  }

  /**
   * 检查是否应该输出日志
   */
  private static shouldLog(level: LogLevel): boolean {
    this.init();
    return level >= this.config.level;
  }

  /**
   * 调试日志 - 仅在开发环境显示
   */
  static debug(message: string, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    console.log(this.formatMessage('DEBUG', message), ...args);
  }

  /**
   * 信息日志
   */
  static info(message: string, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    console.log(this.formatMessage('INFO', message), ...args);
  }

  /**
   * 警告日志
   */
  static warn(message: string, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.warn(this.formatMessage('WARN', message), ...args);
  }

  /**
   * 错误日志 - 始终显示
   */
  static error(message: string, error?: Error | any, ...args: any[]): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    if (error instanceof Error) {
      console.error(this.formatMessage('ERROR', message), error.message, error.stack, ...args);
    } else if (error) {
      console.error(this.formatMessage('ERROR', message), error, ...args);
    } else {
      console.error(this.formatMessage('ERROR', message), ...args);
    }
  }

  /**
   * 媒体处理专用日志 - 带emoji前缀
   */
  static media(message: string, ...args: any[]): void {
    this.debug(`🎬 ${message}`, ...args);
  }

  /**
   * Live图处理专用日志 - 带emoji前缀
   */
  static livePhoto(message: string, ...args: any[]): void {
    this.debug(`📸 ${message}`, ...args);
  }

  /**
   * 解析处理专用日志 - 带emoji前缀
   */
  static parse(message: string, ...args: any[]): void {
    this.debug(`🔍 ${message}`, ...args);
  }

  /**
   * 同步处理专用日志 - 带emoji前缀
   */
  static sync(message: string, ...args: any[]): void {
    this.info(`📝 ${message}`, ...args);
  }

  /**
   * 成功日志 - 带emoji前缀
   */
  static success(message: string, ...args: any[]): void {
    this.info(`✅ ${message}`, ...args);
  }

  /**
   * 失败日志 - 带emoji前缀
   */
  static failure(message: string, error?: Error | any, ...args: any[]): void {
    this.error(`❌ ${message}`, error, ...args);
  }

  /**
   * 进度日志 - 带进度信息
   */
  static progress(current: number, total: number, message: string, ...args: any[]): void {
    this.debug(`📊 [${current}/${total}] ${message}`, ...args);
  }

  /**
   * 批处理日志 - 带批次信息
   */
  static batch(batchNum: number, totalBatches: number, message: string, ...args: any[]): void {
    this.debug(`📦 [批次${batchNum}/${totalBatches}] ${message}`, ...args);
  }

  /**
   * 网络请求日志
   */
  static network(message: string, ...args: any[]): void {
    this.debug(`🌐 ${message}`, ...args);
  }

  /**
   * 缓存操作日志
   */
  static cache(message: string, ...args: any[]): void {
    this.debug(`💾 ${message}`, ...args);
  }

  /**
   * 配置日志
   */
  static configLog(message: string, ...args: any[]): void {
    this.debug(`⚙️ ${message}`, ...args);
  }

  /**
   * 获取当前日志级别
   */
  static getLevel(): LogLevel {
    this.init();
    return this.config.level;
  }

  /**
   * 设置日志级别
   */
  static setLevel(level: LogLevel): void {
    this.config.level = level;
  }
}

/**
 * 导出便捷的日志函数
 */
export const log = {
  debug: Logger.debug.bind(Logger),
  info: Logger.info.bind(Logger),
  warn: Logger.warn.bind(Logger),
  error: Logger.error.bind(Logger),
  media: Logger.media.bind(Logger),
  livePhoto: Logger.livePhoto.bind(Logger),
  parse: Logger.parse.bind(Logger),
  sync: Logger.sync.bind(Logger),
  success: Logger.success.bind(Logger),
  failure: Logger.failure.bind(Logger),
  progress: Logger.progress.bind(Logger),
  batch: Logger.batch.bind(Logger),
  network: Logger.network.bind(Logger),
  cache: Logger.cache.bind(Logger),
  config: Logger.configLog.bind(Logger)
};

// 默认导出Logger类
export default Logger;
