import * as THREE from 'three'
import { CollisionSystem, CollisionVolume, CollidableObject } from './CollisionSystem'
import { CameraManager } from './CameraManager'
import { logger, LogModule } from './Logger'

// ============================================================================
// PLAYER CONFIGURATION
// ============================================================================

export interface PlayerConfig {
  // Physical properties
  height: number
  radius: number
  mass: number
  
  // Movement properties
  walkSpeed: number
  runSpeed: number
  jumpForce: number
  gravity: number
  
  // Physics properties
  groundCheckDistance: number
  friction: number
  airResistance: number
}

export interface PlayerState {
  position: THREE.Vector3
  velocity: THREE.Vector3
  onGround: boolean
  canJump: boolean
  isMoving: boolean
  isRunning: boolean
}

export interface PlayerInput {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
  run: boolean
}

// ============================================================================
// PLAYER CONTROLLER
// ============================================================================

export class PlayerController {
  // Core systems
  private scene: THREE.Scene
  private collisionSystem: CollisionSystem
  private cameraManager: CameraManager
  
  // Configuration
  private config: PlayerConfig
  
  // State
  private state: PlayerState
  private input: PlayerInput
  
  // Visual representation
  private mesh!: THREE.Mesh
  private debugWireframe: THREE.Object3D | null = null
  private isDebugVisible: boolean = false
  
  // Collision
  private collisionVolume!: CollisionVolume
  
  // Input handling
  private keyStates: Map<string, boolean> = new Map()
  private boundKeyDown: (event: KeyboardEvent) => void
  private boundKeyUp: (event: KeyboardEvent) => void
  
  constructor(
    scene: THREE.Scene,
    collisionSystem: CollisionSystem,
    cameraManager: CameraManager,
    config?: Partial<PlayerConfig>
  ) {
    this.scene = scene
    this.collisionSystem = collisionSystem
    this.cameraManager = cameraManager
    
    // Initialize configuration
    this.config = {
      height: 1.8,
      radius: 0.5,
      mass: 70,
      walkSpeed: 5.0,
      runSpeed: 8.0,
      jumpForce: 8.0,
      gravity: 20.0,
      groundCheckDistance: 0.1,
      friction: 0.8,
      airResistance: 0.95,
      ...config
    }
    
    // Initialize state
    this.state = {
      position: new THREE.Vector3(0, 10, 0),
      velocity: new THREE.Vector3(),
      onGround: false,
      canJump: true,
      isMoving: false,
      isRunning: false
    }
    
    // Initialize input
    this.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      run: false
    }
    
    // Bind input handlers
    this.boundKeyDown = this.handleKeyDown.bind(this)
    this.boundKeyUp = this.handleKeyUp.bind(this)
    
    // Initialize player
    this.initializePlayer()
    this.setupInputHandlers()
    this.registerWithCollisionSystem()
    
    logger.info(LogModule.PLAYER, 'PlayerController initialized')
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializePlayer(): void {
    // Create player mesh (capsule-like shape)
    const geometry = new THREE.CylinderGeometry(
      this.config.radius,
      this.config.radius,
      this.config.height,
      8
    )
    
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a90e2,
      transparent: true,
      opacity: 0.8
    })
    
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.position.copy(this.state.position)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.name = 'PlayerMesh'
    this.scene.add(this.mesh)
    
    // Create collision volume
    this.collisionVolume = {
      type: 'capsule',
      position: this.state.position.clone(),
      rotation: new THREE.Euler(),
      dimensions: new THREE.Vector3(
        this.config.radius,
        this.config.height,
        0
      )
    }
    
    // Create debug wireframe
    this.createDebugWireframe()
  }

  private createDebugWireframe(): void {
    this.debugWireframe = this.collisionSystem.createDebugWireframe(this.collisionVolume, 0x00ff00)
    this.debugWireframe.position.copy(this.state.position)
    this.debugWireframe.visible = false
    this.scene.add(this.debugWireframe)
  }

  private registerWithCollisionSystem(): void {
    const collidableObject: CollidableObject = {
      id: 'player',
      mesh: this.mesh,
      collisionVolume: this.collisionVolume,
      isStatic: false
    }
    
    this.collisionSystem.registerObject(collidableObject)
    
    logger.info(LogModule.PLAYER, `Player registered with collision system at position (${this.state.position.x.toFixed(2)}, ${this.state.position.y.toFixed(2)}, ${this.state.position.z.toFixed(2)})`)
  }

  private setupInputHandlers(): void {
    document.addEventListener('keydown', this.boundKeyDown)
    document.addEventListener('keyup', this.boundKeyUp)
  }

  // ============================================================================
  // INPUT HANDLING
  // ============================================================================

  private handleKeyDown(event: KeyboardEvent): void {
    // Prevent default for game keys
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault()
    }
    
    this.keyStates.set(event.code, true)
    this.updateInputState()
    
    logger.debug(LogModule.PLAYER, `Key pressed: ${event.code}`)
  }

  private handleKeyUp(event: KeyboardEvent): void {
    this.keyStates.set(event.code, false)
    this.updateInputState()
    
    logger.debug(LogModule.PLAYER, `Key released: ${event.code}`)
  }

  private updateInputState(): void {
    this.input.forward = this.keyStates.get('KeyW') || false
    this.input.backward = this.keyStates.get('KeyS') || false
    this.input.left = this.keyStates.get('KeyA') || false
    this.input.right = this.keyStates.get('KeyD') || false
    this.input.jump = this.keyStates.get('Space') || false
    this.input.run = (this.keyStates.get('ShiftLeft') || this.keyStates.get('ShiftRight')) || false
  }

  // ============================================================================
  // MOVEMENT SYSTEM
  // ============================================================================

  public update(deltaTime: number): void {
    // Always update movement and input
    this.updateMovement(deltaTime)
    
    // Update collision system
    this.collisionSystem.updatePlayerPosition(this.state.position)
    
    // Always update physics and visuals
    this.updatePhysics(deltaTime)
    this.updateVisuals()
    this.updateCamera()
    
    // Log state occasionally
    if (Math.random() < 0.01) {
      logger.debug(LogModule.PLAYER, `State: pos=(${this.state.position.x.toFixed(2)}, ${this.state.position.y.toFixed(2)}, ${this.state.position.z.toFixed(2)}), vel=(${this.state.velocity.x.toFixed(2)}, ${this.state.velocity.y.toFixed(2)}, ${this.state.velocity.z.toFixed(2)}), onGround=${this.state.onGround}, moving=${this.state.isMoving}`)
    }
  }

  private updateMovement(deltaTime: number): void {
    // Get camera direction for movement
    const camera = this.cameraManager.getCurrentCamera()
    const cameraDirection = new THREE.Vector3()
    camera.getWorldDirection(cameraDirection)
    
    // Create movement direction
    const moveDirection = new THREE.Vector3()
    
    if (this.input.forward) {
      moveDirection.add(cameraDirection.clone().setY(0).normalize())
    }
    if (this.input.backward) {
      moveDirection.sub(cameraDirection.clone().setY(0).normalize())
    }
    if (this.input.left) {
      moveDirection.add(cameraDirection.clone().setY(0).cross(new THREE.Vector3(0, 1, 0)).normalize())
    }
    if (this.input.right) {
      moveDirection.sub(cameraDirection.clone().setY(0).cross(new THREE.Vector3(0, 1, 0)).normalize())
    }
    
    // Apply movement
    if (moveDirection.length() > 0) {
      moveDirection.normalize()
      
      // Determine speed
      const speed = this.input.run ? this.config.runSpeed : this.config.walkSpeed
      const movement = moveDirection.multiplyScalar(speed * deltaTime)
      
      // Apply horizontal movement
      this.state.velocity.x = movement.x
      this.state.velocity.z = movement.z
      this.state.isMoving = true
      this.state.isRunning = this.input.run
      
      logger.debug(LogModule.PLAYER, `Movement: speed=${speed}, direction=(${moveDirection.x.toFixed(2)}, ${moveDirection.z.toFixed(2)}), input=(${this.input.forward},${this.input.backward},${this.input.left},${this.input.right})`)
    } else {
      // Apply friction when not moving
      this.state.velocity.x *= this.config.friction
      this.state.velocity.z *= this.config.friction
      this.state.isMoving = false
      this.state.isRunning = false
      
      // Log when no movement input
      if (this.input.forward || this.input.backward || this.input.left || this.input.right) {
        logger.debug(LogModule.PLAYER, `No movement despite input: forward=${this.input.forward}, backward=${this.input.backward}, left=${this.input.left}, right=${this.input.right}`)
      }
    }
    
    // Handle jumping
    if (this.input.jump && this.state.onGround && this.state.canJump) {
      this.state.velocity.y = this.config.jumpForce
      this.state.onGround = false
      this.state.canJump = false
      
      logger.debug(LogModule.PLAYER, 'Jump initiated')
    }
    
    // Reset jump flag when on ground
    if (this.state.onGround) {
      this.state.canJump = true
    }
  }

  private updatePhysics(deltaTime: number): void {
    // Apply gravity
    if (!this.state.onGround) {
      this.state.velocity.y -= this.config.gravity * deltaTime
    }
    
    // Apply air resistance
    if (!this.state.onGround) {
      this.state.velocity.x *= this.config.airResistance
      this.state.velocity.z *= this.config.airResistance
    }
    
    // Calculate new position
    const newPosition = this.state.position.clone().add(
      this.state.velocity.clone().multiplyScalar(deltaTime)
    )
    
    // Check collision
    const collision = this.collisionSystem.checkCollision('player', newPosition)
    
    if (collision.hasCollision) {
      // Handle collision
      this.state.position.copy(collision.correctedPosition)
      
      // Check if we're on ground
      const groundHeight = this.collisionSystem.getGroundHeight(this.state.position.x, this.state.position.z)
      this.state.onGround = Math.abs(this.state.position.y - groundHeight) < this.config.groundCheckDistance
      
      // Reset vertical velocity if on ground
      if (this.state.onGround && this.state.velocity.y < 0) {
        this.state.velocity.y = 0
      }
      
      logger.debug(LogModule.PLAYER, `Collision: corrected to (${this.state.position.x.toFixed(2)}, ${this.state.position.y.toFixed(2)}, ${this.state.position.z.toFixed(2)})`)
    } else {
      // No collision, update position
      this.state.position.copy(newPosition)
      
      // Check if we're on ground
      const groundHeight = this.collisionSystem.getGroundHeight(this.state.position.x, this.state.position.z)
      this.state.onGround = Math.abs(this.state.position.y - groundHeight) < this.config.groundCheckDistance
    }
    
    // Update collision volume
    this.collisionVolume.position.copy(this.state.position)
  }

  private updateVisuals(): void {
    // Update mesh position (offset down from eye level)
    const meshPosition = this.state.position.clone()
    meshPosition.y -= this.config.height / 2
    this.mesh.position.copy(meshPosition)
    
    // Update debug wireframe
    if (this.debugWireframe) {
      this.debugWireframe.position.copy(this.state.position)
    }
  }

  private updateCamera(): void {
    // Update camera position through camera manager
    this.cameraManager.setPlayerPosition(this.state.position)
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  public setPosition(position: THREE.Vector3): void {
    this.state.position.copy(position)
    this.collisionVolume.position.copy(position)
    
    // Update mesh position
    const meshPosition = position.clone()
    meshPosition.y -= this.config.height / 2
    this.mesh.position.copy(meshPosition)
    
    // Update debug wireframe
    if (this.debugWireframe) {
      this.debugWireframe.position.copy(position)
    }
    
    // Update camera
    this.cameraManager.setPlayerPosition(position)
    
    logger.debug(LogModule.PLAYER, `Position set to (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`)
  }

  public getPosition(): THREE.Vector3 {
    return this.state.position.clone()
  }

  public getVelocity(): THREE.Vector3 {
    return this.state.velocity.clone()
  }

  public getMesh(): THREE.Mesh {
    return this.mesh
  }

  public getCollisionVolume(): CollisionVolume {
    return this.collisionVolume
  }

  public isOnGround(): boolean {
    return this.state.onGround
  }

  public isMoving(): boolean {
    return this.state.isMoving
  }

  public isRunning(): boolean {
    return this.state.isRunning
  }

  public getConfig(): PlayerConfig {
    return { ...this.config }
  }

  public updateConfig(config: Partial<PlayerConfig>): void {
    this.config = { ...this.config, ...config }
    
    // Update collision volume if dimensions changed
    if (config.radius !== undefined || config.height !== undefined) {
      this.collisionVolume.dimensions.set(
        this.config.radius,
        this.config.height,
        0
      )
    }
    
    logger.debug(LogModule.PLAYER, 'Player config updated')
  }

  public setDebugVisible(visible: boolean): void {
    this.isDebugVisible = visible
    if (this.debugWireframe) {
      this.debugWireframe.visible = visible
    }
    logger.debug(LogModule.PLAYER, `Debug wireframe ${visible ? 'shown' : 'hidden'}`)
  }

  public isDebugWireframeVisible(): boolean {
    return this.isDebugVisible
  }

  public getStatus(): object {
    return {
      position: this.state.position.toArray(),
      velocity: this.state.velocity.toArray(),
      onGround: this.state.onGround,
      canJump: this.state.canJump,
      isMoving: this.state.isMoving,
      isRunning: this.state.isRunning,
      input: { ...this.input },
      config: this.getConfig()
    }
  }

  public dispose(): void {
    // Remove from collision system
    this.collisionSystem.unregisterObject('player')
    
    // Remove from scene
    this.scene.remove(this.mesh)
    if (this.debugWireframe) {
      this.scene.remove(this.debugWireframe)
    }
    
    // Remove event listeners
    document.removeEventListener('keydown', this.boundKeyDown)
    document.removeEventListener('keyup', this.boundKeyUp)
    
    // Dispose geometries and materials
    this.mesh.geometry.dispose()
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(mat => mat.dispose())
    } else {
      this.mesh.material.dispose()
    }
    
    logger.info(LogModule.PLAYER, 'PlayerController disposed')
  }
} 