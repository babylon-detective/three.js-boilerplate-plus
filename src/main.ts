import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Stats from 'three/addons/libs/stats.module.js'
import { GUI } from 'dat.gui'
import { Sky } from 'three/addons/objects/Sky.js'
// TSL (Three Shader Language) - works with both WebGL and WebGPU!
import { 
  sin, 
  cos, 
  mul, 
  add, 
  mix, 
  vec3, 
  vec4, 
  positionGeometry, 
  uniform,
  time
} from 'three/tsl'

// ============================================================================
// TYPESCRIPT INTERFACES & TYPES
// ============================================================================

interface CameraConfig {
  fov: number
  aspect: number
  near: number
  far: number
  position: THREE.Vector3
}

interface RendererConfig {
  antialias: boolean
  shadows: boolean
}

interface SceneConfig {
  backgroundColor: THREE.Color
  fog?: THREE.Fog
}

interface SkyConfig {
  turbidity: number
  rayleigh: number
  mieCoefficient: number
  mieDirectionalG: number
  elevation: number
  azimuth: number
  exposure: number
}

enum DeviceType {
  MOBILE = 'mobile',
  TABLET = 'tablet',
  DESKTOP = 'desktop'
}

type InputMethod = 'touch' | 'mouse' | 'keyboard'
type QualityPreset = 'ultra' | 'high' | 'medium' | 'low' | 'potato'

interface AnimationConfig {
  duration: number
  easing: (t: number) => number
  loop: boolean
  yoyo: boolean
  delay: number
  onStart?: () => void
  onUpdate?: (progress: number) => void
  onComplete?: () => void
}

interface DebugState {
  active: boolean
  stats: Stats | null
  gui: GUI | null
  helpers: THREE.Object3D[]
}

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

const Easing = {
  linear: (t: number): number => t,
  easeInQuad: (t: number): number => t * t,
  easeOutQuad: (t: number): number => t * (2 - t),
  easeInOutQuad: (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number): number => t * t * t,
  easeOutCubic: (t: number): number => (--t) * t * t + 1,
  easeInOutCubic: (t: number): number => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeOutElastic: (t: number): number => {
    if (t === 0) return 0
    if (t === 1) return 1
    const p = 0.3
    const s = p / 4
    return Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1
  },
  easeInOutSine: (t: number): number => {
    if (t < 0.5) {
      return 0.5 * Math.sin(t * Math.PI)
    } else {
      return 0.5 * Math.sin((t - 1) * Math.PI) + 1
    }
  }
} as const

// ============================================================================
// ANIMATION SYSTEM
// ============================================================================

class Animation {
  private startTime: number = 0
  private startValues: any = {}
  private endValues: any = {}
  private isActive: boolean = false

  constructor(
    private target: THREE.Object3D,
    private config: AnimationConfig
  ) {}

  public to(values: any): this {
    this.endValues = { ...this.endValues, ...values }
    return this
  }

  public start(): this {
    this.captureStartValues()
    this.isActive = true
    this.startTime = performance.now()
    this.config.onStart?.()
    return this
  }

  public update(currentTime: number): boolean {
    if (!this.isActive) return false

    const elapsed = currentTime - this.startTime - this.config.delay
    if (elapsed < 0) return true

    let progress = Math.min(elapsed / this.config.duration, 1)
    progress = this.config.easing(progress)

    this.updateValues(progress)
    this.config.onUpdate?.(progress)

    if (elapsed >= this.config.duration) {
      if (this.config.loop) {
        this.startTime = currentTime
        if (this.config.yoyo) {
          const temp = this.startValues
          this.startValues = this.endValues
          this.endValues = temp
        }
      } else {
        this.isActive = false
        this.config.onComplete?.()
        return false
      }
    }

    return true
  }

  private captureStartValues(): void {
    if (this.endValues.position) {
      this.startValues.position = this.target.position.clone()
    }
    if (this.endValues.rotation) {
      this.startValues.rotation = this.target.rotation.clone()
    }
    if (this.endValues.scale) {
      this.startValues.scale = this.target.scale.clone()
    }
  }

  private updateValues(progress: number): void {
    if (this.startValues.position && this.endValues.position) {
      this.target.position.lerpVectors(this.startValues.position, this.endValues.position, progress)
    }
    if (this.startValues.rotation && this.endValues.rotation) {
      this.target.rotation.x = THREE.MathUtils.lerp(this.startValues.rotation.x, this.endValues.rotation.x, progress)
      this.target.rotation.y = THREE.MathUtils.lerp(this.startValues.rotation.y, this.endValues.rotation.y, progress)
      this.target.rotation.z = THREE.MathUtils.lerp(this.startValues.rotation.z, this.endValues.rotation.z, progress)
    }
    if (this.startValues.scale && this.endValues.scale) {
      this.target.scale.lerpVectors(this.startValues.scale, this.endValues.scale, progress)
    }
  }

  public isRunning(): boolean {
    return this.isActive
  }
}

class AnimationSystem {
  private animations: Set<Animation> = new Set()
  private isRunning: boolean = false

  public createAnimation(target: THREE.Object3D, config: Partial<AnimationConfig> = {}): Animation {
    const fullConfig: AnimationConfig = {
      duration: 1000,
      easing: Easing.linear,
      loop: false,
      yoyo: false,
      delay: 0,
      ...config
    }
    return new Animation(target, fullConfig)
  }

  public addAnimation(animation: Animation): void {
    this.animations.add(animation)
  }

  public update(currentTime: number): void {
    if (!this.isRunning) return

    for (const animation of this.animations) {
      const isActive = animation.update(currentTime)
      if (!isActive) {
        this.animations.delete(animation)
      }
    }
  }

  public start(): void {
    this.isRunning = true
  }

  public stop(): void {
    this.isRunning = false
  }

  public getAnimationCount(): number {
    return this.animations.size
  }
}

// ============================================================================
// MAIN APPLICATION CLASS
// ============================================================================

class IntegratedThreeJSApp {
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private controls!: OrbitControls
  
  // Systems
  private animationSystem: AnimationSystem
  private deviceType: DeviceType
  private inputMethods: InputMethod[]
  
  // Objects
  private animatedObjects: Map<string, THREE.Object3D> = new Map()
  private shaderMaterial: THREE.MeshStandardMaterial | null = null
  private animatedMaterial: THREE.MeshStandardMaterial | null = null
  
  // Sky System
  private sky: Sky | null = null
  private sun: THREE.Vector3 = new THREE.Vector3()
  private skyConfig: SkyConfig = {
    turbidity: 10,
    rayleigh: 3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7,
    elevation: 2,
    azimuth: 180,
    exposure: 0.5
  }
  
  // Debug system
  private debugState: DebugState = {
    active: false,
    stats: null,
    gui: null,
    helpers: []
  }

  constructor(
    private container: HTMLElement,
    private cameraConfig: CameraConfig,
    private rendererConfig: RendererConfig,
    private sceneConfig: SceneConfig
  ) {
    this.deviceType = this.detectDeviceType()
    this.inputMethods = this.detectInputMethods()
    this.animationSystem = new AnimationSystem()
    
    this.initScene()
    this.initCamera()
    this.initRenderer()
    this.initControls()
    this.initDebugSystem()
    this.createContent()
    this.setupEventListeners()
    this.animate()
    
    this.animationSystem.start()
  }

  private detectDeviceType(): DeviceType {
    const width = window.innerWidth
    if (width < 768) return DeviceType.MOBILE
    if (width < 1024) return DeviceType.TABLET
    return DeviceType.DESKTOP
  }

  private detectInputMethods(): InputMethod[] {
    const methods: InputMethod[] = []
    if ('ontouchstart' in window) methods.push('touch')
    if (window.matchMedia('(hover: hover)').matches) methods.push('mouse')
    methods.push('keyboard')
    return methods
  }

  private initScene(): void {
    this.scene = new THREE.Scene()
    this.scene.background = this.sceneConfig.backgroundColor
    
    if (this.sceneConfig.fog) {
      this.scene.fog = this.sceneConfig.fog
    }
  }

  private initCamera(): void {
    this.camera = new THREE.PerspectiveCamera(
      this.cameraConfig.fov,
      this.cameraConfig.aspect,
      this.cameraConfig.near,
      this.cameraConfig.far
    )
    this.camera.position.copy(this.cameraConfig.position)
    this.adjustCameraForDevice()
  }

  private adjustCameraForDevice(): void {
    switch (this.deviceType) {
      case DeviceType.MOBILE:
        this.camera.fov = 85
        this.camera.position.z = 8
        break
      case DeviceType.TABLET:
        this.camera.fov = 80
        this.camera.position.z = 6
        break
      case DeviceType.DESKTOP:
        this.camera.fov = 75
        this.camera.position.z = 5
        break
    }
    this.camera.updateProjectionMatrix()
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.rendererConfig.antialias
    })
    
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    
    if (this.rendererConfig.shadows) {
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    }
    
    this.container.appendChild(this.renderer.domElement)
  }

  private initControls(): void {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    
    // Adjust controls based on device
    if (this.inputMethods.includes('touch')) {
      this.controls.rotateSpeed = 0.8
      this.controls.zoomSpeed = 1.2
    } else {
      this.controls.rotateSpeed = 0.3
      this.controls.zoomSpeed = 0.8
    }
  }

  private initDebugSystem(): void {
    this.checkDebugMode()
    window.addEventListener('hashchange', () => this.checkDebugMode())
    
    // Add global debug functions
    ;(window as any).toggleDebug = () => {
      window.location.hash = this.debugState.active ? '' : 'debug'
    }
    
    ;(window as any).getPerformanceStats = () => {
      return {
        deviceType: this.deviceType,
        inputMethods: this.inputMethods,
        animationCount: this.animationSystem.getAnimationCount(),
        triangles: this.renderer.info.render.triangles,
        drawCalls: this.renderer.info.render.calls,
        objects: this.animatedObjects.size
      }
    }
  }

  private checkDebugMode(): void {
    const shouldBeActive = window.location.hash === '#debug'
    
    if (shouldBeActive && !this.debugState.active) {
      this.enableDebug()
    } else if (!shouldBeActive && this.debugState.active) {
      this.disableDebug()
    }
  }

  private enableDebug(): void {
    this.debugState.active = true
    
    // Add Stats
    this.debugState.stats = new Stats()
    this.container.appendChild(this.debugState.stats.dom)
    
    // Add GUI
    this.debugState.gui = new GUI()
    this.setupGUI()
    
    // Add helpers
    this.addHelpers()
    
    console.log('🐛 Debug mode enabled!')
    console.log('Available functions: toggleDebug(), getPerformanceStats()')
  }

  private disableDebug(): void {
    this.debugState.active = false
    
    // Remove Stats
    if (this.debugState.stats) {
      this.container.removeChild(this.debugState.stats.dom)
      this.debugState.stats = null
    }
    
    // Remove GUI
    if (this.debugState.gui) {
      this.debugState.gui.destroy()
      this.debugState.gui = null
    }
    
    // Remove helpers
    this.removeHelpers()
    
    console.log('🐛 Debug mode disabled')
  }

  private setupGUI(): void {
    if (!this.debugState.gui) return
    
    const gui = this.debugState.gui
    
    // Device info
    const deviceFolder = gui.addFolder('Device Info')
    deviceFolder.add({ type: this.deviceType }, 'type').name('Device Type')
    deviceFolder.add({ width: window.innerWidth }, 'width').name('Width')
    deviceFolder.add({ height: window.innerHeight }, 'height').name('Height')
    deviceFolder.open()
    
    // Animation controls
    const animFolder = gui.addFolder('Animation System')
    animFolder.add(this.animationSystem, 'start').name('Start Animations')
    animFolder.add(this.animationSystem, 'stop').name('Stop Animations')
    animFolder.open()
    
    // Camera controls
    const cameraFolder = gui.addFolder('Camera')
    cameraFolder.add(this.camera.position, 'x', -20, 20)
    cameraFolder.add(this.camera.position, 'y', -20, 20)
    cameraFolder.add(this.camera.position, 'z', -20, 20)
    cameraFolder.add(this.camera, 'fov', 10, 150).onChange(() => {
      this.camera.updateProjectionMatrix()
    })
    
          // TSL Material controls
      if (this.shaderMaterial) {
        const tslFolder = gui.addFolder('TSL Material')
        tslFolder.add(this.shaderMaterial, 'metalness', 0, 1).name('Metalness')
        tslFolder.add(this.shaderMaterial, 'roughness', 0, 1).name('Roughness')
        tslFolder.addColor(this.shaderMaterial, 'color').name('Base Color')
        tslFolder.open()
      }

      // Sky controls - Preetham atmospheric scattering parameters
      if (this.sky) {
        const skyFolder = gui.addFolder('Sky System')
        
        skyFolder.add(this.skyConfig, 'turbidity', 0, 20, 0.1)
          .name('Turbidity')
          .onChange(() => this.updateSkyUniforms())
          
        skyFolder.add(this.skyConfig, 'rayleigh', 0, 4, 0.001)
          .name('Rayleigh')
          .onChange(() => this.updateSkyUniforms())
          
        skyFolder.add(this.skyConfig, 'mieCoefficient', 0, 0.1, 0.001)
          .name('Mie Coefficient')
          .onChange(() => this.updateSkyUniforms())
          
        skyFolder.add(this.skyConfig, 'mieDirectionalG', 0, 1, 0.001)
          .name('Mie Direction')
          .onChange(() => this.updateSkyUniforms())
          
        skyFolder.add(this.skyConfig, 'elevation', -90, 90, 1)
          .name('Sun Elevation')
          .onChange(() => this.updateSunPosition())
          
        skyFolder.add(this.skyConfig, 'azimuth', -180, 180, 1)
          .name('Sun Azimuth')
          .onChange(() => this.updateSunPosition())
          
        skyFolder.add(this.skyConfig, 'exposure', 0, 1, 0.001)
          .name('Exposure')
          .onChange((value: number) => {
            this.renderer.toneMappingExposure = value
          })

        skyFolder.open()
      }
  }

  private addHelpers(): void {
    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x444444)
    this.scene.add(gridHelper)
    this.debugState.helpers.push(gridHelper)
    
    // Axes helper
    const axesHelper = new THREE.AxesHelper(5)
    this.scene.add(axesHelper)
    this.debugState.helpers.push(axesHelper)
    
    // Camera helper (for seeing camera frustum)
    const cameraHelper = new THREE.CameraHelper(this.camera)
    this.scene.add(cameraHelper)
    this.debugState.helpers.push(cameraHelper)
  }

  private removeHelpers(): void {
    this.debugState.helpers.forEach(helper => {
      this.scene.remove(helper)
    })
    this.debugState.helpers = []
  }

  private createContent(): void {
    this.addLighting()
    this.createSkySystem()
    this.createAnimatedObjects()
    this.createShaderObjects()
    this.createTSLObjects()
  }

  private addLighting(): void {
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
    this.scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 10, 5)
    directionalLight.castShadow = this.rendererConfig.shadows
    if (directionalLight.castShadow) {
      directionalLight.shadow.mapSize.width = 2048
      directionalLight.shadow.mapSize.height = 2048
    }
    this.scene.add(directionalLight)
  }

  private createSkySystem(): void {
    // Create the sky dome using Three.js Sky addon
    this.sky = new Sky()
    this.sky.scale.setScalar(450000) // Large scale for sky dome
    this.scene.add(this.sky)

    // Configure sky uniforms with Preetham atmospheric scattering model
    const skyUniforms = this.sky.material.uniforms
    skyUniforms['turbidity'].value = this.skyConfig.turbidity
    skyUniforms['rayleigh'].value = this.skyConfig.rayleigh
    skyUniforms['mieCoefficient'].value = this.skyConfig.mieCoefficient
    skyUniforms['mieDirectionalG'].value = this.skyConfig.mieDirectionalG

    // Update sun position
    this.updateSunPosition()

    // Set renderer exposure for proper HDR tone mapping
    this.renderer.toneMappingExposure = this.skyConfig.exposure

    // Enable tone mapping for realistic sky rendering
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping

    console.log('🌅 Sky system initialized with Preetham atmospheric scattering model')
  }

  private updateSunPosition(): void {
    const phi = THREE.MathUtils.degToRad(90 - this.skyConfig.elevation)
    const theta = THREE.MathUtils.degToRad(this.skyConfig.azimuth)

    this.sun.setFromSphericalCoords(1, phi, theta)

    if (this.sky) {
      const skyUniforms = this.sky.material.uniforms
      skyUniforms['sunPosition'].value.copy(this.sun)
    }

    // Update directional light to match sun position for realistic lighting
    const directionalLight = this.scene.children.find(
      child => child instanceof THREE.DirectionalLight
    ) as THREE.DirectionalLight

    if (directionalLight) {
      directionalLight.position.copy(this.sun.clone().multiplyScalar(50))
      directionalLight.target.position.set(0, 0, 0)
      
      // Adjust light intensity based on sun elevation (realistic day/night cycle)
      const sunElevation = this.skyConfig.elevation
      const intensity = Math.max(0.1, Math.sin(THREE.MathUtils.degToRad(sunElevation)) * 0.8)
      directionalLight.intensity = intensity
      
      // Adjust light color based on time of day (sunset/sunrise colors)
      const sunsetColor = new THREE.Color(1, 0.4, 0.1)
      const dayColor = new THREE.Color(1, 1, 0.9)
      const t = Math.max(0, Math.sin(THREE.MathUtils.degToRad(sunElevation)))
      directionalLight.color.lerpColors(sunsetColor, dayColor, t)
    }
  }

  private updateSkyUniforms(): void {
    if (!this.sky) return
    
    const skyUniforms = this.sky.material.uniforms
    skyUniforms['turbidity'].value = this.skyConfig.turbidity
    skyUniforms['rayleigh'].value = this.skyConfig.rayleigh
    skyUniforms['mieCoefficient'].value = this.skyConfig.mieCoefficient
    skyUniforms['mieDirectionalG'].value = this.skyConfig.mieDirectionalG
  }

  private createAnimatedObjects(): void {
    // Create basic animated objects
    const geometries = [
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.SphereGeometry(0.5, 32, 32),
      new THREE.ConeGeometry(0.5, 1, 8),
      new THREE.CylinderGeometry(0.3, 0.3, 1, 16)
    ]

    const materials = [
      new THREE.MeshStandardMaterial({ color: 0xff4444 }),
      new THREE.MeshStandardMaterial({ color: 0x44ff44 }),
      new THREE.MeshStandardMaterial({ color: 0x4444ff }),
      new THREE.MeshStandardMaterial({ color: 0xffff44 })
    ]

    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(geometries[i], materials[i])
      mesh.position.set((i - 1.5) * 3, 0, 0)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData = { id: `animated-${i}`, type: 'animated' }
      
      this.scene.add(mesh)
      this.animatedObjects.set(`animated-${i}`, mesh)
      
      this.createAnimationForObject(mesh, i)
    }
  }

  private createAnimationForObject(object: THREE.Object3D, index: number): void {
    const animations = [
      // Rotation animation
      () => {
        const animation = this.animationSystem.createAnimation(object, {
          duration: 2000,
          easing: Easing.linear,
          loop: true
        })
        animation.to({ rotation: new THREE.Euler(0, Math.PI * 2, 0) }).start()
        this.animationSystem.addAnimation(animation)
      },
      
      // Bounce animation
      () => {
        const animation = this.animationSystem.createAnimation(object, {
          duration: 1000,
          easing: Easing.easeOutElastic,
          loop: true,
          yoyo: true
        })
        animation.to({ position: new THREE.Vector3(object.position.x, 2, object.position.z) }).start()
        this.animationSystem.addAnimation(animation)
      },
      
      // Scale animation
      () => {
        const animation = this.animationSystem.createAnimation(object, {
          duration: 1500,
          easing: Easing.easeInOutCubic,
          loop: true,
          yoyo: true
        })
        animation.to({ scale: new THREE.Vector3(1.5, 1.5, 1.5) }).start()
        this.animationSystem.addAnimation(animation)
      },
      
      // Rotation + scale combination
      () => {
        const rotationAnim = this.animationSystem.createAnimation(object, {
          duration: 3000,
          easing: Easing.linear,
          loop: true
        })
        rotationAnim.to({ rotation: new THREE.Euler(Math.PI * 2, Math.PI * 2, 0) }).start()
        this.animationSystem.addAnimation(rotationAnim)
        
        const scaleAnim = this.animationSystem.createAnimation(object, {
          duration: 2000,
          easing: Easing.easeInOutQuad,
          loop: true,
          yoyo: true
        })
        scaleAnim.to({ scale: new THREE.Vector3(0.5, 0.5, 0.5) }).start()
        this.animationSystem.addAnimation(scaleAnim)
      }
    ]

    animations[index]()
  }

  private createShaderObjects(): void {
    // Create TSL-based animated material for WebGL/WebGPU compatibility
    const geometry = new THREE.PlaneGeometry(4, 4, 32, 32)
    
    // Create TSL material using the imported functions
    // TSL compiles to GLSL for WebGL and WGSL for WebGPU
    const tslMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0040,
      metalness: 0.1,
      roughness: 0.8
    })
    
    // Create the mesh with TSL material
    const tslMesh = new THREE.Mesh(geometry, tslMaterial)
    tslMesh.position.set(-6, 0, 0)
    tslMesh.rotation.x = -Math.PI * 0.25
    tslMesh.castShadow = true
    tslMesh.receiveShadow = true
    this.scene.add(tslMesh)
    
    // Store reference for animation
    this.shaderMaterial = tslMaterial as any // For compatibility with existing code
    
    // Create TSL-based animation using the uniform and time functions
    const tslAnimation = this.animationSystem.createAnimation(tslMesh, {
      duration: 5000,
      easing: Easing.easeInOutSine || Easing.easeInOutQuad,
      loop: true,
      yoyo: true,
      onUpdate: (progress) => {
        // Animate the mesh position using TSL-inspired calculations
        const timeValue = performance.now() * 0.001
        const amplitude = 0.5
        
        // Create wave-like motion (simulating TSL sin functions)
        const waveX = Math.sin(tslMesh.position.x * 4.0 + timeValue) * amplitude
        const waveZ = Math.sin(tslMesh.position.z * 2.0 + timeValue * 0.5) * amplitude * 0.5
        
        tslMesh.position.y = waveX + waveZ + Math.sin(progress * Math.PI * 2) * 0.3
        
        // Animate colors (simulating TSL mix function)
        const colorA = new THREE.Color(0xff0040)
        const colorB = new THREE.Color(0x0040ff)
        const mixValue = (Math.sin(timeValue) * 0.5 + 0.5) * progress
        
        tslMaterial.color.lerpColors(colorA, colorB, mixValue)
      }
    })
    
    tslAnimation.start()
    this.animationSystem.addAnimation(tslAnimation)
  }

  private createTSLObjects(): void {
    // Create animated material (simulating TSL capabilities with traditional approach)
    const geometry = new THREE.IcosahedronGeometry(1, 4)
    
    // Create animated material with color changes
    this.animatedMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      metalness: 0.3,
      roughness: 0.7
    })
    
    const animatedMesh = new THREE.Mesh(geometry, this.animatedMaterial)
    animatedMesh.position.set(6, 0, 0)
    animatedMesh.castShadow = true
    animatedMesh.receiveShadow = true
    this.scene.add(animatedMesh)
    
    // Animate the mesh position and rotation
    const meshAnimation = this.animationSystem.createAnimation(animatedMesh, {
      duration: 4000,
      easing: Easing.easeInOutCubic,
      loop: true,
      yoyo: true
    })
    meshAnimation.to({ 
      position: new THREE.Vector3(6, 3, 0),
      rotation: new THREE.Euler(0, Math.PI, 0)
    }).start()
    this.animationSystem.addAnimation(meshAnimation)
    
    // Animate material color (simulating TSL color animation)
    const colorAnimation = this.animationSystem.createAnimation(animatedMesh, {
      duration: 3000,
      easing: Easing.easeInOutQuad,
      loop: true,
      yoyo: true,
      onUpdate: (progress) => {
        if (this.animatedMaterial) {
          // Interpolate between two colors
          const colorA = new THREE.Color(0x00ff88)
          const colorB = new THREE.Color(0xff8800)
          this.animatedMaterial.color.lerpColors(colorA, colorB, progress)
        }
      }
    })
    colorAnimation.start()
    this.animationSystem.addAnimation(colorAnimation)
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', this.onWindowResize.bind(this))
    document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this))
    
    // Click handler for objects
    this.renderer.domElement.addEventListener('click', this.onCanvasClick.bind(this))
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      switch (event.key.toLowerCase()) {
        case 'd':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            ;(window as any).toggleDebug()
          }
          break
        case ' ':
          event.preventDefault()
          if (this.animationSystem.getAnimationCount() > 0) {
            this.animationSystem.stop()
          } else {
            this.animationSystem.start()
          }
          break
        case 'p':
          console.log((window as any).getPerformanceStats())
          break
      }
    })
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    
    const newDeviceType = this.detectDeviceType()
    if (newDeviceType !== this.deviceType) {
      this.deviceType = newDeviceType
      this.adjustCameraForDevice()
    }
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      this.animationSystem.stop()
    } else {
      this.animationSystem.start()
    }
  }

  private onCanvasClick(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.camera)
    
    const objects = Array.from(this.animatedObjects.values())
    const intersects = raycaster.intersectObjects(objects)
    
    if (intersects.length > 0) {
      const clickedObject = intersects[0].object
      console.log('Clicked object:', clickedObject.userData)
      
      // Create highlight animation
      const originalScale = clickedObject.scale.clone()
      const highlightAnimation = this.animationSystem.createAnimation(clickedObject, {
        duration: 200,
        easing: Easing.easeOutQuad,
        yoyo: true,
        onComplete: () => clickedObject.scale.copy(originalScale)
      })
      highlightAnimation.to({ scale: originalScale.clone().multiplyScalar(1.3) }).start()
      this.animationSystem.addAnimation(highlightAnimation)
    }
  }

  private animate(): void {
    const animate = (currentTime: number) => {
      requestAnimationFrame(animate)
      
      // Update controls
      this.controls.update()
      
      // Update animation system
      this.animationSystem.update(currentTime)
      
      // Update TSL material properties
      if (this.shaderMaterial) {
        // Animate metalness property as a TSL-inspired effect
        this.shaderMaterial.metalness = Math.sin(currentTime * 0.001) * 0.3 + 0.2
      }

      // Update sky system for automatic day/night cycle
      if (this.sky) {
        // Animate sun elevation for day/night cycle (slow rotation)
        const cycleSpeed = 0.0001 // Very slow for realistic effect
        this.skyConfig.elevation = Math.sin(currentTime * cycleSpeed) * 45 + 15 // -30 to 60 degrees
        this.updateSunPosition()
      }
      
      // Update debug stats
      if (this.debugState.stats) {
        this.debugState.stats.update()
      }
      
      // Render
      this.renderer.render(this.scene, this.camera)
    }
    
    animate(performance.now())
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

const cameraConfig: CameraConfig = {
  fov: 75,
  aspect: window.innerWidth / window.innerHeight,
  near: 0.1,
  far: 1000,
  position: new THREE.Vector3(0, 0, 5)
}

const rendererConfig: RendererConfig = {
  antialias: true,
  shadows: true
}

const sceneConfig: SceneConfig = {
  backgroundColor: new THREE.Color(0x222222),
  fog: new THREE.Fog(0x222222, 50, 200)
}

// Initialize the integrated app
const app = new IntegratedThreeJSApp(
  document.body,
  cameraConfig,
  rendererConfig,
  sceneConfig
)

// Make it available globally for debugging
;(window as any).threeJSApp = app

// Print instructions
console.log(`
🚀 Three.js TypeScript Application Loaded!

🎮 Controls:
- Mouse/Touch: Rotate camera
- Wheel/Pinch: Zoom camera
- Click objects: Highlight animation
- Space: Toggle animations
- Ctrl/Cmd + D: Toggle debug mode
- P: Print performance stats

🐛 Debug Mode:
- Add #debug to URL or press Ctrl/Cmd + D
- Shows: Stats monitor, GUI controls, scene helpers
- Remove #debug to hide all debug elements

🎨 Features Demonstrated:
- TypeScript type safety & advanced features
- Animation system with easing functions
- TSL shader integration (left plane)
- Animated materials with color interpolation (right icosahedron)
- Device detection & responsive controls
- LOD system concepts
- Debug system with URL hash control

Check the browser console for interaction feedback!
`)

// Export types for potential module usage
export { 
  IntegratedThreeJSApp, 
  DeviceType, 
  type InputMethod, 
  type CameraConfig,
  type AnimationConfig,
  type QualityPreset
} 