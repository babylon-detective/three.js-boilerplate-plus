import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type CameraMode = 'system' | 'player'

export interface CameraConfig {
  fov: number
  near: number
  far: number
  position: THREE.Vector3
  target?: THREE.Vector3
}

export interface PlayerCameraConfig extends CameraConfig {
  height: number // Height above ground
  mouseSensitivity: number
  smoothing: number // Camera movement smoothing
}

export class CameraManager {
  private scene: THREE.Scene
  private renderer: THREE.WebGLRenderer
  private container: HTMLElement
  
  // Cameras
  private systemCamera!: THREE.PerspectiveCamera
  private playerCamera!: THREE.PerspectiveCamera
  private currentCamera!: THREE.PerspectiveCamera
  private currentMode: CameraMode = 'system'
  
  // Controls
  private orbitControls!: OrbitControls
  private playerControls!: {
    enabled: boolean
    mouseX: number
    mouseY: number
    pitch: number // X-axis rotation
    yaw: number   // Y-axis rotation
    smoothing: number
    sensitivity: number
  }
  
  // Player camera properties
  private playerPosition: THREE.Vector3 = new THREE.Vector3(0, 5, 0)
  private playerHeight: number = 1.8
  
  // Transition properties
  private isTransitioning: boolean = false
  private transitionDuration: number = 1.0 // seconds
  private transitionStart: number = 0
  private transitionFromPosition: THREE.Vector3 = new THREE.Vector3()
  private transitionFromRotation: THREE.Euler = new THREE.Euler()
  private transitionToPosition: THREE.Vector3 = new THREE.Vector3()
  private transitionToRotation: THREE.Euler = new THREE.Euler()
  
  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, container: HTMLElement) {
    this.scene = scene
    this.renderer = renderer
    this.container = container
    
    // Initialize cameras
    this.initializeCameras()
    this.initializeControls()
    this.setupEventListeners()
    
    // console.log('📷 CameraManager initialized with system and player cameras')
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeCameras(): void {
    const aspect = window.innerWidth / window.innerHeight
    
    // System Camera (for debugging and free observation)
    // Position camera at horizon level to look horizontally instead of down
    this.systemCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
    this.systemCamera.position.set(0, 2, 10) // Y=2 for horizon level (was 5, looking down)
    this.systemCamera.name = 'SystemCamera'
    
    // Player Camera (first-person view)
    this.playerCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
    this.playerCamera.position.copy(this.playerPosition)
    this.playerCamera.position.y += this.playerHeight
    this.playerCamera.name = 'PlayerCamera'
    
    // Set initial camera
    this.currentCamera = this.systemCamera
  }

  private initializeControls(): void {
    // Orbit controls for system camera
    this.orbitControls = new OrbitControls(this.systemCamera, this.renderer.domElement)
    this.orbitControls.enableDamping = true
    this.orbitControls.dampingFactor = 0.05
    this.orbitControls.minDistance = 2
    this.orbitControls.maxDistance = 1000
    this.orbitControls.maxPolarAngle = Math.PI * 0.95
    this.orbitControls.minPolarAngle = Math.PI * 0.05
    
    // Set target at horizon level (same Y as camera) to look horizontally
    // This makes the camera look at the horizon instead of down at the ground
    this.orbitControls.target.set(0, 2, 0) // Target at horizon level (was 0,0,0)
    this.orbitControls.update() // Update controls to apply the target
    
    // Player controls configuration
    this.playerControls = {
      enabled: false,
      mouseX: 0,
      mouseY: 0,
      pitch: 0,
      yaw: 0,
      smoothing: 0.1,
      sensitivity: 0.002
    }
  }

  private setupEventListeners(): void {
    // Mouse movement for player camera
    this.container.addEventListener('mousemove', this.onMouseMove.bind(this))
    
    // Pointer lock for player camera
    this.container.addEventListener('click', () => {
      if (this.currentMode === 'player') {
        this.container.requestPointerLock()
      }
    })
    
    // Handle pointer lock change
    document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this))
    
    // Window resize
    window.addEventListener('resize', this.onWindowResize.bind(this))
  }

  // ============================================================================
  // CAMERA SWITCHING
  // ============================================================================

  /**
   * Switch between camera modes with smooth transition
   */
  public switchCamera(mode: CameraMode, immediate: boolean = false): void {
    if (this.currentMode === mode || this.isTransitioning) {
      return
    }

    // console.log(`📷 Switching camera mode: ${this.currentMode} → ${mode}`)

    const fromCamera = this.currentCamera
    const toCamera = mode === 'system' ? this.systemCamera : this.playerCamera

    if (immediate) {
      this.setActiveCamera(mode, true)
    } else {
      this.startCameraTransition(fromCamera, toCamera, mode)
    }
  }

  /**
   * Start smooth camera transition
   */
  private startCameraTransition(from: THREE.PerspectiveCamera, to: THREE.PerspectiveCamera, targetMode: CameraMode): void {
    this.isTransitioning = true
    this.transitionStart = performance.now()
    
    // Store transition start and end states
    this.transitionFromPosition.copy(from.position)
    this.transitionFromRotation.copy(from.rotation)
    this.transitionToPosition.copy(to.position)
    this.transitionToRotation.copy(to.rotation)
    
    // Update target mode
    this.currentMode = targetMode
  }

  /**
   * Set active camera immediately
   */
  private setActiveCamera(mode: CameraMode, requestPointerLock: boolean = false): void {
    this.currentMode = mode
    this.currentCamera = mode === 'system' ? this.systemCamera : this.playerCamera
    
    // Enable/disable appropriate controls
    this.orbitControls.enabled = (mode === 'system')
    this.playerControls.enabled = (mode === 'player')
    
    // Handle pointer lock for player mode only when explicitly requested
    if (mode === 'player' && requestPointerLock) {
      // Only request pointer lock if we're not already locked
      if (document.pointerLockElement !== this.container) {
        this.container.requestPointerLock().catch((error) => {
                  // console.warn('📷 Pointer lock request failed:', error.message)
        // console.log('📷 Tip: Click on the canvas first, then press C to switch to player camera')
        })
      }
    } else if (mode === 'system') {
      // Exit pointer lock when switching to system camera
      if (document.pointerLockElement === this.container) {
        document.exitPointerLock()
      }
    }
    
    // console.log(`📷 Active camera: ${this.currentCamera.name}`)
  }

  // ============================================================================
  // PLAYER CAMERA CONTROLS
  // ============================================================================

  private onMouseMove(event: MouseEvent): void {
    if (!this.playerControls.enabled || document.pointerLockElement !== this.container) {
      return
    }

    const movementX = event.movementX || 0
    const movementY = event.movementY || 0

    this.playerControls.yaw -= movementX * this.playerControls.sensitivity
    this.playerControls.pitch -= movementY * this.playerControls.sensitivity  // Standard: Mouse UP = Look UP

    // Clamp pitch to prevent over-rotation
    this.playerControls.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.playerControls.pitch))
  }

  private onPointerLockChange(): void {
    const isLocked = document.pointerLockElement === this.container
    // console.log(`📷 Pointer lock: ${isLocked ? 'enabled' : 'disabled'}`)
  }

  // ============================================================================
  // UPDATE METHODS
  // ============================================================================

  /**
   * Update camera system (call this in animation loop)
   */
  public update(deltaTime: number): void {
    // Handle camera transition
    if (this.isTransitioning) {
      this.updateCameraTransition()
    }
    
    // Update active camera based on mode
    if (this.currentMode === 'system') {
      this.orbitControls.update()
    } else if (this.currentMode === 'player') {
      this.updatePlayerCamera(deltaTime)
    }
  }

  /**
   * Update camera transition animation
   */
  private updateCameraTransition(): void {
    const elapsed = (performance.now() - this.transitionStart) / 1000
    const progress = Math.min(elapsed / this.transitionDuration, 1)
    
    // Smooth easing function
    const easedProgress = 1 - Math.pow(1 - progress, 3)
    
    // Interpolate position and rotation
    this.currentCamera.position.lerpVectors(this.transitionFromPosition, this.transitionToPosition, easedProgress)
    
    // Interpolate rotation using quaternions for smooth rotation
    const fromQuaternion = new THREE.Quaternion().setFromEuler(this.transitionFromRotation)
    const toQuaternion = new THREE.Quaternion().setFromEuler(this.transitionToRotation)
    const currentQuaternion = new THREE.Quaternion().slerpQuaternions(fromQuaternion, toQuaternion, easedProgress)
    this.currentCamera.setRotationFromQuaternion(currentQuaternion)
    
    // Complete transition
    if (progress >= 1) {
      this.isTransitioning = false
      this.setActiveCamera(this.currentMode, false) // Don't auto-request pointer lock during transition
    }
  }

  /**
   * Update player camera based on mouse input
   */
  private updatePlayerCamera(deltaTime: number): void {
    if (!this.playerControls.enabled) return
    
    // Apply rotation with smoothing
    const targetRotationY = this.playerControls.yaw
    const targetRotationX = this.playerControls.pitch
    
    // Set camera rotation
    this.playerCamera.rotation.order = 'YXZ'
    this.playerCamera.rotation.y = targetRotationY
    this.playerCamera.rotation.x = targetRotationX
    this.playerCamera.rotation.z = 0
    
    // Update camera position (will be handled by player controller)
    this.playerCamera.position.copy(this.playerPosition)
    this.playerCamera.position.y += this.playerHeight
  }

  // ============================================================================
  // PLAYER POSITION MANAGEMENT
  // ============================================================================

  /**
   * Set player position (affects player camera)
   */
  public setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position)
    if (this.currentMode === 'player') {
      this.playerCamera.position.copy(position)
      this.playerCamera.position.y += this.playerHeight
    }
  }

  /**
   * Get player position
   */
  public getPlayerPosition(): THREE.Vector3 {
    return this.playerPosition.clone()
  }

  /**
   * Set player height above ground
   */
  public setPlayerHeight(height: number): void {
    this.playerHeight = height
  }

  // ============================================================================
  // GETTERS AND SETTERS
  // ============================================================================

  /**
   * Get current active camera
   */
  public getCurrentCamera(): THREE.PerspectiveCamera {
    return this.currentCamera
  }

  /**
   * Get current camera mode
   */
  public getCurrentMode(): CameraMode {
    return this.currentMode
  }

  /**
   * Get system camera
   */
  public getSystemCamera(): THREE.PerspectiveCamera {
    return this.systemCamera
  }

  /**
   * Get player camera
   */
  public getPlayerCamera(): THREE.PerspectiveCamera {
    return this.playerCamera
  }

  /**
   * Get orbit controls (for system camera)
   */
  public getOrbitControls(): OrbitControls {
    return this.orbitControls
  }

  /**
   * Set player camera sensitivity
   */
  public setPlayerSensitivity(sensitivity: number): void {
    this.playerControls.sensitivity = sensitivity
  }

  /**
   * Update player camera rotation from gamepad input
   * @param deltaX - Right stick horizontal movement (-1 to 1)
   * @param deltaY - Right stick vertical movement (-1 to 1)
   * @param deltaTime - Time since last frame in seconds
   */
  public updatePlayerCameraFromGamepad(deltaX: number, deltaY: number, deltaTime: number): void {
    if (!this.playerControls.enabled || this.currentMode !== 'player') {
      return
    }

    // Apply gamepad sensitivity (higher than mouse for responsiveness)
    const gamepadSensitivity = this.playerControls.sensitivity * 100 // Scale up for gamepad
    
    this.playerControls.yaw -= deltaX * gamepadSensitivity * deltaTime * 60 // Scale by deltaTime and fps
    this.playerControls.pitch += deltaY * gamepadSensitivity * deltaTime * 60  // INVERTED: Changed -= to +=

    // Clamp pitch to prevent over-rotation
    this.playerControls.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.playerControls.pitch))
  }

  /**
   * Set transition duration
   */
  public setTransitionDuration(duration: number): void {
    this.transitionDuration = duration
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Handle window resize
   */
  private onWindowResize(): void {
    const aspect = window.innerWidth / window.innerHeight
    
    this.systemCamera.aspect = aspect
    this.systemCamera.updateProjectionMatrix()
    
    this.playerCamera.aspect = aspect
    this.playerCamera.updateProjectionMatrix()
  }

  /**
   * Get camera info for debugging
   */
  public getCameraInfo(): object {
    return {
      currentMode: this.currentMode,
      isTransitioning: this.isTransitioning,
      systemCamera: {
        position: this.systemCamera.position.toArray(),
        rotation: this.systemCamera.rotation.toArray()
      },
      playerCamera: {
        position: this.playerCamera.position.toArray(),
        rotation: this.playerCamera.rotation.toArray()
      },
      playerControls: {
        enabled: this.playerControls.enabled,
        pitch: this.playerControls.pitch,
        yaw: this.playerControls.yaw,
        sensitivity: this.playerControls.sensitivity
      }
    }
  }

  /**
   * Dispose of camera manager resources
   */
  public dispose(): void {
    this.orbitControls.dispose()
    
    // Remove event listeners
    this.container.removeEventListener('mousemove', this.onMouseMove.bind(this))
    document.removeEventListener('pointerlockchange', this.onPointerLockChange.bind(this))
    window.removeEventListener('resize', this.onWindowResize.bind(this))
    
    // console.log('📷 CameraManager disposed')
  }
} 