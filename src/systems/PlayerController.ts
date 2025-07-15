import * as THREE from 'three'
import { CollisionSystem, CollisionVolume, CollidableObject } from './CollisionSystem'
import { CameraManager } from './CameraManager'
import { logger, LogModule } from './Logger'

export interface PlayerConfig {
  position: THREE.Vector3
  capsuleRadius: number
  capsuleHeight: number
  moveSpeed: number
  jumpSpeed: number
  gravity: number
}

export interface MovementInput {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
  run: boolean
}

export class PlayerController {
  private scene: THREE.Scene
  private collisionSystem: CollisionSystem
  private cameraManager: CameraManager
  
  // Player properties
  private position: THREE.Vector3
  private velocity: THREE.Vector3 = new THREE.Vector3()
  private onGround: boolean = false
  
  // Player configuration
  private config: PlayerConfig = {
    position: new THREE.Vector3(0, 20, 0), // Start 15 units higher (5 + 15 = 20)
    capsuleRadius: 0.5,
    capsuleHeight: 2.0,
    moveSpeed: 25.0, // Increased from 15.0 to 25.0 for faster movement
    jumpSpeed: 8.0,
    gravity: 20.0
  }
  
  // Visual representation
  private playerMesh!: THREE.Mesh // Simple cube inside capsule
  private debugWireframe: THREE.Object3D | null = null
  private isDebugVisible: boolean = false
  
  // Movement input
  private movementInput: MovementInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    run: false
  }
  
  // Collision volume
  private collisionVolume!: CollisionVolume
  
  constructor(scene: THREE.Scene, collisionSystem: CollisionSystem, cameraManager: CameraManager, config?: Partial<PlayerConfig>) {
    this.scene = scene
    this.collisionSystem = collisionSystem
    this.cameraManager = cameraManager
    
    // Apply custom config
    if (config) {
      this.config = { ...this.config, ...config }
    }
    
    this.position = this.config.position.clone()
    
    this.initializePlayer()
    this.setupInputHandlers()
    this.registerWithCollisionSystem()
    
    logger.info(LogModule.PLAYER, 'PlayerController initialized')
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializePlayer(): void {
    // Create player visual mesh (simple cube inside capsule)
    const geometry = new THREE.BoxGeometry(1, 2, 1) // 1x2x1 units as specified
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x4a90e2,
      transparent: true,
      opacity: 0.8
    })
    
    this.playerMesh = new THREE.Mesh(geometry, material)
    this.playerMesh.position.copy(this.position)
    this.playerMesh.castShadow = true
    this.playerMesh.name = 'PlayerMesh'
    this.scene.add(this.playerMesh)
    
    // Create collision volume
    this.collisionVolume = {
      type: 'capsule',
      position: this.position.clone(),
      rotation: new THREE.Euler(0, 0, 0),
      dimensions: new THREE.Vector3(
        this.config.capsuleRadius,
        this.config.capsuleHeight,
        0
      )
    }
    
    // Create debug wireframe (initially hidden)
    this.createDebugWireframe()
  }

  private createDebugWireframe(): void {
    this.debugWireframe = this.collisionSystem.createDebugWireframe(this.collisionVolume, 0x00ff00)
    this.debugWireframe.position.copy(this.position)
    this.debugWireframe.visible = false
    this.scene.add(this.debugWireframe)
  }

  private registerWithCollisionSystem(): void {
    const collidableObject: CollidableObject = {
      id: 'player',
      mesh: this.playerMesh,
      collisionVolume: this.collisionVolume,
      isStatic: false
    }
    
    this.collisionSystem.registerObject(collidableObject)
    
    // Debug: Log player registration
    logger.info(LogModule.PLAYER, `Player registered with collision system: position=(${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)})`)
    logger.info(LogModule.PLAYER, `Collision volume: ${this.collisionVolume.type} radius=${this.collisionVolume.dimensions.x} height=${this.collisionVolume.dimensions.y}`)
  }

  private setupInputHandlers(): void {
    // Keyboard input for movement
    document.addEventListener('keydown', this.onKeyDown.bind(this))
    document.addEventListener('keyup', this.onKeyUp.bind(this))
  }

  // ============================================================================
  // INPUT HANDLING
  // ============================================================================

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.movementInput.forward = true
        break
      case 'KeyS':
      case 'ArrowDown':
        this.movementInput.backward = true
        break
      case 'KeyA':
      case 'ArrowLeft':
        this.movementInput.left = true
        break
      case 'KeyD':
      case 'ArrowRight':
        this.movementInput.right = true
        break
      case 'Space':
        this.movementInput.jump = true
        event.preventDefault()
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        this.movementInput.run = true
        break
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.movementInput.forward = false
        break
      case 'KeyS':
      case 'ArrowDown':
        this.movementInput.backward = false
        break
      case 'KeyA':
      case 'ArrowLeft':
        this.movementInput.left = false
        break
      case 'KeyD':
      case 'ArrowRight':
        this.movementInput.right = false
        break
      case 'Space':
        this.movementInput.jump = false
        break
      case 'ShiftLeft':
      case 'ShiftRight':
        this.movementInput.run = false
        break
    }
  }

  // ============================================================================
  // MOVEMENT AND PHYSICS
  // ============================================================================

  /**
   * Update player physics and movement
   */
  public update(deltaTime: number): void {
    this.updateMovement(deltaTime)
    this.updatePhysics(deltaTime)
    this.updateVisuals()
    this.updateCamera()
  }

  private updateMovement(deltaTime: number): void {
    if (this.cameraManager.getCurrentMode() !== 'player') {
      return // Only process movement in player camera mode
    }
    
    // Debug: Log input state occasionally
    if (Math.random() < 0.01) { // 1% chance per frame
      logger.debug(LogModule.PLAYER, `Input state: forward=${this.movementInput.forward}, backward=${this.movementInput.backward}, left=${this.movementInput.left}, right=${this.movementInput.right}`)
    }
    
    const moveVector = new THREE.Vector3()
    const camera = this.cameraManager.getPlayerCamera()
    
    // Get camera forward and right vectors (only horizontal)
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    
    const right = new THREE.Vector3()
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0))
    right.normalize()
    
    // Calculate movement based on input
    if (this.movementInput.forward) {
      moveVector.add(forward)
    }
    if (this.movementInput.backward) {
      moveVector.sub(forward)
    }
    if (this.movementInput.right) {
      moveVector.add(right)
    }
    if (this.movementInput.left) {
      moveVector.sub(right)
    }
    
    // Normalize and apply speed
    if (moveVector.length() > 0) {
      moveVector.normalize()
      const speed = this.movementInput.run ? this.config.moveSpeed * 2 : this.config.moveSpeed
      moveVector.multiplyScalar(speed * deltaTime)
      
      // Apply horizontal movement to velocity
      this.velocity.x = moveVector.x
      this.velocity.z = moveVector.z
      
      // Debug: Log movement occasionally
      if (Math.random() < 0.01) { // 1% chance per frame
        logger.debug(LogModule.PLAYER, `Movement applied: velocity=(${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}, ${this.velocity.z.toFixed(2)})`)
      }
    } else {
      // Apply friction when not moving
      this.velocity.x *= 0.8
      this.velocity.z *= 0.8
    }
    
    // Handle jumping
    if (this.movementInput.jump && this.onGround) {
      this.velocity.y = this.config.jumpSpeed
      this.onGround = false
    }
  }

  private updatePhysics(deltaTime: number): void {
    // Apply gravity
    if (!this.onGround) {
      this.velocity.y -= this.config.gravity * deltaTime
    }
    
    // Calculate new position
    const newPosition = this.position.clone()
    newPosition.add(this.velocity.clone().multiplyScalar(deltaTime))
    
    // Update collision system with player position for optimization
    this.collisionSystem.updatePlayerPosition(this.position)
    
    // Check collision (throttled for performance)
    const collision = this.collisionSystem.checkCollision('player', newPosition)
    
    if (collision.hasCollision) {
      // Resolve collision
      this.position.copy(collision.correctedPosition)
      
      // Stop downward velocity if we hit ground
      if (collision.normal.y > 0.7) { // Surface is mostly horizontal
        this.velocity.y = Math.max(0, this.velocity.y)
        this.onGround = true
        
        // Debug: Log successful ground collision
        if (Math.random() < 0.01) { // 1% chance per frame
          logger.debug(LogModule.PLAYER, `Ground collision: corrected position=(${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)})`)
        }
      }
    } else {
      // No collision, apply movement
      this.position.copy(newPosition)
      this.onGround = false
      
      // Debug: Log no collision occasionally
      if (Math.random() < 0.01) { // 1% chance per frame
        logger.debug(LogModule.PLAYER, `No collision: new position=(${this.position.x.toFixed(2)}, ${this.position.y.toFixed(2)}, ${this.position.z.toFixed(2)})`)
      }
    }
    
    // Update collision volume position
    this.collisionVolume.position.copy(this.position)
  }

  private updateVisuals(): void {
    // Update player mesh position
    this.playerMesh.position.copy(this.position)
    
    // Update debug wireframe position
    if (this.debugWireframe) {
      this.debugWireframe.position.copy(this.position)
    }
  }

  private updateCamera(): void {
    // Update camera manager with player position
    this.cameraManager.setPlayerPosition(this.position)
  }

  // ============================================================================
  // DEBUG CONTROLS
  // ============================================================================

  /**
   * Toggle debug wireframe visibility
   */
  public setDebugVisible(visible: boolean): void {
    this.isDebugVisible = visible
    
    if (this.debugWireframe) {
      this.debugWireframe.visible = visible
    }
    
    // Also control player mesh visibility based on debug mode
    this.playerMesh.visible = visible
    
    // console.log(`🎮 Player debug wireframe: ${visible ? 'visible' : 'hidden'}`)
  }

  /**
   * Get debug wireframe visibility
   */
  public isDebugWireframeVisible(): boolean {
    return this.isDebugVisible
  }

  // ============================================================================
  // GETTERS AND SETTERS
  // ============================================================================

  /**
   * Get player position
   */
  public getPosition(): THREE.Vector3 {
    return this.position.clone()
  }

  /**
   * Set player position
   */
  public setPosition(position: THREE.Vector3): void {
    this.position.copy(position)
    this.updateVisuals()
    this.updateCamera()
  }

  /**
   * Get player velocity
   */
  public getVelocity(): THREE.Vector3 {
    return this.velocity.clone()
  }

  /**
   * Get player mesh
   */
  public getMesh(): THREE.Mesh {
    return this.playerMesh
  }

  /**
   * Get collision volume
   */
  public getCollisionVolume(): CollisionVolume {
    return { ...this.collisionVolume }
  }

  /**
   * Check if player is on ground
   */
  public isOnGround(): boolean {
    return this.onGround
  }

  /**
   * Get player configuration
   */
  public getConfig(): PlayerConfig {
    return { ...this.config }
  }

  /**
   * Update player configuration
   */
  public updateConfig(config: Partial<PlayerConfig>): void {
    this.config = { ...this.config, ...config }
    
    // Update collision volume if dimensions changed
    if (config.capsuleRadius !== undefined || config.capsuleHeight !== undefined) {
      this.collisionVolume.dimensions.set(
        this.config.capsuleRadius,
        this.config.capsuleHeight,
        0
      )
      
      // Recreate debug wireframe
      if (this.debugWireframe) {
        this.scene.remove(this.debugWireframe)
        this.createDebugWireframe()
        this.debugWireframe.visible = this.isDebugVisible
      }
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get player status for debugging
   */
  public getStatus(): object {
    return {
      position: this.position.toArray(),
      velocity: this.velocity.toArray(),
      onGround: this.onGround,
      debugVisible: this.isDebugVisible,
      movementInput: { ...this.movementInput },
      config: { ...this.config }
    }
  }

  /**
   * Dispose of player controller resources
   */
  public dispose(): void {
    // Remove from collision system
    this.collisionSystem.unregisterObject('player')
    
    // Remove from scene
    this.scene.remove(this.playerMesh)
    if (this.debugWireframe) {
      this.scene.remove(this.debugWireframe)
    }
    
    // Remove event listeners
    document.removeEventListener('keydown', this.onKeyDown.bind(this))
    document.removeEventListener('keyup', this.onKeyUp.bind(this))
    
    // console.log('🎮 PlayerController disposed')
  }
} 