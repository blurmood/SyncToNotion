/**
 * 分批处理管理器
 * 解决Cloudflare Workers的50个subrequest限制问题
 * 
 * @fileoverview 批量处理媒体文件，支持续传机制
 * @author Augment Agent
 * @version 1.0.0
 */

import { processMediaFile } from './media.js';
import { imageHostService } from './imageHost.js';
import type { WorkerEnv } from './index.js';

// ==================== 类型定义 ====================

/** 处理任务状态 */
export interface ProcessingTask {
  /** 任务ID */
  taskId: string;
  /** 原始解析数据 */
  originalData: any;
  /** 总批次数 */
  totalBatches: number;
  /** 已完成批次数 */
  completedBatches: number;
  /** 当前批次 */
  currentBatch: number;
  /** 批次大小 */
  batchSize: number;
  /** 已处理结果 */
  processedResults: {
    videos?: string[];
    images?: string[];
  };
  /** 待处理项目 */
  pendingItems: {
    videos?: string[];
    images?: string[];
  };
  /** 任务状态 */
  status: 'processing' | 'completed' | 'failed' | 'partial';
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  lastUpdated: string;
  /** 过期时间 */
  expiresAt: string;
  /** Notion页面信息 */
  notionInfo?: {
    pageId: string;
    pageUrl: string;
  };
}

/** 批次处理结果 */
export interface BatchProcessResult {
  /** 处理的项目 */
  processedItems: {
    videos?: string[];
    images?: string[];
  };
  /** 是否完成 */
  isComplete: boolean;
  /** 批次信息 */
  batchInfo: {
    current_batch: number;
    total_batches: number;
    completed_batches: number;
    batch_size: number;
  };
  /** 处理详情 */
  details?: {
    success_count: number;
    failed_count: number;
    errors?: string[];
  };
}

/** 媒体项目 */
interface MediaItem {
  type: 'video' | 'image';
  url: string;
  index: number;
}

// ==================== 分批处理管理器 ====================

export class BatchProcessingManager {
  private env: WorkerEnv;
  private readonly TASK_PREFIX = 'batch_task:';
  private readonly TASK_EXPIRY = 3600; // 1小时过期
  private readonly DEFAULT_VIDEO_BATCH_SIZE = 12; // 视频批次大小
  private readonly DEFAULT_IMAGE_BATCH_SIZE = 15; // 图片批次大小

  constructor(env: WorkerEnv) {
    this.env = env;
  }

  /**
   * 创建新的处理任务
   * @param originalData - 原始解析数据
   * @param totalItems - 待处理项目
   * @param customBatchSize - 自定义批次大小
   * @returns 任务ID
   */
  async createTask(
    originalData: any,
    totalItems: { videos?: string[], images?: string[] },
    customBatchSize?: number
  ): Promise<string> {
    const taskId = crypto.randomUUID();
    
    const totalVideos = totalItems.videos?.length || 0;
    const totalImages = totalItems.images?.length || 0;
    
    // 智能计算批次大小和总批次数
    const videoBatchSize = customBatchSize || this.DEFAULT_VIDEO_BATCH_SIZE;
    const imageBatchSize = customBatchSize || this.DEFAULT_IMAGE_BATCH_SIZE;
    
    const videoBatches = totalVideos > 0 ? Math.ceil(totalVideos / videoBatchSize) : 0;
    const imageBatches = totalImages > 0 ? Math.ceil(totalImages / imageBatchSize) : 0;
    const totalBatches = Math.max(videoBatches, imageBatches);

    const task: ProcessingTask = {
      taskId,
      originalData,
      totalBatches,
      completedBatches: 0,
      currentBatch: 1,
      batchSize: videoBatchSize, // 主要以视频批次大小为准
      processedResults: { videos: [], images: [] },
      pendingItems: {
        videos: totalItems.videos ? [...totalItems.videos] : [],
        images: totalItems.images ? [...totalItems.images] : []
      },
      status: 'processing',
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.TASK_EXPIRY * 1000).toISOString()
    };

    await this.env.CACHE_KV.put(
      `${this.TASK_PREFIX}${taskId}`,
      JSON.stringify(task),
      { expirationTtl: this.TASK_EXPIRY }
    );

    return taskId;
  }

  /**
   * 获取任务信息
   * @param taskId - 任务ID
   * @returns 任务信息
   */
  async getTask(taskId: string): Promise<ProcessingTask | null> {
    const taskData = await this.env.CACHE_KV.get(`${this.TASK_PREFIX}${taskId}`);
    return taskData ? JSON.parse(taskData) : null;
  }

  /**
   * 更新任务信息
   * @param task - 任务信息
   */
  async updateTask(task: ProcessingTask): Promise<void> {
    task.lastUpdated = new Date().toISOString();
    await this.env.CACHE_KV.put(
      `${this.TASK_PREFIX}${task.taskId}`,
      JSON.stringify(task),
      { expirationTtl: this.TASK_EXPIRY }
    );
  }

  /**
   * 删除任务
   * @param taskId - 任务ID
   */
  async deleteTask(taskId: string): Promise<void> {
    await this.env.CACHE_KV.delete(`${this.TASK_PREFIX}${taskId}`);
  }

  /**
   * 处理下一批次
   * @param taskId - 任务ID
   * @returns 处理结果
   */
  async processNextBatch(taskId: string): Promise<BatchProcessResult> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error('任务不存在或已过期');
    }

    if (task.status === 'completed') {
      return {
        processedItems: { videos: [], images: [] },
        isComplete: true,
        batchInfo: {
          current_batch: task.completedBatches,
          total_batches: task.totalBatches,
          completed_batches: task.completedBatches,
          batch_size: task.batchSize
        }
      };
    }

    // 获取当前批次要处理的项目
    const currentBatchItems = this.getCurrentBatchItems(task);
    
    if (currentBatchItems.length === 0) {
      task.status = 'completed';
      await this.updateTask(task);
      return {
        processedItems: { videos: [], images: [] },
        isComplete: true,
        batchInfo: {
          current_batch: task.completedBatches,
          total_batches: task.totalBatches,
          completed_batches: task.completedBatches,
          batch_size: task.batchSize
        }
      };
    }

    // 处理当前批次
    const processResult = await this.processBatchItems(currentBatchItems, task);

    // 更新任务状态
    task.completedBatches++;
    task.currentBatch++;

    // 更新已处理结果
    if (processResult.videos && processResult.videos.length > 0) {
      task.processedResults.videos!.push(...processResult.videos);
    }
    if (processResult.images && processResult.images.length > 0) {
      task.processedResults.images!.push(...processResult.images);
    }

    // 从待处理列表中移除已处理的项目
    this.removeProcessedItems(task, currentBatchItems);

    // 检查是否完成
    const isComplete = task.completedBatches >= task.totalBatches ||
                      (task.pendingItems.videos!.length === 0 && task.pendingItems.images!.length === 0);

    if (isComplete) {
      task.status = 'completed';
    }

    // 添加延迟以避免KV频率限制
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.updateTask(task);

    return {
      processedItems: {
        videos: processResult.videos,
        images: processResult.images
      },
      isComplete,
      batchInfo: {
        current_batch: task.currentBatch - 1,
        total_batches: task.totalBatches,
        completed_batches: task.completedBatches,
        batch_size: currentBatchItems.length
      },
      details: processResult.details
    };
  }

  /**
   * 获取当前批次要处理的项目
   * @param task - 任务信息
   * @returns 当前批次项目
   */
  private getCurrentBatchItems(task: ProcessingTask): MediaItem[] {
    const items: MediaItem[] = [];
    const videosPerBatch = this.DEFAULT_VIDEO_BATCH_SIZE;

    // 直接从待处理列表的开头取项目（因为已处理的项目已被移除）
    // 优先处理视频
    if (task.pendingItems.videos && task.pendingItems.videos.length > 0) {
      const videosToProcess = Math.min(videosPerBatch, task.pendingItems.videos.length);

      for (let i = 0; i < videosToProcess; i++) {
        items.push({
          type: 'video',
          url: task.pendingItems.videos[i],
          index: i
        });
      }
    }

    // 如果当前批次还有空间，添加图片
    const remainingSpace = Math.max(0, videosPerBatch - items.length);
    if (remainingSpace > 0 && task.pendingItems.images && task.pendingItems.images.length > 0) {
      const imagesToProcess = Math.min(remainingSpace, task.pendingItems.images.length);

      for (let i = 0; i < imagesToProcess; i++) {
        items.push({
          type: 'image',
          url: task.pendingItems.images[i],
          index: i
        });
      }
    }

    return items;
  }

  /**
   * 处理批次项目
   * @param items - 批次项目
   * @param task - 任务信息
   * @returns 处理结果
   */
  private async processBatchItems(items: MediaItem[], task: ProcessingTask): Promise<{
    videos: string[];
    images: string[];
    details: {
      success_count: number;
      failed_count: number;
      errors: string[];
    };
  }> {
    const processedVideos: string[] = [];
    const processedImages: string[] = [];
    const errors: string[] = [];
    let successCount = 0;
    let failedCount = 0;

    // 设置图床服务环境
    imageHostService.setEnv(this.env);

    // 并发处理当前批次的项目
    const results = await Promise.all(
      items.map(async (item, batchIndex) => {
        const key = `${task.taskId}_${item.type}_${Date.now()}_${batchIndex}`;

        try {
          const processedUrl = await processMediaFile(
            item.url,
            null,
            key,
            {
              isLivePhoto: item.type === 'video',
              timeout: 45000 // 45秒超时
            }
          );

          successCount++;
          return {
            type: item.type,
            originalUrl: item.url,
            processedUrl,
            success: true,
            index: item.index
          };
        } catch (error) {
          failedCount++;
          const errorMsg = `${item.type}${item.index}处理失败: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);

          return {
            type: item.type,
            originalUrl: item.url,
            processedUrl: item.url, // 失败时返回原始URL
            success: false,
            error: errorMsg,
            index: item.index
          };
        }
      })
    );

    // 分类处理结果
    results.forEach(result => {
      if (result.type === 'video') {
        processedVideos.push(result.processedUrl);
      } else if (result.type === 'image') {
        processedImages.push(result.processedUrl);
      }
    });

    return {
      videos: processedVideos,
      images: processedImages,
      details: {
        success_count: successCount,
        failed_count: failedCount,
        errors
      }
    };
  }

  /**
   * 从待处理列表中移除已处理的项目
   * @param task - 任务信息
   * @param processedItems - 已处理项目
   */
  private removeProcessedItems(task: ProcessingTask, processedItems: MediaItem[]): void {
    // 创建要删除的URL集合，避免索引问题
    const processedVideoUrls = new Set(
      processedItems.filter(item => item.type === 'video').map(item => item.url)
    );
    const processedImageUrls = new Set(
      processedItems.filter(item => item.type === 'image').map(item => item.url)
    );

    // 从视频列表中移除已处理的项目
    if (task.pendingItems.videos && processedVideoUrls.size > 0) {
      task.pendingItems.videos = task.pendingItems.videos.filter(url => !processedVideoUrls.has(url));
    }

    // 从图片列表中移除已处理的项目
    if (task.pendingItems.images && processedImageUrls.size > 0) {
      task.pendingItems.images = task.pendingItems.images.filter(url => !processedImageUrls.has(url));
    }
  }

  /**
   * 获取任务进度信息
   * @param taskId - 任务ID
   * @returns 进度信息
   */
  async getTaskProgress(taskId: string): Promise<{
    task_id: string;
    status: string;
    progress: {
      completed_batches: number;
      total_batches: number;
      percentage: number;
    };
    processed_items: {
      videos: number;
      images: number;
    };
    remaining_items: {
      videos: number;
      images: number;
    };
    created_at: string;
    last_updated: string;
    estimated_time_remaining?: string;
  } | null> {
    const task = await this.getTask(taskId);
    if (!task) {
      return null;
    }

    const processedVideos = task.processedResults.videos?.length || 0;
    const processedImages = task.processedResults.images?.length || 0;
    const remainingVideos = task.pendingItems.videos?.length || 0;
    const remainingImages = task.pendingItems.images?.length || 0;

    // 估算剩余时间（基于平均处理时间）
    const avgTimePerBatch = 30; // 假设每批次30秒
    const remainingBatches = task.totalBatches - task.completedBatches;
    const estimatedSeconds = remainingBatches * avgTimePerBatch;
    const estimatedTime = estimatedSeconds > 0 ? `${estimatedSeconds}s` : undefined;

    return {
      task_id: taskId,
      status: task.status,
      progress: {
        completed_batches: task.completedBatches,
        total_batches: task.totalBatches,
        percentage: task.totalBatches > 0 ? Math.round((task.completedBatches / task.totalBatches) * 100) : 100
      },
      processed_items: {
        videos: processedVideos,
        images: processedImages
      },
      remaining_items: {
        videos: remainingVideos,
        images: remainingImages
      },
      created_at: task.createdAt,
      last_updated: task.lastUpdated,
      estimated_time_remaining: estimatedTime
    };
  }

  /**
   * 检查是否需要分批处理
   * @param videos - 视频数组
   * @param images - 图片数组
   * @returns 是否需要分批处理
   */
  static shouldUseBatchProcessing(videos?: string[], images?: string[]): boolean {
    const videoCount = videos?.length || 0;
    const imageCount = images?.length || 0;

    // 视频超过12个或图片超过15个时启用分批处理
    return videoCount > 12 || imageCount > 15;
  }

  /**
   * 计算预估的subrequest数量
   * @param videos - 视频数组
   * @param images - 图片数组
   * @returns 预估的subrequest数量
   */
  static estimateSubrequests(videos?: string[], images?: string[]): number {
    const videoCount = videos?.length || 0;
    const imageCount = images?.length || 0;

    // 每个媒体文件大约需要2-3个请求（HEAD + GET + POST）
    return (videoCount + imageCount) * 3;
  }
}
