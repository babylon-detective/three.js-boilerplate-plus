import * as THREE from 'three'

// Advanced TypeScript: Generic interfaces
interface AnimationConfig<T = any> {
  duration: number
  easing: EasingFunction
  loop: boolean
  yoyo: boolean
  delay: number
  onStart?: () => void
  onUpdate?: (progress: number, value: T) => void
  onComplete?: () => void
}

// Type alias for easing functions
type EasingFunction = (t: number) => number

// Enum for animation states
enum AnimationState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused',
  COMPLETED = 'completed'
}

// Advanced TypeScript: Conditional types and mapped types
type AnimatableProperties = {
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: THREE.Vector3
  material: {
    opacity: number
    color: THREE.Color
  }
}

// Utility type to make properties optional
type PartialAnimation<T> = {
  [K in keyof T]?: T[K] extends object ? PartialAnimation<T[K]> : T[K]
}

// Generic animation class with TypeScript constraints
class Animation<T extends THREE.Object3D = THREE.Object3D> {
  public readonly target: T
  private startValues: PartialAnimation<AnimatableProperties> = {}
  private endValues: PartialAnimation<AnimatableProperties> = {}
  private currentValues: PartialAnimation<AnimatableProperties> = {}
  private state: AnimationState = AnimationState.IDLE
  private startTime: number = 0
  private pausedTime: number = 0
  private isActive: boolean = false
  
  constructor(
    target: T,
    private config: AnimationConfig,
    private isLockedFn?: (uuid: string) => boolean
  ) {
    this.target = target
  }

  // Method overloading in TypeScript
  public to(values: PartialAnimation<AnimatableProperties>): this
  public to(property: keyof AnimatableProperties, value: any): this
  public to(
    propertyOrValues: keyof AnimatableProperties | PartialAnimation<AnimatableProperties>,
    value?: any
  ): this {
    if (typeof propertyOrValues === 'string') {
      // Single property animation
      this.endValues[propertyOrValues] = value
    } else {
      // Multiple properties animation
      this.endValues = { ...this.endValues, ...propertyOrValues }
    }
    return this
  }

  public start(): this {
    this.isActive = true
    this.captureStartValues()
    this.state = AnimationState.PLAYING
    this.startTime = performance.now()
    this.config.onStart?.()
    return this
  }

  public pause(): this {
    if (this.state === AnimationState.PLAYING) {
      this.state = AnimationState.PAUSED
      this.pausedTime = performance.now()
    }
    return this
  }

  public resume(): this {
    if (this.state === AnimationState.PAUSED) {
      this.state = AnimationState.PLAYING
      this.startTime += performance.now() - this.pausedTime
    }
    return this
  }

  public stop(): this {
    this.state = AnimationState.IDLE
    this.isActive = false
    return this
  }

  public update(currentTime: number): boolean {
    if (!this.isActive) return false

    // Check if position is locked
    if (this.isLockedFn && this.isLockedFn(this.target.uuid)) {
      return true // Keep animation alive but don't update
    }

    const elapsed = currentTime - this.startTime - this.config.delay
    if (elapsed < 0) return true // Still in delay phase

    let progress = Math.min(elapsed / this.config.duration, 1)
    progress = this.config.easing(progress)

    this.updateValues(progress)
    this.config.onUpdate?.(progress, this.currentValues)

    if (elapsed >= this.config.duration) {
      if (this.config.loop) {
        this.startTime = currentTime
        if (this.config.yoyo) {
          this.swapStartAndEndValues()
        }
      } else {
        this.state = AnimationState.COMPLETED
        this.config.onComplete?.()
        this.isActive = false
        return false
      }
    }

    return this.isActive
  }

  private captureStartValues(): void {
    // TypeScript's type narrowing helps here
    if (this.endValues.position) {
      this.startValues.position = this.target.position.clone()
    }
    if (this.endValues.rotation) {
      this.startValues.rotation = this.target.rotation.clone()
    }
    if (this.endValues.scale) {
      this.startValues.scale = this.target.scale.clone()
    }
    if (this.endValues.material && 'material' in this.target) {
      const material = this.target.material as THREE.Material
      this.startValues.material = {
        opacity: material.opacity,
        color: (material as any).color?.clone() || new THREE.Color()
      }
    }
  }

  private updateValues(progress: number): void {
    // Position animation
    if (this.startValues.position && this.endValues.position) {
      const startPos = this.startValues.position as THREE.Vector3
      const endPos = this.endValues.position as THREE.Vector3
      this.target.position.lerpVectors(startPos, endPos, progress)
    }

    // Rotation animation
    if (this.startValues.rotation && this.endValues.rotation) {
      const startRot = this.startValues.rotation
      const endRot = this.endValues.rotation
      this.target.rotation.x = THREE.MathUtils.lerp(
        startRot.x ?? 0,
        endRot.x ?? 0,
        progress
      )
      this.target.rotation.y = THREE.MathUtils.lerp(
        startRot.y ?? 0,
        endRot.y ?? 0,
        progress
      )
      this.target.rotation.z = THREE.MathUtils.lerp(
        startRot.z ?? 0,
        endRot.z ?? 0,
        progress
      )
    }

    // Scale animation
    if (this.startValues.scale && this.endValues.scale) {
      const startScale = this.startValues.scale as THREE.Vector3
      const endScale = this.endValues.scale as THREE.Vector3
      this.target.scale.lerpVectors(startScale, endScale, progress)
    }

    // Material animation
    if (this.startValues.material && this.endValues.material && 'material' in this.target) {
      const material = this.target.material as THREE.Material
      
      if (this.endValues.material.opacity !== undefined) {
        material.opacity = THREE.MathUtils.lerp(
          this.startValues.material.opacity!,
          this.endValues.material.opacity,
          progress
        )
      }

      if (this.endValues.material.color && 'color' in material) {
        (material as any).color.lerpColors(
          this.startValues.material.color!,
          this.endValues.material.color,
          progress
        )
      }
    }

    this.currentValues = { ...this.startValues }
  }

  private swapStartAndEndValues(): void {
    const temp = this.startValues
    this.startValues = this.endValues
    this.endValues = temp
  }

  public getState(): AnimationState {
    return this.state
  }

  public isRunning(): boolean {
    return this.isActive
  }
}

// Easing functions library
export const Easing = {
  linear: (t: number): number => t,
  easeInQuad: (t: number): number => t * t,
  easeOutQuad: (t: number): number => t * (2 - t),
  easeInOutQuad: (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number): number => t * t * t,
  easeOutCubic: (t: number): number => (--t) * t * t + 1,
  easeInOutCubic: (t: number): number => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInElastic: (t: number): number => {
    if (t === 0) return 0
    if (t === 1) return 1
    const p = 0.3
    const s = p / 4
    return -(Math.pow(2, 10 * (t -= 1)) * Math.sin((t - s) * (2 * Math.PI) / p))
  },
  easeOutElastic: (t: number): number => {
    if (t === 0) return 0
    if (t === 1) return 1
    const p = 0.3
    const s = p / 4
    return Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1
  }
} as const // 'as const' makes this a readonly object

// Animation manager with TypeScript generics
export class AnimationSystem {
  private animations: Set<Animation> = new Set()
  private isRunning: boolean = false
  private isLockedFn?: (uuid: string) => boolean

  public setLockedPositionChecker(isLockedFn: (uuid: string) => boolean): void {
    this.isLockedFn = isLockedFn
  }

  // Generic method for creating animations
  public createAnimation<T extends THREE.Object3D>(
    target: T,
    config: Partial<AnimationConfig> = {}
  ): Animation<T> {
    const fullConfig: AnimationConfig = {
      duration: 1000,
      easing: Easing.linear,
      loop: false,
      yoyo: false,
      delay: 0,
      ...config
    }

    return new Animation(target, fullConfig, this.isLockedFn)
  }

  public addAnimation(animation: Animation): void {
    this.animations.add(animation)
  }

  public removeAnimation(animation: Animation): void {
    this.animations.delete(animation)
  }

  /**
   * Remove all animations for a specific object
   */
  public removeAnimationsForObject(target: THREE.Object3D): void {
    const animationsToRemove: Animation[] = []
    for (const animation of this.animations) {
      // Check if animation targets this object
      if (animation.target === target) {
        animationsToRemove.push(animation)
      }
    }
    animationsToRemove.forEach(animation => {
      animation.stop()
      this.animations.delete(animation)
    })
  }

  public update(currentTime: number): void {
    if (!this.isRunning) return

    const animationsToRemove: Animation<any>[] = []
    
    for (const animation of this.animations) {
      if (!animation.update(currentTime)) {
        animationsToRemove.push(animation)
      }
    }

    // Remove completed animations
    animationsToRemove.forEach(animation => {
      this.animations.delete(animation)
    })
  }

  public start(): void {
    this.isRunning = true
  }

  public stop(): void {
    this.isRunning = false
    this.animations.clear()
  }

  public getAnimationCount(): number {
    return this.animations.size
  }

  // Advanced TypeScript: Method decorator could be used here
  public animateTo<T extends THREE.Object3D>(
    target: T,
    values: PartialAnimation<AnimatableProperties>,
    config: Partial<AnimationConfig> = {}
  ): Animation<T> {
    const animation = this.createAnimation(target, config)
    animation.to(values).start()
    this.addAnimation(animation)
    return animation
  }
}

// Export types for use in other modules
export type {
  Animation,
  AnimationConfig,
  AnimationState,
  EasingFunction,
  AnimatableProperties,
  PartialAnimation
} 