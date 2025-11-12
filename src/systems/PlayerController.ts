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
  camera: boolean // 'C' key for camera mode switching
  // Analog input for gamepad (0-1 values)
  analogMovement?: THREE.Vector2
  analogCamera?: THREE.Vector2
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
  
  // Gamepad input
  private gamepadInput: {
    movement: THREE.Vector2
    camera: THREE.Vector2
    jump: boolean
    run: boolean
    action: boolean
    cameraMode: boolean
  } = {
    movement: new THREE.Vector2(),
    camera: new THREE.Vector2(),
    jump: false,
    run: false,
    action: false,
    cameraMode: false
  }
  
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
      walkSpeed: 250.0,  // 10x faster (was 25.0)
      runSpeed: 1200.0,  // 3x sprint speed (was 400.0)
      jumpForce: 8.0,
      gravity: 20.0,
      groundCheckDistance: 0.6,  // Increased from 0.1 for more reliable ground detection
      friction: 0.8,
      airResistance: 0.95,
      ...config
    }
    
    // Initialize state
    this.state = {
      position: new THREE.Vector3(0, 3, 0), // CRITICAL FIX: Start above ground level (was 2, now 3)
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
      run: false,
      camera: false
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
    // Keyboard input
    const keyForward = this.keyStates.get('KeyW') || false
    const keyBackward = this.keyStates.get('KeyS') || false
    const keyLeft = this.keyStates.get('KeyA') || false
    const keyRight = this.keyStates.get('KeyD') || false
    const keyJump = this.keyStates.get('Space') || false
    const keyRun = (this.keyStates.get('ShiftLeft') || this.keyStates.get('ShiftRight')) || false
    const keyCamera = this.keyStates.get('KeyC') || false
    
    // Gamepad input (analog movement converted to digital)
    const gamepadForward = this.gamepadInput.movement.y > 0.1
    const gamepadBackward = this.gamepadInput.movement.y < -0.1
    const gamepadLeft = this.gamepadInput.movement.x < -0.1
    const gamepadRight = this.gamepadInput.movement.x > 0.1
    
    // Combine keyboard and gamepad input (OR logic - either input works)
    this.input.forward = keyForward || gamepadForward
    this.input.backward = keyBackward || gamepadBackward
    this.input.left = keyLeft || gamepadLeft
    this.input.right = keyRight || gamepadRight
    this.input.jump = keyJump || this.gamepadInput.jump
    this.input.run = keyRun || this.gamepadInput.run
    this.input.camera = keyCamera || this.gamepadInput.cameraMode
    
    // Store analog values for smooth movement
    this.input.analogMovement = this.gamepadInput.movement.clone()
    this.input.analogCamera = this.gamepadInput.camera.clone()
    
    // Debug: Log input state occasionally (disabled)
    // if (Math.random() < 0.01) { // 1% chance per frame to reduce spam
    //   console.log(`🎮 Input: forward=${this.input.forward}, backward=${this.input.backward}, left=${this.input.left}, right=${this.input.right}, run=${this.input.run}, camera=${this.input.camera}`)
    //   if (this.gamepadInput.movement.length() > 0.1) {
    //     console.log(`🎮 Gamepad movement: x=${this.gamepadInput.movement.x.toFixed(2)}, y=${this.gamepadInput.movement.y.toFixed(2)}`)
    //   }
    // }
  }

  // ============================================================================
  // GAMEPAD INPUT HANDLING
  // ============================================================================
  
  public handleGamepadInput(input: {
    movement: THREE.Vector2
    camera: THREE.Vector2
    jump: boolean
    run: boolean
    action: boolean
    cameraMode: boolean
  }): void {
    this.gamepadInput = {
      movement: input.movement.clone(),
      camera: input.camera.clone(),
      jump: input.jump,
      run: input.run,
      action: input.action,
      cameraMode: input.cameraMode
    }
    
    // CRITICAL FIX: Update input state immediately when gamepad input changes
    // This ensures gamepad input is processed even without keyboard events
    this.updateInputState()
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
    this.updateCamera(deltaTime)
    
    // Log state occasionally (commented out to reduce spam)
    // if (Math.random() < 0.01) {
    //   logger.debug(LogModule.PLAYER, `State: pos=(${this.state.position.x.toFixed(2)}, ${this.state.position.y.toFixed(2)}, ${this.state.position.z.toFixed(2)}), vel=(${this.state.velocity.x.toFixed(2)}, ${this.state.velocity.y.toFixed(2)}, ${this.state.velocity.z.toFixed(2)}), onGround=${this.state.onGround}, moving=${this.state.isMoving}`)
    // }
  }

  private updateMovement(deltaTime: number): void {
    // Get camera direction for movement
    const camera = this.cameraManager.getCurrentCamera()
    const cameraDirection = new THREE.Vector3()
    camera.getWorldDirection(cameraDirection)
    
    // Create movement direction
    const moveDirection = new THREE.Vector3()
    
    // Check if we have analog gamepad input
    const hasAnalogInput = this.input.analogMovement && this.input.analogMovement.length() > 0.1
    
    if (hasAnalogInput) {
      // Use analog gamepad input for smooth movement
      const analogX = this.input.analogMovement!.x
      const analogY = this.input.analogMovement!.y
      
      // Forward/backward based on analog Y
      if (Math.abs(analogY) > 0.1) {
        const forwardDir = cameraDirection.clone().setY(0).normalize()
        moveDirection.add(forwardDir.multiplyScalar(analogY))
      }
      
      // Left/right based on analog X
      if (Math.abs(analogX) > 0.1) {
        const rightDir = cameraDirection.clone().setY(0).cross(new THREE.Vector3(0, 1, 0)).normalize()
        moveDirection.add(rightDir.multiplyScalar(analogX))
      }
    } else {
      // Use digital keyboard/button input
      if (this.input.forward) {
        moveDirection.add(cameraDirection.clone().setY(0).normalize())
      }
      if (this.input.backward) {
        moveDirection.sub(cameraDirection.clone().setY(0).normalize())
      }
      if (this.input.left) {
        moveDirection.sub(cameraDirection.clone().setY(0).cross(new THREE.Vector3(0, 1, 0)).normalize())
      }
      if (this.input.right) {
        moveDirection.add(cameraDirection.clone().setY(0).cross(new THREE.Vector3(0, 1, 0)).normalize())
      }
    }
    
    // Apply movement
    if (moveDirection.length() > 0) {
      // For analog input, preserve the magnitude for variable speed
      const inputMagnitude = hasAnalogInput ? Math.min(this.input.analogMovement!.length(), 1.0) : 1.0
      
      // Normalize direction but preserve analog magnitude
      moveDirection.normalize()
      
      // Determine speed
      const baseSpeed = this.input.run ? this.config.runSpeed : this.config.walkSpeed
      const speed = baseSpeed * inputMagnitude // Scale by analog input magnitude
      const movement = moveDirection.multiplyScalar(speed * deltaTime)
      
      // Apply horizontal movement
      this.state.velocity.x = movement.x
      this.state.velocity.z = movement.z
      this.state.isMoving = true
      this.state.isRunning = this.input.run
      
      // Debug: Log speed difference (disabled)
      // if (Math.random() < 0.05) { // 5% chance per frame
      //   console.log(`🏃 Speed: ${this.input.run ? 'RUN' : 'WALK'} = ${speed} units/s`)
      // }
      
      // logger.debug(LogModule.PLAYER, `Movement: speed=${speed}, direction=(${moveDirection.x.toFixed(2)}, ${moveDirection.z.toFixed(2)}), input=(${this.input.forward},${this.input.backward},${this.input.left},${this.input.right})`)
    } else {
      // Apply friction when not moving
      this.state.velocity.x *= this.config.friction
      this.state.velocity.z *= this.config.friction
      this.state.isMoving = false
      this.state.isRunning = false
      
      // Log when no movement input (commented out to reduce spam)
      // if (this.input.forward || this.input.backward || this.input.left || this.input.right) {
      //   logger.debug(LogModule.PLAYER, `No movement despite input: forward=${this.input.forward}, backward=${this.input.backward}, left=${this.input.left}, right=${this.input.right}`)
      // }
    }
    
    // Handle jumping
    if (this.input.jump && this.state.onGround && this.state.canJump) {
      this.state.velocity.y = this.config.jumpForce
      this.state.onGround = false
      this.state.canJump = false
      
      // logger.debug(LogModule.PLAYER, 'Jump initiated')
    }
    
    // Reset jump flag when on ground
    if (this.state.onGround) {
      this.state.canJump = true
    }
  }

  private updatePhysics(deltaTime: number): void {
    // Apply gravity
    if (!this.state.onGround) { // Only apply gravity if not on ground
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
    
    // Debug: Log collision results occasionally (disabled)
    // if (Math.random() < 0.01 && collision.hasCollision) { // 1% chance and only when collision happens
    //   console.log(`🔍 Collision Result: hasCollision=${collision.hasCollision}, penetration=${collision.penetrationDepth.toFixed(3)}, normal=(${collision.normal.x.toFixed(2)}, ${collision.normal.y.toFixed(2)}, ${collision.normal.z.toFixed(2)})`)
    // }
    
    if (collision.hasCollision) {
      // Handle collision
      this.state.position.copy(collision.correctedPosition)
      
      // If collision is with ground (normal points mostly upward)
      if (collision.normal.y > 0.5) {
        this.state.onGround = true
        // Reset vertical velocity if moving downwards into ground
        if (this.state.velocity.y < 0) {
          this.state.velocity.y = 0
        }
      } else {
        // Collision with wall or ceiling, not ground
        this.state.onGround = false
      }
      
      // Debug: Log collision handling (disabled)
      // if (Math.random() < 0.02) { // 2% chance per frame (was 5%)
      //   console.log(`💥 Collision: corrected to (${this.state.position.x.toFixed(2)}, ${this.state.position.y.toFixed(2)}, ${this.state.position.z.toFixed(2)}), onGround=${this.state.onGround}, normal=(${collision.normal.x.toFixed(2)}, ${this.state.velocity.y.toFixed(2)}, ${this.state.velocity.z.toFixed(2)})`)
      // }
    } else {
      // No collision, update position
      this.state.position.copy(newPosition)
      
      // Check if we're on ground by checking ground height at current position
      const groundHeight = this.collisionSystem.getGroundHeight(this.state.position.x, this.state.position.z)
      const playerBottomY = this.state.position.y - (this.config.height / 2 - this.config.radius)
      
      // More stable ground detection: use a larger tolerance and check velocity
      const groundTolerance = this.config.groundCheckDistance * 2 // Double the tolerance
      const isNearGround = playerBottomY <= groundHeight + groundTolerance
      const isNotMovingUp = this.state.velocity.y <= 0.5 // More lenient velocity check
      
      // Only change onGround state if there's a significant difference
      const shouldBeOnGround = isNearGround && isNotMovingUp
      
      // CRITICAL FIX: When player walks off edge, immediately set onGround = false
      // This allows gravity to apply and player to fall naturally
      if (!shouldBeOnGround && this.state.onGround) {
        // Player is no longer near ground - set onGround to false immediately
        // This fixes the bug where player stays elevated after walking off box edge
        this.state.onGround = false
        
        // Debug: Log ground state changes (disabled)
        // if (Math.random() < 0.02) { // 2% chance per frame
        //   console.log(`🌊 Ground state changed: onGround=${this.state.onGround}, playerBottomY=${playerBottomY.toFixed(2)}, groundHeight=${groundHeight.toFixed(2)}, tolerance=${groundTolerance.toFixed(2)}, velocityY=${this.state.velocity.y.toFixed(2)}`)
        // }
      } else if (shouldBeOnGround && !this.state.onGround) {
        // Only switch to onGround if we're clearly on ground AND not moving up
        // Add velocity check to prevent setting onGround while jumping
        if (isNotMovingUp) {
          this.state.onGround = true
          
          // Debug: Log ground state changes (disabled)
          // if (Math.random() < 0.02) { // 2% chance per frame
          //   console.log(`🌊 Ground state changed: onGround=${this.state.onGround}, playerBottomY=${playerBottomY.toFixed(2)}, groundHeight=${groundHeight.toFixed(2)}, tolerance=${groundTolerance.toFixed(2)}, velocityY=${this.state.velocity.y.toFixed(2)}`)
          // }
        }
      }
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

  private updateCamera(deltaTime: number): void {
    // Update camera position through camera manager
    this.cameraManager.setPlayerPosition(this.state.position)
    
    // Handle gamepad camera rotation (right stick)
    if (this.input.analogCamera && this.input.analogCamera.length() > 0.1) {
      const cameraX = this.input.analogCamera.x
      const cameraY = this.input.analogCamera.y
      
      // Apply deadzone
      const deadzone = 0.1
      const adjustedX = Math.abs(cameraX) > deadzone ? cameraX : 0
      const adjustedY = Math.abs(cameraY) > deadzone ? cameraY : 0
      
      // Update camera rotation through camera manager
      this.cameraManager.updatePlayerCameraFromGamepad(adjustedX, adjustedY, deltaTime)
    }
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

  public getInputState(): any {
    return {
      forward: this.input.forward,
      backward: this.input.backward,
      left: this.input.left,
      right: this.input.right,
      jump: this.input.jump,
      run: this.input.run,
      camera: this.input.camera,
      mouseX: 0, // Mouse input would need to be tracked separately
      mouseY: 0,
      mouseLeft: false,
      mouseRight: false
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