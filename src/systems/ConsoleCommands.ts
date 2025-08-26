import * as THREE from 'three'
import { ObjectManager } from './ObjectManager'
import { AnimationSystem } from './AnimationSystem'
import { ConfigManager } from './ConfigManager'
import { logger, LogModule, LogLevel } from './Logger'
import { performanceMonitor } from './PerformanceMonitor'


// Interface for the main app reference
interface AppReference {
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  objectManager: ObjectManager
  animationSystem: AnimationSystem
  configManager: ConfigManager
  collisionSystem?: any
  playerController?: any
  cameraManager?: any
  oceanLODSystem?: any
  landSystem?: any
  parameterManager?: any
  parameterGUI?: any
  deviceType: string
  inputMethods: string[]
}

// Interface for the main app reference (for static methods)
interface IntegratedThreeJSApp {
  getCollisionSystem(): any
  getPlayerStatus(): any
  setPlayerPosition(x: number, y: number, z: number): void
  togglePlayerDebug(): void
  testCollisionAtPlayerPosition(): void
  testPlayerCollision(): void
  testCollisionAtPosition(x: number, y: number, z: number): void
}

export class ConsoleCommands {
  private app: AppReference

  constructor(app: AppReference) {
    this.app = app
  }

  // ============================================================================
  // OBJECT MANAGEMENT COMMANDS
  // ============================================================================

  public listObjects(): void {
    console.group('🎯 ObjectManager Objects')
    this.app.objectManager.listAllObjects()
    console.groupEnd()
  }

  public debugObject(id: string): void {
    console.group(`🔍 Object Debug: ${id}`)
    this.app.objectManager.debugObject(id)
    console.groupEnd()
  }

  public lockObject(id: string): boolean {
    const result = this.app.objectManager.lockObject(id)
    console.log(`🔒 Object "${id}" ${result ? 'locked' : 'lock failed'}`)
    return result
  }

  public unlockObject(id: string): boolean {
    const result = this.app.objectManager.lockObject(id, false)
    console.log(`🔓 Object "${id}" ${result ? 'unlocked' : 'unlock failed'}`)
    return result
  }

  public moveObject(id: string, x: number, y: number, z: number, autoLock: boolean = true): boolean {
    let shouldAutoLock = false
    
    // For animated objects, automatically lock them to prevent animation override
    if (autoLock) {
      const obj = this.app.objectManager.getObject(id)
      if (obj && obj.animations && obj.animations.length > 0) {
        console.log(`🔒 Auto-locking animated object "${id}" to prevent animation override`)
        shouldAutoLock = true
      }
    }
    
    // Move the object first (don't save yet if we're going to auto-lock)
    const result = this.app.objectManager.setObjectPosition(id, new THREE.Vector3(x, y, z), !shouldAutoLock, shouldAutoLock)
    
    // Lock after successful move if needed (this will save everything at once)
    if (shouldAutoLock && result) {
      this.app.objectManager.lockObject(id, true)
    }
    
    console.log(`📍 Object "${id}" ${result ? `moved to (${x}, ${y}, ${z})` : 'move failed'}`)
    
    if (shouldAutoLock && result) {
      console.log(`💡 Use unlockObject('${id}') to re-enable animations`)
    }
    
    return result
  }

  // Scale and rotation methods can be added to ObjectManager later if needed

  public clearObjectStates(): void {
    this.app.objectManager.clearPersistentStates()
    console.log('🧹 All object states cleared')
  }

  public lookAtObject(id: string): boolean {
    const obj = this.app.objectManager.getObject(id)
    if (!obj) {
      console.error(`❌ Object "${id}" not found`)
      return false
    }
    
    // Point camera at the object
    const position = obj.mesh.position
    this.app.camera.lookAt(position)
    
    // If using OrbitControls, update the target
    if ((this.app as any).controls) {
      (this.app as any).controls.target.copy(position)
      ;(this.app as any).controls.update()
    }
    
    console.log(`👁️ Camera now looking at "${id}" at position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`)
    return true
  }

  // Legacy mesh commands removed - use ObjectManager commands instead

  // ============================================================================
  // SYSTEM STATUS AND DIAGNOSTICS
  // ============================================================================

  public showSystemStatus(): void {
    console.group('🔍 Complete System Status')
    
    console.group('📱 Device Information')
    console.log('Type:', this.app.deviceType)
    console.log('Input Methods:', this.app.inputMethods.join(', '))
    console.log('Screen:', `${window.innerWidth}x${window.innerHeight}`)
    console.groupEnd()
    
    console.group('🎨 Renderer Information')
    console.log('Triangles:', this.app.renderer.info.render.triangles)
    console.log('Draw Calls:', this.app.renderer.info.render.calls)
    console.log('Geometries:', this.app.renderer.info.memory.geometries)
    console.log('Textures:', this.app.renderer.info.memory.textures)
    console.groupEnd()
    
    console.group('🎯 Object Management')
    console.log('Managed Objects:', this.app.objectManager.getAllObjects().length)
    console.log('Locked Objects:', this.app.objectManager.getLockedPositions().size)
    console.groupEnd()
    
    console.group('🎬 Animation System')
    console.log('Active Animations:', this.app.animationSystem.getAnimationCount())
    console.groupEnd()
    
    if (this.app.oceanLODSystem) {
      console.group('🌊 Ocean LOD System')
      console.log('LOD Levels:', this.app.oceanLODSystem.getLODLevels().length)
      console.groupEnd()
    }
    
    if (this.app.landSystem) {
      console.group('🏔️ Land System')
      console.log('Land Pieces:', this.app.landSystem.getLandPieces().length)
      console.groupEnd()
    }
    
    console.groupEnd()
  }

  public showObjectStatus(): void {
    console.group('🔍 Object Management Status')
    
    const allMeshes: THREE.Mesh[] = []
    this.app.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        allMeshes.push(object)
      }
    })
    
    console.log(`📊 Total meshes in scene: ${allMeshes.length}`)
    console.log(`🎯 ObjectManager managed objects: ${this.app.objectManager.getAllObjects().length}`)
    
    console.group('📦 ObjectManager Objects')
    this.app.objectManager.listAllObjects()
    console.groupEnd()
    
    const unmanagedMeshes = allMeshes.filter(mesh => {
      const hasId = this.app.objectManager.getObject(mesh.userData.id)
      const hasUuid = this.app.objectManager.getObject(mesh.uuid)
      return !hasId && !hasUuid
    })
    
    if (unmanagedMeshes.length > 0) {
      console.group('⚠️ Unmanaged Legacy Objects')
      unmanagedMeshes.forEach((mesh, index) => {
        console.log(`${index}: ${mesh.userData.id || 'No ID'} (${mesh.userData.type || 'Unknown'}) - UUID: ${mesh.uuid.substring(0, 8)}...`)
      })
      console.log('💡 Run migrateToObjectManager() to move these to unified management')
      console.groupEnd()
    } else {
      console.log('✅ All objects are managed by ObjectManager!')
    }
    
    console.groupEnd()
  }

  public migrateToObjectManager(): void {
    console.group('🔄 Migrating to ObjectManager')
    
    const allMeshes: THREE.Mesh[] = []
    this.app.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        allMeshes.push(object)
      }
    })
    
    let migratedCount = 0
    
    allMeshes.forEach((mesh, index) => {
      if (this.app.objectManager.getObject(mesh.userData.id) || this.app.objectManager.getObject(mesh.uuid)) {
        return
      }
      
      if (mesh.userData.type === 'ocean' || mesh.userData.type === 'land' || 
          mesh.userData.type === 'ocean-shadow' || mesh.userData.type === 'land-shadow') {
        return
      }
      
      const objectId = mesh.userData.id || `mesh-${index}`
      const objectType = mesh.userData.type || 'custom'
      
      try {
        const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        this.app.objectManager.createObject({
          id: objectId,
          type: objectType as any,
          geometry: mesh.geometry,
          material: material,
          position: mesh.position.clone(),
          rotation: mesh.rotation.clone(),
          scale: mesh.scale.clone(),
          userData: mesh.userData,
          persistPosition: true
        })
        
        migratedCount++
        console.log(`✅ Migrated: ${objectId} (${objectType})`)
        
      } catch (error) {
        console.warn(`⚠️ Failed to migrate: ${objectId}`, error)
      }
    })
    
    console.log(`🎯 Migration complete: ${migratedCount} objects migrated to ObjectManager`)
    console.groupEnd()
  }

  // ============================================================================
  // CAMERA MANAGEMENT COMMANDS
  // ============================================================================

  public saveCameraState(): void {
    this.app.objectManager.saveCameraState()
    console.log('📷 Camera state saved manually')
  }

  public loadCameraState(): boolean {
    const loaded = this.app.objectManager.loadCameraState()
    if (loaded) {
      console.log('📷 Camera state loaded successfully')
    } else {
      console.log('📷 No saved camera state found')
    }
    return loaded
  }

  public clearCameraState(): void {
    this.app.objectManager.clearCameraState()
    console.log('📷 Camera state cleared')
  }

  public setCameraPosition(x: number, y: number, z: number, targetX?: number, targetY?: number, targetZ?: number): void {
    const position = new THREE.Vector3(x, y, z)
    const target = targetX !== undefined && targetY !== undefined && targetZ !== undefined 
      ? new THREE.Vector3(targetX, targetY, targetZ) 
      : undefined
    
    this.app.objectManager.setCameraPosition(position, target)
    
    if (target) {
      console.log(`📷 Camera moved to (${x}, ${y}, ${z}) looking at (${targetX}, ${targetY}, ${targetZ})`)
    } else {
      console.log(`📷 Camera moved to (${x}, ${y}, ${z})`)
    }
  }

  public getCameraState(): void {
    const state = this.app.objectManager.getCameraState()
    if (state) {
      console.group('📷 Current Camera State')
      console.log('Position:', `(${state.position.x.toFixed(2)}, ${state.position.y.toFixed(2)}, ${state.position.z.toFixed(2)})`)
      console.log('Rotation:', `(${state.rotation.x.toFixed(2)}, ${state.rotation.y.toFixed(2)}, ${state.rotation.z.toFixed(2)})`)
      console.log('FOV:', state.fov.toFixed(1))
      console.log('Zoom:', state.zoom.toFixed(2))
      if (state.target) {
        console.log('Target:', `(${state.target.x.toFixed(2)}, ${state.target.y.toFixed(2)}, ${state.target.z.toFixed(2)})`)
      }
      console.groupEnd()
    } else {
      console.log('📷 No camera registered for state management')
    }
  }

  // ============================================================================
  // CAMERA MANAGER COMMANDS (New System)
  // ============================================================================

  public switchCamera(mode: 'system' | 'player' = 'system'): void {
    if ((this.app as any).cameraManager) {
      const cameraManager = (this.app as any).cameraManager
      cameraManager.switchCamera(mode)
      console.log(`📷 Switched to ${mode} camera`)
    } else {
      console.warn('⚠️ CameraManager not available')
    }
  }

  public getCameraMode(): string {
    if ((this.app as any).cameraManager) {
      const cameraManager = (this.app as any).cameraManager
      const mode = cameraManager.getCurrentMode()
      console.log(`📷 Current camera mode: ${mode}`)
      return mode
    } else {
      console.warn('⚠️ CameraManager not available')
      return 'unknown'
    }
  }

  public getCameraInfo(): void {
    if ((this.app as any).cameraManager) {
      const cameraManager = (this.app as any).cameraManager
      const info = cameraManager.getCameraInfo()
      console.group('📷 Camera Manager Info')
      console.log('Current Mode:', info.currentMode)
      console.log('Is Transitioning:', info.isTransitioning)
      console.group('System Camera')
      console.log('Position:', info.systemCamera.position)
      console.log('Rotation:', info.systemCamera.rotation)
      console.groupEnd()
      console.group('Player Camera')
      console.log('Position:', info.playerCamera.position)
      console.log('Rotation:', info.playerCamera.rotation)
      console.groupEnd()
      console.group('Player Controls')
      console.log('Enabled:', info.playerControls.enabled)
      console.log('Pitch:', info.playerControls.pitch.toFixed(3))
      console.log('Yaw:', info.playerControls.yaw.toFixed(3))
      console.log('Sensitivity:', info.playerControls.sensitivity)
      console.groupEnd()
      console.groupEnd()
    } else {
      console.warn('⚠️ CameraManager not available')
    }
  }

  public setPlayerPosition(x: number, y: number, z: number): void {
    if ((this.app as any).playerController) {
      const playerController = (this.app as any).playerController
      playerController.setPosition(new THREE.Vector3(x, y, z))
      console.log(`🎮 Player position set to (${x}, ${y}, ${z})`)
    } else {
      console.warn('⚠️ PlayerController not available')
    }
  }

  public getPlayerStatus(): void {
    if ((this.app as any).playerController) {
      const playerController = (this.app as any).playerController
      const status = playerController.getStatus()
      console.group('🎮 Player Status')
      console.log('Position:', status.position)
      console.log('Velocity:', status.velocity)
      console.log('On Ground:', status.onGround)
      console.log('Debug Visible:', status.debugVisible)
      console.group('Movement Input')
      Object.entries(status.movementInput).forEach(([key, value]) => {
        console.log(`${key}:`, value)
      })
      console.groupEnd()
      console.group('Configuration')
      Object.entries(status.config).forEach(([key, value]) => {
        console.log(`${key}:`, value)
      })
      console.groupEnd()
      console.groupEnd()
    } else {
      console.warn('⚠️ PlayerController not available')
    }
  }

  public togglePlayerDebug(): void {
    if ((this.app as any).playerController) {
      const playerController = (this.app as any).playerController
      const currentState = playerController.isDebugWireframeVisible()
      playerController.setDebugVisible(!currentState)
      console.log(`🎮 Player debug wireframe: ${!currentState ? 'visible' : 'hidden'}`)
    } else {
      console.warn('⚠️ PlayerController not available')
    }
  }

  // ============================================================================
  // PERFORMANCE AND DEBUGGING
  // ============================================================================

  public getPerformanceStats(): object {
    return {
      deviceType: this.app.deviceType,
      inputMethods: this.app.inputMethods,
      animationCount: this.app.animationSystem.getAnimationCount(),
      triangles: this.app.renderer.info.render.triangles,
      drawCalls: this.app.renderer.info.render.calls,
      managedObjects: this.app.objectManager.getAllObjects().length,
      oceanLODs: this.app.oceanLODSystem?.getLODLevels().length || 0,
      landPieces: this.app.landSystem?.getLandPieces().length || 0,
      memoryUsage: {
        geometries: this.app.renderer.info.memory.geometries,
        textures: this.app.renderer.info.memory.textures
      }
    }
  }

  public printPerformanceStats(): void {
    console.group('📊 Performance Statistics')
    const stats = this.getPerformanceStats()
    Object.entries(stats).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        console.group(key)
        Object.entries(value).forEach(([subKey, subValue]) => {
          console.log(`${subKey}:`, subValue)
        })
        console.groupEnd()
      } else {
        console.log(`${key}:`, value)
      }
    })
    console.groupEnd()
  }

  // ============================================================================
  // OCEAN SYSTEM COMMANDS
  // ============================================================================

  public resetOcean(): void {
    if (this.app.oceanLODSystem) {
      this.app.oceanLODSystem.resetOceanPositions()
      console.log('🌊 Ocean positions reset')
    } else {
      console.warn('⚠️ Ocean system not available')
    }
  }

  public setWaveAmplitude(amplitude: number): void {
    if (this.app.oceanLODSystem) {
      this.app.oceanLODSystem.setWaveAmplitude(amplitude)
      console.log(`🌊 Wave amplitude set to ${amplitude}`)
    } else {
      console.warn('⚠️ Ocean system not available')
    }
  }

  public setWind(x: number, z: number, strength?: number): void {
    if (this.app.oceanLODSystem) {
      this.app.oceanLODSystem.setWindDirection(x, z)
      if (strength !== undefined) {
        this.app.oceanLODSystem.setWindStrength(strength)
      }
      console.log(`🌊 Wind set to direction (${x}, ${z})${strength !== undefined ? ` with strength ${strength}` : ''}`)
    } else {
      console.warn('⚠️ Ocean system not available')
    }
  }

  // ============================================================================
  // LAND SYSTEM COMMANDS
  // ============================================================================

  public clearLand(): void {
    if (this.app.landSystem) {
      this.app.landSystem.clearAllLand()
      console.log('🏔️ All land cleared')
    } else {
      console.warn('⚠️ Land system not available')
    }
  }

  public setTerrainHeight(elevation: number): void {
    if (this.app.landSystem) {
      this.app.landSystem.setElevation(elevation)
      console.log(`🏔️ Terrain elevation set to ${elevation}`)
    } else {
      console.warn('⚠️ Land system not available')
    }
  }

  public setTerrainRoughness(roughness: number): void {
    if (this.app.landSystem) {
      this.app.landSystem.setRoughness(roughness)
      console.log(`🏔️ Terrain roughness set to ${roughness}`)
    } else {
      console.warn('⚠️ Land system not available')
    }
  }

  // ============================================================================
  // ANIMATION SYSTEM COMMANDS
  // ============================================================================

  public startAnimations(): void {
    this.app.animationSystem.start()
    console.log('🎬 Animations started')
  }

  public stopAnimations(): void {
    this.app.animationSystem.stop()
    console.log('🎬 Animations stopped')
  }

  public toggleAnimations(): void {
    // Simple toggle - just try to start/stop
    // We can improve this later by adding a public isRunning method to AnimationSystem
    try {
      this.app.animationSystem.stop()
      console.log('🎬 Animations toggled off')
    } catch {
      this.app.animationSystem.start()
      console.log('🎬 Animations toggled on')
    }
  }

  // ============================================================================
  // HELP SYSTEM
  // ============================================================================

  public help(): void {
    console.log(`
🚀 Three.js Garden Console Commands

🎯 OBJECT MANAGEMENT:
- listObjects()                    - List all managed objects
- debugObject(id)                  - Debug specific object
- lockObject(id)                   - Lock object position
- unlockObject(id)                 - Unlock object position
- moveObject(id, x, y, z)          - Move object to position
- clearObjectStates()              - Clear all object states
- lookAtObject(id)                 - Point camera at object

📷 CAMERA MANAGEMENT (Legacy System):
- saveCameraState()                - Save current camera state
- loadCameraState()                - Load saved camera state
- clearCameraState()               - Clear saved camera state
- setCameraPosition(x, y, z)       - Move camera to position
- setCameraPosition(x, y, z, tx, ty, tz) - Move camera + set target
- getCameraState()                 - Show current camera state

📷 CAMERA MANAGER (New System):
- switchCamera('system'/'player')  - Switch between camera modes
- getCameraMode()                  - Get current camera mode
- getCameraInfo()                  - Show detailed camera info

🎮 PLAYER CONTROLLER:
- setPlayerPosition(x, y, z)       - Set player position
- getPlayerStatus()                - Show player status and config
- togglePlayerDebug()              - Toggle player debug wireframe
- checkPlayerSpeeds()              - Check current player speeds
- syncPlayerSpeeds()               - Sync speeds from ParameterManager
- diagnosePlayerIssues()           - Comprehensive player issue diagnosis

🔍 COLLISION SYSTEM:
- testCollision(x, y, z)           - Test collision at position
- testCollisionAt(x, y, z)         - Test collision at specific position
- testCollisionAtPlayer()          - Test collision at player position
- testCollisionAtOrigin()          - Test collision at origin (0, 10, 0)
- testCollisionPerformance()       - Test collision system performance
- testPlayerMovement()             - Test player movement and collision
- testPlayerCollision()            - Test collision at player position
- getCollisionStatus()             - Show collision system status
- showLandMeshes()                 - Show registered land meshes
- showLandBounds()                 - Show land mesh bounds and player position analysis
- movePlayerToSafePosition()       - Move player to safe position within land bounds

🔧 PARAMETER MANAGEMENT:
- showParameters()                 - Show parameter management status
- saveParameterState(name)         - Save current parameters as state
- loadParameterState(name)         - Load parameters from saved state
- resetParameters(category?)       - Reset parameters to defaults
- exportParameters()               - Export parameters as JSON

🔍 SYSTEM STATUS:
- showSystemStatus()               - Complete system overview
- showObjectStatus()               - Object management status
- migrateToObjectManager()         - Migrate legacy objects
- getPerformanceStats()            - Get performance data
- printPerformanceStats()          - Print performance stats

🌊 OCEAN SYSTEM:
- resetOcean()                     - Reset ocean positions
- setWaveAmplitude(amplitude)      - Set wave height
- setWind(x, z, strength?)         - Set wind direction/strength

🏔️ LAND SYSTEM:
- clearLand()                      - Clear all land
- setTerrainHeight(elevation)      - Set terrain elevation
- setTerrainRoughness(roughness)   - Set terrain roughness

🎬 ANIMATION SYSTEM:
- startAnimations()                - Start all animations
- stopAnimations()                 - Stop all animations
- toggleAnimations()               - Toggle animation state

📝 LOGGING CONTROL:
- enableCollisionLogging()         - Enable collision debug logs
- disableCollisionLogging()        - Disable collision debug logs
- enableAllLogging()               - Enable all debug logging
- disableAllLogging()              - Disable all debug logging
- getLoggingConfig()               - Show logging configuration

❓ HELP:
- help()                          - Show this help message

💡 Examples:
- moveObject('hologram', 0, 15, 0)  // Auto-locks animated objects
- moveObject('hologram', 0, 15, 0, false)  // Don't auto-lock
- lockObject('animated-0')
- lookAtObject('animated-0')        // Point camera at object
- setCameraPosition(10, 5, 10)     // Move camera
- setCameraPosition(10, 5, 10, 0, 0, 0) // Move camera, look at origin
- switchCamera('player')            // Switch to player camera
- setPlayerPosition(0, 10, 0)       // Move player
- togglePlayerDebug()               // Show/hide player wireframe
- setWaveAmplitude(0.8)
- showSystemStatus()

🎮 CONTROLS:
- C = Switch between System/Player cameras
- WASD = Move player (in player camera mode)
- Space = Jump (in player camera mode)
- Shift = Run (in player camera mode)
- Mouse = Look around (in player camera mode)
`)
  }

  public clearLocalStorage(): void {
    console.log('🗑️ Clearing local storage...')
    localStorage.clear()
    console.log('✅ Local storage cleared. Refresh the page to reload with new defaults.')
  }

  public forceResetAndSync(): void {
    console.group('🔄 Force Reset and Sync')
    
    // Clear local storage
    console.log('🗑️ Clearing local storage...')
    localStorage.clear()
    
    // Reset parameters to defaults
    if (this.app.parameterManager) {
      console.log('🔄 Resetting all parameters to defaults...')
      this.app.parameterManager.resetAllToDefaults()
    }
    
    // Sync player speeds
    if (this.app.playerController && this.app.parameterManager) {
      console.log('🔄 Syncing player speeds...')
      const paramWalkSpeed = this.app.parameterManager.getParameter('player', 'walkSpeed')
      const paramRunSpeed = this.app.parameterManager.getParameter('player', 'runSpeed')
      
      if (paramWalkSpeed !== null && paramRunSpeed !== null) {
        this.app.playerController.updateConfig({
          walkSpeed: paramWalkSpeed,
          runSpeed: paramRunSpeed
        })
        
        console.log(`✅ Player speeds synced:`)
        console.log(`  Walk Speed: ${paramWalkSpeed} units/s`)
        console.log(`  Run Speed: ${paramRunSpeed} units/s`)
      }
    }
    
    console.log('✅ Force reset complete! Refresh the page to apply changes.')
    console.groupEnd()
  }

  // ============================================================================
  // GLOBAL REGISTRATION
  // ============================================================================

  public registerGlobalCommands(): void {
    const win = window as any
    
    // Object Management Commands
    win.listObjects = () => this.listObjects()
    win.debugObject = (id: string) => this.debugObject(id)
    win.lockObject = (id: string) => this.lockObject(id)
    win.unlockObject = (id: string) => this.unlockObject(id)
    win.moveObject = (id: string, x: number, y: number, z: number) => this.moveObject(id, x, y, z)
    win.lookAtObject = (id: string) => this.lookAtObject(id)
    // Scale and rotation methods can be added later
    win.clearObjectStates = () => this.clearObjectStates()
    
    // Camera Management Commands (Legacy System)
    win.saveCameraState = () => this.saveCameraState()
    win.loadCameraState = () => this.loadCameraState()
    win.clearCameraState = () => this.clearCameraState()
    win.setCameraPosition = (x: number, y: number, z: number, targetX?: number, targetY?: number, targetZ?: number) => 
      this.setCameraPosition(x, y, z, targetX, targetY, targetZ)
    win.getCameraState = () => this.getCameraState()
    
    // Camera Manager Commands (New System)
    win.switchCamera = (mode: 'system' | 'player') => this.switchCamera(mode)
    win.getCameraMode = () => this.getCameraMode()
    win.getCameraInfo = () => this.getCameraInfo()
    
    // Player Controller Commands
    win.setPlayerPosition = (x: number, y: number, z: number) => this.setPlayerPosition(x, y, z)
    win.getPlayerStatus = () => this.getPlayerStatus()
    win.togglePlayerDebug = () => this.togglePlayerDebug()
    
    // Collision System Commands
    win.testCollision = (x: number = 0, y: number = 10, z: number = 0) => this.testCollision(x, y, z)
    win.getCollisionStatus = () => this.getCollisionStatus()
    win.debugCollision = (x: number = 0, y: number = 10, z: number = 0) => {
      if (this.app.collisionSystem) {
        this.app.collisionSystem.debugCollisionTest(new THREE.Vector3(x, y, z))
      } else {
        console.error('Collision system not available')
      }
    }
    win.testPlayerCollision = () => {
      if (this.app.playerController && this.app.collisionSystem) {
        const position = this.app.playerController.getPosition()
        this.app.collisionSystem.debugCollisionTest(position)
      } else {
        console.error('Player controller or collision system not available')
      }
    }
    
    win.testCollisionAt = (x: number, y: number, z: number) => this.testCollisionAt(x, y, z)
    win.testCollisionAtPlayer = () => this.testCollisionAtPlayer()
    win.testCollisionAtOrigin = () => this.testCollisionAtOrigin()
    win.testCollisionPerformance = () => this.testCollisionPerformance()
    win.testPlayerMovement = () => this.testPlayerMovement()
    win.testParameterGUI = () => this.testParameterGUI()
    win.testParameterIntegration = () => this.testParameterIntegration()
    win.debugCameraPlayerPosition = () => this.debugCameraPlayerPosition()
    win.showLandMeshes = () => this.showLandMeshes()
    win.showLandBounds = () => ConsoleCommands.showLandBounds()
    win.movePlayerToSafePosition = () => ConsoleCommands.movePlayerToSafePosition()
    win.refreshCollisionSystem = () => this.refreshCollisionSystem()
    win.checkPlayerSpeeds = () => this.checkPlayerSpeeds()
    win.syncPlayerSpeeds = () => this.syncPlayerSpeeds()
    win.diagnosePlayerIssues = () => this.diagnosePlayerIssues()
    win.clearLocalStorage = () => this.clearLocalStorage()
    win.forceResetAndSync = () => this.forceResetAndSync()
    win.testLandCollision = () => this.testLandCollision()
    win.testCollisionAtPosition = (x: number, y: number, z: number) => this.testCollisionAtPosition(x, y, z)
    win.testGroundDetection = () => this.testGroundDetection()
    
    // Parameter Management Commands
    win.showParameters = () => this.showParameters()
    win.saveParameterState = (name: string) => this.saveParameterState(name)
    win.loadParameterState = (name: string) => this.loadParameterState(name)
    win.resetParameters = (category?: string) => this.resetParameters(category)
    win.exportParameters = () => this.exportParameters()
    
    // Performance Monitoring Commands
    win.getPerformanceStats = () => {
      const metrics = performanceMonitor.getMetrics()
      const warnings = performanceMonitor.getPerformanceWarnings()
      
      console.group('📊 Performance Statistics')
      console.log(`FPS: ${metrics.fps}`)
      console.log(`Frame Time: ${metrics.frameTime}ms`)
      console.log(`Collision Checks: ${metrics.collisionChecks}`)
      console.log(`Collision Time: ${metrics.collisionTime}ms`)
      console.log(`Render Time: ${metrics.renderTime}ms`)
      if (metrics.memoryUsage) {
        console.log(`Memory Usage: ${Math.round(metrics.memoryUsage / 1024 / 1024 * 100) / 100}MB`)
      }
      
      if (warnings.length > 0) {
        console.group('⚠️ Performance Warnings')
        warnings.forEach(warning => console.warn(warning))
        console.groupEnd()
      }
      
      console.groupEnd()
    }
    win.enablePerformanceMonitoring = () => performanceMonitor.enable()
    win.disablePerformanceMonitoring = () => performanceMonitor.disable()
    win.resetPerformanceMetrics = () => performanceMonitor.reset()
    win.getCollisionStats = () => {
      if (this.app.collisionSystem) {
        const stats = this.app.collisionSystem.getPerformanceStats()
        console.group('💥 Collision System Statistics')
        console.log(`Registered Objects: ${stats.registeredObjects}`)
        console.log(`Land Meshes: ${stats.landMeshes}`)
        console.log(`Cache Size: ${stats.cacheSize}`)
        console.log(`Cache Timeout: ${stats.cacheTimeout}ms`)
        console.log(`Collision Check Interval: ${stats.collisionCheckInterval}ms`)
        console.log(`Max Raycast Distance: ${stats.maxRaycastDistance} units`)
        console.groupEnd()
      } else {
        console.warn('❌ Collision system not available')
      }
    }
    
    // System Status Commands
    win.showSystemStatus = () => this.showSystemStatus()
    win.showObjectStatus = () => this.showObjectStatus()
    win.migrateToObjectManager = () => this.migrateToObjectManager()
    win.getPerformanceStats = () => this.getPerformanceStats()
    win.printPerformanceStats = () => this.printPerformanceStats()
    
    // Ocean System Commands
    win.resetOcean = () => this.resetOcean()
    win.setWaveAmplitude = (amplitude: number) => this.setWaveAmplitude(amplitude)
    win.setWind = (x: number, z: number, strength?: number) => this.setWind(x, z, strength)
    
    // Land System Commands
    win.clearLand = () => this.clearLand()
    win.setTerrainHeight = (elevation: number) => this.setTerrainHeight(elevation)
    win.setTerrainRoughness = (roughness: number) => this.setTerrainRoughness(roughness)
    
    // Animation System Commands
    win.startAnimations = () => this.startAnimations()
    win.stopAnimations = () => this.stopAnimations()
    win.toggleAnimations = () => this.toggleAnimations()
    
    // Logging Control Commands
    win.enableCollisionLogging = () => {
      logger.enableModule(LogModule.COLLISION)
      console.log('✅ Collision debug logging enabled')
    }
    win.disableCollisionLogging = () => {
      logger.disableModule(LogModule.COLLISION)
      console.log('✅ Collision debug logging disabled')
    }
    win.enableAllLogging = () => {
      logger.enableAllModules()
      console.log('✅ All debug logging enabled')
    }
    win.disableAllLogging = () => {
      logger.disableAllModules()
      console.log('✅ All debug logging disabled')
    }
    win.getLoggingConfig = () => {
      const config = logger.getConfig()
      console.group('📝 Logging Configuration')
      console.log(`Level: ${LogLevel[config.level]}`)
      console.log(`Enabled Modules: ${config.enabledModules.join(', ')}`)
      console.log(`Silent Mode: ${config.silentMode}`)
      console.log(`Development Mode: ${config.developmentMode}`)
      console.groupEnd()
    }
    
    // Help Command
    win.help = () => this.help()
    
    // Direct access to systems
    win.objectManager = this.app.objectManager
    win.animationSystem = this.app.animationSystem
    win.configManager = this.app.configManager
    
    console.log('🎮 Console commands registered! Type help() for available commands.')
  }

  // ============================================================================
  // COLLISION SYSTEM COMMANDS
  // ============================================================================

  /**
   * Test collision detection at a specific position
   */
  public testCollision(x: number = 0, y: number = 10, z: number = 0): void {
    if (!this.app.collisionSystem) {
      console.warn('❌ Collision system not available')
      return
    }
    
    const testPosition = new THREE.Vector3(x, y, z)
    const collision = this.app.collisionSystem.checkCollision('player', testPosition)
    
    console.group('🔍 Collision Test Results')
    console.log(`Test Position: (${x}, ${y}, ${z})`)
    console.log(`Has Collision: ${collision.hasCollision}`)
    console.log(`Penetration Depth: ${collision.penetrationDepth.toFixed(3)}`)
    console.log(`Surface Normal: (${collision.normal.x.toFixed(3)}, ${collision.normal.y.toFixed(3)}, ${collision.normal.z.toFixed(3)})`)
    console.log(`Corrected Position: (${collision.correctedPosition.x.toFixed(3)}, ${collision.correctedPosition.y.toFixed(3)}, ${collision.correctedPosition.z.toFixed(3)})`)
    console.groupEnd()
  }

  /**
   * Show collision system status
   */
  public getCollisionStatus(): void {
    console.group('🔍 Collision System Status')
    
    if (!this.app.collisionSystem) {
      console.log('❌ Collision system not available')
      console.groupEnd()
      return
    }
    
    const stats = this.app.collisionSystem.getPerformanceStats()
    console.log('📊 Performance Stats:', stats)
    
    const objects = this.app.collisionSystem.getObjects()
    console.log(`🎯 Registered Objects: ${objects.size}`)
    
    objects.forEach((obj: any, id: string) => {
      console.log(`  ${id}: ${obj.isStatic ? 'Static' : 'Dynamic'} - ${obj.collisionVolume.type}`)
    })
    
    console.groupEnd()
  }

  public showLandMeshes(): void {
    console.group('🏔️ Land Meshes in Collision System')
    
    if (!this.app.collisionSystem) {
      console.log('❌ Collision system not available')
      console.groupEnd()
      return
    }
    
    // Get land meshes from collision system
    const landMeshes = this.app.collisionSystem.getLandMeshes()
    console.log(`📊 Land meshes registered: ${landMeshes.length}`)
    
    if (landMeshes.length > 0) {
      console.group('🏔️ Registered Land Meshes')
      landMeshes.forEach((info: any, index: number) => {
        const mesh = info.mesh
        console.log(`  ${index}: ${mesh.userData.id || 'No ID'} (${mesh.userData.type || mesh.userData.landType || 'Unknown'}) priority=${info.priority}`)
        console.log(`    Position: (${mesh.position.x.toFixed(1)}, ${mesh.position.y.toFixed(1)}, ${mesh.position.z.toFixed(1)})`)
        console.log(`    Scale: (${mesh.scale.x.toFixed(1)}, ${mesh.scale.y.toFixed(1)}, ${mesh.scale.z.toFixed(1)})`)
      })
      console.groupEnd()
    } else {
      console.log('⚠️ No land meshes registered in collision system')
    }
    
    // If we have access to land system, show those details too
    if (this.app.landSystem) {
      const landPieces = this.app.landSystem.getLandPieces()
      console.log(`🏔️ Land system pieces: ${landPieces.length}`)
      
      landPieces.forEach((piece: any, index: number) => {
        console.log(`  ${index}: ${piece.id} (${piece.type}) at (${piece.mesh.position.x.toFixed(1)}, ${piece.mesh.position.y.toFixed(1)}, ${piece.mesh.position.z.toFixed(1)})`)
      })
    }
    
    console.groupEnd()
  }

  /**
   * Show land mesh bounds and player position for collision debugging
   */
  public static showLandBounds(): void {
    const app = (window as any).threeJSApp as IntegratedThreeJSApp
    if (!app) {
      console.error('❌ Three.js app not found')
      return
    }

    const collisionSystem = app.getCollisionSystem()
    if (!collisionSystem) {
      console.error('❌ Collision system not found')
      return
    }

    const landMeshes = collisionSystem.getLandMeshes()
    const playerPosition = app.getPlayerStatus ? app.getPlayerStatus() : null

    console.group('🗺️ Land Mesh Bounds Analysis')
    console.log(`📍 Player Position: ${playerPosition ? `(${playerPosition.x?.toFixed(1)}, ${playerPosition.y?.toFixed(1)}, ${playerPosition.z?.toFixed(1)})` : 'Unknown'}`)
    console.log(`🏔️ Registered Land Meshes: ${landMeshes.length}`)
    
    if (landMeshes.length === 0) {
      console.warn('⚠️ No land meshes registered!')
      console.groupEnd()
      return
    }

    landMeshes.forEach((info: any, index: number) => {
      const mesh = info.mesh
      const bbox = info.boundingBox
      const center = new THREE.Vector3()
      bbox.getCenter(center)
      const size = new THREE.Vector3()
      bbox.getSize(size)
      
      console.group(`🏔️ Land Mesh ${index}: ${mesh.userData.id}`)
      console.log(`   Type: ${mesh.userData.type}/${mesh.userData.landType}`)
      console.log(`   Position: (${mesh.position.x.toFixed(1)}, ${mesh.position.y.toFixed(1)}, ${mesh.position.z.toFixed(1)})`)
      console.log(`   Bounds: X[${bbox.min.x.toFixed(1)}, ${bbox.max.x.toFixed(1)}], Y[${bbox.min.y.toFixed(1)}, ${bbox.max.y.toFixed(1)}], Z[${bbox.min.z.toFixed(1)}, ${bbox.max.z.toFixed(1)}]`)
      console.log(`   Size: ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`)
      console.log(`   Priority: ${info.priority}`)
      
      // Check if player is within bounds
      if (playerPosition) {
        const isInBounds = bbox.containsPoint(new THREE.Vector3(playerPosition.x, playerPosition.y, playerPosition.z))
        console.log(`   Player in bounds: ${isInBounds ? '✅ YES' : '❌ NO'}`)
        
        if (!isInBounds) {
          const distance = new THREE.Vector3(playerPosition.x, playerPosition.y, playerPosition.z).distanceTo(center)
          console.log(`   Distance to center: ${distance.toFixed(1)} units`)
        }
      }
      console.groupEnd()
    })

    // Overall analysis
    if (playerPosition) {
      let closestMesh: any = null
      let closestDistance = Infinity
      
      landMeshes.forEach((info: any) => {
        const center = new THREE.Vector3()
        info.boundingBox.getCenter(center)
        const distance = new THREE.Vector3(playerPosition.x, playerPosition.y, playerPosition.z).distanceTo(center)
        if (distance < closestDistance) {
          closestDistance = distance
          closestMesh = info
        }
      })
      
      console.group('📊 Analysis')
      console.log(`🎯 Closest land mesh: ${closestMesh?.mesh.userData.id} (${closestDistance.toFixed(1)} units away)`)
      
      if (closestDistance > 100) {
        console.warn('⚠️ Player is very far from any land mesh - this will cause collision issues!')
        console.log('💡 Try moving the player closer to the land or expanding the land area')
      } else if (closestDistance > 50) {
        console.warn('⚠️ Player is moderately far from land meshes')
      } else {
        console.log('✅ Player is reasonably close to land meshes')
      }
      console.groupEnd()
    }
    
    console.groupEnd()
  }

  /**
   * Move player to a safe position within land bounds
   */
  public static movePlayerToSafePosition(): void {
    const app = (window as any).threeJSApp as IntegratedThreeJSApp
    if (!app) {
      console.error('❌ Three.js app not found')
      return
    }

    const collisionSystem = app.getCollisionSystem()
    if (!collisionSystem) {
      console.error('❌ Collision system not found')
      return
    }

    const landMeshes = collisionSystem.getLandMeshes()
    if (landMeshes.length === 0) {
      console.error('❌ No land meshes available')
      return
    }

    // Find the main terrain (highest priority or largest)
    let mainTerrain = landMeshes[0]
    for (const info of landMeshes) {
      if (info.mesh.userData.id === 'main-terrain' || info.priority > mainTerrain.priority) {
        mainTerrain = info
        break
      }
    }

    const bbox = mainTerrain.boundingBox
    const center = new THREE.Vector3()
    bbox.getCenter(center)
    
    // Move player to center of main terrain, slightly above ground
    const safeX = center.x
    const safeZ = center.z
    const safeY = Math.max(bbox.max.y + 2, 10) // At least 2 units above ground, minimum 10 units up
    
    app.setPlayerPosition(safeX, safeY, safeZ)
    
    console.log(`🎯 Moved player to safe position: (${safeX.toFixed(1)}, ${safeY.toFixed(1)}, ${safeZ.toFixed(1)})`)
    console.log(`📍 This is the center of ${mainTerrain.mesh.userData.id}`)
    console.log(`💡 Use showLandBounds() to verify the player is now within collision range`)
    
    // Test collision at new position
    setTimeout(() => {
      console.log('🧪 Testing collision at new position...')
      collisionSystem.debugCollisionTest(new THREE.Vector3(safeX, safeY, safeZ))
    }, 500)
  }

  /**
   * Refresh collision system land meshes
   */
  public refreshCollisionSystem(): void {
    console.group('🔄 Refreshing Collision System')
    
    if (!this.app.collisionSystem) {
      console.log('❌ Collision system not available')
      console.groupEnd()
      return
    }

    if (!this.app.landSystem) {
      console.log('❌ Land system not available')
      console.groupEnd()
      return
    }

    // Get current land meshes
    const landPieces = this.app.landSystem.getLandPieces()
    const landMeshes = landPieces.map((piece: any) => piece.mesh)
    
    console.log(`🏔️ Refreshing collision system with ${landMeshes.length} land meshes`)
    
    // Log each land mesh for debugging
    landMeshes.forEach((mesh: THREE.Mesh, index: number) => {
      console.log(`  ${index}: ${mesh.userData.id} (${mesh.userData.type}/${mesh.userData.landType}) at (${mesh.position.x.toFixed(1)}, ${mesh.position.y.toFixed(1)}, ${mesh.position.z.toFixed(1)})`)
    })
    
    // Re-register land meshes with collision system
    this.app.collisionSystem.registerLandMeshes(landMeshes)
    
    // Test collision at player position
    if (this.app.playerController) {
      const playerPosition = this.app.playerController.getPosition()
      console.log(`🧪 Testing collision at player position: (${playerPosition.x.toFixed(1)}, ${playerPosition.y.toFixed(1)}, ${playerPosition.z.toFixed(1)})`)
      this.app.collisionSystem.debugCollisionTest(playerPosition)
    }
    
    // Test collision at origin
    console.log('🧪 Testing collision at origin (0, 10, 0)...')
    this.app.collisionSystem.debugCollisionTest(new THREE.Vector3(0, 10, 0))
    
    console.log('✅ Collision system refreshed successfully')
    console.groupEnd()
  }

  /**
   * Check current player movement speeds
   */
  public diagnosePlayerIssues(): void {
    console.group('🔍 Player Issues Diagnosis')
    
    // Check player controller
    if (!this.app.playerController) {
      console.log('❌ Player controller not available')
      console.groupEnd()
      return
    }

    // Check speeds
    const config = this.app.playerController.getConfig()
    console.log(`🚶 Walk Speed: ${config.walkSpeed} units/s`)
    console.log(`🏃 Run Speed: ${config.runSpeed} units/s`)
    
    // Check current state
    const position = this.app.playerController.getPosition()
    const velocity = this.app.playerController.getVelocity()
    const onGround = this.app.playerController.isOnGround()
    const isMoving = this.app.playerController.isMoving()
    const isRunning = this.app.playerController.isRunning()
    
    console.log(`🎮 Current State:`)
    console.log(`  Position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`)
    console.log(`  Velocity: (${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)})`)
    console.log(`  On Ground: ${onGround}`)
    console.log(`  Moving: ${isMoving}`)
    console.log(`  Running: ${isRunning}`)
    
    // Check collision system
    if (this.app.collisionSystem) {
      const landMeshes = this.app.collisionSystem.getLandMeshes()
      console.log(`🏔️ Land Meshes: ${landMeshes.length} registered`)
      
      if (landMeshes.length === 0) {
        console.warn('⚠️ NO LAND MESHES REGISTERED! This is why player falls through land.')
      } else {
        landMeshes.forEach((info: any, index: number) => {
          const mesh = info.mesh
          console.log(`  ${index}: ${mesh.userData.id} (${mesh.userData.type}/${mesh.userData.landType}) at (${mesh.position.x.toFixed(1)}, ${mesh.position.y.toFixed(1)}, ${mesh.position.z.toFixed(1)})`)
        })
      }
      
      // Test collision at current position
      console.log('🧪 Testing collision at current position...')
      this.app.collisionSystem.debugCollisionTest(position)
    } else {
      console.log('❌ Collision system not available')
    }
    
    // Check land system
    if (this.app.landSystem) {
      const landPieces = this.app.landSystem.getLandPieces()
      console.log(`🏔️ Land System: ${landPieces.length} pieces`)
      
      landPieces.forEach((piece: any, index: number) => {
        console.log(`  ${index}: ${piece.id} (${piece.type}) at (${piece.mesh.position.x.toFixed(1)}, ${piece.mesh.position.y.toFixed(1)}, ${piece.mesh.position.z.toFixed(1)})`)
      })
    } else {
      console.log('❌ Land system not available')
    }
    
    console.log('💡 Run refreshCollisionSystem() to re-register land meshes')
    console.log('💡 Run testPlayerMovement() for detailed movement testing')
    console.groupEnd()
  }

  public checkPlayerSpeeds(): void {
    console.group('🏃 Player Movement Speeds')
    
    if (!this.app.playerController) {
      console.log('❌ Player controller not available')
      console.groupEnd()
      return
    }

    const config = this.app.playerController.getConfig()
    console.log(`🚶 Walk Speed: ${config.walkSpeed} units/s`)
    console.log(`🏃 Run Speed: ${config.runSpeed} units/s`)
    console.log(`🦘 Jump Force: ${config.jumpForce} units/s`)
    console.log(`🌍 Gravity: ${config.gravity} units/s²`)
    
    // Also check parameter manager values
    if (this.app.parameterManager) {
      const paramWalkSpeed = this.app.parameterManager.getParameter('player', 'walkSpeed')
      const paramRunSpeed = this.app.parameterManager.getParameter('player', 'runSpeed')
      const paramJumpForce = this.app.parameterManager.getParameter('player', 'jumpForce')
      
      console.log(`📊 Parameter Manager Values:`)
      console.log(`  Walk Speed: ${paramWalkSpeed} units/s`)
      console.log(`  Run Speed: ${paramRunSpeed} units/s`)
      console.log(`  Jump Force: ${paramJumpForce} units/s`)
      
      // Check if there's a mismatch
      if (config.walkSpeed !== paramWalkSpeed || config.runSpeed !== paramRunSpeed || config.jumpForce !== paramJumpForce) {
        console.warn('⚠️ Mismatch between PlayerController and ParameterManager values!')
        console.log('💡 This might be causing the slow movement issue.')
        console.log('💡 Run syncPlayerSpeeds() to fix this.')
      } else {
        console.log('✅ PlayerController and ParameterManager values match')
      }
    }
    
    // Test current player state
    const position = this.app.playerController.getPosition()
    const velocity = this.app.playerController.getVelocity()
    const onGround = this.app.playerController.isOnGround()
    const isMoving = this.app.playerController.isMoving()
    const isRunning = this.app.playerController.isRunning()
    
    console.log(`🎮 Current State:`)
    console.log(`  Position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`)
    console.log(`  Velocity: (${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)})`)
    console.log(`  On Ground: ${onGround}`)
    console.log(`  Moving: ${isMoving}`)
    console.log(`  Running: ${isRunning}`)
    
    console.groupEnd()
  }

  public syncPlayerSpeeds(): void {
    console.group('🔄 Syncing Player Speeds')
    
    if (!this.app.playerController || !this.app.parameterManager) {
      console.log('❌ Player controller or parameter manager not available')
      console.groupEnd()
      return
    }

    const paramWalkSpeed = this.app.parameterManager.getParameter('player', 'walkSpeed')
    const paramRunSpeed = this.app.parameterManager.getParameter('player', 'runSpeed')
    
    if (paramWalkSpeed !== null && paramRunSpeed !== null) {
      this.app.playerController.updateConfig({
        walkSpeed: paramWalkSpeed,
        runSpeed: paramRunSpeed
      })
      
      console.log(`✅ Player speeds synced from ParameterManager:`)
      console.log(`  Walk Speed: ${paramWalkSpeed} units/s`)
      console.log(`  Run Speed: ${paramRunSpeed} units/s`)
      
      // Verify the sync worked
      const config = this.app.playerController.getConfig()
      if (config.walkSpeed === paramWalkSpeed && config.runSpeed === paramRunSpeed) {
        console.log('✅ Sync successful - values now match!')
      } else {
        console.warn('⚠️ Sync may have failed - values still differ')
      }
    } else {
      console.error('❌ Could not get speed values from ParameterManager')
    }
    
    console.groupEnd()
  }

  public showParameters(): void {
    console.group('🔧 Parameter Management System')
    
    if (!this.app.parameterManager) {
      console.log('❌ Parameter manager not available')
      console.groupEnd()
      return
    }
    
    const allParameters = this.app.parameterManager.getAllParameters()
    console.log(`📊 Total parameters: ${Object.keys(allParameters.categories).length} categories`)
    console.log(`🕒 Last modified: ${new Date(allParameters.lastModified).toLocaleString()}`)
    
    // Show modified parameters
    const modified = this.app.parameterManager.getModifiedParameters()
    if (modified.length > 0) {
      console.group('📝 Modified Parameters')
      modified.forEach(({ category, parameterId, defaultValue, currentValue }: any) => {
        console.log(`  ${category}.${parameterId}: ${defaultValue} → ${currentValue}`)
      })
      console.groupEnd()
    } else {
      console.log('✅ All parameters are at default values')
    }
    
    // Show saved states
    const savedStates = this.app.parameterManager.getSavedStateNames()
    if (savedStates.length > 0) {
      console.group('💾 Saved States')
      savedStates.forEach((stateName: string) => {
        console.log(`  ${stateName}`)
      })
      console.groupEnd()
    } else {
      console.log('📁 No saved states')
    }
    
    console.groupEnd()
  }

  public saveParameterState(name: string): void {
    if (!this.app.parameterManager) {
      console.error('❌ Parameter manager not available')
      return
    }
    
    this.app.parameterManager.saveState(name)
    console.log(`💾 Parameters saved as state: ${name}`)
  }

  public loadParameterState(name: string): void {
    if (!this.app.parameterManager) {
      console.error('❌ Parameter manager not available')
      return
    }
    
    const success = this.app.parameterManager.loadState(name)
    if (success) {
      console.log(`📂 Parameters loaded from state: ${name}`)
    } else {
      console.error(`❌ Failed to load state: ${name}`)
    }
  }

  public resetParameters(category?: string): void {
    if (!this.app.parameterManager) {
      console.error('❌ Parameter manager not available')
      return
    }
    
    if (category) {
      this.app.parameterManager.resetCategory(category as any)
      console.log(`🔄 ${category} parameters reset to defaults`)
    } else {
      this.app.parameterManager.resetAllToDefaults()
      console.log('🔄 All parameters reset to defaults')
    }
  }

  public exportParameters(): void {
    if (!this.app.parameterManager) {
      console.error('❌ Parameter manager not available')
      return
    }
    
    const json = this.app.parameterManager.exportParameters()
    console.log('📤 Parameters exported:')
    console.log(json)
  }

  /**
   * Test collision at arbitrary position
   */
  public testCollisionAt(x: number, y: number, z: number): void {
    if (!this.app.collisionSystem) {
      console.warn('❌ Collision system not available')
      return
    }
    
    console.log(`🎯 Testing collision at position: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`)
    this.app.collisionSystem.debugCollisionTest(new THREE.Vector3(x, y, z))
  }

  /**
   * Test collision at player's current position
   */
  public testCollisionAtPlayer(): void {
    if (!this.app.playerController || !this.app.collisionSystem) {
      console.warn('❌ Player controller or collision system not available')
      return
    }
    
    const position = this.app.playerController.getPosition()
    console.log(`🎯 Testing collision at player position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`)
    this.app.collisionSystem.debugCollisionTest(position)
  }

  /**
   * Test collision at origin (0, 10, 0) where main terrain should be
   */
  public testCollisionAtOrigin(): void {
    if (!this.app.collisionSystem) {
      console.warn('❌ Collision system not available')
      return
    }
    
    console.log('🎯 Testing collision at origin (0, 10, 0) where main terrain should be')
    this.app.collisionSystem.debugCollisionTest(new THREE.Vector3(0, 10, 0))
    
    // Also test fallback method
    if (this.app.collisionSystem.getGroundHeightFallback) {
      const fallbackHeight = this.app.collisionSystem.getGroundHeightFallback(0, 0)
      console.log(`🔧 Fallback ground height at (0, 0): ${fallbackHeight.toFixed(2)}`)
    }
  }

  /**
   * Test collision system performance
   */
  public testCollisionPerformance(): void {
    if (!this.app.collisionSystem) {
      console.warn('❌ Collision system not available')
      return
    }
    
    console.log('🚀 Testing collision system performance...')
    
    const startTime = performance.now()
    const iterations = 100
    
    // Test multiple collision checks
    for (let i = 0; i < iterations; i++) {
      const x = (Math.random() - 0.5) * 100
      const z = (Math.random() - 0.5) * 100
      this.app.collisionSystem.checkCollision('test', new THREE.Vector3(x, 10, z))
    }
    
    const endTime = performance.now()
    const totalTime = endTime - startTime
    const avgTime = totalTime / iterations
    
    console.log(`⏱️ Performance test results:`)
    console.log(`  Total time: ${totalTime.toFixed(2)}ms`)
    console.log(`  Average time per collision check: ${avgTime.toFixed(3)}ms`)
    console.log(`  Collision checks per second: ${(1000 / avgTime).toFixed(0)}`)
    
    // Show collision system stats
    if (this.app.collisionSystem) {
      const stats = this.app.collisionSystem.getPerformanceStats()
      console.group('💥 Collision System Statistics')
      console.log(`Registered Objects: ${stats.registeredObjects}`)
      console.log(`Land Meshes: ${stats.landMeshes}`)
      console.log(`Cache Size: ${stats.cacheSize}`)
      console.log(`Cache Timeout: ${stats.cacheTimeout}ms`)
      console.log(`Collision Check Interval: ${stats.collisionCheckInterval}ms`)
      console.log(`Max Raycast Distance: ${stats.maxRaycastDistance} units`)
      console.groupEnd()
    }
  }

  /**
   * Test player movement and collision
   */
  public testPlayerMovement(): void {
    if (!this.app.playerController || !this.app.collisionSystem) {
      console.warn('❌ Player controller or collision system not available')
      return
    }
    
    console.group('🎮 Player Movement Test')
    
    // Test new player system
    const status = this.app.playerController.getStatus()
    console.log('Player Status:', status)
    
    const position = this.app.playerController.getPosition()
    const velocity = this.app.playerController.getVelocity()
    const onGround = this.app.playerController.isOnGround()
    const isMoving = this.app.playerController.isMoving()
    
    console.log(`Current Position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`)
    console.log(`Current Velocity: (${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)})`)
    console.log(`On Ground: ${onGround}`)
    console.log(`Moving: ${isMoving}`)
    
    // Test input state
    console.log('Input State:', status.input)
    
    // Test collision at current position
    console.log('Testing collision at current position...')
    this.app.collisionSystem.debugCollisionTest(position)
    
    // Test collision slightly below current position
    const testPosition = position.clone()
    testPosition.y -= 1
    console.log('Testing collision 1 unit below current position...')
    this.app.collisionSystem.debugCollisionTest(testPosition)
    
    // Test collision at origin (where main terrain should be)
    console.log('Testing collision at origin (0, 10, 0)...')
    this.app.collisionSystem.debugCollisionTest(new THREE.Vector3(0, 10, 0))
    
    // Test collision at origin ground level
    console.log('Testing collision at origin ground level (0, 0, 0)...')
    this.app.collisionSystem.debugCollisionTest(new THREE.Vector3(0, 0, 0))
    
    // Test input system
    console.log('Testing input system...')
    console.log('Press W, A, S, D to move')
    console.log('Press Space to jump')
    console.log('Press Shift to run')
    
    // Enable debug wireframe
    this.app.playerController.setDebugVisible(true)
    console.log('Debug wireframe enabled')
    
    // Test manual movement
    console.log('Testing manual movement...')
    const testMovePosition = position.clone()
    testMovePosition.x += 1
    this.app.playerController.setPosition(testMovePosition)
    console.log(`Moved player to (${testMovePosition.x.toFixed(2)}, ${testMovePosition.y.toFixed(2)}, ${testMovePosition.z.toFixed(2)})`)
    
    console.groupEnd()
  }

  /**
   * Test parameter GUI functionality
   */
  public testParameterGUI(): void {
    if (!this.app.parameterManager) {
      console.warn('❌ Parameter manager not available')
      return
    }
    
    console.group('🎛️ Parameter GUI Test')
    
    // Test setting a parameter
    console.log('Testing parameter setting...')
    const testValue = Math.random() * 2
    this.app.parameterManager.setParameter('ocean', 'amplitude', testValue, 'test_setting')
    console.log(`Set ocean.amplitude to ${testValue}`)
    
    // Verify the parameter was set
    const retrievedValue = this.app.parameterManager.getParameter('ocean', 'amplitude')
    console.log(`Retrieved ocean.amplitude: ${retrievedValue}`)
    
    // Test getting all parameters for a category
    const oceanParams = this.app.parameterManager.getCategoryParameters('ocean')
    console.log(`Ocean parameters count: ${oceanParams.length}`)
    
    // Test parameter validation
    console.log('Testing parameter validation...')
    this.app.parameterManager.setParameter('ocean', 'amplitude', 5, 'test_validation') // Should be clamped to max
    const clampedValue = this.app.parameterManager.getParameter('ocean', 'amplitude')
    console.log(`After setting to 5 (should be clamped): ${clampedValue}`)
    
    // Reset to a reasonable value
    this.app.parameterManager.setParameter('ocean', 'amplitude', 0.5, 'test_reset')
    
    console.groupEnd()
  }

  /**
   * Test parameter integration with systems
   */
  public testParameterIntegration(): void {
    if (!this.app.parameterManager) {
      console.warn('❌ Parameter manager not available')
      return
    }
    
    console.group('🔗 Parameter Integration Test')
    
    // Test ocean parameter integration
    console.log('Testing ocean parameter integration...')
    const originalAmplitude = this.app.parameterManager.getParameter('ocean', 'amplitude')
    const newAmplitude = 1.5
    this.app.parameterManager.setParameter('ocean', 'amplitude', newAmplitude, 'integration_test')
    console.log(`Ocean amplitude changed from ${originalAmplitude} to ${newAmplitude}`)
    
    // Test land parameter integration
    console.log('Testing land parameter integration...')
    const originalElevation = this.app.parameterManager.getParameter('land', 'elevation')
    const newElevation = 10.0
    this.app.parameterManager.setParameter('land', 'elevation', newElevation, 'integration_test')
    console.log(`Land elevation changed from ${originalElevation} to ${newElevation}`)
    
    // Test player parameter integration
    console.log('Testing player parameter integration...')
    const originalWalkSpeed = this.app.parameterManager.getParameter('player', 'walkSpeed')
    const newWalkSpeed = 12.0
    this.app.parameterManager.setParameter('player', 'walkSpeed', newWalkSpeed, 'integration_test')
    console.log(`Player walk speed changed from ${originalWalkSpeed} to ${newWalkSpeed}`)
    
    // Reset parameters to reasonable values
    setTimeout(() => {
      this.app.parameterManager.setParameter('ocean', 'amplitude', originalAmplitude, 'integration_reset')
      this.app.parameterManager.setParameter('land', 'elevation', originalElevation, 'integration_reset')
      this.app.parameterManager.setParameter('player', 'walkSpeed', originalWalkSpeed, 'integration_reset')
      console.log('✅ Parameters reset to original values')
    }, 2000)
    
    console.groupEnd()
  }

  /**
   * Debug camera and player positioning
   */
  public debugCameraPlayerPosition(): void {
    if (!this.app.playerController || !this.app.cameraManager) {
      console.warn('❌ Player controller or camera manager not available')
      return
    }
    
    console.group('📷 Camera & Player Position Debug')
    
    // Get player information
    const playerPosition = this.app.playerController.getPosition()
    const playerVelocity = this.app.playerController.getVelocity()
    const playerMesh = this.app.playerController.getMesh()
    const playerOnGround = this.app.playerController.isOnGround()
    
    // Get camera information
    const cameraInfo = this.app.cameraManager.getCameraInfo()
    const currentCamera = this.app.cameraManager.getCurrentCamera()
    const currentMode = this.app.cameraManager.getCurrentMode()
    
    console.group('🎮 Player Information')
    console.log(`Position: (${playerPosition.x.toFixed(2)}, ${playerPosition.y.toFixed(2)}, ${playerPosition.z.toFixed(2)})`)
    console.log(`Velocity: (${playerVelocity.x.toFixed(2)}, ${playerVelocity.y.toFixed(2)}, ${playerVelocity.z.toFixed(2)})`)
    console.log(`Mesh Position: (${playerMesh.position.x.toFixed(2)}, ${playerMesh.position.y.toFixed(2)}, ${playerMesh.position.z.toFixed(2)})`)
    console.log(`On Ground: ${playerOnGround}`)
    console.groupEnd()
    
    console.group('📷 Camera Information')
    console.log(`Current Mode: ${currentMode}`)
    console.log(`Camera Position: (${currentCamera.position.x.toFixed(2)}, ${currentCamera.position.y.toFixed(2)}, ${currentCamera.position.z.toFixed(2)})`)
    console.log(`Camera Rotation: (${currentCamera.rotation.x.toFixed(3)}, ${currentCamera.rotation.y.toFixed(3)}, ${currentCamera.rotation.z.toFixed(3)})`)
    console.log(`Is Transitioning: ${cameraInfo.isTransitioning}`)
    console.groupEnd()
    
    // Calculate differences
    const positionDiff = playerPosition.clone().sub(currentCamera.position)
    const meshDiff = playerMesh.position.clone().sub(currentCamera.position)
    
    console.group('🔍 Position Analysis')
    console.log(`Player to Camera Distance: ${positionDiff.length().toFixed(2)} units`)
    console.log(`Mesh to Camera Distance: ${meshDiff.length().toFixed(2)} units`)
    console.log(`Expected Camera Height: ${playerPosition.y + 1.6} (player Y + 1.6)`)
    console.log(`Actual Camera Height: ${currentCamera.position.y}`)
    console.groupEnd()
    
    console.groupEnd()
  }

  public testLandCollision(): void {
    console.group('🏔️ Land Collision Test')
    
    if (!this.app.collisionSystem) {
      console.log('❌ Collision system not available')
      console.groupEnd()
      return
    }

    const landMeshes = this.app.collisionSystem.getLandMeshes()
    console.log(`📊 Land meshes available: ${landMeshes.length}`)
    
    if (landMeshes.length === 0) {
      console.warn('⚠️ No land meshes registered! This is why the player falls through!')
      console.log('🔍 Debugging land mesh registration...')
      
      // Check if land system exists
      if (this.app.landSystem) {
        const landPieces = this.app.landSystem.getLandPieces()
        console.log(`🏔️ Land system has ${landPieces.length} pieces:`)
        landPieces.forEach((piece: any, index: number) => {
          console.log(`  ${index}: ${piece.id} (${piece.type}) at (${piece.mesh.position.x.toFixed(1)}, ${piece.mesh.position.y.toFixed(1)}, ${piece.mesh.position.z.toFixed(1)})`)
        })
      } else {
        console.log('❌ Land system not available!')
      }
      
      console.groupEnd()
      return
    }

    // Test positions
    const testPositions = [
      { name: 'Origin', pos: new THREE.Vector3(0, 0, 0) },
      { name: 'Above Ground', pos: new THREE.Vector3(0, 5, 0) },
      { name: 'Player Height', pos: new THREE.Vector3(0, 1.8, 0) },
      { name: 'Hill Area', pos: new THREE.Vector3(30, 5, 30) },
      { name: 'Rocky Area', pos: new THREE.Vector3(-40, 5, 20) }
    ]

    for (const test of testPositions) {
      console.group(`🧪 Testing: ${test.name} at (${test.pos.x.toFixed(1)}, ${test.pos.y.toFixed(1)}, ${test.pos.z.toFixed(1)})`)
      
      // Test collision with player capsule
      const collision = this.app.collisionSystem.checkCollision('player', test.pos)
      console.log(`Collision: ${collision.hasCollision ? 'YES' : 'NO'}`)
      if (collision.hasCollision) {
        console.log(`  Penetration: ${collision.penetrationDepth.toFixed(3)}`)
        console.log(`  Normal: (${collision.normal.x.toFixed(2)}, ${collision.normal.y.toFixed(2)}, ${collision.normal.z.toFixed(2)})`)
        console.log(`  Corrected: (${collision.correctedPosition.x.toFixed(2)}, ${collision.correctedPosition.y.toFixed(2)}, ${collision.correctedPosition.z.toFixed(2)})`)
      }
      
      console.groupEnd()
    }

    console.groupEnd()
  }

  public testCollisionAtPosition(x: number, y: number, z: number): void {
    console.group(`🧪 Testing Collision at Position (${x}, ${y}, ${z})`)
    
    if (!this.app.collisionSystem) {
      console.log('❌ Collision system not available')
      console.groupEnd()
      return
    }

    // Test collision with player capsule
    const collision = this.app.collisionSystem.checkCollision('player', new THREE.Vector3(x, y, z))
    console.log(`Collision: ${collision.hasCollision ? 'YES' : 'NO'}`)
    if (collision.hasCollision) {
      console.log(`  Penetration: ${collision.penetrationDepth.toFixed(3)}`)
      console.log(`  Normal: (${collision.normal.x.toFixed(2)}, ${collision.normal.y.toFixed(2)}, ${collision.normal.z.toFixed(2)})`)
      console.log(`  Corrected: (${collision.correctedPosition.x.toFixed(2)}, ${collision.correctedPosition.y.toFixed(2)}, ${collision.correctedPosition.z.toFixed(2)})`)
    }

    // Test ground height
    const groundHeight = this.app.collisionSystem.getGroundHeight(x, z)
    console.log(`Ground Height: ${groundHeight.toFixed(2)}`)
    console.log(`Distance to Ground: ${(y - groundHeight).toFixed(2)}`)

    // Test land meshes
    const landMeshes = this.app.collisionSystem.getLandMeshes()
    console.log(`Land Meshes: ${landMeshes.length}`)
    
    landMeshes.forEach((info: any, index: number) => {
      const mesh = info.mesh
      const bbox = info.boundingBox
      const center = new THREE.Vector3()
      bbox.getCenter(center)
      const distance = new THREE.Vector3(x, y, z).distanceTo(center)
      console.log(`  ${index}: ${mesh.userData.id} - distance: ${distance.toFixed(2)}`)
    })

    console.groupEnd()
  }

  public testGroundDetection(): void {
    console.group('🌊 Ground Detection Test')
    
    if (!this.app.playerController) {
      console.log('❌ Player controller not available')
      console.groupEnd()
      return
    }
    
    // Test collision system directly
    if (this.app.collisionSystem) {
      console.log('🧪 Testing collision system directly...')
      const testPos = new THREE.Vector3(0, 10, 0)
      this.app.collisionSystem.debugCollisionTest(testPos)
    }

    const position = this.app.playerController.getPosition()
    const velocity = this.app.playerController.getVelocity()
    const onGround = this.app.playerController.isOnGround()
    
    console.log(`Current Position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`)
    console.log(`Current Velocity: (${velocity.x.toFixed(2)}, ${velocity.y.toFixed(2)}, ${velocity.z.toFixed(2)})`)
    console.log(`On Ground: ${onGround}`)
    
    // Test ground height at current position
    if (this.app.collisionSystem) {
      const groundHeight = this.app.collisionSystem.getGroundHeight(position.x, position.z)
      const playerBottomY = position.y - (1.8 / 2 - 0.5) // Player height/2 - radius
      const distanceToGround = playerBottomY - groundHeight
      
      console.log(`Ground Height: ${groundHeight.toFixed(2)}`)
      console.log(`Player Bottom Y: ${playerBottomY.toFixed(2)}`)
      console.log(`Distance to Ground: ${distanceToGround.toFixed(2)}`)
      console.log(`Ground Tolerance: ${0.6 * 2} (doubled from 0.6)`)
      
      if (distanceToGround <= 0.6 * 2 && velocity.y <= 0.5) {
        console.log('✅ Should be on ground')
      } else {
        console.log('❌ Should not be on ground')
      }
    }
    
    console.groupEnd()
  }
} 