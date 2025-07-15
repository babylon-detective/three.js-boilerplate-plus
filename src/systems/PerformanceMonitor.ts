import { logger, LogModule } from './Logger'

export interface PerformanceMetrics {
  fps: number
  frameTime: number
  collisionChecks: number
  collisionTime: number
  renderTime: number
  memoryUsage?: number
  timestamp: number
}

export class PerformanceMonitor {
  private frameCount: number = 0
  private lastTime: number = 0
  private fpsHistory: number[] = []
  private frameTimeHistory: number[] = []
  private collisionChecks: number = 0
  private collisionTime: number = 0
  private renderTime: number = 0
  private isEnabled: boolean = false
  private logInterval: number = 5000 // Log every 5 seconds
  private lastLogTime: number = 0

  constructor() {
    this.lastTime = performance.now()
  }

  /**
   * Enable performance monitoring
   */
  public enable(): void {
    this.isEnabled = true
    logger.info(LogModule.PERFORMANCE, 'Performance monitoring enabled')
  }

  /**
   * Disable performance monitoring
   */
  public disable(): void {
    this.isEnabled = false
    logger.info(LogModule.PERFORMANCE, 'Performance monitoring disabled')
  }

  /**
   * Start frame timing
   */
  public startFrame(): void {
    if (!this.isEnabled) return
    
    this.lastTime = performance.now()
  }

  /**
   * End frame timing and calculate metrics
   */
  public endFrame(): void {
    if (!this.isEnabled) return

    const currentTime = performance.now()
    const frameTime = currentTime - this.lastTime
    const fps = 1000 / frameTime

    this.frameCount++
    this.fpsHistory.push(fps)
    this.frameTimeHistory.push(frameTime)

    // Keep only last 60 frames for averaging
    if (this.fpsHistory.length > 60) {
      this.fpsHistory.shift()
      this.frameTimeHistory.shift()
    }

    // Log performance metrics periodically
    if (currentTime - this.lastLogTime > this.logInterval) {
      this.logPerformanceMetrics()
      this.lastLogTime = currentTime
    }
  }

  /**
   * Start collision timing
   */
  public startCollisionCheck(): void {
    if (!this.isEnabled) return
    this.collisionChecks++
    this.collisionTime = performance.now()
  }

  /**
   * End collision timing
   */
  public endCollisionCheck(): void {
    if (!this.isEnabled) return
    this.collisionTime = performance.now() - this.collisionTime
  }

  /**
   * Start render timing
   */
  public startRender(): void {
    if (!this.isEnabled) return
    this.renderTime = performance.now()
  }

  /**
   * End render timing
   */
  public endRender(): void {
    if (!this.isEnabled) return
    this.renderTime = performance.now() - this.renderTime
  }

  /**
   * Get current performance metrics
   */
  public getMetrics(): PerformanceMetrics {
    const avgFps = this.fpsHistory.length > 0 
      ? this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length 
      : 0
    
    const avgFrameTime = this.frameTimeHistory.length > 0
      ? this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length
      : 0

    return {
      fps: Math.round(avgFps),
      frameTime: Math.round(avgFrameTime * 100) / 100,
      collisionChecks: this.collisionChecks,
      collisionTime: Math.round(this.collisionTime * 100) / 100,
      renderTime: Math.round(this.renderTime * 100) / 100,
      memoryUsage: this.getMemoryUsage(),
      timestamp: performance.now()
    }
  }

  /**
   * Log performance metrics
   */
  private logPerformanceMetrics(): void {
    const metrics = this.getMetrics()
    
    logger.info(LogModule.PERFORMANCE, `Performance Metrics:
      FPS: ${metrics.fps}
      Frame Time: ${metrics.frameTime}ms
      Collision Checks: ${metrics.collisionChecks}
      Collision Time: ${metrics.collisionTime}ms
      Render Time: ${metrics.renderTime}ms
      Memory: ${metrics.memoryUsage ? `${Math.round(metrics.memoryUsage / 1024 / 1024 * 100) / 100}MB` : 'N/A'}
    `)

    // Reset collision check counter
    this.collisionChecks = 0
  }

  /**
   * Get memory usage if available
   */
  private getMemoryUsage(): number | undefined {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize
    }
    return undefined
  }

  /**
   * Check if performance is acceptable
   */
  public isPerformanceAcceptable(): boolean {
    const metrics = this.getMetrics()
    return metrics.fps >= 30 && metrics.frameTime < 33
  }

  /**
   * Get performance warnings
   */
  public getPerformanceWarnings(): string[] {
    const warnings: string[] = []
    const metrics = this.getMetrics()

    if (metrics.fps < 30) {
      warnings.push(`Low FPS: ${metrics.fps} (target: 30+)`)
    }

    if (metrics.frameTime > 33) {
      warnings.push(`High frame time: ${metrics.frameTime}ms (target: <33ms)`)
    }

    if (metrics.collisionTime > 5) {
      warnings.push(`Slow collision detection: ${metrics.collisionTime}ms`)
    }

    if (metrics.renderTime > 16) {
      warnings.push(`Slow rendering: ${metrics.renderTime}ms`)
    }

    return warnings
  }

  /**
   * Reset all metrics
   */
  public reset(): void {
    this.frameCount = 0
    this.fpsHistory = []
    this.frameTimeHistory = []
    this.collisionChecks = 0
    this.collisionTime = 0
    this.renderTime = 0
    this.lastLogTime = 0
    logger.info(LogModule.PERFORMANCE, 'Performance metrics reset')
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor() 