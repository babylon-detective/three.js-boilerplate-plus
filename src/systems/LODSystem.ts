import * as THREE from 'three'

// Advanced TypeScript: Discriminated unions for different LOD strategies
type LODStrategy = 
  | { type: 'distance'; camera: THREE.Camera }
  | { type: 'screen-size'; camera: THREE.Camera; renderer: THREE.WebGLRenderer }
  | { type: 'custom'; evaluator: (object: THREE.Object3D) => number }

// Interface for LOD level configuration
interface LODLevel {
  distance: number
  object: THREE.Object3D
  visible: boolean
}

// Type for LOD performance metrics
interface LODMetrics {
  totalObjects: number
  visibleObjects: number
  triangleCount: number
  drawCalls: number
  lastUpdateTime: number
}

// Generic constraint for objects that can have LOD
type LODCompatible = THREE.Object3D & {
  geometry?: THREE.BufferGeometry
  material?: THREE.Material | THREE.Material[]
}

// Advanced TypeScript: Template literal types for LOD quality presets
type QualityPreset = 'ultra' | 'high' | 'medium' | 'low' | 'potato'

// Mapped type for quality settings
type QualitySettings = {
  [K in QualityPreset]: {
    maxDistance: number
    levelCount: number
    reductionFactor: number
    shadowDistance: number
  }
}

// LOD configuration with conditional properties
interface LODConfig {
  strategy: LODStrategy
  hysteresis: number // Prevents flickering between levels
  updateFrequency: number // How often to update LOD (in ms)
  qualityPreset?: QualityPreset
  autoGenerate?: boolean
  customLevels?: LODLevel[]
}

// Class for managing individual LOD objects
class LODObject {
  private levels: LODLevel[] = []
  private currentLevel: number = 0
  private lastDistance: number = 0
  private object: THREE.Object3D
  private boundingSphere: THREE.Sphere
  
  constructor(
    object: THREE.Object3D,
    private config: LODConfig
  ) {
    this.object = object
    this.boundingSphere = new THREE.Sphere()
    this.calculateBoundingSphere()
    
    if (config.autoGenerate) {
      this.generateLODLevels()
    } else if (config.customLevels) {
      this.levels = [...config.customLevels]
    }
  }

  private calculateBoundingSphere(): void {
    const box = new THREE.Box3().setFromObject(this.object)
    box.getBoundingSphere(this.boundingSphere)
  }

  private generateLODLevels(): void {
    const preset = this.getQualityPreset()
    
    // Generate different LOD levels automatically
    for (let i = 0; i < preset.levelCount; i++) {
      const distance = (preset.maxDistance / preset.levelCount) * i
      const reductionFactor = Math.pow(preset.reductionFactor, i)
      
      const lodObject = this.createReducedGeometry(this.object, reductionFactor)
      
      this.levels.push({
        distance,
        object: lodObject,
        visible: i === 0
      })
    }
  }

  private getQualityPreset(): QualitySettings[QualityPreset] {
    const qualitySettings: QualitySettings = {
      ultra: { maxDistance: 1000, levelCount: 5, reductionFactor: 0.8, shadowDistance: 500 },
      high: { maxDistance: 800, levelCount: 4, reductionFactor: 0.7, shadowDistance: 300 },
      medium: { maxDistance: 600, levelCount: 3, reductionFactor: 0.6, shadowDistance: 200 },
      low: { maxDistance: 400, levelCount: 2, reductionFactor: 0.5, shadowDistance: 100 },
      potato: { maxDistance: 200, levelCount: 1, reductionFactor: 0.3, shadowDistance: 50 }
    }
    
    return qualitySettings[this.config.qualityPreset || 'medium']
  }

  private createReducedGeometry(object: THREE.Object3D, reductionFactor: number): THREE.Object3D {
    const clonedObject = object.clone()
    
    // Traverse and reduce geometry complexity
    clonedObject.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        child.geometry = this.simplifyGeometry(child.geometry, reductionFactor)
      }
    })
    
    return clonedObject
  }

  private simplifyGeometry(geometry: THREE.BufferGeometry, factor: number): THREE.BufferGeometry {
    // Simple vertex reduction - in real project, use more sophisticated algorithms
    const positions = geometry.attributes.position.array
    const reducedPositions = new Float32Array(Math.floor(positions.length * factor))
    
    for (let i = 0; i < reducedPositions.length; i++) {
      reducedPositions[i] = positions[i]
    }
    
    const reducedGeometry = new THREE.BufferGeometry()
    reducedGeometry.setAttribute('position', new THREE.BufferAttribute(reducedPositions, 3))
    
    return reducedGeometry
  }

  public update(evaluationValue: number): boolean {
    const hysteresis = this.config.hysteresis
    let newLevel = this.currentLevel
    
    // Find appropriate LOD level with hysteresis
    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i]
      const threshold = level.distance
      const hysteresisThreshold = this.lastDistance > threshold ? threshold * (1 + hysteresis) : threshold * (1 - hysteresis)
      
      if (evaluationValue <= hysteresisThreshold) {
        newLevel = i
        break
      }
    }
    
    // Update visibility if level changed
    if (newLevel !== this.currentLevel) {
      this.levels[this.currentLevel].visible = false
      this.levels[newLevel].visible = true
      this.currentLevel = newLevel
      this.lastDistance = evaluationValue
      return true // Level changed
    }
    
    this.lastDistance = evaluationValue
    return false // No change
  }

  public addLevel(distance: number, object: THREE.Object3D): void {
    this.levels.push({ distance, object, visible: false })
    this.levels.sort((a, b) => a.distance - b.distance)
  }

  public getCurrentLevel(): number {
    return this.currentLevel
  }

  public getLevels(): readonly LODLevel[] {
    return this.levels
  }

  public getBoundingSphere(): THREE.Sphere {
    return this.boundingSphere
  }

  public getTriangleCount(): number {
    let count = 0
    const currentObject = this.levels[this.currentLevel]?.object
    
    if (currentObject) {
      currentObject.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          const index = child.geometry.index
          const positions = child.geometry.attributes.position
          
          if (index) {
            count += index.count / 3
          } else if (positions) {
            count += positions.count / 3
          }
        }
      })
    }
    
    return count
  }
}

// Main LOD System class
export class LODSystem {
  private lodObjects: Map<string, LODObject> = new Map()
  private lastUpdateTime: number = 0
  private metrics: LODMetrics = {
    totalObjects: 0,
    visibleObjects: 0,
    triangleCount: 0,
    drawCalls: 0,
    lastUpdateTime: 0
  }

  constructor(private defaultConfig: LODConfig) {}

  // Method overloading for different registration methods
  public register(id: string, object: THREE.Object3D): void
  public register(id: string, object: THREE.Object3D, config: Partial<LODConfig>): void
  public register(
    id: string, 
    object: THREE.Object3D, 
    config: Partial<LODConfig> = {}
  ): void {
    const finalConfig: LODConfig = { ...this.defaultConfig, ...config }
    const lodObject = new LODObject(object, finalConfig)
    this.lodObjects.set(id, lodObject)
    this.updateMetrics()
  }

  public unregister(id: string): boolean {
    const result = this.lodObjects.delete(id)
    if (result) {
      this.updateMetrics()
    }
    return result
  }

  public update(currentTime: number = performance.now()): void {
    if (currentTime - this.lastUpdateTime < this.defaultConfig.updateFrequency) {
      return
    }

    let changedObjects = 0
    
    for (const [id, lodObject] of this.lodObjects) {
      const evaluationValue = this.evaluateObject(lodObject)
      const changed = lodObject.update(evaluationValue)
      
      if (changed) {
        changedObjects++
      }
    }

    this.lastUpdateTime = currentTime
    this.updateMetrics()
    
    // Optional: Log performance
    if (changedObjects > 0) {
      console.log(`LOD System: Updated ${changedObjects} objects`)
    }
  }

  private evaluateObject(lodObject: LODObject): number {
    const strategy = this.defaultConfig.strategy
    
    // TypeScript's discriminated unions enable type-safe switch statements
    switch (strategy.type) {
      case 'distance':
        return this.evaluateDistance(lodObject, strategy.camera)
      
      case 'screen-size':
        return this.evaluateScreenSize(lodObject, strategy.camera, strategy.renderer)
      
      case 'custom':
        return strategy.evaluator(lodObject.getLevels()[0].object)
      
      default:
        // TypeScript ensures we handle all cases
        const exhaustiveCheck: never = strategy
        throw new Error(`Unhandled LOD strategy: ${exhaustiveCheck}`)
    }
  }

  private evaluateDistance(lodObject: LODObject, camera: THREE.Camera): number {
    const boundingSphere = lodObject.getBoundingSphere()
    return camera.position.distanceTo(boundingSphere.center)
  }

  private evaluateScreenSize(
    lodObject: LODObject, 
    camera: THREE.Camera, 
    renderer: THREE.WebGLRenderer
  ): number {
    const boundingSphere = lodObject.getBoundingSphere()
    const distance = camera.position.distanceTo(boundingSphere.center)
    
    // Calculate screen size based on distance and sphere radius
    const canvas = renderer.domElement
    const fov = (camera as THREE.PerspectiveCamera).fov * Math.PI / 180
    const screenHeight = 2 * Math.tan(fov / 2) * distance
    const screenSize = (boundingSphere.radius * canvas.height) / screenHeight
    
    return 1 / screenSize // Invert so smaller screen size = higher value
  }

  private updateMetrics(): void {
    this.metrics.totalObjects = this.lodObjects.size
    this.metrics.visibleObjects = 0
    this.metrics.triangleCount = 0
    this.metrics.drawCalls = 0

    for (const lodObject of this.lodObjects.values()) {
      const levels = lodObject.getLevels()
      const currentLevel = lodObject.getCurrentLevel()
      
      if (levels[currentLevel]?.visible) {
        this.metrics.visibleObjects++
        this.metrics.triangleCount += lodObject.getTriangleCount()
        this.metrics.drawCalls++
      }
    }

    this.metrics.lastUpdateTime = performance.now()
  }

  // Getter with TypeScript's readonly modifier
  public getMetrics(): Readonly<LODMetrics> {
    return this.metrics
  }

  public getLODObject(id: string): LODObject | undefined {
    return this.lodObjects.get(id)
  }

  public getAllLODObjects(): ReadonlyMap<string, LODObject> {
    return this.lodObjects
  }

  // Method to change quality preset at runtime
  public setQualityPreset(preset: QualityPreset): void {
    this.defaultConfig.qualityPreset = preset
    
    // Regenerate LOD levels for all objects
    for (const lodObject of this.lodObjects.values()) {
      // Would need to expose regeneration method on LODObject
    }
  }

  // Performance monitoring
  public getPerformanceReport(): string {
    const metrics = this.metrics
    return `
LOD System Performance Report:
- Total Objects: ${metrics.totalObjects}
- Visible Objects: ${metrics.visibleObjects}
- Triangle Count: ${metrics.triangleCount.toLocaleString()}
- Draw Calls: ${metrics.drawCalls}
- Visibility Ratio: ${((metrics.visibleObjects / metrics.totalObjects) * 100).toFixed(1)}%
- Last Update: ${new Date(metrics.lastUpdateTime).toLocaleTimeString()}
    `.trim()
  }
}

// Utility functions with TypeScript generics
export function createLODSystem(
  strategy: LODStrategy,
  options: Partial<LODConfig> = {}
): LODSystem {
  const defaultConfig: LODConfig = {
    strategy,
    hysteresis: 0.1,
    updateFrequency: 100,
    qualityPreset: 'medium',
    autoGenerate: true,
    ...options
  }
  
  return new LODSystem(defaultConfig)
}

// Export all types for external use
export {
  LODStrategy,
  LODLevel,
  LODMetrics,
  LODConfig,
  QualityPreset,
  QualitySettings,
  LODObject
} 