import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { ObjectManager } from './systems/ObjectManager'
import { ConfigManager } from './systems/ConfigManager'
import { ObjectLoader } from './systems/ObjectLoader'
import { AnimationSystem } from './systems/AnimationSystem'
import { ConsoleCommands } from './systems/ConsoleCommands'
import { CollisionSystem } from './systems/CollisionSystem'
import { CameraManager } from './systems/CameraManager'
import { PlayerController } from './systems/PlayerController'
import { ParameterManager } from './systems/ParameterManager'
import { ParameterGUI } from './systems/ParameterGUI'
import { ParameterIntegration } from './systems/ParameterIntegration'
import { logger, LogModule } from './systems/Logger'
import { performanceMonitor } from './systems/PerformanceMonitor'
import { DebugGUIManager } from './systems/DebugGUIManager'
import { HUDSystem, HUDData } from './systems/HUDSystem'
import { SHADERS, ShaderPath } from './shaderImports'

// TSL (Three Shader Language) - works with both WebGL and WebGPU!
// import { 
//   sin, 
//   cos, 
//   mul, 
//   add, 
//   mix, 
//   vec3, 
//   vec4, 
//   positionGeometry, 
//   uniform,
//   time
// } from 'three/tsl'

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
      // Use imported shaders instead of fetch for production compatibility
      if (path in SHADERS) {
        const content = SHADERS[path as ShaderPath]
        this.cache.set(path, content)
        return content
      }
      
      // Fallback to fetch for development/custom shaders
      const response = await fetch(path)
      if (!response.ok) {
        throw new Error(`Failed to load shader: ${path}`)
      }
      const content = await response.text()
      this.cache.set(path, content)
      return content
    } catch (error) {
      logger.error(LogModule.SYSTEM, `Error loading shader ${path}:`, error)
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
// OCEAN LOD SYSTEM
// ============================================================================

interface OceanLODLevel {
  geometry: THREE.PlaneGeometry
  material: THREE.ShaderMaterial
  mesh: THREE.Mesh
  shadowMesh: THREE.Mesh
  distance: number
  size: number
  segments: number
}

interface LandPiece {
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  mesh: THREE.Mesh
  shadowMesh: THREE.Mesh
  id: string
  type: 'plane' | 'box' | 'sphere' | 'cylinder' | 'custom'
  scale: number
}

class OceanLODSystem {
  private lodLevels: OceanLODLevel[] = []
  private camera: THREE.Camera
  private scene: THREE.Scene
  private oceanUniforms: { [key: string]: { value: any } }

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    this.camera = camera
    this.scene = scene
    this.oceanUniforms = {
      uTime: { value: 0 },
      uAmplitude: { value: 0.5 },
      uWindDirection: { value: new THREE.Vector2(1, 0.5) },
      uWindStrength: { value: 1.0 },
      uWaveLength: { value: 2.0 },
      uWaveSpeed: { value: 1.0 },
      uWaterColor: { value: new THREE.Color(0x006994) },
      uDeepWaterColor: { value: new THREE.Color(0x003366) },
      uFoamColor: { value: new THREE.Color(0xffffff) },
      uTransparency: { value: 0.8 },
      uReflectionStrength: { value: 0.6 },
      uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.2) },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uSunIntensity: { value: 1.0 }
    }
  }

  public async createLODLevels(oceanShaders: { vertex: string; fragment: string }): Promise<void> {
    // Simplified LOD system with only 3 levels for smoother transitions
    const lodConfigs = [
      { distance: 0, size: 300, segments: 128 },    // Close - high detail
      { distance: 200, size: 800, segments: 64 },   // Medium - medium detail  
      { distance: 800, size: 2000, segments: 32 }   // Far - low detail (large coverage)
    ]

    for (let i = 0; i < lodConfigs.length; i++) {
      const config = lodConfigs[i]
      
      // Create geometry with appropriate detail level  
      const geometry = new THREE.PlaneGeometry(config.size, config.size, config.segments, config.segments)
      geometry.rotateX(-Math.PI / 2) // Rotate to make it horizontal (X-Z plane)

      // Add random attributes for wave variation
      const positionAttribute = geometry.getAttribute('position')
      const randomValues = new Float32Array(positionAttribute.count)
      for (let j = 0; j < randomValues.length; j++) {
        randomValues[j] = Math.random()
      }
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(randomValues, 1))

      // Create material with shared uniforms
      const material = new THREE.ShaderMaterial({
        vertexShader: oceanShaders.vertex,
        fragmentShader: oceanShaders.fragment,
        uniforms: this.oceanUniforms,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        depthWrite: true, // Enable depth writing for proper sorting
        depthTest: true,
        alphaTest: 0.1 // Discard fully transparent pixels
      })

      // Create mesh
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(0, -2, 0) // Fixed position at origin
      mesh.userData = { 
        id: `ocean-lod-${i}`, 
        type: 'ocean', 
        lodLevel: i,
        distance: config.distance,
        size: config.size 
      }

      // Ocean receives shadows but cannot cast them with custom shaders
      mesh.receiveShadow = true  // Water receives shadows from land
      mesh.castShadow = false    // Custom shaders don't support shadow casting
      
      // Create invisible shadow-casting plane for this LOD level
      const shadowGeometry = new THREE.PlaneGeometry(config.size, config.size, 32, 32)
      shadowGeometry.rotateX(-Math.PI / 2)
      
      const shadowMaterial = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0, // Invisible
        color: 0x006994,
        depthWrite: false // Don't write to depth buffer to avoid interfering with ocean
      })
      
      const shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial)
      shadowMesh.position.set(0, -1.9, 0) // Slightly higher than ocean to avoid Z-fighting
      shadowMesh.castShadow = true
      shadowMesh.receiveShadow = false
      shadowMesh.userData = { 
        id: `ocean-shadow-${i}`, 
        type: 'ocean-shadow', 
        lodLevel: i,
        visible: false // Mark as helper mesh
      }
      
      this.scene.add(shadowMesh)

      // Add to scene
      this.scene.add(mesh)

      // Store LOD level
      this.lodLevels.push({
        geometry,
        material,
        mesh,
        shadowMesh,
        distance: config.distance,
        size: config.size,
        segments: config.segments
      })
    }

    console.log(`🌊 Simplified Ocean LOD System created with ${this.lodLevels.length} levels`)
    console.log('🌊 Ocean shadow settings: receiveShadow=true, invisible shadow casters added')
  }

  public update(time: number): void {
    // Update time uniform for all levels
    this.oceanUniforms.uTime.value = time * 0.001

    const cameraPosition = this.camera.position
    
    // Calculate camera distance from origin for zoom-based decisions
    const cameraDistance = Math.sqrt(
      cameraPosition.x * cameraPosition.x + 
      cameraPosition.z * cameraPosition.z
    )
    
    // Determine which single LOD level to show based on camera distance
    let activeLODIndex = 0
    
    if (cameraDistance < 150) {
      activeLODIndex = 0 // Close: high detail
    } else if (cameraDistance < 600) {
      activeLODIndex = 1 // Medium: medium detail
    } else {
      activeLODIndex = 2 // Far: low detail
    }
    
    for (let i = 0; i < this.lodLevels.length; i++) {
      const level = this.lodLevels[i]
      
      // Only the active LOD level is visible - eliminates jumping between levels
      const isActive = (i === activeLODIndex)
      level.mesh.visible = isActive
      level.shadowMesh.visible = isActive
      
      if (isActive) {
        // Keep ocean centered at global origin - DO NOT follow camera
        level.mesh.position.set(0, -2, 0)
        level.shadowMesh.position.set(0, -1.9, 0)
        
        // For close-up detail, allow slight following to prevent edge visibility
        if (i === 0 && cameraDistance < 100) {
          // Only follow camera when very close to prevent seeing edges
          const followX = Math.max(-50, Math.min(50, cameraPosition.x * 0.3))
          const followZ = Math.max(-50, Math.min(50, cameraPosition.z * 0.3))
          level.mesh.position.x = followX
          level.mesh.position.z = followZ
          level.shadowMesh.position.set(followX, -1.9, followZ)
        }
      }
    }
  }

  public setWaveAmplitude(amplitude: number): void {
    this.oceanUniforms.uAmplitude.value = amplitude
  }

  public setWindDirection(x: number, z: number): void {
    this.oceanUniforms.uWindDirection.value.set(x, z)
  }

  public setWindStrength(strength: number): void {
    this.oceanUniforms.uWindStrength.value = strength
  }

  public setWaterColors(shallow: THREE.Color, deep: THREE.Color): void {
    this.oceanUniforms.uWaterColor.value.copy(shallow)
    this.oceanUniforms.uDeepWaterColor.value.copy(deep)
  }

  public setSunDirection(direction: THREE.Vector3): void {
    this.oceanUniforms.uSunDirection.value.copy(direction)
  }

  public setSunColor(color: THREE.Color): void {
    this.oceanUniforms.uSunColor.value.copy(color)
  }

  public setSunIntensity(intensity: number): void {
    this.oceanUniforms.uSunIntensity.value = intensity
  }

  public getLODLevels(): OceanLODLevel[] {
    return this.lodLevels
  }

  // Legacy method removed - position locking now handled by ObjectManager

  public resetOceanPositions(): void {
    // Reset all ocean planes to origin
    for (let i = 0; i < this.lodLevels.length; i++) {
      const level = this.lodLevels[i]
      level.mesh.position.set(0, -2, 0) // Reset to origin
      level.shadowMesh.position.set(0, -1.9, 0) // Reset shadow mesh too
    }
  }

  public setOceanShadowCasting(enabled: boolean): void {
    for (let i = 0; i < this.lodLevels.length; i++) {
      this.lodLevels[i].shadowMesh.castShadow = enabled
    }
    console.log(`🌊 Ocean shadow casting: ${enabled ? 'enabled' : 'disabled'}`)
  }

  public setOceanShadowReceiving(enabled: boolean): void {
    for (let i = 0; i < this.lodLevels.length; i++) {
      this.lodLevels[i].mesh.receiveShadow = enabled
    }
    console.log(`🌊 Ocean shadow receiving: ${enabled ? 'enabled' : 'disabled'}`)
  }
}

class LandSystem {
  private landPieces: LandPiece[] = []
  private scene: THREE.Scene
  private landUniforms: { [key: string]: { value: any } }
  private collisionSystem?: CollisionSystem

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.landUniforms = {
      uTime: { value: 0 },
      uElevation: { value: 8.0 }, // Increased for more dramatic peaks
      uRoughness: { value: 1.2 }, // More terrain variation
      uScale: { value: 0.8 }, // Tighter terrain features
      uLandColor: { value: new THREE.Color(0x4a7c59) }, // Forest green
      uRockColor: { value: new THREE.Color(0x8b7355) }, // Rock brown
      uSandColor: { value: new THREE.Color(0xc2b280) }, // Sandy beige
      uMoisture: { value: 0.3 }, // Drier for more rocky appearance
      uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.2) },
      uSunColor: { value: new THREE.Color(1, 1, 0.9) },
      uSunIntensity: { value: 1.0 },
      uIslandRadius: { value: 35.0 }, // Smaller for steeper dropoff
      uCoastSmoothness: { value: 8.0 }, // Sharper coastline
      uSeaLevel: { value: -4.0 } // Deeper edges
    }
  }

  public async createLandPiece(
    type: 'plane' | 'box' | 'sphere' | 'cylinder' | 'custom',
    landShaders: { vertex: string; fragment: string },
    options: {
      id?: string
      position?: THREE.Vector3
      rotation?: THREE.Euler
      scale?: THREE.Vector3
      size?: number
      segments?: number
      customGeometry?: THREE.BufferGeometry
    } = {}
  ): Promise<LandPiece> {
    const {
      id = `land-${type}-${Date.now()}`,
      position = new THREE.Vector3(0, 0, 0),
      rotation = new THREE.Euler(0, 0, 0),
      scale = new THREE.Vector3(1, 1, 1),
      size = 50,
      segments = 64,
      customGeometry
    } = options

    // Create geometry based on type
    let geometry: THREE.BufferGeometry

    switch (type) {
      case 'plane':
        geometry = new THREE.PlaneGeometry(size, size, segments, segments)
        geometry.rotateX(-Math.PI / 2) // Make horizontal
        break
      case 'box':
        geometry = new THREE.BoxGeometry(size, size * 0.5, size, segments, segments, segments)
        break
      case 'sphere':
        geometry = new THREE.SphereGeometry(size * 0.5, segments, segments)
        break
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(size * 0.5, size * 0.5, size * 0.3, segments, segments)
        break
      case 'custom':
        if (!customGeometry) {
          throw new Error('Custom geometry required for custom type')
        }
        geometry = customGeometry
        break
      default:
        throw new Error(`Unknown land type: ${type}`)
    }

    // Create material with land shader
    const material = new THREE.ShaderMaterial({
      vertexShader: landShaders.vertex,
      fragmentShader: landShaders.fragment,
      uniforms: this.landUniforms,
      side: THREE.DoubleSide,
      wireframe: false
    })

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    mesh.rotation.copy(rotation)
    mesh.scale.copy(scale)
    mesh.userData = {
      id,
      type: 'land',
      landType: type,
      scale: scale.x
    }

    // Land can receive shadows but cannot cast them with custom shaders
    mesh.castShadow = false    // Custom shaders don't support shadow casting
    mesh.receiveShadow = true  // Land receives shadows from other objects
    
    // Create invisible shadow-casting geometry for proper shadows
    const shadowGeometry = geometry.clone()
    const shadowMaterial = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0, // Invisible
      color: 0x8B4513,
      depthWrite: false // Don't write to depth buffer to avoid interfering with ocean
    })
    
    const shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial)
    shadowMesh.position.copy(position)
    shadowMesh.rotation.copy(rotation)
    shadowMesh.scale.copy(scale)
    shadowMesh.castShadow = true
    shadowMesh.receiveShadow = false
    shadowMesh.userData = { 
      id: `${id}-shadow`, 
      type: 'land-shadow',
      visible: false // Mark as helper mesh
    }
    
    this.scene.add(shadowMesh)

    // Add to scene
    this.scene.add(mesh)

    // Create land piece object
    const landPiece: LandPiece = {
      geometry,
      material,
      mesh,
      shadowMesh,
      id,
      type,
      scale: scale.x
    }

    // Store land piece
    this.landPieces.push(landPiece)

    // Note: Land meshes are now registered centrally in createContent() method
    // This ensures proper initialization order and avoids duplicate registration

    console.log(`🏔️ Land piece created: ${type} (${id}) - receiveShadow=true, invisible shadow caster added`)
    return landPiece
  }

  public update(time: number): void {
    // Update time uniform for all land pieces
    this.landUniforms.uTime.value = time * 0.001
  }

  /**
   * Set collision system reference for automatic updates
   */
  public setCollisionSystem(collisionSystem: CollisionSystem): void {
    this.collisionSystem = collisionSystem
  }

  public setElevation(elevation: number): void {
    this.landUniforms.uElevation.value = elevation
    // TODO: Update collision geometry when parameters change
    console.log(`🏔️ Elevation set to ${elevation} - use refreshCollisionMeshes() to update collision`)
  }

  public setRoughness(roughness: number): void {
    this.landUniforms.uRoughness.value = roughness
    // TODO: Update collision geometry when parameters change  
    console.log(`🏔️ Roughness set to ${roughness} - use refreshCollisionMeshes() to update collision`)
  }

  public setScale(scale: number): void {
    this.landUniforms.uScale.value = scale
    // TODO: Update collision geometry when parameters change
    console.log(`🏔️ Scale set to ${scale} - use refreshCollisionMeshes() to update collision`)
  }

  public setLandColor(color: THREE.Color): void {
    this.landUniforms.uLandColor.value.copy(color)
  }

  public setRockColor(color: THREE.Color): void {
    this.landUniforms.uRockColor.value.copy(color)
  }

  public setSandColor(color: THREE.Color): void {
    this.landUniforms.uSandColor.value.copy(color)
  }

  public setMoisture(moisture: number): void {
    this.landUniforms.uMoisture.value = moisture
  }

  public setSunDirection(direction: THREE.Vector3): void {
    this.landUniforms.uSunDirection.value.copy(direction)
  }

  public setSunColor(color: THREE.Color): void {
    this.landUniforms.uSunColor.value.copy(color)
  }

  public setSunIntensity(intensity: number): void {
    this.landUniforms.uSunIntensity.value = intensity
  }

  public setIslandRadius(radius: number): void {
    this.landUniforms.uIslandRadius.value = radius
  }

  public setCoastSmoothness(smoothness: number): void {
    this.landUniforms.uCoastSmoothness.value = smoothness
  }

  public setSeaLevel(level: number): void {
    this.landUniforms.uSeaLevel.value = level
  }

  public removeLandPiece(id: string): boolean {
    const index = this.landPieces.findIndex(piece => piece.id === id)
    if (index !== -1) {
      const piece = this.landPieces[index]
      this.scene.remove(piece.mesh)
      this.scene.remove(piece.shadowMesh)
      piece.geometry.dispose()
      piece.material.dispose()
      if (Array.isArray(piece.shadowMesh.material)) {
        piece.shadowMesh.material.forEach(mat => mat.dispose())
      } else {
        piece.shadowMesh.material.dispose()
      }
      piece.shadowMesh.geometry.dispose()
      this.landPieces.splice(index, 1)
      console.log(`🏔️ Land piece removed: ${id}`)
      return true
    }
    return false
  }

  public getLandPieces(): LandPiece[] {
    return this.landPieces
  }

  public getLandPiece(id: string): LandPiece | undefined {
    return this.landPieces.find(piece => piece.id === id)
  }

  public clearAllLand(): void {
    this.landPieces.forEach(piece => {
      this.scene.remove(piece.mesh)
      this.scene.remove(piece.shadowMesh)
      piece.geometry.dispose()
      piece.material.dispose()
      if (Array.isArray(piece.shadowMesh.material)) {
        piece.shadowMesh.material.forEach(mat => mat.dispose())
      } else {
        piece.shadowMesh.material.dispose()
      }
      piece.shadowMesh.geometry.dispose()
    })
    this.landPieces = []
    console.log('🏔️ All land pieces cleared')
    
    // Clear collision system land meshes when all land is cleared
    if (this.collisionSystem) {
      this.collisionSystem.registerLandMeshes([])
    }
  }

  public setLandShadowCasting(enabled: boolean): void {
    this.landPieces.forEach(piece => {
      piece.shadowMesh.castShadow = enabled
    })
    console.log(`🏔️ Land shadow casting: ${enabled ? 'enabled' : 'disabled'}`)
  }

  public setLandShadowReceiving(enabled: boolean): void {
    this.landPieces.forEach(piece => {
      piece.mesh.receiveShadow = enabled
    })
    console.log(`🏔️ Land shadow receiving: ${enabled ? 'enabled' : 'disabled'}`)
  }

  // ============================================================================
  // TERRAIN DISPLACEMENT - CONVERT SHADER TO REAL GEOMETRY
  // ============================================================================

  /**
   * Create collision geometry that matches shader displacement 
   * Keeps visual shader but creates separate collision mesh
   */
  public createCollisionGeometry(landPieceId: string, segments: number = 32): THREE.Mesh | null {
    const landPiece = this.landPieces.find(piece => piece.id === landPieceId)
    if (!landPiece || landPiece.type !== 'plane') {
      console.warn(`❌ Land piece ${landPieceId} not found or not a plane`)
      return null
    }

    const originalMesh = landPiece.mesh
    const material = originalMesh.material as THREE.ShaderMaterial
    
    if (!material.uniforms) {
      console.warn(`❌ No shader uniforms found for ${landPieceId}`)
      return null
    }

    // Create lower-resolution collision geometry
    const size = 100 // Match terrain size
    const collisionGeometry = new THREE.PlaneGeometry(size, size, segments, segments)
    collisionGeometry.rotateX(-Math.PI / 2) // Make horizontal

    // Apply shader displacement to collision geometry
    this.applyShaderDisplacement(collisionGeometry, material.uniforms)

    // Create invisible collision mesh
    const collisionMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      wireframe: false
    })

    const collisionMesh = new THREE.Mesh(collisionGeometry, collisionMaterial)
    collisionMesh.position.copy(originalMesh.position)
    collisionMesh.rotation.copy(originalMesh.rotation)
    collisionMesh.scale.copy(originalMesh.scale)
    collisionMesh.userData = {
      id: `${landPieceId}-collision`,
      type: 'land-collision',
      landType: 'plane', // Mark as plane for collision detection
      originalId: landPieceId,
      visible: false
    }

    // Add to scene
    this.scene.add(collisionMesh)

    console.log(`✅ Created collision geometry for ${landPieceId} with ${segments}x${segments} segments`)
    return collisionMesh
  }

  /**
   * Apply shader displacement calculation to geometry vertices
   */
  private applyShaderDisplacement(geometry: THREE.BufferGeometry, uniforms: any): void {
    const positionAttribute = geometry.getAttribute('position')
    const vertices = positionAttribute.array as Float32Array

    const elevation = uniforms.uElevation?.value || 0
    const roughness = uniforms.uRoughness?.value || 1
    const scale = uniforms.uScale?.value || 1
    const islandRadius = uniforms.uIslandRadius?.value || 35
    const coastSmoothness = uniforms.uCoastSmoothness?.value || 8
    const seaLevel = uniforms.uSeaLevel?.value || -4

    console.log(`🏗️ Applying displacement: elevation=${elevation}, roughness=${roughness}, scale=${scale}`)

    // Displace each vertex using same calculation as shader
    let maxDisplacement = 0
    let minDisplacement = 0
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i]
      const z = vertices[i + 2]
      
      // Calculate distance from center
      const distanceFromCenter = Math.sqrt(x * x + z * z)
      
      // Calculate noise (simplified version of shader noise)
      const noiseHeight = this.calculateSimpleNoise(x * scale, z * scale, roughness)
      
      // Apply island mask (falloff towards edges)
      const islandMask = this.calculateIslandMask(distanceFromCenter, islandRadius, coastSmoothness)
      
      // Calculate final displacement - REMOVE THE 0.1 SCALING!
      const displacement = noiseHeight * elevation * islandMask
      
      // Track displacement range
      maxDisplacement = Math.max(maxDisplacement, displacement)
      minDisplacement = Math.min(minDisplacement, displacement)
      
      // Apply displacement to Y coordinate
      vertices[i + 1] += displacement
      
      // Ensure doesn't go below sea level
      vertices[i + 1] = Math.max(vertices[i + 1], seaLevel)
    }

    console.log(`🏗️ Displacement range: ${minDisplacement.toFixed(2)} to ${maxDisplacement.toFixed(2)} (elevation=${elevation})`)

    positionAttribute.needsUpdate = true
    geometry.computeVertexNormals()
  }

  /**
   * Simplified noise calculation (approximates shader noise)
   */
  private calculateSimpleNoise(x: number, z: number, roughness: number): number {
    // Simple multi-octave noise approximation
    const octave1 = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 0.5
    const octave2 = Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.25
    const octave3 = Math.sin(x * 0.7) * Math.cos(z * 0.7) * 0.125
    
    return (octave1 + octave2 + octave3) * roughness
  }

  /**
   * Calculate island mask (terrain falloff towards edges)
   */
  private calculateIslandMask(distanceFromCenter: number, islandRadius: number, coastSmoothness: number): number {
    if (distanceFromCenter <= islandRadius) {
      return 1.0 // Full height in center
    }
    
    // Smooth falloff beyond island radius
    const falloffDistance = distanceFromCenter - islandRadius
    const falloffFactor = Math.exp(-falloffDistance / coastSmoothness)
    return Math.max(0, falloffFactor)
  }

  /**
   * Create collision geometry for all plane-type land pieces
   */
  public createAllCollisionGeometry(segments: number = 32): THREE.Mesh[] {
    const collisionMeshes: THREE.Mesh[] = []
    
    this.landPieces.forEach(piece => {
      if (piece.type === 'plane') {
        const collisionMesh = this.createCollisionGeometry(piece.id, segments)
        if (collisionMesh) {
          collisionMeshes.push(collisionMesh)
        }
      }
    })

    console.log(`🏔️ Created collision geometry for ${collisionMeshes.length} terrain pieces`)
    return collisionMeshes
  }

  /**
   * Get collision meshes (for registering with collision system)
   */
  public getCollisionMeshes(): THREE.Mesh[] {
    const collisionMeshes: THREE.Mesh[] = []
    this.scene.children.forEach(child => {
      if (child.userData.type === 'land-collision') {
        collisionMeshes.push(child as THREE.Mesh)
      }
    })
    return collisionMeshes
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
  debugGUIManager: DebugGUIManager | null
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
// Animation classes moved to separate AnimationSystem module
// ============================================================================

// ============================================================================
// MAIN APPLICATION CLASS
// ============================================================================

class IntegratedThreeJSApp {
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private renderer!: THREE.WebGLRenderer
  private controls!: OrbitControls
  
  // Animation and systems
  private animationSystem: AnimationSystem
  private oceanLODSystem: OceanLODSystem | null = null
  private landSystem: LandSystem | null = null
  private deviceType: DeviceType
  private inputMethods: InputMethod[]
  
  // Unified management systems
  private objectManager!: ObjectManager
  private configManager: ConfigManager
  private consoleCommands!: ConsoleCommands
  
  // New modular systems
  private collisionSystem!: CollisionSystem
  private cameraManager!: CameraManager
  private playerController!: PlayerController
  private parameterManager!: ParameterManager
  private parameterGUI!: ParameterGUI
  private parameterIntegration!: ParameterIntegration
  private hudSystem!: HUDSystem
  
  // Timing for delta time calculation
  private lastTime: number = 0
  
  // All objects now managed via ObjectManager - no legacy references needed
  
  // Sky system
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
    debugGUIManager: null,
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
    
    // Initialize management systems (scene will be initialized in init())
    this.configManager = new ConfigManager()
    
    this.init()
  }

  private async init(): Promise<void> {
    this.detectDeviceType()
    this.detectInputMethods()
    
    this.initScene()
    this.initCamera()
    this.initRenderer()
    this.initControls()
    
    // Initialize ObjectManager after scene is created
    this.objectManager = new ObjectManager(this.scene, this.configManager)
    
    // Initialize new modular systems
    this.collisionSystem = new CollisionSystem()
    this.cameraManager = new CameraManager(this.scene, this.renderer, this.container)
    this.parameterManager = new ParameterManager()
    this.parameterGUI = new ParameterGUI(this.parameterManager, {
      container: this.container,
      position: { top: '0px', right: '320px' },
      width: 300
    })
    // Initialize HUD system
    this.hudSystem = new HUDSystem()
    // Parameter integration will be initialized after all systems are created
    
    // Initialize player controller with collision system and camera manager
          this.playerController = new PlayerController(
        this.scene, 
        this.collisionSystem, 
        this.cameraManager,
        {
          height: 1.8,
          radius: 0.5,
          mass: 70,
          walkSpeed: 250.0,  // 10x faster (was 25.0)
          runSpeed: 400.0,   // 10x faster (was 40.0)
          jumpForce: 15.0,  // Increased for higher jumps
          gravity: 8.0,      // CRITICAL FIX: Reduced from 25.0 to 8.0 for better collision detection
          groundCheckDistance: 0.1,
          friction: 0.8,
          airResistance: 0.95
        }
      )
    
    // Register camera with ObjectManager for persistence
    this.objectManager.registerCamera(this.camera, this.controls)
    
    // Auto-save camera state when controls change
    this.controls.addEventListener('change', () => {
      this.objectManager.saveCameraState()
    })
    
            // console.log('📷 Camera registered with ObjectManager for persistence')
    
    // Initialize ConsoleCommands with app reference
    this.consoleCommands = new ConsoleCommands({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      objectManager: this.objectManager,
      animationSystem: this.animationSystem,
      configManager: this.configManager,
      collisionSystem: this.collisionSystem,
      cameraManager: this.cameraManager,
      playerController: this.playerController,
      oceanLODSystem: this.oceanLODSystem,
      landSystem: this.landSystem,
      deviceType: this.deviceType,
      inputMethods: this.inputMethods,
      parameterManager: this.parameterManager,
      parameterGUI: this.parameterGUI
    })
    
    // Register global console commands
    this.consoleCommands.registerGlobalCommands()
    
    // Set up locked position checker for animation system (using ObjectManager)
    this.animationSystem.setLockedPositionChecker((uuid: string) => this.objectManager.getLockedPositions().has(uuid))
    
    await this.createContent()
    
    this.setupEventListeners()
    this.animate()
    
    this.animationSystem.start()
    
    // Initialize debug system after all other systems are ready
    this.initDebugSystem()
    
    // Show initial help overlay
    this.showInitialHelp()
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
    
    // Adjust controls based on device - less sensitive for ocean viewing
    if (this.inputMethods.includes('touch')) {
      this.controls.rotateSpeed = 0.5
      this.controls.zoomSpeed = 0.8
    } else {
      this.controls.rotateSpeed = 0.2
      this.controls.zoomSpeed = 0.5
    }
    
    // Limit extreme rotations that can cause ocean clipping
    this.controls.maxPolarAngle = Math.PI * 0.95 // Prevent going too far under
    this.controls.minPolarAngle = Math.PI * 0.05 // Prevent going too far over
    
    // Set reasonable zoom limits for ocean viewing
    this.controls.minDistance = 2
    this.controls.maxDistance = 1000
    
    // console.log('🎮 Controls initialized')
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
        managedObjects: this.objectManager?.getAllObjects().length || 0,
        oceanLODs: this.oceanLODSystem?.getLODLevels().length || 0,
        landPieces: this.landSystem?.getLandPieces().length || 0
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
    
    // Create stats
    this.debugState.stats = new Stats()
    this.debugState.stats.dom.style.position = 'absolute'
    this.debugState.stats.dom.style.top = '0px'
    this.debugState.stats.dom.style.left = '0px'
    this.container.appendChild(this.debugState.stats.dom)
    
    // Create legacy GUI for backward compatibility
    this.debugState.gui = new GUI()
    this.debugState.gui.domElement.style.position = 'absolute'
    this.debugState.gui.domElement.style.top = '0px'
    this.debugState.gui.domElement.style.right = '0px'
    this.container.appendChild(this.debugState.gui.domElement)
    
    // Initialize the new centralized Debug GUI Manager
    this.debugState.debugGUIManager = new DebugGUIManager(this.container, {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      objectManager: this.objectManager,
      animationSystem: this.animationSystem,
      collisionSystem: this.collisionSystem,
      cameraManager: this.cameraManager,
      playerController: this.playerController,
      oceanLODSystem: this.oceanLODSystem,
      landSystem: this.landSystem,
      sky: this.sky,
      skyConfig: this.skyConfig,
      deviceType: this.deviceType,
      inputMethods: this.inputMethods,
      parameterManager: this.parameterManager,
      parameterGUI: this.parameterGUI
    })
    
    this.debugState.debugGUIManager.initialize()
    
    // Initialize the Parameter GUI
    this.parameterGUI.initialize()
    
    // Add helpers
    this.addHelpers()
    
    // Enable performance monitoring
    performanceMonitor.enable()
    
    // Show player debug wireframe if in player camera mode
    if (this.cameraManager.getCurrentMode() === 'player') {
      this.playerController.setDebugVisible(true)
    }
    
    logger.info(LogModule.SYSTEM, 'Debug mode enabled with centralized GUI Manager and Parameter GUI')
  }

  private disableDebug(): void {
    this.debugState.active = false
    
    // Remove stats
    if (this.debugState.stats) {
      this.container.removeChild(this.debugState.stats.dom)
      this.debugState.stats = null
    }
    
    // Remove legacy GUI
    if (this.debugState.gui) {
      this.debugState.gui.destroy()
      this.debugState.gui = null
    }
    
    // Dispose of centralized GUI Manager
    if (this.debugState.debugGUIManager) {
      this.debugState.debugGUIManager.dispose()
      this.debugState.debugGUIManager = null
    }
    
    // Hide Parameter GUI (don't dispose, just hide to preserve parameters)
    this.parameterGUI.hide()
    
    // Remove helpers
    this.removeHelpers()
    
    // Disable performance monitoring
    performanceMonitor.disable()
    
    // Hide player debug wireframe
    this.playerController.setDebugVisible(false)
    
    logger.info(LogModule.SYSTEM, 'Debug mode disabled - parameters preserved')
  }

  // setupGUI method removed - now handled by DebugGUIManager

  // All GUI setup methods removed - now handled by DebugGUIManager

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
    await this.createOceanSystem()
    
    // Create land system first
    await this.createLandSystem()
    
    // CRITICAL FIX: Connect collision system to land system AFTER creation
    if (this.landSystem) {
      this.landSystem.setCollisionSystem(this.collisionSystem)
      console.log('🏔️ Collision system connected to land system AFTER creation')
      
      // Create collision geometry that matches shader displacement
      console.log('🏗️ Creating collision geometry for terrain...')
      const collisionMeshes = this.landSystem.createAllCollisionGeometry(32) // 32x32 segments for good collision
      
      // Register collision meshes (not visual meshes) with collision system
      this.collisionSystem.registerLandMeshes(collisionMeshes)
      
      // Debug: Log collision mesh registration
      console.log(`🏔️ Registered ${collisionMeshes.length} collision meshes with collision system:`)
      collisionMeshes.forEach((mesh, index) => {
        console.log(`  ${index}: ${mesh.userData.id} (${mesh.userData.type}) at (${mesh.position.x.toFixed(1)}, ${mesh.position.y.toFixed(1)}, ${mesh.position.z.toFixed(1)})`)
      })
      
      // Test collision at origin after registration
      setTimeout(() => {
        console.log('🧪 Testing collision at origin (0, 10, 0)...')
        this.collisionSystem.debugCollisionTest(new THREE.Vector3(0, 10, 0))
      }, 1000)
      
      // Also test at ground level
      setTimeout(() => {
        console.log('🧪 Testing collision at ground level (0, 0, 0)...')
        this.collisionSystem.debugCollisionTest(new THREE.Vector3(0, 0, 0))
      }, 1500)
    }
    
    // Set up camera switching controls
    this.setupCameraSwitching()
    
    // Initialize ObjectLoader with required systems
    ObjectLoader.initialize(this.scene, this.objectManager, this.animationSystem)
    
    // Load all objects using the unified ObjectLoader system
    await ObjectLoader.loadDefaultScene()
    
    // Load saved positions using ObjectManager
    this.objectManager.loadPersistentStates()
    
    // Load saved camera state
    const cameraLoaded = this.objectManager.loadCameraState()
    if (cameraLoaded) {
      // console.log('📷 Camera state restored from previous session')
    } else {
      // console.log('📷 No saved camera state found, using default position')
    }
    
    // Initialize parameter integration after all systems are created
    this.parameterIntegration = new ParameterIntegration(this.parameterManager, {
      oceanSystem: this.oceanLODSystem,
      landSystem: this.landSystem,
      skySystem: this.sky,
      lightingSystem: null, // Will be set after lighting is created
      cameraManager: this.cameraManager,
      playerController: this.playerController
    })
    
    // Update all systems with current parameter values
    this.parameterIntegration.updateAllSystems()
    
    // Force sync player speeds from ParameterManager to PlayerController
    const walkSpeed = this.parameterManager.getParameter('player', 'walkSpeed')
    const runSpeed = this.parameterManager.getParameter('player', 'runSpeed')
    if (walkSpeed !== null && runSpeed !== null) {
      this.playerController.updateConfig({
        walkSpeed: walkSpeed,
        runSpeed: runSpeed
      })
      // logger.info(LogModule.SYSTEM, `Player speeds synced: walk=${walkSpeed}, run=${runSpeed}`)
    }
    
    // Save current parameters as first state if no saved states exist
    if (this.parameterManager.getSavedStateNames().length === 0) {
      this.parameterManager.saveState('initial')
      logger.info(LogModule.SYSTEM, 'Initial parameters saved as first state')
    }
    
    // console.log('🔄 All objects created via ObjectLoader, positions loaded via ObjectManager')
    // console.log('🎯 Unified object system ready! Use help() in console for available commands')
    // console.log('📷 Camera Controls: C = Switch between System/Player cameras')
  }

  /**
   * Set up camera switching functionality
   */
  private setupCameraSwitching(): void {
    // Create camera mode indicator
    this.createCameraModeIndicator()
    
    // Add keyboard listener for camera switching
    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyC') {
        const currentMode = this.cameraManager.getCurrentMode()
        const newMode = currentMode === 'system' ? 'player' : 'system'
        
        // Use immediate switch with pointer lock request for user-initiated switches
        this.cameraManager.switchCamera(newMode, true)
        
        // Update the indicator
        this.updateCameraModeIndicator(newMode)
        
        // Toggle player debug wireframe based on debug mode and camera mode
        if (newMode === 'player' && this.debugState.active) {
          this.playerController.setDebugVisible(true)
        } else {
          this.playerController.setDebugVisible(false)
        }
        
        // console.log(`📷 Switched to ${newMode} camera`)
        
        // Additional guidance for player camera
        if (newMode === 'player') {
          // console.log('🎮 PLAYER MODE ACTIVE:')
          // console.log('   • WASD = Move around')
          // console.log('   • Mouse = Look around')
          // console.log('   • Space = Jump')
          // console.log('   • Shift = Run')
          // console.log('   • C = Switch back to system camera')
          // console.log('📷 If mouse look doesn\'t work, click on the canvas first')
          
          // Show a temporary on-screen message
          this.showTemporaryMessage('Player Mode Active - Use WASD to move, mouse to look', 3000)
        } else {
          // console.log('📷 SYSTEM MODE ACTIVE:')
          // console.log('   • Mouse drag = Rotate camera')
          // console.log('   • Scroll = Zoom in/out')
          // console.log('   • C = Switch to player camera for WASD movement')
          
          this.showTemporaryMessage('System Mode - Press C for player movement', 2000)
        }
      }
    })
    
    // Set initial debug visibility for player
    if (this.debugState.active) {
      this.playerController.setDebugVisible(true)
    }
    
    // console.log('📷 Camera switching controls initialized (Press C to switch)')
    // console.log('🎮 Current mode: System Camera - Press C to enable WASD movement')
  }

  /**
   * Create a persistent camera mode indicator
   */
  private createCameraModeIndicator(): void {
    const indicator = document.createElement('div')
    indicator.id = 'camera-mode-indicator'
    indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      z-index: 1000;
      pointer-events: none;
      transition: all 0.3s ease;
    `
    indicator.textContent = 'System Camera'
    document.body.appendChild(indicator)
  }

  /**
   * Update the camera mode indicator
   */
  private updateCameraModeIndicator(mode: 'system' | 'player'): void {
    const indicator = document.getElementById('camera-mode-indicator')
    if (indicator) {
      if (mode === 'player') {
        indicator.textContent = 'Player Camera'
        indicator.style.background = 'rgba(0, 128, 0, 0.8)'
        indicator.style.color = 'white'
      } else {
        indicator.textContent = 'System Camera'
        indicator.style.background = 'rgba(0, 0, 0, 0.7)'
        indicator.style.color = 'white'
      }
    }
  }

  /**
   * Show a temporary message on screen
   */
  private showTemporaryMessage(message: string, duration: number = 3000): void {
    // Remove any existing message
    const existingMessage = document.getElementById('temp-message')
    if (existingMessage) {
      existingMessage.remove()
    }
    
    // Create new message element
    const messageElement = document.createElement('div')
    messageElement.id = 'temp-message'
    messageElement.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 1000;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `
    messageElement.textContent = message
    
    document.body.appendChild(messageElement)
    
    // Remove after duration
    setTimeout(() => {
      if (messageElement.parentNode) {
        messageElement.style.opacity = '0'
        setTimeout(() => {
          if (messageElement.parentNode) {
            messageElement.remove()
          }
        }, 300)
      }
    }, duration)
  }

  private addLighting(): void {
    // Ambient light for global illumination
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3)
    this.scene.add(ambientLight)

    // Main directional light (sun) with enhanced shadow mapping
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2)
    directionalLight.position.set(50, 50, 25)
    directionalLight.castShadow = this.rendererConfig.shadows
    
    if (directionalLight.castShadow) {
      // High-quality shadow mapping
      directionalLight.shadow.mapSize.width = 4096
      directionalLight.shadow.mapSize.height = 4096
      directionalLight.shadow.camera.near = 0.5
      directionalLight.shadow.camera.far = 500
      
      // Large shadow camera frustum to cover the entire scene
      const shadowCameraSize = 200
      directionalLight.shadow.camera.left = -shadowCameraSize
      directionalLight.shadow.camera.right = shadowCameraSize
      directionalLight.shadow.camera.top = shadowCameraSize
      directionalLight.shadow.camera.bottom = -shadowCameraSize
      
      // Soft shadows with improved bias to prevent shadow acne
      directionalLight.shadow.radius = 8
      directionalLight.shadow.blurSamples = 25
      directionalLight.shadow.bias = -0.0001
    }
    
    directionalLight.target.position.set(0, 0, 0)
    this.scene.add(directionalLight)
    this.scene.add(directionalLight.target)

    // Softer fill light for better visibility
    const fillLight = new THREE.DirectionalLight(0x8899ff, 0.2)
    fillLight.position.set(-25, 25, -25)
    this.scene.add(fillLight)
    
    // console.log('💡 Lighting system initialized')
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

    // console.log('🌅 Sky system initialized')
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
      const intensity = Math.max(0.1, Math.sin(THREE.MathUtils.degToRad(sunElevation)) * 1.2)
      directionalLight.intensity = intensity
      
      // Adjust light color based on time of day (sunset/sunrise colors)
      const sunsetColor = new THREE.Color(1, 0.4, 0.1)
      const dayColor = new THREE.Color(1, 1, 0.9)
      const nightColor = new THREE.Color(0.2, 0.3, 0.6)
      // const t = Math.max(0, Math.sin(THREE.MathUtils.degToRad(sunElevation))) // Unused for now
      
      // Interpolate between night, sunset, and day colors
      let finalColor: THREE.Color
      if (sunElevation < -10) {
        // Night time
        finalColor = nightColor.clone()
      } else if (sunElevation < 10) {
        // Sunset/sunrise
        finalColor = new THREE.Color().lerpColors(nightColor, sunsetColor, (sunElevation + 10) / 20)
      } else {
        // Day time
        finalColor = new THREE.Color().lerpColors(sunsetColor, dayColor, Math.min(1, (sunElevation - 10) / 30))
      }
      
      directionalLight.color.copy(finalColor)
      
      // Update ocean shader uniforms to match sun position, color, and intensity
      if (this.oceanLODSystem) {
        this.oceanLODSystem.setSunDirection(this.sun)
        this.oceanLODSystem.setSunColor(finalColor)
        this.oceanLODSystem.setSunIntensity(intensity)
      }
      
      // Update land shader uniforms to match sun position, color, and intensity
      if (this.landSystem) {
        this.landSystem.setSunDirection(this.sun)
        this.landSystem.setSunColor(finalColor)
        this.landSystem.setSunIntensity(intensity)
      }
    }
  }

  // UNUSED: Method for updating sky uniforms - kept for future use
  // private updateSkyUniforms(): void {
  //   if (!this.sky) return
  //   
  //   const skyUniforms = this.sky.material.uniforms
  //   skyUniforms['turbidity'].value = this.skyConfig.turbidity
  //   skyUniforms['rayleigh'].value = this.skyConfig.rayleigh
  //   skyUniforms['mieCoefficient'].value = this.skyConfig.mieCoefficient
  //   skyUniforms['mieDirectionalG'].value = this.skyConfig.mieDirectionalG
  // }

  private async createOceanSystem(): Promise<void> {
    try {
      // Load ocean shaders
      const { vertex: oceanVertexShader, fragment: oceanFragmentShader } = await ShaderLoader.loadShaderPair({
        vertexPath: 'src/shaders/ocean-vertex.glsl',
        fragmentPath: 'src/shaders/ocean-fragment.glsl'
      })

      // Initialize Ocean LOD System
      this.oceanLODSystem = new OceanLODSystem(this.camera, this.scene)
      
      // Create LOD levels with loaded shaders
      await this.oceanLODSystem.createLODLevels({
        vertex: oceanVertexShader,
        fragment: oceanFragmentShader
      })

      // console.log('🌊 Ocean system initialized')

    } catch (error) {
      // console.error('❌ Failed to create ocean system:', error)
      
      // Fallback: create a simple water plane
      const geometry = new THREE.PlaneGeometry(200, 200, 64, 64)
      geometry.rotateX(-Math.PI / 2)
      
      const material = new THREE.MeshStandardMaterial({
        color: 0x006994,
        transparent: true,
        opacity: 0.8,
        roughness: 0.1,
        metalness: 0.1
      })
      
      const waterMesh = new THREE.Mesh(geometry, material)
      waterMesh.position.set(0, -2, 0)
      waterMesh.userData = { id: 'fallback-water', type: 'water' }
      this.scene.add(waterMesh)
      
              // console.log('🌊 Fallback water created')
    }
  }

  private async createLandSystem(): Promise<void> {
    try {
      // Load land shaders
      const { vertex: landVertexShader, fragment: landFragmentShader } = await ShaderLoader.loadShaderPair({
        vertexPath: 'src/shaders/land-vertex.glsl',
        fragmentPath: 'src/shaders/land-fragment.glsl'
      })

      // Initialize Land System
      this.landSystem = new LandSystem(this.scene)

      // Create some sample land pieces
      await this.landSystem.createLandPiece('plane', {
        vertex: landVertexShader,
        fragment: landFragmentShader
      }, {
        id: 'main-terrain',
        position: new THREE.Vector3(0, 0, 0),
        size: 100,
        segments: 128
      })

      // Create a hill
      await this.landSystem.createLandPiece('sphere', {
        vertex: landVertexShader,
        fragment: landFragmentShader
      }, {
        id: 'hill-1',
        position: new THREE.Vector3(30, 0, 30),
        size: 25,
        segments: 64
      })

      // Create a rocky outcrop
      await this.landSystem.createLandPiece('box', {
        vertex: landVertexShader,
        fragment: landFragmentShader
      }, {
        id: 'rocky-outcrop',
        position: new THREE.Vector3(-40, 0, 20),
        size: 20,
        segments: 32
      })

      // Note: Land meshes will be registered with collision system in createContent() method
      // This ensures proper initialization order

      // console.log('🏔️ Land system initialized')

    } catch (error) {
      // console.error('❌ Failed to create land system:', error)
    }
  }

  // Object creation methods moved to ObjectLoader system

  // Legacy animation creation moved to ObjectLoader system



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
          // console.log((window as any).getPerformanceStats())
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
    
    // Get ALL meshes in the scene (recursive traversal)
    const allMeshes: THREE.Mesh[] = []
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        allMeshes.push(object)
      }
    })
    
    const intersects = raycaster.intersectObjects(allMeshes)
    
    if (intersects.length > 0) {
      const clickedObject = intersects[0].object as THREE.Mesh
      // const distance = intersects[0].distance // Unused for now
      // const point = intersects[0].point // Unused for now
      
      // Find the mesh index in scene traversal order
      // const meshIndex = allMeshes.findIndex(mesh => mesh.uuid === clickedObject.uuid) // Unused for now
      
      // Enhanced mesh identification
      // console.group('🎯 Mesh Click Detection')
      // console.log('🔢 Mesh Index:', meshIndex >= 0 ? meshIndex : 'Not found')
      // console.log('📍 Clicked Mesh:', clickedObject)
      // console.log('🏷️  User Data:', clickedObject.userData)
      // console.log('📏 Distance from Camera:', distance.toFixed(2))
      // console.log('🎯 World Position:', {
      //   x: point.x.toFixed(2),
      //   y: point.y.toFixed(2),
      //   z: point.z.toFixed(2)
      // })
      // console.log('📐 Mesh Position:', {
      //   x: clickedObject.position.x.toFixed(2),
      //   y: clickedObject.position.y.toFixed(2),
      //   z: clickedObject.position.z.toFixed(2)
      // })
      // console.log('📏 Mesh Scale:', {
      //   x: clickedObject.scale.x.toFixed(2),
      //   y: clickedObject.scale.y.toFixed(2),
      //   z: clickedObject.scale.z.toFixed(2)
      // })
      // console.log('🎨 Material Type:', clickedObject.material.constructor.name)
      
      // Identify mesh type based on userData or material properties
      let meshType = 'Unknown'
      // let meshDescription = '' // Unused for now
      
      if (clickedObject.userData.type) {
        meshType = clickedObject.userData.type
        // meshDescription = clickedObject.userData.id || 'No ID' // Unused for now
      } else if (clickedObject.userData.id) {
        meshType = 'Identified'
        // meshDescription = clickedObject.userData.id // Unused for now
      } else {
        // Try to identify by material or geometry properties
        if (clickedObject.material instanceof THREE.ShaderMaterial) {
          if (clickedObject.material.uniforms?.uWaterColor) {
            meshType = 'Ocean'
            // meshDescription = 'Ocean LOD System' // Unused for now
          } else if (clickedObject.material.uniforms?.uLandColor) {
            meshType = 'Land'
            // meshDescription = 'Terrain System' // Unused for now
          } else {
            meshType = 'Shader'
            // meshDescription = 'Custom Shader Material' // Unused for now
          }
        } else if (clickedObject.material instanceof THREE.MeshStandardMaterial) {
          meshType = 'Standard'
          // meshDescription = 'Standard Material Mesh' // Unused for now
        }
      }
      
      // console.log('🔍 Mesh Type:', meshType)
      // console.log('📝 Description:', meshDescription)
      // console.log('🆔 Object UUID:', clickedObject.uuid)
      // console.log(`📋 Use: moveMesh(${meshIndex}, yOffset) to move this mesh`)
      // console.groupEnd()
      
      // Create highlight animation only for small meshes (exclude ocean and land)
      if (meshType !== 'Ocean' && meshType !== 'ocean' && meshType !== 'Land' && meshType !== 'land') {
      const originalScale = clickedObject.scale.clone()
      const highlightAnimation = this.animationSystem.createAnimation(clickedObject, {
        duration: 200,
        easing: Easing.easeOutQuad,
        yoyo: true,
        onComplete: () => clickedObject.scale.copy(originalScale)
      })
      highlightAnimation.to({ scale: originalScale.clone().multiplyScalar(1.3) }).start()
      this.animationSystem.addAnimation(highlightAnimation)
      } else {
        // For large meshes (ocean/land), just log a special message
        if (meshType === 'Ocean' || meshType === 'ocean') {
          // console.log('🌊 Ocean mesh clicked - no highlight animation (too large)')
        } else if (meshType === 'Land' || meshType === 'land') {
          // console.log('🏔️ Land mesh clicked - no highlight animation (too large)')
        }
      }
    } else {
      // console.log('❌ No mesh clicked - clicked on empty space')
    }
  }

  private animate(): void {
    const animate = (currentTime: number) => {
      requestAnimationFrame(animate)
      
      // Start performance monitoring
      performanceMonitor.startFrame()
      
      // Calculate delta time for physics
      const deltaTime = Math.min((currentTime - (this.lastTime || currentTime)) / 1000, 0.1)
      this.lastTime = currentTime
      
      // Update controls (only for system camera)
      if (this.cameraManager.getCurrentMode() === 'system') {
        this.controls.update()
      }
      
      // Update camera manager
      this.cameraManager.update(deltaTime)
      
      // Update player controller (physics, movement, collision)
      this.playerController.update(deltaTime)
      
      // Update HUD with current data
      this.updateHUD(deltaTime)
      
      // Update collision system (gravity, collision resolution) - throttled for performance
      performanceMonitor.startCollisionCheck()
      this.collisionSystem.updateDynamicObjects(deltaTime)
      performanceMonitor.endCollisionCheck()
      
      // Update animation system
      this.animationSystem.update(currentTime)
      
      // Update shader material uniforms for all ObjectManager objects
      this.objectManager.getAllObjects().forEach((managedObject) => {
        const mesh = managedObject.mesh
        if (mesh.material instanceof THREE.ShaderMaterial && mesh.material.uniforms) {
          // Only update if uniforms exist
          if (mesh.material.uniforms.uTime) {
            mesh.material.uniforms.uTime.value = currentTime * 0.001
          }
          
          // Add type-specific amplitude variations
          if (mesh.material.uniforms.uAmplitude) {
            if (managedObject.id.startsWith('animated-')) {
              const variation = Math.sin(currentTime * 0.0003 + mesh.position.x) * 0.05
              mesh.material.uniforms.uAmplitude.value = 0.2 + variation
            } else if (managedObject.id === 'shader-plane') {
              mesh.material.uniforms.uAmplitude.value = 0.2 + Math.sin(currentTime * 0.0005) * 0.1
            } else if (managedObject.id === 'hologram') {
              mesh.material.uniforms.uAmplitude.value = 0.15 + Math.sin(currentTime * 0.0008) * 0.05
            }
          }
        }
      })

      // Update ocean LOD system
      if (this.oceanLODSystem) {
        this.oceanLODSystem.update(currentTime)
      }

      // Update land system
      if (this.landSystem) {
        this.landSystem.update(currentTime)
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
      
      // Start render timing
      performanceMonitor.startRender()
      
      // Render with current camera from camera manager
      const currentCamera = this.cameraManager.getCurrentCamera()
      this.renderer.render(this.scene, currentCamera)
      
      // End render timing and performance monitoring
      performanceMonitor.endRender()
      performanceMonitor.endFrame()
    }
    
    animate(performance.now())
  }

  // Legacy methods moved to ConsoleCommands module for better organization
  // Use help() in console to see available commands

  setPlayerPosition(x: number, y: number, z: number): void {
    this.playerController.setPosition(new THREE.Vector3(x, y, z))
  }

  getPlayerStatus(): void {
    // console.log('Player Status:', this.playerController.getStatus())
  }

  togglePlayerDebug(): void {
    if (this.playerController) {
      const isVisible = this.playerController.isDebugWireframeVisible()
      this.playerController.setDebugVisible(!isVisible)
      // console.log(`🎮 Player debug wireframe ${!isVisible ? 'enabled' : 'disabled'}`)
    }
  }

  testCollisionAtPlayerPosition(): void {
    if (this.playerController) {
      const position = this.playerController.getPosition()
      this.collisionSystem.debugCollisionTest(position)
    }
  }

  testPlayerCollision(): void {
    if (this.playerController && this.collisionSystem) {
      const position = this.playerController.getPosition()
      console.log('🧪 Testing player collision detection...')
      console.log(`Player position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`)
      
      // Test collision at player position
      const collision = this.collisionSystem.checkCollision('player', position)
      console.log('Collision result:', collision)
      
      // Test ground height at player position
      const groundHeight = this.collisionSystem.getGroundHeight(position.x, position.z)
      console.log(`Ground height at (${position.x.toFixed(2)}, ${position.z.toFixed(2)}): ${groundHeight.toFixed(2)}`)
      
      // Test collision at origin
      console.log('🧪 Testing collision at origin (0, 10, 0)...')
      this.collisionSystem.debugCollisionTest(new THREE.Vector3(0, 10, 0))
    }
  }

  testCollisionAtPosition(x: number, y: number, z: number): void {
    const position = new THREE.Vector3(x, y, z)
    this.collisionSystem.debugCollisionTest(position)
  }

  getCollisionSystem(): any {
    return this.collisionSystem
  }

  getLandSystem(): LandSystem | null {
    return this.landSystem
  }

  getHUDSystem(): HUDSystem {
    return this.hudSystem
  }

  /**
   * Update HUD with current game data
   */
  private updateHUD(deltaTime: number): void {
    // Get player data
    const playerStatus = this.playerController.getStatus()
    const playerPosition = this.playerController.getPosition()
    const playerVelocity = this.playerController.getVelocity()
    const terrainHeight = this.collisionSystem.getTerrainHeight(playerPosition.x, playerPosition.z)
    
    // Get input states from player controller
    const inputState = this.playerController.getInputState()
    
    // Get performance data
    const fps = Math.round(1 / deltaTime)
    
    // Get renderer info
    const renderInfo = this.renderer.info
    
    // Prepare HUD data
    const hudData: Partial<HUDData> = {
      // Player state
      position: {
        x: playerPosition.x,
        y: playerPosition.y,
        z: playerPosition.z
      },
      velocity: {
        x: playerVelocity.x,
        y: playerVelocity.y,
        z: playerVelocity.z
      },
      onGround: (playerStatus as any).onGround,
      terrainHeight: terrainHeight,
      
      // Input states
      keys: {
        w: inputState.forward,
        a: inputState.left,
        s: inputState.backward,
        d: inputState.right,
        space: inputState.jump,
        shift: inputState.run,
        c: inputState.camera
      },
      mouse: {
        x: inputState.mouseX || 0,
        y: inputState.mouseY || 0,
        leftButton: inputState.mouseLeft || false,
        rightButton: inputState.mouseRight || false
      },
      
      // System states
      mode: this.cameraManager.getCurrentMode(),
      fps: fps,
      
      // Performance
      triangles: renderInfo.render.triangles,
      drawCalls: renderInfo.render.calls
    }
    
    // Update HUD
    this.hudSystem.updateData(hudData)
  }

  /**
   * Dispose of the Parameter GUI
   */
  public dispose(): void {
    // Dispose of Parameter Integration
    if (this.parameterIntegration) {
      this.parameterIntegration.dispose()
    }
    
    // Dispose of Parameter GUI
    if (this.parameterGUI) {
      this.parameterGUI.dispose()
    }
    
    // Dispose of Parameter Manager
    if (this.parameterManager) {
      this.parameterManager.dispose()
    }
  }

  /**
   * Show initial help overlay
   */
  private showInitialHelp(): void {
    // Help overlay removed - instructions moved to INSTRUCTIONS.md
    // Users can access instructions via console help() command or read the markdown file
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

const cameraConfig: CameraConfig = {
  fov: 75,
  aspect: window.innerWidth / window.innerHeight,
  near: 0.1, // Balanced to prevent z-fighting while allowing close viewing
  far: 15000, // Increased for large ocean LOD system
  position: new THREE.Vector3(0, 5, 5) // Start higher to see ocean better
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
;(window as any).debugLandMeshes = () => app.getCollisionSystem().debugLandMeshes()
;(window as any).debugTerrainHeight = (x: number = 0, z: number = 0) => app.getCollisionSystem().debugTerrainHeight(x, z)
;(window as any).getTerrainHeight = (x: number = 0, z: number = 0) => app.getCollisionSystem().getTerrainHeight(x, z)
;(window as any).testTerrainFix = () => app.getCollisionSystem().testTerrainFix()
;(window as any).createCollisionGeometry = (segments: number = 32) => {
  if (app.getLandSystem()) {
    return app.getLandSystem()!.createAllCollisionGeometry(segments)
  } else {
    console.error('❌ Land system not available')
    return []
  }
}
;(window as any).refreshCollisionMeshes = () => {
  console.log('🔄 Refreshing collision meshes...')
  if (app.getLandSystem()) {
    const collisionMeshes = app.getLandSystem()!.createAllCollisionGeometry(32)
    app.getCollisionSystem().registerLandMeshes(collisionMeshes)
    console.log(`✅ Refreshed ${collisionMeshes.length} collision meshes`)
  } else {
    console.error('❌ Land system not available')
  }
}
;(window as any).checkCollisionMeshes = () => {
  console.log('🔍 CHECKING COLLISION MESH STATUS:')
  if (app.getLandSystem()) {
    const collisionMeshes = app.getLandSystem()!.getCollisionMeshes()
    console.log(`Found ${collisionMeshes.length} collision meshes in scene:`)
    collisionMeshes.forEach((mesh, index) => {
      console.log(`  ${index}: ${mesh.userData.id} (${mesh.userData.type}) at (${mesh.position.x.toFixed(1)}, ${mesh.position.y.toFixed(1)}, ${mesh.position.z.toFixed(1)})`)
    })
  }
  
  const collisionSystem = app.getCollisionSystem()
  console.log(`CollisionSystem has ${collisionSystem.landMeshes?.length || 0} registered land meshes`)
  app.getCollisionSystem().debugLandMeshes()
}

// HUD debug functions
;(window as any).toggleHUD = () => {
  app.getHUDSystem().toggle()
  console.log('🖥️ HUD toggled')
}
;(window as any).showHUD = () => {
  app.getHUDSystem().show()
  console.log('🖥️ HUD shown')
}
;(window as any).hideHUD = () => {
  app.getHUDSystem().hide()
  console.log('🖥️ HUD hidden')
}
;(window as any).testCollisionDisplacement = () => {
  console.log('🧪 TESTING COLLISION DISPLACEMENT:')
  ;(window as any).refreshCollisionMeshes()
  setTimeout(() => {
    ;(window as any).debugTerrainHeight(0, 0)
    ;(window as any).debugTerrainHeight(10, 10)
    ;(window as any).debugTerrainHeight(25, 25)
  }, 500)
}

// Register debug methods globally
;(window as any).testPlayerCollision = () => app.testPlayerCollision()
;(window as any).testFallbackGroundHeight = (x: number = 0, z: number = 0) => {
  const collisionSystem = app.getCollisionSystem()
  if (collisionSystem && collisionSystem.getGroundHeightFallback) {
    const height = collisionSystem.getGroundHeightFallback(x, z)
    console.log(`🔧 Fallback ground height at (${x}, ${z}): ${height.toFixed(2)}`)
    return height
  } else {
    console.error('❌ Collision system or fallback method not available')
    return -4.0
  }
}

// Console commands are now handled by the ConsoleCommands module
// Type help() in the console to see available commands

// Example automatic movement (commented out - use console commands instead)
// setTimeout(() => {
//   console.log('🎯 Example: Moving mesh to new position...')
//   // Use moveMesh(id, x, y, z) in console for manual control
//   // Example: moveMesh(0, 0, 15, 0) moves mesh 0 to position (0, 15, 0)
// }, 1000)

// Instructions moved to INSTRUCTIONS.md

// Export types for potential module usage
export { 
  IntegratedThreeJSApp, 
  DeviceType, 
  type InputMethod, 
  type CameraConfig,
  type AnimationConfig,
  type QualityPreset
} 

// Configure logging for development
logger.setDevelopmentMode()

// Enable only specific modules for focused debugging
logger.enableModule(LogModule.PLAYER)
logger.enableModule(LogModule.CAMERA)
// Enable collision debug logging temporarily to diagnose the issue
logger.enableModule(LogModule.COLLISION)