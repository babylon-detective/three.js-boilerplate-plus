import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import * as THREE from 'three'
import { ObjectManager } from './ObjectManager'
import { AnimationSystem } from './AnimationSystem'
import { CollisionSystem } from './CollisionSystem'
import { CameraManager } from './CameraManager'
import { PlayerController } from './PlayerController'
import { performanceMonitor } from './PerformanceMonitor'
import { logger, LogModule } from './Logger'

export interface DebugGUIConfig {
  mainGUIPosition?: { top: string; right: string }
  environmentGUIPosition?: { top: string; right: string }
  performanceGUIPosition?: { top: string; right: string }
  playerGUIPosition?: { top: string; right: string }
}

export interface SystemReferences {
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  objectManager: ObjectManager
  animationSystem: AnimationSystem
  configManager?: ConfigManager
  collisionSystem?: any
  cameraManager?: any
  playerController?: any
  oceanLODSystem?: any
  landSystem?: any
  sky?: any
  skyConfig?: any
  parameterManager?: any
  parameterGUI?: any
  deviceType: string
  inputMethods: string[]
}

export class DebugGUIManager {
  private mainGUI: GUI | null = null
  private environmentGUI: GUI | null = null
  private performanceGUI: GUI | null = null
  private playerGUI: GUI | null = null
  private container: HTMLElement
  private systems: SystemReferences
  private config: DebugGUIConfig

  constructor(container: HTMLElement, systems: SystemReferences, config: DebugGUIConfig = {}) {
    this.container = container
    this.systems = systems
    this.config = {
      mainGUIPosition: { top: '0px', right: '0px' },
      environmentGUIPosition: { top: '0px', right: '320px' },
      performanceGUIPosition: { top: '0px', right: '640px' },
      playerGUIPosition: { top: '0px', right: '960px' },
      ...config
    }
  }

  /**
   * Initialize all GUI panels
   */
  public initialize(): void {
    this.createMainGUI()
    this.createEnvironmentGUI()
    this.createPerformanceGUI()
    this.createPlayerGUI()
    
    logger.info(LogModule.SYSTEM, 'Debug GUI Manager initialized with all panels')
  }

  /**
   * Create main system controls GUI
   */
  private createMainGUI(): void {
    this.mainGUI = new GUI({ width: 300 })
    this.mainGUI.domElement.style.position = 'fixed'
    this.mainGUI.domElement.style.top = this.config.mainGUIPosition!.top
    this.mainGUI.domElement.style.right = this.config.mainGUIPosition!.right
    this.mainGUI.domElement.style.zIndex = '1000'
    
    this.container.appendChild(this.mainGUI.domElement)
    
    this.setupDeviceInfo()
    this.setupAnimationControls()
    this.setupCameraControls()
    this.setupObjectManagement()
  }

  /**
   * Create environment controls GUI
   */
  private createEnvironmentGUI(): void {
    this.environmentGUI = new GUI({ width: 300 })
    this.environmentGUI.domElement.style.position = 'fixed'
    this.environmentGUI.domElement.style.top = this.config.environmentGUIPosition!.top
    this.environmentGUI.domElement.style.right = this.config.environmentGUIPosition!.right
    this.environmentGUI.domElement.style.zIndex = '1000'
    
    this.container.appendChild(this.environmentGUI.domElement)
    
    this.setupSkyControls()
    this.setupOceanControls()
    this.setupLandControls()
  }

  /**
   * Create performance monitoring GUI
   */
  private createPerformanceGUI(): void {
    this.performanceGUI = new GUI({ width: 300 })
    this.performanceGUI.domElement.style.position = 'fixed'
    this.performanceGUI.domElement.style.top = this.config.performanceGUIPosition!.top
    this.performanceGUI.domElement.style.right = this.config.performanceGUIPosition!.right
    this.performanceGUI.domElement.style.zIndex = '1000'
    
    this.container.appendChild(this.performanceGUI.domElement)
    
    this.setupPerformanceControls()
    this.setupCollisionControls()
  }

  /**
   * Create player controls GUI
   */
  private createPlayerGUI(): void {
    this.playerGUI = new GUI({ width: 300 })
    this.playerGUI.domElement.style.position = 'fixed'
    this.playerGUI.domElement.style.top = this.config.playerGUIPosition!.top
    this.playerGUI.domElement.style.right = this.config.playerGUIPosition!.right
    this.playerGUI.domElement.style.zIndex = '1000'
    
    this.container.appendChild(this.playerGUI.domElement)
    
    this.setupPlayerControls()
  }

  // ============================================================================
  // MAIN GUI SECTIONS
  // ============================================================================

  private setupDeviceInfo(): void {
    if (!this.mainGUI) return
    
    const deviceFolder = this.mainGUI.addFolder('📱 Device Info')
    deviceFolder.add({ type: this.systems.deviceType }, 'type').name('Device Type')
    deviceFolder.add({ width: window.innerWidth }, 'width').name('Width')
    deviceFolder.add({ height: window.innerHeight }, 'height').name('Height')
    deviceFolder.add({ inputs: this.systems.inputMethods.join(', ') }, 'inputs').name('Input Methods')
    deviceFolder.open()
  }

  private setupAnimationControls(): void {
    if (!this.mainGUI || !this.systems.animationSystem) return
    
    const animFolder = this.mainGUI.addFolder('🎬 Animation System')
    animFolder.add(this.systems.animationSystem, 'start').name('Start Animations')
    animFolder.add(this.systems.animationSystem, 'stop').name('Stop Animations')
    animFolder.add({ count: this.systems.animationSystem.getAnimationCount() }, 'count').name('Active Animations')
    animFolder.open()
  }

  private setupCameraControls(): void {
    if (!this.mainGUI || !this.systems.objectManager) return
    
    const cameraFolder = this.mainGUI.addFolder('📷 Camera')
    
    // Camera position controls
    const positionFolder = cameraFolder.addFolder('Position')
    positionFolder.add(this.systems.camera.position, 'x', -50, 50).onChange(() => {
      this.systems.objectManager.saveCameraState()
    })
    positionFolder.add(this.systems.camera.position, 'y', -50, 50).onChange(() => {
      this.systems.objectManager.saveCameraState()
    })
    positionFolder.add(this.systems.camera.position, 'z', -50, 50).onChange(() => {
      this.systems.objectManager.saveCameraState()
    })
    positionFolder.open()
    
    // Camera FOV
    cameraFolder.add(this.systems.camera, 'fov', 10, 150).onChange(() => {
      this.systems.camera.updateProjectionMatrix()
      this.systems.objectManager.saveCameraState()
    })
    
    // Camera persistence controls
    const cameraPersistence = {
      'Save Camera State': () => {
        this.systems.objectManager.saveCameraState()
        logger.info(LogModule.CAMERA, 'Camera state saved manually')
      },
      'Load Camera State': () => {
        const loaded = this.systems.objectManager.loadCameraState()
        if (loaded) {
          logger.info(LogModule.CAMERA, 'Camera state loaded')
        } else {
          logger.warn(LogModule.CAMERA, 'No saved camera state found')
        }
      },
      'Clear Camera State': () => {
        this.systems.objectManager.clearCameraState()
        logger.info(LogModule.CAMERA, 'Camera state cleared')
      }
    }
    
    cameraFolder.add(cameraPersistence, 'Save Camera State')
    cameraFolder.add(cameraPersistence, 'Load Camera State')
    cameraFolder.add(cameraPersistence, 'Clear Camera State')
    cameraFolder.open()
  }

  private setupObjectManagement(): void {
    if (!this.mainGUI || !this.systems.objectManager) return
    
    const objectFolder = this.mainGUI.addFolder('🎯 Object Management')
    objectFolder.add({ count: this.systems.objectManager.getAllObjects().length }, 'count').name('Managed Objects')
    objectFolder.add(this.systems.objectManager, 'listAllObjects').name('List All Objects')
    objectFolder.add(this.systems.objectManager, 'savePersistentStates').name('Save States')
    objectFolder.add(this.systems.objectManager, 'clearPersistentStates').name('Clear All States')
    objectFolder.open()
  }

  // ============================================================================
  // ENVIRONMENT GUI SECTIONS
  // ============================================================================

  private setupSkyControls(): void {
    if (!this.environmentGUI || !this.systems.sky || !this.systems.skyConfig) return
    
    const skyFolder = this.environmentGUI.addFolder('☀️ Sun & Sky System')
    
    skyFolder.add(this.systems.skyConfig, 'turbidity', 0, 20, 0.1)
      .name('Turbidity')
      .onChange(() => this.updateSkyUniforms())
      
    skyFolder.add(this.systems.skyConfig, 'rayleigh', 0, 4, 0.001)
      .name('Rayleigh')
      .onChange(() => this.updateSkyUniforms())
      
    skyFolder.add(this.systems.skyConfig, 'mieCoefficient', 0, 0.1, 0.001)
      .name('Mie Coefficient')
      .onChange(() => this.updateSkyUniforms())
      
    skyFolder.add(this.systems.skyConfig, 'mieDirectionalG', 0, 1, 0.001)
      .name('Mie Direction')
      .onChange(() => this.updateSkyUniforms())
      
    skyFolder.add(this.systems.skyConfig, 'elevation', -90, 90, 1)
      .name('Sun Elevation')
      .onChange(() => this.updateSunPosition())
      
    skyFolder.add(this.systems.skyConfig, 'azimuth', -180, 180, 1)
      .name('Sun Azimuth')
      .onChange(() => this.updateSunPosition())
      
    skyFolder.add(this.systems.skyConfig, 'exposure', 0, 1, 0.001)
      .name('Exposure')
      .onChange((value: number) => {
        this.systems.renderer.toneMappingExposure = value
      })

    skyFolder.open()
  }

  private setupOceanControls(): void {
    if (!this.environmentGUI || !this.systems.oceanLODSystem) return
    
    const oceanFolder = this.environmentGUI.addFolder('🌊 Ocean System')
    const oceanLevels = this.systems.oceanLODSystem.getLODLevels()
    
    if (oceanLevels.length > 0) {
      const oceanUniforms = oceanLevels[0].material.uniforms
      
      // Wave Parameters
      const waveFolder = oceanFolder.addFolder('🌊 Wave Parameters')
      waveFolder.add(oceanUniforms.uAmplitude, 'value', 0, 2, 0.01).name('Wave Amplitude')
      waveFolder.add(oceanUniforms.uWaveSpeed, 'value', 0.1, 3, 0.1).name('Wave Speed')
      waveFolder.add(oceanUniforms.uWaveLength, 'value', 0.5, 5, 0.1).name('Wave Length')
      waveFolder.add(oceanUniforms.uWindStrength, 'value', 0, 3, 0.1).name('Wind Strength')
      waveFolder.add(oceanUniforms.uWindDirection.value, 'x', -1, 1, 0.1).name('Wind Dir X')
      waveFolder.add(oceanUniforms.uWindDirection.value, 'y', -1, 1, 0.1).name('Wind Dir Z')
      waveFolder.open()
      
      // Visual Parameters
      const visualFolder = oceanFolder.addFolder('🎨 Visual Properties')
      visualFolder.add(oceanUniforms.uTransparency, 'value', 0, 1, 0.01).name('Transparency')
      visualFolder.add(oceanUniforms.uReflectionStrength, 'value', 0, 1, 0.01).name('Reflection Strength')
      visualFolder.addColor(oceanUniforms.uWaterColor, 'value').name('Shallow Water')
      visualFolder.addColor(oceanUniforms.uDeepWaterColor, 'value').name('Deep Water')
      visualFolder.addColor(oceanUniforms.uFoamColor, 'value').name('Foam Color')
      visualFolder.open()
      
      // Ocean Sun Parameters
      const oceanSunFolder = oceanFolder.addFolder('☀️ Ocean Sun Effects')
      oceanSunFolder.add(oceanUniforms.uSunIntensity, 'value', 0, 3, 0.1).name('Sun Intensity')
      oceanSunFolder.addColor(oceanUniforms.uSunColor, 'value').name('Sun Color')
      
      // Sun direction controls
      const sunDirControls = {
        x: oceanUniforms.uSunDirection.value.x,
        y: oceanUniforms.uSunDirection.value.y,
        z: oceanUniforms.uSunDirection.value.z
      }
      oceanSunFolder.add(sunDirControls, 'x', -1, 1, 0.1)
        .name('Sun Dir X')
        .onChange((value: number) => {
          oceanUniforms.uSunDirection.value.x = value
          if (this.systems.landSystem) {
            this.systems.landSystem.setSunDirection(oceanUniforms.uSunDirection.value)
          }
        })
      oceanSunFolder.add(sunDirControls, 'y', -1, 1, 0.1)
        .name('Sun Dir Y')
        .onChange((value: number) => {
          oceanUniforms.uSunDirection.value.y = value
          if (this.systems.landSystem) {
            this.systems.landSystem.setSunDirection(oceanUniforms.uSunDirection.value)
          }
        })
      oceanSunFolder.add(sunDirControls, 'z', -1, 1, 0.1)
        .name('Sun Dir Z')
        .onChange((value: number) => {
          oceanUniforms.uSunDirection.value.z = value
          if (this.systems.landSystem) {
            this.systems.landSystem.setSunDirection(oceanUniforms.uSunDirection.value)
          }
        })
      oceanSunFolder.open()
      
      oceanFolder.open()
    }
  }

  private setupLandControls(): void {
    if (!this.environmentGUI || !this.systems.landSystem) return
    
    const landFolder = this.environmentGUI.addFolder('🏔️ Land System')
    
    // Land parameters
    landFolder.add({ pieces: this.systems.landSystem.getLandPieces().length }, 'pieces').name('Land Pieces')
    
    // Terrain controls
    const terrainFolder = landFolder.addFolder('Terrain Parameters')
    terrainFolder.add({ elevation: 1.0 }, 'elevation', 0, 5, 0.1)
      .name('Elevation')
      .onChange((value: number) => this.systems.landSystem.setElevation(value))
    
    terrainFolder.add({ roughness: 0.5 }, 'roughness', 0, 1, 0.01)
      .name('Roughness')
      .onChange((value: number) => this.systems.landSystem.setRoughness(value))
    
    terrainFolder.add({ scale: 1.0 }, 'scale', 0.1, 3, 0.1)
      .name('Scale')
      .onChange((value: number) => this.systems.landSystem.setScale(value))
    
    terrainFolder.open()
    landFolder.open()
  }

  // ============================================================================
  // PERFORMANCE GUI SECTIONS
  // ============================================================================

  private setupPerformanceControls(): void {
    if (!this.performanceGUI) return
    
    const perfFolder = this.performanceGUI.addFolder('📊 Performance')
    
    // Performance monitoring controls
    const perfControls = {
      'Enable Monitoring': () => performanceMonitor.enable(),
      'Disable Monitoring': () => performanceMonitor.disable(),
      'Reset Metrics': () => performanceMonitor.reset(),
      'Show Stats': () => {
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
    }
    
    perfFolder.add(perfControls, 'Enable Monitoring')
    perfFolder.add(perfControls, 'Disable Monitoring')
    perfFolder.add(perfControls, 'Reset Metrics')
    perfFolder.add(perfControls, 'Show Stats')
    perfFolder.open()
  }

  private setupCollisionControls(): void {
    if (!this.performanceGUI || !this.systems.collisionSystem) return
    
    const collisionFolder = this.performanceGUI.addFolder('💥 Collision System')
    
    // Collision system controls
    const collisionControls = {
      'Show Stats': () => {
        const stats = this.systems.collisionSystem.getPerformanceStats()
        console.group('💥 Collision System Statistics')
        console.log(`Registered Objects: ${stats.registeredObjects}`)
        console.log(`Land Meshes: ${stats.landMeshes}`)
        console.log(`Cache Size: ${stats.cacheSize}`)
        console.log(`Cache Timeout: ${stats.cacheTimeout}ms`)
        console.log(`Collision Check Interval: ${stats.collisionCheckInterval}ms`)
        console.groupEnd()
      },
      'Test Collision': () => {
        const testPosition = new THREE.Vector3(0, 10, 0)
        const collision = this.systems.collisionSystem.checkCollision('player', testPosition)
        
        console.group('🔍 Collision Test Results')
        console.log(`Test Position: (0, 10, 0)`)
        console.log(`Has Collision: ${collision.hasCollision}`)
        console.log(`Penetration Depth: ${collision.penetrationDepth.toFixed(3)}`)
        console.log(`Surface Normal: (${collision.normal.x.toFixed(3)}, ${collision.normal.y.toFixed(3)}, ${collision.normal.z.toFixed(3)})`)
        console.log(`Corrected Position: (${collision.correctedPosition.x.toFixed(3)}, ${collision.correctedPosition.y.toFixed(3)}, ${collision.correctedPosition.z.toFixed(3)})`)
        console.groupEnd()
      }
    }
    
    collisionFolder.add(collisionControls, 'Show Stats')
    collisionFolder.add(collisionControls, 'Test Collision')
    collisionFolder.open()
  }

  // ============================================================================
  // PLAYER GUI SECTIONS
  // ============================================================================

  private setupPlayerControls(): void {
    if (!this.playerGUI || !this.systems.playerController) return
    
    const playerFolder = this.playerGUI.addFolder('🎮 Player Controller')
    
    // Player position controls
    const positionFolder = playerFolder.addFolder('Position')
    const playerPos = this.systems.playerController.getPosition()
    positionFolder.add({ x: playerPos.x }, 'x', -50, 50, 0.1)
      .name('X Position')
      .onChange((value: number) => {
        const pos = this.systems.playerController.getPosition()
        pos.x = value
        this.systems.playerController.setPosition(pos)
      })
    
    positionFolder.add({ y: playerPos.y }, 'y', -50, 50, 0.1)
      .name('Y Position')
      .onChange((value: number) => {
        const pos = this.systems.playerController.getPosition()
        pos.y = value
        this.systems.playerController.setPosition(pos)
      })
    
    positionFolder.add({ z: playerPos.z }, 'z', -50, 50, 0.1)
      .name('Z Position')
      .onChange((value: number) => {
        const pos = this.systems.playerController.getPosition()
        pos.z = value
        this.systems.playerController.setPosition(pos)
      })
    positionFolder.open()
    
    // Player configuration controls
    const configFolder = playerFolder.addFolder('Configuration')
    const config = this.systems.playerController.getConfig()
    
    configFolder.add({ moveSpeed: config.moveSpeed }, 'moveSpeed', 5, 50, 0.5)
      .name('Move Speed')
      .onChange((value: number) => {
        this.systems.playerController.updateConfig({ moveSpeed: value })
      })
    
    configFolder.add({ jumpSpeed: config.jumpSpeed }, 'jumpSpeed', 1, 20, 0.5)
      .name('Jump Speed')
      .onChange((value: number) => {
        this.systems.playerController.updateConfig({ jumpSpeed: value })
      })
    
    configFolder.add({ gravity: config.gravity }, 'gravity', 5, 50, 0.5)
      .name('Gravity')
      .onChange((value: number) => {
        this.systems.playerController.updateConfig({ gravity: value })
      })
    
    configFolder.add({ capsuleRadius: config.capsuleRadius }, 'capsuleRadius', 0.1, 2, 0.1)
      .name('Capsule Radius')
      .onChange((value: number) => {
        this.systems.playerController.updateConfig({ capsuleRadius: value })
      })
    
    configFolder.add({ capsuleHeight: config.capsuleHeight }, 'capsuleHeight', 0.5, 5, 0.1)
      .name('Capsule Height')
      .onChange((value: number) => {
        this.systems.playerController.updateConfig({ capsuleHeight: value })
      })
    configFolder.open()
    
    // Player debug controls
    const debugFolder = playerFolder.addFolder('Debug')
    debugFolder.add({ debugVisible: false }, 'debugVisible')
      .name('Show Debug Wireframe')
      .onChange((value: boolean) => {
        this.systems.playerController.setDebugVisible(value)
      })
    
    debugFolder.add({ showStatus: false }, 'showStatus')
      .name('Show Status')
      .onChange((value: boolean) => {
        if (value) {
          console.group('🎮 Player Status')
          console.log(this.systems.playerController.getStatus())
          console.groupEnd()
        }
      })
    debugFolder.open()
    
    playerFolder.open()
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private updateSkyUniforms(): void {
    if (this.systems.sky && this.systems.skyConfig) {
      this.systems.sky.material.uniforms.turbidity.value = this.systems.skyConfig.turbidity
      this.systems.sky.material.uniforms.rayleigh.value = this.systems.skyConfig.rayleigh
      this.systems.sky.material.uniforms.mieCoefficient.value = this.systems.skyConfig.mieCoefficient
      this.systems.sky.material.uniforms.mieDirectionalG.value = this.systems.skyConfig.mieDirectionalG
      this.systems.sky.material.uniforms.exposure.value = this.systems.skyConfig.exposure
    }
  }

  private updateSunPosition(): void {
    if (this.systems.sky && this.systems.skyConfig) {
      const phi = THREE.MathUtils.degToRad(90 - this.systems.skyConfig.elevation)
      const theta = THREE.MathUtils.degToRad(this.systems.skyConfig.azimuth)
      
      this.systems.sun.setFromSphericalCoords(1, phi, theta)
      this.systems.sky.material.uniforms.sunPosition.value.copy(this.systems.sun)
    }
  }

  /**
   * Dispose of all GUI elements
   */
  public dispose(): void {
    if (this.mainGUI) {
      this.mainGUI.destroy()
      this.mainGUI = null
    }
    if (this.environmentGUI) {
      this.environmentGUI.destroy()
      this.environmentGUI = null
    }
    if (this.performanceGUI) {
      this.performanceGUI.destroy()
      this.performanceGUI = null
    }
    if (this.playerGUI) {
      this.playerGUI.destroy()
      this.playerGUI = null
    }
    
    logger.info(LogModule.SYSTEM, 'Debug GUI Manager disposed')
  }

  /**
   * Get all GUI instances
   */
  public getGUIs(): { main: GUI | null; environment: GUI | null; performance: GUI | null; player: GUI | null } {
    return {
      main: this.mainGUI,
      environment: this.environmentGUI,
      performance: this.performanceGUI,
      player: this.playerGUI
    }
  }
} 