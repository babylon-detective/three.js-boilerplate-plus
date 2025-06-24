import * as THREE from 'three'
import { AnimationSystem, Easing } from './systems/AnimationSystem'
import { LODSystem, createLODSystem } from './systems/LODSystem'
import { InputSystem } from './systems/InputSystem'
import { ThreeJSApp, DeviceType } from './main'

// Comprehensive example integrating all systems
export class IntegratedThreeJSExample {
  private app: ThreeJSApp
  private animationSystem: AnimationSystem
  private lodSystem: LODSystem
  private inputSystem: InputSystem
  
  // Collections for managing objects
  private animatedObjects: Map<string, THREE.Object3D> = new Map()
  private lodObjects: Map<string, THREE.Object3D> = new Map()
  
  constructor(container: HTMLElement) {
    // Initialize main app
    this.app = new ThreeJSApp(
      container,
      {
        fov: 75,
        aspect: window.innerWidth / window.innerHeight,
        near: 0.1,
        far: 1000,
        position: new THREE.Vector3(0, 0, 10)
      },
      {
        antialias: true,
        shadows: true,
        physicallyCorrectLights: true
      },
      {
        backgroundColor: new THREE.Color(0x222222),
        fog: new THREE.Fog(0x222222, 50, 200)
      }
    )

    this.initializeSystems()
    this.createScene()
    this.setupEventHandlers()
    this.startUpdateLoop()
  }

  private initializeSystems(): void {
    // Initialize Animation System
    this.animationSystem = new AnimationSystem()
    this.animationSystem.start()

    // Initialize LOD System with distance-based strategy
    this.lodSystem = createLODSystem(
      {
        type: 'distance',
        camera: this.app.getCamera()
      },
      {
        qualityPreset: 'medium',
        updateFrequency: 100,
        hysteresis: 0.1
      }
    )

    // Initialize Input System
    this.inputSystem = new InputSystem(this.app.getRenderer().domElement)
    
    // Create and add camera controls
    const cameraHandler = this.inputSystem.createCameraHandler(
      this.app.getCamera(),
      new THREE.Vector3(0, 0, 0)
    )
    this.inputSystem.addHandler(cameraHandler)

    // Create and add object interaction handler
    const interactionHandler = this.inputSystem.createObjectInteractionHandler(
      this.app.getCamera(),
      this.app.getScene(),
      this.onObjectClick.bind(this),
      this.onObjectHover.bind(this)
    )
    this.inputSystem.addHandler(interactionHandler)
  }

  private createScene(): void {
    const scene = this.app.getScene()
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 10, 5)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    // Create multiple objects to demonstrate systems
    this.createAnimatedObjects()
    this.createLODObjects()
  }

  private createAnimatedObjects(): void {
    const scene = this.app.getScene()

    // Create various animated objects
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
      mesh.position.set(
        (i - 1.5) * 3,
        0,
        0
      )
      mesh.castShadow = true
      mesh.receiveShadow = true
      
      // Add unique identifier for interaction
      mesh.userData = { id: `animated-${i}`, type: 'animated' }
      
      scene.add(mesh)
      this.animatedObjects.set(`animated-${i}`, mesh)
      
      // Create different animations for each object
      this.createAnimationForObject(mesh, i)
    }
  }

  private createAnimationForObject(object: THREE.Object3D, index: number): void {
    const animations = [
      // Rotation animation
      () => {
        const rotationAnimation = this.animationSystem.createAnimation(object, {
          duration: 2000,
          easing: Easing.linear,
          loop: true
        })
        rotationAnimation
          .to({ rotation: new THREE.Euler(0, Math.PI * 2, 0) })
          .start()
        return rotationAnimation
      },
      
      // Bounce animation
      () => {
        const bounceAnimation = this.animationSystem.createAnimation(object, {
          duration: 1000,
          easing: Easing.easeOutElastic,
          loop: true,
          yoyo: true
        })
        bounceAnimation
          .to({ position: new THREE.Vector3(object.position.x, 2, object.position.z) })
          .start()
        return bounceAnimation
      },
      
      // Scale animation
      () => {
        const scaleAnimation = this.animationSystem.createAnimation(object, {
          duration: 1500,
          easing: Easing.easeInOutCubic,
          loop: true,
          yoyo: true
        })
        scaleAnimation
          .to({ scale: new THREE.Vector3(1.5, 1.5, 1.5) })
          .start()
        return scaleAnimation
      },
      
      // Color animation
      () => {
        const colorAnimation = this.animationSystem.createAnimation(object, {
          duration: 3000,
          easing: Easing.easeInOutQuad,
          loop: true,
          yoyo: true
        })
        colorAnimation
          .to({ 
            material: { 
              color: new THREE.Color(0xff00ff) 
            } 
          })
          .start()
        return colorAnimation
      }
    ]

    // Execute the animation based on index
    animations[index]()
  }

  private createLODObjects(): void {
    const scene = this.app.getScene()

    // Create objects at different distances for LOD demonstration
    const distances = [5, 15, 30, 50, 80]
    
    for (let i = 0; i < distances.length; i++) {
      const distance = distances[i]
      
      // Create high-detail geometry
      const highDetailGeometry = new THREE.IcosahedronGeometry(1, 3) // High subdivision
      const material = new THREE.MeshStandardMaterial({ 
        color: new THREE.Color().setHSL(i / distances.length, 0.8, 0.6),
        wireframe: false
      })
      
      const mesh = new THREE.Mesh(highDetailGeometry, material)
      mesh.position.set(
        Math.cos(i * Math.PI * 2 / distances.length) * distance,
        Math.sin(i * Math.PI / 4) * 5,
        Math.sin(i * Math.PI * 2 / distances.length) * distance
      )
      
      mesh.userData = { id: `lod-${i}`, type: 'lod', distance }
      
      scene.add(mesh)
      this.lodObjects.set(`lod-${i}`, mesh)
      
      // Register with LOD system
      this.lodSystem.register(`lod-${i}`, mesh, {
        qualityPreset: distance > 40 ? 'low' : distance > 20 ? 'medium' : 'high'
      })
    }
  }

  private setupEventHandlers(): void {
    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this))
    
    // Handle visibility change (pause animations when tab is not visible)
    document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this))
  }

  private onWindowResize(): void {
    const camera = this.app.getCamera() as THREE.PerspectiveCamera
    const renderer = this.app.getRenderer()
    
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      // Pause animations when tab is not visible
      this.animationSystem.stop()
    } else {
      // Resume animations when tab becomes visible
      this.animationSystem.start()
    }
  }

  private onObjectClick(object: THREE.Object3D, point: THREE.Vector3): void {
    console.log('Object clicked:', object.userData)
    
    // Create a temporary highlight animation
    const originalScale = object.scale.clone()
    
    const highlightAnimation = this.animationSystem.createAnimation(object, {
      duration: 200,
      easing: Easing.easeOutQuad,
      yoyo: true,
      onComplete: () => {
        object.scale.copy(originalScale)
      }
    })
    
    highlightAnimation
      .to({ scale: originalScale.clone().multiplyScalar(1.2) })
      .start()

    this.animationSystem.addAnimation(highlightAnimation)

    // Show click point with a temporary marker
    this.createClickMarker(point)
  }

  private onObjectHover(object: THREE.Object3D | null): void {
    // Change cursor based on hover state
    const canvas = this.app.getRenderer().domElement
    canvas.style.cursor = object ? 'pointer' : 'default'
    
    if (object) {
      console.log('Hovering over:', object.userData)
    }
  }

  private createClickMarker(position: THREE.Vector3): void {
    const scene = this.app.getScene()
    
    // Create a temporary marker at click position
    const markerGeometry = new THREE.SphereGeometry(0.1, 8, 8)
    const markerMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffff,
      transparent: true,
      opacity: 1
    })
    
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    marker.position.copy(position)
    scene.add(marker)
    
    // Animate marker fade out and removal
    const fadeAnimation = this.animationSystem.createAnimation(marker, {
      duration: 1000,
      easing: Easing.easeOutQuad,
      onComplete: () => {
        scene.remove(marker)
        markerGeometry.dispose()
        markerMaterial.dispose()
      }
    })
    
    fadeAnimation
      .to({ 
        material: { opacity: 0 },
        scale: new THREE.Vector3(2, 2, 2)
      })
      .start()

    this.animationSystem.addAnimation(fadeAnimation)
  }

  private startUpdateLoop(): void {
    const animate = (currentTime: number) => {
      requestAnimationFrame(animate)
      
      // Update all systems
      this.animationSystem.update(currentTime)
      this.lodSystem.update(currentTime)
      
      // Update renderer (this is handled by the main app)
      // The main app has its own animation loop
    }
    
    animate(performance.now())
  }

  // Public API for controlling the example
  public toggleAnimations(): void {
    if (this.animationSystem.getAnimationCount() > 0) {
      this.animationSystem.stop()
    } else {
      this.animationSystem.start()
    }
  }

  public setLODQuality(quality: 'ultra' | 'high' | 'medium' | 'low' | 'potato'): void {
    this.lodSystem.setQualityPreset(quality)
  }

  public getPerformanceStats(): string {
    return `
Performance Statistics:
${this.lodSystem.getPerformanceReport()}

Animation System:
- Active Animations: ${this.animationSystem.getAnimationCount()}

Input System:
- Device Capabilities: ${JSON.stringify(this.inputSystem.getCapabilities(), null, 2)}
- Active Pointers: ${this.inputSystem.getPointerCount()}
- Active Touches: ${this.inputSystem.getTouchCount()}
    `.trim()
  }

  public dispose(): void {
    // Clean up all systems
    this.animationSystem.stop()
    this.inputSystem.dispose()
    
    // Clean up Three.js objects
    this.animatedObjects.forEach((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => mat.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
    
    this.lodObjects.forEach((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => mat.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
  }
}

// Usage example and setup function
export function createIntegratedExample(container: HTMLElement): IntegratedThreeJSExample {
  const example = new IntegratedThreeJSExample(container)
  
  // Add some debug controls
  if (typeof window !== 'undefined') {
    // Make it available globally for debugging
    (window as any).threeJSExample = example
    
    // Add keyboard shortcuts for debugging
    document.addEventListener('keydown', (event) => {
      switch (event.key) {
        case '1':
          example.setLODQuality('ultra')
          console.log('LOD Quality set to Ultra')
          break
        case '2':
          example.setLODQuality('high')
          console.log('LOD Quality set to High')
          break
        case '3':
          example.setLODQuality('medium')
          console.log('LOD Quality set to Medium')
          break
        case '4':
          example.setLODQuality('low')
          console.log('LOD Quality set to Low')
          break
        case '5':
          example.setLODQuality('potato')
          console.log('LOD Quality set to Potato')
          break
        case ' ':
          event.preventDefault()
          example.toggleAnimations()
          console.log('Animations toggled')
          break
        case 'p':
          console.log(example.getPerformanceStats())
          break
      }
    })
    
    console.log(`
Three.js TypeScript Example Loaded!

Controls:
- Mouse/Touch: Rotate camera
- Wheel/Pinch: Zoom
- Click objects: Highlight animation
- Keyboard shortcuts:
  - 1-5: Change LOD quality (Ultra to Potato)
  - Space: Toggle animations
  - P: Print performance stats

Check the browser console for performance data and interaction feedback.
    `)
  }
  
  return example
}

// TypeScript module declaration for global access
declare global {
  interface Window {
    threeJSExample?: IntegratedThreeJSExample
  }
} 