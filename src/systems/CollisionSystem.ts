import * as THREE from 'three'
import { logger, LogModule } from './Logger'

export interface CollisionVolume {
  type: 'box' | 'sphere' | 'capsule'
  position: THREE.Vector3
  rotation: THREE.Euler
  dimensions: THREE.Vector3 // For box: width, height, depth; For sphere: radius, 0, 0; For capsule: radius, height, 0
}

export interface CollisionResult {
  hasCollision: boolean
  penetrationDepth: number
  normal: THREE.Vector3
  correctedPosition: THREE.Vector3
}

export interface CollidableObject {
  id: string
  mesh: THREE.Mesh
  collisionVolume: CollisionVolume
  isStatic: boolean // Static objects don't move when colliding
}

interface GroundHeightCache {
  x: number
  z: number
  height: number
  timestamp: number
}

interface LandMeshInfo {
  mesh: THREE.Mesh
  boundingBox: THREE.Box3
  priority: number // Higher priority = checked first
}

export class CollisionSystem {
  private collidableObjects: Map<string, CollidableObject> = new Map()
  private landMeshes: LandMeshInfo[] = []
  private raycaster: THREE.Raycaster = new THREE.Raycaster()
  private tempVector: THREE.Vector3 = new THREE.Vector3()
  private tempVector2: THREE.Vector3 = new THREE.Vector3()
  private tempBox: THREE.Box3 = new THREE.Box3()

  // Performance optimizations
  private groundHeightCache: Map<string, GroundHeightCache> = new Map()
  private cacheTimeout: number = 500 // Increased cache time to 500ms
  private lastCollisionCheck: number = 0
  private collisionCheckInterval: number = 32 // Reduced to 30fps collision checks
  private maxRaycastDistance: number = 200 // Increased to check land within 200 units
  private playerPosition: THREE.Vector3 = new THREE.Vector3()
  private lastPlayerPosition: THREE.Vector3 = new THREE.Vector3()
  private positionThreshold: number = 0.1 // Only update if player moved more than 0.1 units

  constructor() {
    logger.info(LogModule.COLLISION, 'CollisionSystem initialized with performance optimizations')
  }

  // ============================================================================
  // OBJECT REGISTRATION
  // ============================================================================

  public registerObject(object: CollidableObject): void {
    this.collidableObjects.set(object.id, object)
    logger.debug(LogModule.COLLISION, `Registered collidable object: ${object.id}`)
  }

  public unregisterObject(id: string): void {
    this.collidableObjects.delete(id)
    logger.debug(LogModule.COLLISION, `Unregistered collidable object: ${id}`)
  }

  public registerLandMeshes(meshes: THREE.Mesh[]): void {
    console.log(`🏔️ CollisionSystem.registerLandMeshes() called with ${meshes.length} meshes`)
    
    // Filter out ocean meshes - only register actual land terrain
    const landMeshes = meshes.filter(mesh => {
      const userData = mesh.userData
      // Include meshes that are explicitly marked as land
      const isLand = userData.type === 'land' || 
                     userData.landType === 'plane' || 
                     userData.landType === 'box' || 
                     userData.landType === 'sphere' ||
                     userData.landType === 'cylinder'
      
      // Debug: Log what we're filtering (reduced frequency)
      if (Math.random() < 0.3) { // 30% chance to avoid spam
        console.log(`🏔️ Mesh ${userData.id}: type=${userData.type}, landType=${userData.landType}, isLand=${isLand}`)
      }
      
      return isLand
    })
    
    // Create optimized land mesh info with bounding boxes and priorities
    this.landMeshes = landMeshes.map(mesh => {
      const boundingBox = new THREE.Box3().setFromObject(mesh)
      let priority = 1
      
      // Store mesh info for debugging (one-time log)
      const size = boundingBox.getSize(new THREE.Vector3())
      console.log(`🏔️ Land mesh: ${mesh.userData.id} at (${mesh.position.x.toFixed(1)}, ${mesh.position.y.toFixed(1)}, ${mesh.position.z.toFixed(1)}) size: ${size.x.toFixed(1)}x${size.z.toFixed(1)}`)
      
      // Prioritize main terrain (usually at origin)
      if (mesh.userData.id === 'main-terrain') {
        priority = 10
      }
      // Prioritize larger meshes (more likely to be ground)
      else if (boundingBox.getSize(this.tempVector).x > 50) {
        priority = 5
      }
      
      return {
        mesh,
        boundingBox,
        priority
      }
    }).sort((a, b) => b.priority - a.priority) // Sort by priority (highest first)
    
    logger.info(LogModule.COLLISION, `Registered ${this.landMeshes.length} land meshes for collision detection`)
    
    // Log details about registered meshes for debugging
    this.landMeshes.forEach((info, index) => {
      logger.info(LogModule.COLLISION, `Land mesh ${index}: ${info.mesh.userData.id} (${info.mesh.userData.type}) priority=${info.priority} at (${info.mesh.position.x.toFixed(1)}, ${info.mesh.position.y.toFixed(1)}, ${info.mesh.position.z.toFixed(1)})`)
    })
    
    // Clear cache when land meshes change
    this.groundHeightCache.clear()
    
    if (this.landMeshes.length === 0) {
      logger.warn(LogModule.COLLISION, 'No land meshes registered! Player will fall through terrain.')
    }
  }

  /**
   * Refresh land meshes - update bounding boxes and clear cache
   * Call this when land meshes are modified (position, scale, etc.)
   */
  public refreshLandMeshes(): void {
    // Update bounding boxes for all registered land meshes
    this.landMeshes.forEach(info => {
      info.boundingBox.setFromObject(info.mesh)
    })
    
    // Clear cache to force recalculation
    this.groundHeightCache.clear()
    
    logger.info(LogModule.COLLISION, `Refreshed ${this.landMeshes.length} land meshes - updated bounding boxes and cleared cache`)
  }

  /**
   * Update land mesh bounding boxes and cache
   * Call this when land parameters change (elevation, roughness, etc.)
   */
  public updateLandMesh(meshId: string): void {
    const landMeshInfo = this.landMeshes.find(info => info.mesh.userData.id === meshId)
    if (landMeshInfo) {
      // Update bounding box for this specific mesh
      landMeshInfo.boundingBox.setFromObject(landMeshInfo.mesh)
      
      // Clear cache to force recalculation
      this.groundHeightCache.clear()
      
      logger.debug(LogModule.COLLISION, `Updated land mesh: ${meshId} - refreshed bounding box and cleared cache`)
    } else {
      logger.warn(LogModule.COLLISION, `Land mesh not found for update: ${meshId}`)
    }
  }

  // ============================================================================
  // COLLISION DETECTION
  // ============================================================================

  /**
   * Check collision for a specific object at a given position
   */
  public checkCollision(objectId: string, newPosition: THREE.Vector3): CollisionResult {
    const object = this.collidableObjects.get(objectId)
    if (!object) {
      return {
        hasCollision: false,
        penetrationDepth: 0,
        normal: new THREE.Vector3(0, 1, 0),
        correctedPosition: newPosition.clone()
      }
    }

    // Check collision with land
    const landCollision = this.checkLandCollision(object.collisionVolume, newPosition)
    
    // Check collision with other objects
    const objectCollision = this.checkObjectCollisions(objectId, object.collisionVolume, newPosition)

    // Combine results (prioritize land collision)
    if (landCollision.hasCollision) {
      return landCollision
    } else if (objectCollision.hasCollision) {
      return objectCollision
    }

    return {
      hasCollision: false,
      penetrationDepth: 0,
      normal: new THREE.Vector3(0, 1, 0),
      correctedPosition: newPosition.clone()
    }
  }

  /**
   * Check collision with land meshes (optimized)
   */
  private checkLandCollision(volume: CollisionVolume, position: THREE.Vector3): CollisionResult {
    if (this.landMeshes.length === 0) {
      return {
        hasCollision: false,
        penetrationDepth: 0,
        normal: new THREE.Vector3(0, 1, 0),
        correctedPosition: position.clone()
      }
    }

    switch (volume.type) {
      case 'capsule':
        return this.checkCapsuleLandCollision(volume, position)
      case 'box':
        return this.checkBoxLandCollision(volume, position)
      case 'sphere':
        return this.checkSphereLandCollision(volume, position)
      default:
        return {
          hasCollision: false,
          penetrationDepth: 0,
          normal: new THREE.Vector3(0, 1, 0),
          correctedPosition: position.clone()
        }
    }
  }

  /**
   * Check capsule collision with land (improved with proper mesh collision)
   */
  private checkCapsuleLandCollision(volume: CollisionVolume, position: THREE.Vector3): CollisionResult {
    const radius = volume.dimensions.x
    const height = volume.dimensions.y
    const halfHeight = height * 0.5

    // Check multiple points along the capsule for better collision detection
    const checkPoints = [
      // Top of capsule
      new THREE.Vector3(position.x, position.y + halfHeight - radius, position.z),
      // Center of capsule
      new THREE.Vector3(position.x, position.y, position.z),
      // Bottom of capsule
      new THREE.Vector3(position.x, position.y - halfHeight + radius, position.z),
      // Sides of capsule (for wall collisions)
      new THREE.Vector3(position.x + radius, position.y, position.z),
      new THREE.Vector3(position.x - radius, position.y, position.z),
      new THREE.Vector3(position.x, position.y, position.z + radius),
      new THREE.Vector3(position.x, position.y, position.z - radius)
    ]

    let maxPenetration = 0
    let collisionNormal = new THREE.Vector3(0, 1, 0)
    let hasAnyCollision = false

    // Check each point for collision with land meshes
    for (const checkPoint of checkPoints) {
      const collision = this.checkPointCollision(checkPoint, radius)
      if (collision.hasCollision && collision.penetrationDepth > maxPenetration) {
        maxPenetration = collision.penetrationDepth
        collisionNormal = collision.normal
        hasAnyCollision = true
      }
    }

    if (hasAnyCollision) {
      const correctedPosition = position.clone()
      correctedPosition.add(collisionNormal.clone().multiplyScalar(maxPenetration + 0.01))

      return {
        hasCollision: true,
        penetrationDepth: maxPenetration,
        normal: collisionNormal,
        correctedPosition
      }
    }

    return {
      hasCollision: false,
      penetrationDepth: 0,
      normal: new THREE.Vector3(0, 1, 0),
      correctedPosition: position.clone()
    }
  }

  /**
   * Check if a point collides with any land mesh
   */
  private checkPointCollision(point: THREE.Vector3, radius: number): CollisionResult {
    if (this.landMeshes.length === 0) {
      return {
        hasCollision: false,
        penetrationDepth: 0,
        normal: new THREE.Vector3(0, 1, 0),
        correctedPosition: point.clone()
      }
    }

    // First, try to get ground height using the existing method
    const groundHeight = this.getGroundHeightOptimized(point.x, point.z)
    
    // CRITICAL FIX: Check if point is below ground + radius (proper sphere collision)
    if (point.y < groundHeight + radius) {
      const penetration = (groundHeight + radius) - point.y
      const correctedPosition = point.clone()
      correctedPosition.y = groundHeight + radius // Set absolute position at ground level
      
      // Debug: Log collision correction (rare)
      if (Math.random() < 0.001) { // 0.1% chance
        console.log(`🔧 COLLISION FIX: Point at Y=${point.y.toFixed(2)} below ground+radius=${(groundHeight + radius).toFixed(2)}, correcting to Y=${correctedPosition.y.toFixed(2)}`)
      }
      
      return {
        hasCollision: true,
        penetrationDepth: penetration,
        normal: new THREE.Vector3(0, 1, 0),
        correctedPosition
      }
    }

    // Also try raycasting in multiple directions for wall collisions
    const rayDirections = [
      new THREE.Vector3(1, 0, 0),   // Right
      new THREE.Vector3(-1, 0, 0),  // Left
      new THREE.Vector3(0, 0, 1),   // Forward
      new THREE.Vector3(0, 0, -1),  // Back
      new THREE.Vector3(0, 1, 0)    // Up
    ]

    let closestCollision = {
      hasCollision: false,
      penetrationDepth: 0,
      normal: new THREE.Vector3(0, 1, 0),
      correctedPosition: point.clone()
    }

    const allMeshes = this.landMeshes.map(info => info.mesh)

    for (const direction of rayDirections) {
      this.raycaster.set(point, direction)
      const intersects = this.raycaster.intersectObjects(allMeshes, true)

      for (const intersect of intersects) {
        const distance = intersect.distance
        if (distance <= radius) {
          const penetration = radius - distance
          if (penetration > closestCollision.penetrationDepth) {
            closestCollision = {
              hasCollision: true,
              penetrationDepth: penetration,
              normal: intersect.face ? intersect.face.normal.clone().applyQuaternion(intersect.object.getWorldQuaternion(new THREE.Quaternion())) : direction.clone(),
              correctedPosition: point.clone().add(direction.clone().multiplyScalar(penetration))
            }
          }
        }
      }
    }

    return closestCollision
  }

  /**
   * Check box collision with land (optimized)
   */
  private checkBoxLandCollision(volume: CollisionVolume, position: THREE.Vector3): CollisionResult {
    // Only check center point for performance
    const groundHeight = this.getGroundHeightOptimized(position.x, position.z)
    const halfHeight = volume.dimensions.y * 0.5
    const penetration = groundHeight - (position.y - halfHeight)

    if (penetration > 0) {
      const correctedPosition = position.clone()
      correctedPosition.y += penetration

      return {
        hasCollision: true,
        penetrationDepth: penetration,
        normal: new THREE.Vector3(0, 1, 0),
        correctedPosition
      }
    }

    return {
      hasCollision: false,
      penetrationDepth: 0,
      normal: new THREE.Vector3(0, 1, 0),
      correctedPosition: position.clone()
    }
  }

  /**
   * Check sphere collision with land (optimized)
   */
  private checkSphereLandCollision(volume: CollisionVolume, position: THREE.Vector3): CollisionResult {
    const radius = volume.dimensions.x
    const groundHeight = this.getGroundHeightOptimized(position.x, position.z)
    const penetration = groundHeight - (position.y - radius)

    if (penetration > 0) {
      const correctedPosition = position.clone()
      correctedPosition.y = groundHeight + radius // CRITICAL FIX: Set absolute position at ground level

      return {
        hasCollision: true,
        penetrationDepth: penetration,
        normal: new THREE.Vector3(0, 1, 0),
        correctedPosition
      }
    }

    return {
      hasCollision: false,
      penetrationDepth: 0,
      normal: new THREE.Vector3(0, 1, 0),
      correctedPosition: position.clone()
    }
  }

  /**
   * Check collisions with other objects
   */
  private checkObjectCollisions(objectId: string, volume: CollisionVolume, position: THREE.Vector3): CollisionResult {
    // TODO: Implement object-to-object collision detection
    // For now, return no collision
    return {
      hasCollision: false,
      penetrationDepth: 0,
      normal: new THREE.Vector3(0, 1, 0),
      correctedPosition: position.clone()
    }
  }

  // ============================================================================
  // OPTIMIZED GROUND HEIGHT CALCULATION
  // ============================================================================

  /**
   * Get ground height using simple modular approach (like ocean collision)
   */
  private getGroundHeightOptimized(x: number, z: number): number {
    if (this.landMeshes.length === 0) {
      return -4.0
    }

    let maxGroundHeight = -4.0 // Start with sea level
    
    // Check each land mesh to see if point is within its bounds
    for (const info of this.landMeshes) {
      const mesh = info.mesh
      const boundingBox = info.boundingBox
      
      // Check if point is within this mesh's X-Z bounds
      if (x >= boundingBox.min.x && x <= boundingBox.max.x &&
          z >= boundingBox.min.z && z <= boundingBox.max.z) {
        
        // For plane meshes, need to account for shader displacement
        if (mesh.userData.landType === 'plane') {
          const terrainHeight = this.calculateShaderTerrainHeight(mesh, x, z)
          maxGroundHeight = Math.max(maxGroundHeight, terrainHeight)
        }
        // For box/sphere/cylinder, use top of bounding box
        else {
          maxGroundHeight = Math.max(maxGroundHeight, boundingBox.max.y)
        }
        
        // Debug: Log successful collision (disabled - use debugTerrainHeight() for testing)
        // console.log(`🏔️ LAND COLLISION: Point (${x.toFixed(1)}, ${z.toFixed(1)}) inside ${mesh.userData.id}, height=${maxGroundHeight.toFixed(2)}`)
      }
    }
    
    return maxGroundHeight
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const now = performance.now()
    for (const [key, entry] of this.groundHeightCache.entries()) {
      if ((now - entry.timestamp) > this.cacheTimeout * 2) {
        this.groundHeightCache.delete(key)
      }
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Update all dynamic objects (apply gravity, resolve collisions) - optimized
   */
  public updateDynamicObjects(deltaTime: number): void {
    const now = performance.now()
    
    // Throttle collision checks for better performance
    if (now - this.lastCollisionCheck < this.collisionCheckInterval) {
      return
    }
    
    this.lastCollisionCheck = now

    for (const [id, object] of this.collidableObjects) {
      // Skip player - player controller handles its own physics
      if (id === 'player') {
        continue
      }
      
      if (!object.isStatic) {
        // Apply gravity
        const currentPosition = object.mesh.position.clone()
        currentPosition.y -= 9.81 * deltaTime // Simple gravity

        // Check collision and correct position
        const collision = this.checkCollision(id, currentPosition)
        
        if (collision.hasCollision) {
          object.mesh.position.copy(collision.correctedPosition)
        } else {
          object.mesh.position.copy(currentPosition)
        }
      }
    }
  }

  /**
   * Update player position for optimization
   */
  public updatePlayerPosition(position: THREE.Vector3): void {
    this.lastPlayerPosition.copy(this.playerPosition)
    this.playerPosition.copy(position)
  }

  /**
   * Check if player has moved significantly enough to warrant collision checks
   */
  public shouldCheckCollision(): boolean {
    return this.playerPosition.distanceTo(this.lastPlayerPosition) > this.positionThreshold
  }

  /**
   * Create a debug wireframe for a collision volume
   */
  public createDebugWireframe(volume: CollisionVolume, color: number = 0x00ff00): THREE.Object3D {
    let geometry: THREE.BufferGeometry

    switch (volume.type) {
      case 'capsule':
        // Create capsule wireframe (cylinder + 2 spheres)
        const group = new THREE.Group()
        
        // Cylinder body
        const cylinderGeometry = new THREE.CylinderGeometry(
          volume.dimensions.x, // radius
          volume.dimensions.x, // radius
          volume.dimensions.y - volume.dimensions.x * 2, // height minus sphere caps
          8, 1, true
        )
        const cylinderWireframe = new THREE.WireframeGeometry(cylinderGeometry)
        const cylinderMesh = new THREE.LineSegments(cylinderWireframe, new THREE.LineBasicMaterial({ color }))
        group.add(cylinderMesh)

        // Top sphere cap
        const topSphereGeometry = new THREE.SphereGeometry(volume.dimensions.x, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)
        const topSphereWireframe = new THREE.WireframeGeometry(topSphereGeometry)
        const topSphereMesh = new THREE.LineSegments(topSphereWireframe, new THREE.LineBasicMaterial({ color }))
        topSphereMesh.position.y = (volume.dimensions.y - volume.dimensions.x * 2) * 0.5
        group.add(topSphereMesh)

        // Bottom sphere cap
        const bottomSphereGeometry = new THREE.SphereGeometry(volume.dimensions.x, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
        const bottomSphereWireframe = new THREE.WireframeGeometry(bottomSphereGeometry)
        const bottomSphereMesh = new THREE.LineSegments(bottomSphereWireframe, new THREE.LineBasicMaterial({ color }))
        bottomSphereMesh.position.y = -(volume.dimensions.y - volume.dimensions.x * 2) * 0.5
        group.add(bottomSphereMesh)

        return group

      case 'box':
        geometry = new THREE.BoxGeometry(volume.dimensions.x, volume.dimensions.y, volume.dimensions.z)
        break

      case 'sphere':
        geometry = new THREE.SphereGeometry(volume.dimensions.x, 8, 6)
        break

      default:
        geometry = new THREE.BoxGeometry(1, 1, 1)
    }

    const wireframe = new THREE.WireframeGeometry(geometry)
    const mesh = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color }))
    
    return mesh
  }

  /**
   * Get all registered objects
   */
  public getObjects(): Map<string, CollidableObject> {
    return this.collidableObjects
  }

  /**
   * Clear all registered objects
   */
  public clear(): void {
    this.collidableObjects.clear()
    this.landMeshes = []
    this.groundHeightCache.clear()
    logger.info(LogModule.COLLISION, 'CollisionSystem cleared')
  }

  /**
   * Get performance statistics
   */
  public getPerformanceStats(): object {
    return {
      registeredObjects: this.collidableObjects.size,
      landMeshes: this.landMeshes.length,
      cacheSize: this.groundHeightCache.size,
      cacheTimeout: this.cacheTimeout,
      collisionCheckInterval: this.collisionCheckInterval,
      maxRaycastDistance: this.maxRaycastDistance
    }
  }

  /**
   * Get registered land meshes for debugging
   */
  public getLandMeshes(): LandMeshInfo[] {
    return this.landMeshes.map(info => ({
      mesh: info.mesh,
      boundingBox: info.boundingBox.clone(),
      priority: info.priority
    }))
  }

  /**
   * Get ground height at position (public wrapper for debugging)
   */
  public getGroundHeight(x: number, z: number): number {
    return this.getGroundHeightOptimized(x, z)
  }

  /**
   * Fallback ground height detection using bounding boxes
   */
  public getGroundHeightFallback(x: number, z: number): number {
    if (this.landMeshes.length === 0) {
      return -4.0
    }

    let groundHeight = -4.0 // Default to sea level
    let closestDistance = Infinity
    let closestMesh = null
    
    // Check each land mesh's bounding box
    for (const info of this.landMeshes) {
      const mesh = info.mesh
      const boundingBox = info.boundingBox
      
      // Calculate distance to mesh center for better fallback
      const center = new THREE.Vector3()
      boundingBox.getCenter(center)
      const distance = new THREE.Vector3(x, 0, z).distanceTo(new THREE.Vector3(center.x, 0, center.z))
      
      if (distance < closestDistance) {
        closestDistance = distance
        closestMesh = mesh
      }
      
      // Check if point is within this mesh's X-Z bounds
      if (x >= boundingBox.min.x && x <= boundingBox.max.x &&
          z >= boundingBox.min.z && z <= boundingBox.max.z) {
        
        // For plane meshes, the ground height is the mesh's Y position
        if (mesh.userData.landType === 'plane') {
          groundHeight = Math.max(groundHeight, mesh.position.y)
        }
        // For other types, use the bottom of the bounding box
        else {
          groundHeight = Math.max(groundHeight, boundingBox.min.y)
        }
      }
    }
    
    // If we're outside all bounds, use the closest mesh as reference
    if (groundHeight === -4.0 && closestMesh) {
      const boundingBox = this.landMeshes.find(info => info.mesh === closestMesh)?.boundingBox
      if (boundingBox) {
        // Use the mesh's Y position as a reasonable fallback
        groundHeight = closestMesh.position.y
        // logger.debug(LogModule.COLLISION, `Using closest mesh fallback: ${closestMesh.userData.id} at Y=${groundHeight.toFixed(2)} (${closestDistance.toFixed(1)} units away)`)
      }
    }
    
    return groundHeight
  }

  /**
   * Debug method to test collision detection at a specific position
   */
  public debugCollisionTest(position: THREE.Vector3): void {
    console.log(`=== 🔍 COLLISION DEBUG TEST at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) ===`)
    
    // Test ground height detection
    const groundHeight = this.getGroundHeightOptimized(position.x, position.z)
    console.log(`Ground height: ${groundHeight.toFixed(2)}`)
    
    // List all land meshes with their bounds
    console.log(`Land meshes (${this.landMeshes.length}):`)
    this.landMeshes.forEach((info, index) => {
      const bbox = info.boundingBox
      const contains = position.x >= bbox.min.x && position.x <= bbox.max.x && 
                      position.z >= bbox.min.z && position.z <= bbox.max.z
      console.log(`  ${index}: ${info.mesh.userData.id} bounds: X(${bbox.min.x.toFixed(1)} to ${bbox.max.x.toFixed(1)}) Z(${bbox.min.z.toFixed(1)} to ${bbox.max.z.toFixed(1)}) contains: ${contains}`)
    })
    
    console.log(`=== End Debug Test ===`)
  }

  /**
   * Simple debug method to check land mesh info
   */
  public debugLandMeshes(): void {
    console.log(`🏔️ LAND MESHES DEBUG (${this.landMeshes.length} registered):`)
    this.landMeshes.forEach((info, index) => {
      const mesh = info.mesh
      const bbox = info.boundingBox
      const size = bbox.getSize(new THREE.Vector3())
      console.log(`${index}: ${mesh.userData.id}`)
      console.log(`  Position: (${mesh.position.x}, ${mesh.position.y}, ${mesh.position.z})`)
      console.log(`  Size: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`)
      console.log(`  Bounds: X(${bbox.min.x.toFixed(1)} to ${bbox.max.x.toFixed(1)}) Z(${bbox.min.z.toFixed(1)} to ${bbox.max.z.toFixed(1)})`)
      
      // Show shader parameters if available
      if (mesh.material instanceof THREE.ShaderMaterial && mesh.material.uniforms) {
        const uniforms = mesh.material.uniforms
        console.log(`  Shader Parameters:`)
        if (uniforms.uElevation) console.log(`    Elevation: ${uniforms.uElevation.value}`)
        if (uniforms.uRoughness) console.log(`    Roughness: ${uniforms.uRoughness.value}`)
        if (uniforms.uScale) console.log(`    Scale: ${uniforms.uScale.value}`)
        if (uniforms.uIslandRadius) console.log(`    Island Radius: ${uniforms.uIslandRadius.value}`)
        if (uniforms.uCoastSmoothness) console.log(`    Coast Smoothness: ${uniforms.uCoastSmoothness.value}`)
      }
    })
  }

  // ============================================================================
  // INTELLIGENT SHADER-BASED TERRAIN HEIGHT CALCULATION
  // ============================================================================

  /**
   * Calculate terrain height at a specific point using shader parameters
   * This intelligently replicates the vertex shader displacement calculation
   */
  private calculateShaderTerrainHeight(mesh: THREE.Mesh, worldX: number, worldZ: number): number {
    const baseHeight = mesh.position.y
    
    // Check if this mesh uses shader-based displacement
    if (!(mesh.material instanceof THREE.ShaderMaterial) || !mesh.material.uniforms) {
      return baseHeight
    }
    
    const uniforms = mesh.material.uniforms
    
    // Extract shader parameters with defaults
    const elevation = uniforms.uElevation?.value || 0
    const roughness = uniforms.uRoughness?.value || 1
    const scale = uniforms.uScale?.value || 1
    const islandRadius = uniforms.uIslandRadius?.value || 35
    const coastSmoothness = uniforms.uCoastSmoothness?.value || 8
    const seaLevel = uniforms.uSeaLevel?.value || -4
    
    // Convert world coordinates to local mesh coordinates
    const localX = worldX - mesh.position.x
    const localZ = worldZ - mesh.position.z
    
    // Calculate distance from center (for island-style terrain)
    const distanceFromCenter = Math.sqrt(localX * localX + localZ * localZ)
    
    // Calculate base noise height (simplified noise approximation)
    const noiseHeight = this.calculateTerrainNoise(localX * scale, localZ * scale, roughness)
    
    // Apply island mask (terrain falls off towards edges)
    const islandMask = this.calculateIslandMask(distanceFromCenter, islandRadius, coastSmoothness)
    
    // Combine all height factors
    let finalHeight = baseHeight + (noiseHeight * elevation * islandMask)
    
    // Ensure terrain doesn't go below sea level at edges
    finalHeight = Math.max(finalHeight, seaLevel)
    
    return finalHeight
  }

  /**
   * Simplified terrain noise calculation (approximates shader noise)
   */
  private calculateTerrainNoise(x: number, z: number, roughness: number): number {
    // Multi-octave noise approximation
    let height = 0
    let amplitude = 1
    let frequency = 0.01
    
    // 3 octaves of noise for terrain detail
    for (let i = 0; i < 3; i++) {
      // Simple pseudo-noise using sine/cosine (approximates GPU noise)
      const noise1 = Math.sin(x * frequency) * Math.cos(z * frequency)
      const noise2 = Math.sin(x * frequency * 2.1) * Math.cos(z * frequency * 1.9)
      const noise3 = Math.sin(x * frequency * 4.3) * Math.cos(z * frequency * 3.7)
      
      const octaveNoise = (noise1 + noise2 * 0.5 + noise3 * 0.25) / 1.75
      height += octaveNoise * amplitude * roughness
      
      amplitude *= 0.5
      frequency *= 2
    }
    
    // Normalize to 0-1 range
    return Math.max(0, Math.min(1, (height + 1) * 0.5))
  }

  /**
   * Calculate island mask (terrain falloff towards edges)
   */
  private calculateIslandMask(distanceFromCenter: number, islandRadius: number, coastSmoothness: number): number {
    if (distanceFromCenter < islandRadius) {
      return 1.0 // Full height inside island
    }
    
    // Smooth falloff beyond island radius
    const falloffDistance = distanceFromCenter - islandRadius
    const falloffFactor = Math.exp(-falloffDistance / coastSmoothness)
    
    return Math.max(0, falloffFactor)
  }

  /**
   * Get terrain height with intelligent shader parameter tracking
   */
  public getTerrainHeight(x: number, z: number): number {
    return this.getGroundHeightOptimized(x, z)
  }

  /**
   * Test terrain height calculation at a specific point
   */
  public debugTerrainHeight(x: number, z: number): void {
    console.log(`🏔️ TERRAIN HEIGHT DEBUG at (${x.toFixed(2)}, ${z.toFixed(2)}):`)
    
    const groundHeight = this.getGroundHeightOptimized(x, z)
    console.log(`  Final Ground Height: ${groundHeight.toFixed(2)}`)
    
    // Show breakdown for each land mesh
    this.landMeshes.forEach((info, index) => {
      const mesh = info.mesh
      const boundingBox = info.boundingBox
      
      if (x >= boundingBox.min.x && x <= boundingBox.max.x &&
          z >= boundingBox.min.z && z <= boundingBox.max.z) {
        
        if (mesh.userData.landType === 'plane') {
          const shaderHeight = this.calculateShaderTerrainHeight(mesh, x, z)
          console.log(`  ${mesh.userData.id}: shader height = ${shaderHeight.toFixed(2)}`)
          
          if (mesh.material instanceof THREE.ShaderMaterial && mesh.material.uniforms) {
            const uniforms = mesh.material.uniforms
            console.log(`    Elevation: ${uniforms.uElevation?.value || 0}`)
            console.log(`    Roughness: ${uniforms.uRoughness?.value || 1}`)
            console.log(`    Scale: ${uniforms.uScale?.value || 1}`)
          }
        } else {
          console.log(`  ${mesh.userData.id}: bbox height = ${boundingBox.max.y.toFixed(2)}`)
        }
      }
    })
  }
} 