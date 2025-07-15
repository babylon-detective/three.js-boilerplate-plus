// ============================================================================
// CONFIGURATION INTEGRATION EXAMPLE
// ============================================================================

import * as THREE from 'three'
import { ConfigManager, ConfigManager as CM } from './ConfigManager'
import { GUIManager, type GUICallbacks } from './GUIManager'

/**
 * Example integration class showing how to connect the configuration system
 * with your existing Three.js application
 */
export class ConfigIntegration {
  private configManager: ConfigManager
  private guiManager: GUIManager
  private scene: THREE.Scene
  private oceanSystem: any // Replace with your actual ocean system type
  private landSystem: any  // Replace with your actual land system type
  private skySystem: any   // Replace with your actual sky system type
  private lightingSystem: any // Replace with your actual lighting system type

  constructor(
    scene: THREE.Scene,
    oceanSystem: any,
    landSystem: any,
    skySystem: any,
    lightingSystem: any
  ) {
    this.scene = scene
    this.oceanSystem = oceanSystem
    this.landSystem = landSystem
    this.skySystem = skySystem
    this.lightingSystem = lightingSystem

    // Initialize configuration system
    this.configManager = new ConfigManager()

    // Set up GUI with callbacks
    const callbacks: GUICallbacks = {
      onOceanUpdate: (config) => this.updateOceanSystem(config),
      onLandUpdate: (config) => this.updateLandSystem(config),
      onSkyUpdate: (config) => this.updateSkySystem(config),
      onLightingUpdate: (config) => this.updateLightingSystem(config)
    }

    this.guiManager = new GUIManager(this.configManager, callbacks)

    // Apply initial configuration
    this.applyInitialConfiguration()
  }

  // ============================================================================
  // SYSTEM UPDATE METHODS
  // ============================================================================

  private updateOceanSystem(config: any): void {
    if (!this.oceanSystem) return

    // Example ocean system updates
    this.oceanSystem.setWaveAmplitude(config.amplitude)
    this.oceanSystem.setWindDirection(config.windDirection.x, config.windDirection.z)
    this.oceanSystem.setWindStrength(config.windStrength)
    
    // Update colors
    this.oceanSystem.setWaterColors(
      CM.hexToColor(config.waterColor),
      CM.hexToColor(config.deepWaterColor)
    )

    // Update other ocean uniforms
    const oceanLevels = this.oceanSystem.getLODLevels()
    oceanLevels.forEach((level: any) => {
      const uniforms = level.material.uniforms
      if (uniforms.uWaveLength) uniforms.uWaveLength.value = config.waveLength
      if (uniforms.uWaveSpeed) uniforms.uWaveSpeed.value = config.waveSpeed
      if (uniforms.uTransparency) uniforms.uTransparency.value = config.transparency
      if (uniforms.uReflectionStrength) uniforms.uReflectionStrength.value = config.reflectionStrength
      if (uniforms.uFoamColor) uniforms.uFoamColor.value.copy(CM.hexToColor(config.foamColor))
    })

    console.log('🌊 Ocean system updated with new configuration')
  }

  private updateLandSystem(config: any): void {
    if (!this.landSystem) return

    // Example land system updates
    this.landSystem.setElevation(config.elevation)
    this.landSystem.setRoughness(config.roughness)
    this.landSystem.setScale(config.scale)
    this.landSystem.setMoisture(config.moisture)
    this.landSystem.setIslandRadius(config.islandRadius)
    this.landSystem.setCoastSmoothness(config.coastSmoothness)
    this.landSystem.setSeaLevel(config.seaLevel)

    // Update colors
    this.landSystem.setLandColor(CM.hexToColor(config.landColor))
    this.landSystem.setRockColor(CM.hexToColor(config.rockColor))
    this.landSystem.setSandColor(CM.hexToColor(config.sandColor))

    console.log('🏔️ Land system updated with new configuration')
  }

  private updateSkySystem(config: any): void {
    if (!this.skySystem) return

    // Example sky system updates
    // This would depend on your sky system implementation
    if (this.skySystem.updateUniforms) {
      this.skySystem.updateUniforms({
        turbidity: config.turbidity,
        rayleigh: config.rayleigh,
        mieCoefficient: config.mieCoefficient,
        mieDirectionalG: config.mieDirectionalG,
        exposure: config.exposure
      })
    }

    // Update sun position
    if (this.skySystem.setSunPosition) {
      this.skySystem.setSunPosition(config.elevation, config.azimuth)
    }

    console.log('🌅 Sky system updated with new configuration')
  }

  private updateLightingSystem(config: any): void {
    if (!this.lightingSystem) return

    // Example lighting system updates
    // Find directional light
    const directionalLight = this.scene.children.find(
      child => child instanceof THREE.DirectionalLight
    ) as THREE.DirectionalLight

    if (directionalLight) {
      directionalLight.intensity = config.sunIntensity
      
      // Update shadow settings
      if (directionalLight.shadow) {
        directionalLight.shadow.mapSize.setScalar(config.shadowMapSize)
        directionalLight.shadow.radius = config.shadowRadius
        directionalLight.shadow.blurSamples = config.shadowBlur
        directionalLight.shadow.bias = config.shadowBias
      }
    }

    // Find ambient light
    const ambientLight = this.scene.children.find(
      child => child instanceof THREE.AmbientLight
    ) as THREE.AmbientLight

    if (ambientLight) {
      ambientLight.intensity = config.ambientIntensity
    }

    console.log('💡 Lighting system updated with new configuration')
  }

  // ============================================================================
  // INITIALIZATION METHODS
  // ============================================================================

  private applyInitialConfiguration(): void {
    const config = this.configManager.getCurrentConfig()

    // Apply all configurations on startup
    this.updateOceanSystem(config.ocean)
    this.updateLandSystem(config.land)
    this.updateSkySystem(config.sky)
    this.updateLightingSystem(config.lighting)

    console.log('🎯 Initial configuration applied to all systems')
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  public getConfigManager(): ConfigManager {
    return this.configManager
  }

  public getGUIManager(): GUIManager {
    return this.guiManager
  }

  public showGUI(): void {
    this.guiManager.show()
  }

  public hideGUI(): void {
    this.guiManager.hide()
  }

  public resetToDefaults(): void {
    this.configManager.resetToDefaults()
    this.applyInitialConfiguration()
  }

  public exportConfiguration(): string {
    return this.configManager.exportConfig()
  }

  public importConfiguration(jsonString: string): boolean {
    const success = this.configManager.importConfig(jsonString)
    if (success) {
      this.applyInitialConfiguration()
    }
    return success
  }

  public destroy(): void {
    this.guiManager.destroy()
  }
}

// ============================================================================
// USAGE EXAMPLE FOR MAIN.TS
// ============================================================================

/*
// In your main.ts file, replace the existing GUI setup with:

import { ConfigIntegration } from './systems/ConfigIntegration'

class IntegratedThreeJSApp {
  private configIntegration: ConfigIntegration | null = null

  private async init(): Promise<void> {
    // ... existing initialization code ...

    // Initialize systems first
    await this.createOceanSystem()
    await this.createLandSystem()
    this.createSkySystem()
    this.addLighting()

    // Then initialize configuration system
    this.configIntegration = new ConfigIntegration(
      this.scene,
      this.oceanLODSystem,
      this.landSystem,
      this.sky, // or your sky system
      null // or your lighting system
    )

    // Show GUI only in debug mode
    if (this.debugState.active) {
      this.configIntegration.showGUI()
    }
  }

  private enableDebug(): void {
    this.debugState.active = true
    
    // Show configuration GUI
    if (this.configIntegration) {
      this.configIntegration.showGUI()
    }
  }

  private disableDebug(): void {
    this.debugState.active = false
    
    // Hide configuration GUI
    if (this.configIntegration) {
      this.configIntegration.hideGUI()
    }
  }

  // Add these console commands to your setupEventListeners method:
  private setupEventListeners(): void {
    // ... existing event listeners ...

    // Add global console commands for configuration
    (window as any).exportConfig = () => {
      if (this.configIntegration) {
        const config = this.configIntegration.exportConfiguration()
        console.log('📤 Configuration exported:', config)
        return config
      }
    }

    (window as any).importConfig = (jsonString: string) => {
      if (this.configIntegration) {
        const success = this.configIntegration.importConfiguration(jsonString)
        console.log(success ? '📥 Configuration imported' : '❌ Import failed')
        return success
      }
    }

    (window as any).resetConfig = () => {
      if (this.configIntegration) {
        this.configIntegration.resetToDefaults()
        console.log('🔄 Configuration reset to defaults')
      }
    }
  }
}
*/ 