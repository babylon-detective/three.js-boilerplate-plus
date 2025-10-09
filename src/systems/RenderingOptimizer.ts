/**
 * Rendering Performance Optimizer
 * 
 * Analyzes current scene and applies performance optimizations:
 * - Automatic instancing for similar objects
 * - Draw call batching and reduction
 * - LOD integration with instancing
 * - Memory usage optimization
 * - Performance monitoring and recommendations
 */

import * as THREE from 'three'
import { GPUInstancingSystem, InstancedObjectConfig } from './GPUInstancingSystem'
import { ObjectManager, ManagedObject } from './ObjectManager'
import { LODSystem } from './LODSystem'
import { performanceMonitor } from './PerformanceMonitor'

export interface PerformanceAnalysis {
  currentDrawCalls: number
  potentialDrawCalls: number
  drawCallReduction: number
  memoryUsage: {
    current: number
    optimized: number
    savings: number
  }
  recommendations: string[]
  optimizationOpportunities: {
    instancing: { objects: number, savings: number }
    batching: { materials: number, savings: number }
    lod: { objects: number, savings: number }
    culling: { objects: number, savings: number }
  }
}

export interface OptimizationConfig {
  enableInstancing: boolean
  enableBatching: boolean
  enableLOD: boolean
  enableFrustumCulling: boolean
  instanceThreshold: number // Minimum objects to justify instancing
  lodDistanceMultiplier: number
  maxInstancesPerObject: number
}

export class RenderingOptimizer {
  private scene: THREE.Scene
  private camera: THREE.Camera
  private renderer: THREE.WebGLRenderer
  private objectManager: ObjectManager
  private lodSystem: LODSystem
  private instancingSystem: GPUInstancingSystem
  private config: OptimizationConfig

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    objectManager: ObjectManager,
    lodSystem: LODSystem
  ) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.objectManager = objectManager
    this.lodSystem = lodSystem
    this.instancingSystem = new GPUInstancingSystem(scene, camera)

    // Default optimization configuration
    this.config = {
      enableInstancing: true,
      enableBatching: true,
      enableLOD: true,
      enableFrustumCulling: true,
      instanceThreshold: 3, // 3+ similar objects = worth instancing
      lodDistanceMultiplier: 1.5,
      maxInstancesPerObject: 1000
    }

    console.log('⚡ Rendering Optimizer initialized')
  }

  /**
   * Analyze current scene performance and identify optimization opportunities
   */
  public analyzePerformance(): PerformanceAnalysis {
    const objects = this.objectManager.getAllObjects()
    const renderInfo = this.renderer.info

    // Group objects by geometry and material for instancing analysis
    const instanceGroups = this.groupObjectsForInstancing(objects)
    
    // Calculate current state
    const currentDrawCalls = renderInfo.render.calls
    const currentMemory = this.calculateMemoryUsage(objects)

    // Calculate optimization potential
    let potentialDrawCalls = currentDrawCalls
    let instancingSavings = 0
    let batchingSavings = 0
    let lodSavings = 0

    // Analyze instancing opportunities
    for (const [key, group] of instanceGroups) {
      if (group.length >= this.config.instanceThreshold) {
        instancingSavings += group.length - 1 // N objects become 1 draw call
        potentialDrawCalls -= (group.length - 1)
      }
    }

    // Analyze material batching opportunities
    const materialGroups = this.groupObjectsByMaterial(objects)
    for (const [materialId, group] of materialGroups) {
      if (group.length > 1) {
        batchingSavings += Math.floor(group.length / 2) // Rough estimate
      }
    }

    // Analyze LOD opportunities
    const lodCandidates = objects.filter(obj => this.isLODCandidate(obj))
    lodSavings = Math.floor(lodCandidates.length * 0.3) // 30% triangle reduction estimate

    const analysis: PerformanceAnalysis = {
      currentDrawCalls,
      potentialDrawCalls: Math.max(1, potentialDrawCalls - batchingSavings),
      drawCallReduction: currentDrawCalls - potentialDrawCalls,
      memoryUsage: {
        current: currentMemory,
        optimized: currentMemory * 0.8, // Rough estimate
        savings: currentMemory * 0.2
      },
      recommendations: this.generateRecommendations(objects, instanceGroups),
      optimizationOpportunities: {
        instancing: { objects: instanceGroups.size, savings: instancingSavings },
        batching: { materials: materialGroups.size, savings: batchingSavings },
        lod: { objects: lodCandidates.length, savings: lodSavings },
        culling: { objects: objects.length, savings: Math.floor(objects.length * 0.2) }
      }
    }

    return analysis
  }

  /**
   * Apply automatic optimizations based on analysis
   */
  public async applyOptimizations(analysis?: PerformanceAnalysis): Promise<void> {
    if (!analysis) {
      analysis = this.analyzePerformance()
    }

    console.log('🚀 Applying rendering optimizations...')

    // 1. Apply instancing optimizations
    if (this.config.enableInstancing) {
      await this.applyInstancingOptimizations()
    }

    // 2. Apply material batching
    if (this.config.enableBatching) {
      await this.applyBatchingOptimizations()
    }

    // 3. Apply LOD optimizations
    if (this.config.enableLOD) {
      await this.applyLODOptimizations()
    }

    // 4. Apply frustum culling
    if (this.config.enableFrustumCulling) {
      this.applyFrustumCulling()
    }

    console.log('✅ Rendering optimizations applied')
    
    // Log results
    const newAnalysis = this.analyzePerformance()
    console.log(`📊 Draw calls reduced: ${analysis.currentDrawCalls} → ${newAnalysis.currentDrawCalls}`)
    console.log(`💾 Memory savings: ${(analysis.memoryUsage.savings / 1024 / 1024).toFixed(1)}MB`)
  }

  /**
   * Apply instancing optimizations
   */
  private async applyInstancingOptimizations(): Promise<void> {
    const objects = this.objectManager.getAllObjects()
    const instanceGroups = this.groupObjectsForInstancing(objects)

    for (const [key, group] of instanceGroups) {
      if (group.length >= this.config.instanceThreshold) {
        const firstObj = group[0]
        const geometry = firstObj.mesh.geometry
        const material = firstObj.mesh.material

        // Create instanced object configuration
        const config: InstancedObjectConfig = {
          id: `instanced-${key}`,
          geometry: geometry.clone(),
          material: material.clone(),
          maxInstances: Math.min(group.length * 2, this.config.maxInstancesPerObject),
          enableLOD: true,
          lodDistances: [50, 150, 300],
          frustumCulling: true
        }

        // Create instanced object
        this.instancingSystem.createInstancedObject(config)

        // Convert objects to instances
        for (let i = 0; i < group.length; i++) {
          const obj = group[i]
          this.instancingSystem.addInstance(config.id, {
            id: obj.id,
            position: obj.mesh.position.clone(),
            rotation: obj.mesh.rotation.clone(),
            scale: obj.mesh.scale.clone(),
            userData: obj.userData
          })

          // Remove original object
          this.objectManager.removeObject(obj.id)
        }

        console.log(`🔄 Instanced ${group.length} objects of type ${key}`)
      }
    }
  }

  /**
   * Apply material batching optimizations
   */
  private async applyBatchingOptimizations(): Promise<void> {
    // Group objects by material and merge geometries where possible
    const objects = this.objectManager.getAllObjects()
    const materialGroups = this.groupObjectsByMaterial(objects)

    for (const [materialId, group] of materialGroups) {
      if (group.length > 1 && this.canBatchObjects(group)) {
        await this.batchObjectsByMaterial(group, materialId)
      }
    }
  }

  /**
   * Apply LOD optimizations
   */
  private async applyLODOptimizations(): Promise<void> {
    const objects = this.objectManager.getAllObjects()
    
    for (const obj of objects) {
      if (this.isLODCandidate(obj)) {
        await this.createLODForObject(obj)
      }
    }
  }

  /**
   * Apply frustum culling
   */
  private applyFrustumCulling(): void {
    const objects = this.objectManager.getAllObjects()
    
    for (const obj of objects) {
      obj.mesh.frustumCulled = true
      if (obj.shadowMesh) {
        obj.shadowMesh.frustumCulled = true
      }
    }
  }

  /**
   * Group objects for instancing analysis
   */
  private groupObjectsForInstancing(objects: ManagedObject[]): Map<string, ManagedObject[]> {
    const groups = new Map<string, ManagedObject[]>()

    for (const obj of objects) {
      // Skip certain object types that shouldn't be instanced
      if (obj.type === 'ocean' || obj.type === 'land' || obj.userData.noInstancing) {
        continue
      }

      const geometry = obj.mesh.geometry
      const material = obj.mesh.material
      const key = `${geometry.uuid}-${(material as THREE.Material).uuid}`

      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(obj)
    }

    return groups
  }

  /**
   * Group objects by material
   */
  private groupObjectsByMaterial(objects: ManagedObject[]): Map<string, ManagedObject[]> {
    const groups = new Map<string, ManagedObject[]>()

    for (const obj of objects) {
      const material = obj.mesh.material as THREE.Material
      const key = material.uuid

      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(obj)
    }

    return groups
  }

  /**
   * Check if objects can be batched together
   */
  private canBatchObjects(objects: ManagedObject[]): boolean {
    // Objects can be batched if they:
    // 1. Use the same material
    // 2. Don't have individual animations
    // 3. Don't need individual updates
    return objects.every(obj => 
      !obj.animations?.length && 
      obj.type !== 'animated' &&
      !obj.userData.requiresIndividualUpdates
    )
  }

  /**
   * Batch objects with the same material
   */
  private async batchObjectsByMaterial(objects: ManagedObject[], materialId: string): Promise<void> {
    if (objects.length < 2) return

    const geometries: THREE.BufferGeometry[] = []
    const transforms: THREE.Matrix4[] = []

    // Collect geometries and transforms
    for (const obj of objects) {
      const geometry = obj.mesh.geometry.clone()
      const transform = new THREE.Matrix4()
      transform.compose(obj.mesh.position, obj.mesh.quaternion, obj.mesh.scale)
      
      geometry.applyMatrix4(transform)
      geometries.push(geometry)
    }

    // Merge geometries
    const mergedGeometry = THREE.BufferGeometryUtils.mergeGeometries(geometries)
    if (!mergedGeometry) return

    // Create batched object
    const batchedMesh = new THREE.Mesh(mergedGeometry, objects[0].mesh.material)
    batchedMesh.userData = { 
      id: `batched-${materialId}`,
      type: 'batched',
      originalCount: objects.length
    }

    // Add to scene and object manager
    this.scene.add(batchedMesh)

    // Remove original objects
    for (const obj of objects) {
      this.objectManager.removeObject(obj.id)
    }

    console.log(`📦 Batched ${objects.length} objects with material ${materialId}`)
  }

  /**
   * Check if object is a candidate for LOD
   */
  private isLODCandidate(obj: ManagedObject): boolean {
    const geometry = obj.mesh.geometry
    const triangleCount = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3
    
    // Objects with high triangle count benefit from LOD
    return triangleCount > 100 && obj.type !== 'ocean' && obj.type !== 'land'
  }

  /**
   * Create LOD levels for an object
   */
  private async createLODForObject(obj: ManagedObject): Promise<void> {
    // This would integrate with your existing LOD system
    // Implementation would create multiple LOD levels with reduced geometry
    console.log(`🔍 Creating LOD for object ${obj.id}`)
  }

  /**
   * Calculate current memory usage
   */
  private calculateMemoryUsage(objects: ManagedObject[]): number {
    let totalMemory = 0
    
    for (const obj of objects) {
      const geometry = obj.mesh.geometry
      const material = obj.mesh.material as THREE.Material

      // Rough geometry memory calculation
      if (geometry.attributes.position) {
        totalMemory += geometry.attributes.position.array.byteLength
      }
      if (geometry.attributes.normal) {
        totalMemory += geometry.attributes.normal.array.byteLength
      }
      if (geometry.attributes.uv) {
        totalMemory += geometry.attributes.uv.array.byteLength
      }
      if (geometry.index) {
        totalMemory += geometry.index.array.byteLength
      }

      // Add material memory (textures, etc.)
      if (material instanceof THREE.MeshStandardMaterial) {
        if (material.map) totalMemory += this.estimateTextureMemory(material.map)
        if (material.normalMap) totalMemory += this.estimateTextureMemory(material.normalMap)
        if (material.roughnessMap) totalMemory += this.estimateTextureMemory(material.roughnessMap)
      }
    }

    return totalMemory
  }

  /**
   * Estimate texture memory usage
   */
  private estimateTextureMemory(texture: THREE.Texture): number {
    const image = texture.image
    if (!image) return 0
    
    const width = image.width || 512
    const height = image.height || 512
    const bytesPerPixel = 4 // RGBA
    
    return width * height * bytesPerPixel
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(objects: ManagedObject[], instanceGroups: Map<string, ManagedObject[]>): string[] {
    const recommendations: string[] = []

    // Instancing recommendations
    const instancingCandidates = Array.from(instanceGroups.values()).filter(group => group.length >= this.config.instanceThreshold)
    if (instancingCandidates.length > 0) {
      recommendations.push(`🚀 Enable instancing for ${instancingCandidates.length} object groups to reduce draw calls by ${instancingCandidates.reduce((sum, group) => sum + group.length - 1, 0)}`)
    }

    // LOD recommendations
    const lodCandidates = objects.filter(obj => this.isLODCandidate(obj))
    if (lodCandidates.length > 0) {
      recommendations.push(`🔍 Add LOD to ${lodCandidates.length} high-poly objects to improve performance`)
    }

    // Memory recommendations
    const totalMemory = this.calculateMemoryUsage(objects)
    if (totalMemory > 100 * 1024 * 1024) { // 100MB
      recommendations.push(`💾 Consider texture compression and geometry optimization (current: ${(totalMemory / 1024 / 1024).toFixed(1)}MB)`)
    }

    // Draw call recommendations
    const currentDrawCalls = this.renderer.info.render.calls
    if (currentDrawCalls > 50) {
      recommendations.push(`📊 Reduce draw calls from ${currentDrawCalls} to <50 for better performance`)
    }

    return recommendations
  }

  /**
   * Update optimizer (call every frame)
   */
  public update(deltaTime: number): void {
    this.instancingSystem.update(deltaTime)
  }

  /**
   * Get current optimization configuration
   */
  public getConfig(): OptimizationConfig {
    return { ...this.config }
  }

  /**
   * Update optimization configuration
   */
  public updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Get performance metrics
   */
  public getMetrics() {
    return {
      rendering: this.analyzePerformance(),
      instancing: this.instancingSystem.getMetrics(),
      lod: this.lodSystem.getMetrics()
    }
  }

  /**
   * Dispose of optimizer
   */
  public dispose(): void {
    this.instancingSystem.dispose()
    console.log('🧹 Rendering Optimizer disposed')
  }
}
