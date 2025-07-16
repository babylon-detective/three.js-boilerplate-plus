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
    // Filter out ocean meshes - only register actual land terrain
    const landMeshes = meshes.filter(mesh => {
      const userData = mesh.userData
      // Only include meshes that are explicitly marked as land
      return userData.type === 'land' || 
             userData.landType === 'plane' || 
             userData.landType === 'box' || 
             userData.landType === 'sphere' ||
             userData.landType === 'cylinder'
    })
    
    // Create optimized land mesh info with bounding boxes and priorities
    this.landMeshes = landMeshes.map(mesh => {
      const boundingBox = new THREE.Box3().setFromObject(mesh)
      let priority = 1
      
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
   * Check capsule collision with land (highly optimized)
   */
  private checkCapsuleLandCollision(volume: CollisionVolume, position: THREE.Vector3): CollisionResult {
    const radius = volume.dimensions.x
    const height = volume.dimensions.y
    const halfHeight = height * 0.5

    // Only check center point for performance - this is sufficient for most cases
    const centerPoint = new THREE.Vector3(position.x, position.y - halfHeight + radius, position.z)
    
    // Get ground height at center point
    const groundHeight = this.getGroundHeightOptimized(centerPoint.x, centerPoint.z)
    const penetration = groundHeight - (centerPoint.y - radius)

    if (penetration > 0) {
      const correctedPosition = position.clone()
      correctedPosition.y += penetration + 0.01 // Add small offset to prevent sticking

      return {
        hasCollision: true,
        penetrationDepth: penetration,
        normal: new THREE.Vector3(0, 1, 0), // Simplified normal calculation
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
   * Get ground height with intelligent LOD and spatial optimization
   */
  private getGroundHeightOptimized(x: number, z: number): number {
    const now = performance.now()
    
    // Create cache key (rounded to reduce cache entries)
    const cacheKey = `${Math.round(x * 5) / 5},${Math.round(z * 5) / 5}` // Coarser cache grid
    
    // Check cache first
    const cached = this.groundHeightCache.get(cacheKey)
    if (cached && (now - cached.timestamp) < this.cacheTimeout) {
      return cached.height
    }

    // For now, use ALL land meshes to ensure accuracy
    // TODO: Re-implement spatial optimization once basic collision works
    const allMeshes = this.landMeshes.map(info => info.mesh)
    
    if (allMeshes.length === 0) {
      const defaultHeight = -4.0
      logger.warn(LogModule.COLLISION, `No land meshes available, using default height: ${defaultHeight}`)
      return defaultHeight
    }

    // Cast ray from high above down to the ground
    this.raycaster.set(
      new THREE.Vector3(x, 1000, z),
      new THREE.Vector3(0, -1, 0)
    )

    // Use recursive raycasting to account for mesh transformations
    const intersects = this.raycaster.intersectObjects(allMeshes, true)
    
    let groundHeight = -4.0 // Default to sea level if no intersection
    
    if (intersects.length > 0) {
      groundHeight = intersects[0].point.y
      logger.debug(LogModule.COLLISION, `Found ground height at (${x.toFixed(1)}, ${z.toFixed(1)}): ${groundHeight.toFixed(2)} from ${intersects.length} intersections`)
      
      // Debug: Log the first intersection details
      if (Math.random() < 0.01) { // 1% chance per frame to avoid spam
        const firstIntersect = intersects[0]
        logger.debug(LogModule.COLLISION, `Intersection details: mesh=${firstIntersect.object.userData.id}, point=(${firstIntersect.point.x.toFixed(2)}, ${firstIntersect.point.y.toFixed(2)}, ${firstIntersect.point.z.toFixed(2)})`)
      }
    } else {
      logger.warn(LogModule.COLLISION, `No raycast intersections at (${x.toFixed(1)}, ${z.toFixed(1)}) with ${allMeshes.length} land meshes`)
      
      // Use fallback method when raycasting fails
      groundHeight = this.getGroundHeightFallback(x, z)
      logger.debug(LogModule.COLLISION, `Using fallback method, ground height: ${groundHeight.toFixed(2)}`)
      
      // Debug: Log mesh details when no intersection found
      if (Math.random() < 0.01) { // 1% chance per frame
        logger.debug(LogModule.COLLISION, `Available land meshes:`)
        allMeshes.forEach((mesh, index) => {
          logger.debug(LogModule.COLLISION, `  ${index}: ${mesh.userData.id} at (${mesh.position.x.toFixed(1)}, ${mesh.position.y.toFixed(1)}, ${mesh.position.z.toFixed(1)})`)
        })
        
        // Try a different approach - check if the point is within any mesh's bounding box
        logger.debug(LogModule.COLLISION, `Checking bounding boxes for point (${x.toFixed(1)}, ${z.toFixed(1)}):`)
        this.landMeshes.forEach((info, index) => {
          const mesh = info.mesh
          const boundingBox = info.boundingBox
          const isInside = boundingBox.containsPoint(new THREE.Vector3(x, 0, z))
          logger.debug(LogModule.COLLISION, `  ${index}: ${mesh.userData.id} - inside bbox: ${isInside}, bbox: ${boundingBox.min.x.toFixed(1)} to ${boundingBox.max.x.toFixed(1)}, ${boundingBox.min.z.toFixed(1)} to ${boundingBox.max.z.toFixed(1)}`)
        })
      }
    }

    // Cache the result
    this.groundHeightCache.set(cacheKey, {
      x: Math.round(x * 5) / 5,
      z: Math.round(z * 5) / 5,
      height: groundHeight,
      timestamp: now
    })

    // Clean up old cache entries periodically
    if (this.groundHeightCache.size > 500) { // Reduced cache size
      this.cleanupCache()
    }

    return groundHeight
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
        logger.debug(LogModule.COLLISION, `Using closest mesh fallback: ${closestMesh.userData.id} at Y=${groundHeight.toFixed(2)} (${closestDistance.toFixed(1)} units away)`)
      }
    }
    
    return groundHeight
  }

  /**
   * Debug method to test collision detection at a specific position
   */
  public debugCollisionTest(position: THREE.Vector3): void {
    logger.info(LogModule.COLLISION, `=== Collision Debug Test at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}) ===`)
    
    // Test ground height detection
    const groundHeight = this.getGroundHeightOptimized(position.x, position.z)
    logger.info(LogModule.COLLISION, `Ground height at (${position.x.toFixed(2)}, ${position.z.toFixed(2)}): ${groundHeight.toFixed(2)}`)
    
    // Test capsule collision
    const capsuleVolume: CollisionVolume = {
      type: 'capsule',
      position: position.clone(),
      rotation: new THREE.Euler(0, 0, 0),
      dimensions: new THREE.Vector3(0.5, 2.0, 0) // Standard player capsule
    }
    
    const collision = this.checkCapsuleLandCollision(capsuleVolume, position)
    logger.info(LogModule.COLLISION, `Capsule collision result:`)
    logger.info(LogModule.COLLISION, `  Has collision: ${collision.hasCollision}`)
    logger.info(LogModule.COLLISION, `  Penetration depth: ${collision.penetrationDepth.toFixed(3)}`)
    logger.info(LogModule.COLLISION, `  Normal: (${collision.normal.x.toFixed(3)}, ${collision.normal.y.toFixed(3)}, ${collision.normal.z.toFixed(3)})`)
    logger.info(LogModule.COLLISION, `  Corrected position: (${collision.correctedPosition.x.toFixed(2)}, ${collision.correctedPosition.y.toFixed(2)}, ${collision.correctedPosition.z.toFixed(2)})`)
    
    // List all land meshes
    logger.info(LogModule.COLLISION, `Registered land meshes (${this.landMeshes.length}):`)
    this.landMeshes.forEach((info, index) => {
      logger.info(LogModule.COLLISION, `  ${index}: ${info.mesh.userData.id} (${info.mesh.userData.type}) priority=${info.priority}`)
    })
    
    logger.info(LogModule.COLLISION, `=== End Collision Debug Test ===`)
  }
} 