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
// SHADER LOADING UTILITIES
// ============================================================================

interface ShaderConfig {
  vertexPath: string
  fragmentPath: string
}

class ShaderLoader {
  private static cache: Map<string, string> = new Map()

  public static async loadShader(path: string): Promise<string> {
    if (this.cache.has(path)) {
      return this.cache.get(path)!
    }

    try {
      const response = await fetch(path)
      if (!response.ok) {
        throw new Error(`Failed to load shader: ${path}`)
      }
      const content = await response.text()
      this.cache.set(path, content)
      return content
    } catch (error) {
      console.error(`Error loading shader ${path}:`, error)
      throw error
    }
  }

  public static async loadShaderPair(config: ShaderConfig): Promise<{ vertex: string; fragment: string }> {
    const [vertex, fragment] = await Promise.all([
      this.loadShader(config.vertexPath),
      this.loadShader(config.fragmentPath)
    ])
    return { vertex, fragment }
  }
}

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
  private shaderMaterial: THREE.ShaderMaterial | THREE.MeshStandardMaterial | null = null
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
    
    this.init()
  }

  private async init(): Promise<void> {
    this.initScene()
    this.initCamera()
    this.initRenderer()
    this.initControls()
    this.initDebugSystem()
    await this.createContent()
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
    
          // Material controls
      if (this.shaderMaterial) {
        if (this.shaderMaterial instanceof THREE.ShaderMaterial) {
          const shaderFolder = gui.addFolder('Shader Material')
          shaderFolder.add(this.shaderMaterial.uniforms.uAmplitude, 'value', 0, 1).name('Wave Amplitude')
          shaderFolder.addColor(this.shaderMaterial.uniforms.uColorA, 'value').name('Color A')
          shaderFolder.addColor(this.shaderMaterial.uniforms.uColorB, 'value').name('Color B')
          shaderFolder.open()
        } else if (this.shaderMaterial instanceof THREE.MeshStandardMaterial) {
          const materialFolder = gui.addFolder('Standard Material')
          materialFolder.add(this.shaderMaterial, 'metalness', 0, 1).name('Metalness')
          materialFolder.add(this.shaderMaterial, 'roughness', 0, 1).name('Roughness')
          materialFolder.addColor(this.shaderMaterial, 'color').name('Base Color')
          materialFolder.open()
        }
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

  private async createContent(): Promise<void> {
    this.addLighting()
    this.createSkySystem()
    await this.createAnimatedObjects()
    await this.createShaderObjects()
    await this.createTSLObjects()
  }

  private addLighting(): void {
    // Brighter ambient light to make materials more visible
    const ambientLight = new THREE.AmbientLight(0x404040, 0.8)
    this.scene.add(ambientLight)

    // Main directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0)
    directionalLight.position.set(10, 10, 5)
    directionalLight.castShadow = this.rendererConfig.shadows
    if (directionalLight.castShadow) {
      directionalLight.shadow.mapSize.width = 2048
      directionalLight.shadow.mapSize.height = 2048
    }
    this.scene.add(directionalLight)

    // Add fill light for better visibility
    const fillLight = new THREE.DirectionalLight(0x8899ff, 0.4)
    fillLight.position.set(-5, 5, -5)
    this.scene.add(fillLight)
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

  private async createAnimatedObjects(): Promise<void> {
    // Create geometries
    const geometries = [
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.SphereGeometry(0.5, 32, 32),
      new THREE.ConeGeometry(0.5, 1, 8),
      new THREE.CylinderGeometry(0.3, 0.3, 1, 16)
    ]

    // Define shader configurations for each mesh
    const shaderConfigs: ShaderConfig[] = [
      { vertexPath: 'src/shaders/noise-vertex.glsl', fragmentPath: 'src/shaders/noise-fragment.glsl' },      // Box: Noise shader
      { vertexPath: 'src/shaders/spiral-vertex.glsl', fragmentPath: 'src/shaders/spiral-fragment.glsl' },   // Sphere: Spiral shader
      { vertexPath: 'src/shaders/pulse-vertex.glsl', fragmentPath: 'src/shaders/pulse-fragment.glsl' },     // Cone: Pulse shader
      { vertexPath: 'src/shaders/crystal-vertex.glsl', fragmentPath: 'src/shaders/crystal-fragment.glsl' }  // Cylinder: Crystal shader
    ]

    for (let i = 0; i < 4; i++) {
      try {
        // Load shader pair from external files
        const { vertex: vertexShader, fragment: fragmentShader } = await ShaderLoader.loadShaderPair(shaderConfigs[i])

        // Add random attributes to geometry
        const geometry = geometries[i]
        const positionAttribute = geometry.getAttribute('position')
        const randomValues = new Float32Array(positionAttribute.count)
        
        for (let j = 0; j < randomValues.length; j++) {
          randomValues[j] = Math.random()
        }
        
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(randomValues, 1))
        
        // Create shader material using loaded external shaders
        const material = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: {
            uTime: { value: 0 },
            uAmplitude: { value: 0.2 },
            uColorA: { value: new THREE.Color(0xff0040) },
            uColorB: { value: new THREE.Color(0x0040ff) }
          },
          side: THREE.DoubleSide,
          transparent: false
        })

        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set((i - 1.5) * 3, 0, 0)
        mesh.userData = { id: `animated-${i}`, type: 'animated', material: material }
        
        this.scene.add(mesh)
        this.animatedObjects.set(`animated-${i}`, mesh)
        
        this.createAnimationForObject(mesh, i)

      } catch (error) {
        console.error(`Failed to load shaders for mesh ${i}:`, error)
        
        // Fallback to basic material if shader loading fails
        const fallbackMaterial = new THREE.MeshStandardMaterial({
          color: 0xff0040,
          metalness: 0.1,
          roughness: 0.4,
          emissive: 0x330011
        })
        
        const geometry = geometries[i]
        const mesh = new THREE.Mesh(geometry, fallbackMaterial)
        mesh.position.set((i - 1.5) * 3, 0, 0)
        mesh.userData = { id: `animated-${i}`, type: 'animated', material: fallbackMaterial }
        
        this.scene.add(mesh)
        this.animatedObjects.set(`animated-${i}`, mesh)
        this.createAnimationForObject(mesh, i)
      }
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

  private async createShaderObjects(): Promise<void> {
    try {
      // Load main wave shader from external files
      const { vertex: vertexShader, fragment: fragmentShader } = await ShaderLoader.loadShaderPair({
        vertexPath: 'src/shaders/vertex.glsl',
        fragmentPath: 'src/shaders/fragment.glsl'
      })
      
      // Create geometry with random attributes (as expected by the shader)
      const geometry = new THREE.PlaneGeometry(4, 4, 32, 32)
      const positionAttribute = geometry.getAttribute('position')
      const randomValues = new Float32Array(positionAttribute.count)
      
      for (let i = 0; i < randomValues.length; i++) {
        randomValues[i] = Math.random()
      }
      
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(randomValues, 1))
      
      // Create shader material using the loaded GLSL shaders
      const shaderMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uAmplitude: { value: 0.2 },
          uColorA: { value: new THREE.Color(0xff0040) },
          uColorB: { value: new THREE.Color(0x0040ff) }
        },
        side: THREE.DoubleSide,
        transparent: true
      })
      
      // Create the mesh with shader material
      const shaderMesh = new THREE.Mesh(geometry, shaderMaterial)
      shaderMesh.position.set(-6, 0, 0)
      shaderMesh.rotation.x = -Math.PI * 0.25
      this.scene.add(shaderMesh)
      
      // Store reference for animation
      this.shaderMaterial = shaderMaterial
      
      console.log('✅ Custom GLSL shaders loaded and applied!')
      
    } catch (error) {
      console.error('❌ Failed to load shaders:', error)
      
      // Fallback to simple material
      const geometry = new THREE.PlaneGeometry(4, 4, 32, 32)
      const fallbackMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0040,
        metalness: 0.1,
        roughness: 0.4,
        emissive: 0x330011 // Add some emission to make it brighter
      })
      
      const fallbackMesh = new THREE.Mesh(geometry, fallbackMaterial)
      fallbackMesh.position.set(-6, 0, 0)
      fallbackMesh.rotation.x = -Math.PI * 0.25
      fallbackMesh.castShadow = true
      fallbackMesh.receiveShadow = true
      this.scene.add(fallbackMesh)
      
      this.shaderMaterial = fallbackMaterial
    }
  }

  private async createTSLObjects(): Promise<void> {
    // Create holographic icosahedron
    const geometry = new THREE.IcosahedronGeometry(1, 4)
    
    // Add random attributes for holographic effect
    const positionAttribute = geometry.getAttribute('position')
    const randomValues = new Float32Array(positionAttribute.count)
    
    for (let i = 0; i < randomValues.length; i++) {
      randomValues[i] = Math.random()
    }
    
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randomValues, 1))
    
    // Load holographic shader from external files
    const { vertex: holoVertexShader, fragment: holoFragmentShader } = await ShaderLoader.loadShaderPair({
      vertexPath: 'src/shaders/hologram-vertex.glsl',
      fragmentPath: 'src/shaders/hologram-fragment.glsl'
    })

    // Create holographic shader material
    const holographicMaterial = new THREE.ShaderMaterial({
      vertexShader: holoVertexShader,
      fragmentShader: holoFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: 0.15 },
        uColorA: { value: new THREE.Color(0x00ff88) },
        uColorB: { value: new THREE.Color(0xff8800) }
      },
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending
    })

    const animatedMesh = new THREE.Mesh(geometry, holographicMaterial)
    animatedMesh.position.set(6, 0, 0)
    animatedMesh.userData = { id: 'hologram', type: 'hologram', material: holographicMaterial }
    this.scene.add(animatedMesh)
    
    // Store reference for uniform updates
    this.animatedMaterial = holographicMaterial as any

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

    // Additional rotation animation for holographic effect
    const rotationAnimation = this.animationSystem.createAnimation(animatedMesh, {
      duration: 6000,
      easing: Easing.linear,
      loop: true
    })
    rotationAnimation.to({ 
      rotation: new THREE.Euler(Math.PI * 2, Math.PI * 2, Math.PI * 2)
    }).start()
    this.animationSystem.addAnimation(rotationAnimation)
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
      
      // Update shader material uniforms
      if (this.shaderMaterial && this.shaderMaterial instanceof THREE.ShaderMaterial) {
        this.shaderMaterial.uniforms.uTime.value = currentTime * 0.001
        // Add subtle amplitude variation
        this.shaderMaterial.uniforms.uAmplitude.value = 0.2 + Math.sin(currentTime * 0.0005) * 0.1
      }
      
      // Update animated objects with shader materials
      this.animatedObjects.forEach((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.material instanceof THREE.ShaderMaterial) {
          mesh.material.uniforms.uTime.value = currentTime * 0.001
          // Add slight variation to each object's amplitude
          const variation = Math.sin(currentTime * 0.0003 + object.position.x) * 0.05
          mesh.material.uniforms.uAmplitude.value = 0.2 + variation
        }
      })
      
      // Update holographic material
      if (this.animatedMaterial && this.animatedMaterial instanceof THREE.ShaderMaterial) {
        this.animatedMaterial.uniforms.uTime.value = currentTime * 0.001
        this.animatedMaterial.uniforms.uAmplitude.value = 0.15 + Math.sin(currentTime * 0.0008) * 0.05
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
  backgroundColor: new THREE.Color(0x333333), // Slightly brighter background
  fog: new THREE.Fog(0x333333, 50, 200)
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
🚀 Three.js TypeScript Application with Unique Shaders Loaded!

🎮 Controls:
- Mouse/Touch: Rotate camera
- Wheel/Pinch: Zoom camera
- Click objects: Highlight animation
- Space: Toggle animations
- Ctrl/Cmd + D: Toggle debug mode
- P: Print performance stats

🎨 Unique Shader Materials:
- LEFT PLANE: Enhanced Wave Shader with multi-frequency waves and complex color mixing
- BOX: Noise/Fire Shader with procedural displacement and flickering fire colors
- SPHERE: Spiral/Ocean Shader with twisting geometry and ocean-like shimmer effects
- CONE: Pulse/Plasma Shader with electric pulsing and arc lighting effects
- CYLINDER: Crystal Shader with faceted geometry and golden amber crystalline effects
- ICOSAHEDRON: Holographic Shader with iridescent colors and scanning line effects

🐛 Debug Mode:
- Add #debug to URL or press Ctrl/Cmd + D
- Shows: Stats monitor, GUI controls for shader parameters, scene helpers
- Remove #debug to hide all debug elements

✨ Features Demonstrated:
- TypeScript type safety & advanced patterns
- Modular shader architecture with unique effects per mesh
- Custom GLSL vertex and fragment shaders
- Real-time uniform updates and animations
- Advanced material effects (noise, spirals, pulses, crystals, holograms)
- Responsive device detection & controls
- Comprehensive debug system with shader parameter control

Each mesh has its own unique visual identity and animation pattern!
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