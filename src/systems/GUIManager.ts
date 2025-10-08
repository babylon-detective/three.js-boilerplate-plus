// ============================================================================
// GUI MANAGEMENT SYSTEM
// ============================================================================

import { GUI } from 'dat.gui'
import * as THREE from 'three'
import { ConfigManager, type SceneConfig } from './ConfigManager'

export interface GUICallbacks {
  onOceanUpdate?: (config: any) => void
  onLandUpdate?: (config: any) => void
  onSkyUpdate?: (config: any) => void
  onLightingUpdate?: (config: any) => void
}

export class GUIManager {
  private gui: GUI
  private configManager: ConfigManager
  private callbacks: GUICallbacks
  private folders: { [key: string]: GUI } = {}
  private controllers: { [key: string]: any } = {}

  constructor(configManager: ConfigManager, callbacks: GUICallbacks = {}) {
    this.configManager = configManager
    this.callbacks = callbacks
    this.gui = new GUI({ width: 320 })
    this.setupGUI()
  }

  // ============================================================================
  // GUI SETUP METHODS
  // ============================================================================

  private setupGUI(): void {
    this.gui.domElement.style.position = 'fixed'
    this.gui.domElement.style.top = '10px'
    this.gui.domElement.style.right = '10px'
    this.gui.domElement.style.zIndex = '1000'

    // Create main control panel
    this.createControlPanel()
    
    // Create configuration folders
    this.createOceanFolder()
    this.createLandFolder()
    this.createSkyFolder()
    this.createLightingFolder()

    // Load saved state
    this.loadGUIState()

    console.log('🎛️ GUI Manager initialized')
  }

  private createControlPanel(): void {
    const controls = {
      'Reset All': () => this.resetAllToDefaults(),
      'Reset Ocean': () => this.resetSection('ocean'),
      'Reset Land': () => this.resetSection('land'),
      'Reset Sky': () => this.resetSection('sky'),
      'Reset Lighting': () => this.resetSection('lighting'),
      'Export Config': () => this.exportConfiguration(),
      'Import Config': () => this.importConfiguration(),
      'Show History': () => this.showHistory(),
      'Clear All Data': () => this.clearAllData()
    }

    const controlFolder = this.gui.addFolder('🔧 Configuration Controls')
    
    Object.entries(controls).forEach(([name, action]) => {
      controlFolder.add(controls, name as keyof typeof controls)
    })

    // Show modification status
    const status = {
      modified: this.configManager.hasModifications(),
      sections: this.configManager.getModifiedSections().join(', ') || 'None'
    }

    const statusFolder = controlFolder.addFolder('📊 Status')
    statusFolder.add(status, 'modified').name('Has Modifications').listen()
    statusFolder.add(status, 'sections').name('Modified Sections').listen()

    controlFolder.open()
  }

  private createOceanFolder(): void {
    const config = this.configManager.getCurrentConfig().ocean
    const folder = this.gui.addFolder('🌊 Ocean Parameters')
    this.folders.ocean = folder

    // Wave parameters
    const waveFolder = folder.addFolder('Wave Settings')
    this.addController(waveFolder, config, 'amplitude', 0, 3, 0.1, 'ocean')
    this.addController(waveFolder, config, 'waveLength', 0.5, 10, 0.1, 'ocean')
    this.addController(waveFolder, config, 'waveSpeed', 0.1, 5, 0.1, 'ocean')

    // Wind parameters
    const windFolder = folder.addFolder('Wind Settings')
    this.addController(windFolder, config.windDirection, 'x', -2, 2, 0.1, 'ocean', 'windDirection.x')
    this.addController(windFolder, config.windDirection, 'z', -2, 2, 0.1, 'ocean', 'windDirection.z')
    this.addController(windFolder, config, 'windStrength', 0, 3, 0.1, 'ocean')

    // Visual parameters
    const visualFolder = folder.addFolder('Visual Settings')
    this.addColorController(visualFolder, config, 'waterColor', 'ocean')
    this.addColorController(visualFolder, config, 'deepWaterColor', 'ocean')
    this.addColorController(visualFolder, config, 'foamColor', 'ocean')
    this.addController(visualFolder, config, 'transparency', 0, 1, 0.01, 'ocean')
    this.addController(visualFolder, config, 'reflectionStrength', 0, 2, 0.01, 'ocean')

    folder.open()
  }

  private createLandFolder(): void {
    const config = this.configManager.getCurrentConfig().land
    const folder = this.gui.addFolder('🏔️ Land Parameters')
    this.folders.land = folder

    // Terrain parameters
    const terrainFolder = folder.addFolder('Terrain Settings')
    this.addController(terrainFolder, config, 'elevation', 0, 20, 0.1, 'land')
    this.addController(terrainFolder, config, 'roughness', 0, 3, 0.1, 'land')
    this.addController(terrainFolder, config, 'scale', 0.1, 8, 0.1, 'land')
    this.addController(terrainFolder, config, 'moisture', 0, 1, 0.01, 'land')

    // Island parameters
    const islandFolder = folder.addFolder('Island Settings')
    this.addController(islandFolder, config, 'islandRadius', 5, 150, 1, 'land')
    this.addController(islandFolder, config, 'coastSmoothness', 1, 30, 0.5, 'land')
    this.addController(islandFolder, config, 'seaLevel', -15, 2, 0.1, 'land')

    // Material parameters
    const materialFolder = folder.addFolder('Material Settings')
    this.addColorController(materialFolder, config, 'landColor', 'land')
    this.addColorController(materialFolder, config, 'rockColor', 'land')
    this.addColorController(materialFolder, config, 'sandColor', 'land')

    folder.open()
  }

  private createSkyFolder(): void {
    const config = this.configManager.getCurrentConfig().sky
    const folder = this.gui.addFolder('🌅 Sky Parameters')
    this.folders.sky = folder

    // Atmospheric parameters
    const atmosphereFolder = folder.addFolder('Atmosphere Settings')
    this.addController(atmosphereFolder, config, 'turbidity', 0, 20, 0.1, 'sky')
    this.addController(atmosphereFolder, config, 'rayleigh', 0, 10, 0.1, 'sky')
    this.addController(atmosphereFolder, config, 'mieCoefficient', 0, 0.1, 0.001, 'sky')
    this.addController(atmosphereFolder, config, 'mieDirectionalG', 0, 1, 0.01, 'sky')

    // Sun parameters
    const sunFolder = folder.addFolder('Sun Settings')
    this.addController(sunFolder, config, 'elevation', -10, 90, 1, 'sky')
    this.addController(sunFolder, config, 'azimuth', 0, 360, 1, 'sky')
    this.addController(sunFolder, config, 'exposure', 0, 1, 0.01, 'sky')

    folder.open()
  }

  private createLightingFolder(): void {
    const config = this.configManager.getCurrentConfig().lighting
    const folder = this.gui.addFolder('💡 Lighting Parameters')
    this.folders.lighting = folder

    // Shadow parameters
    const shadowFolder = folder.addFolder('Shadow Settings')
    this.addController(shadowFolder, config, 'shadowMapSize', 1024, 8192, 1024, 'lighting')
    this.addController(shadowFolder, config, 'shadowRadius', 0, 20, 1, 'lighting')
    this.addController(shadowFolder, config, 'shadowBlur', 0, 50, 1, 'lighting')
    this.addController(shadowFolder, config, 'shadowBias', -0.01, 0.01, 0.0001, 'lighting')

    // Light parameters
    const lightFolder = folder.addFolder('Light Settings')
    this.addController(lightFolder, config, 'sunIntensity', 0, 3, 0.1, 'lighting')
    this.addController(lightFolder, config, 'ambientIntensity', 0, 1, 0.01, 'lighting')

    folder.open()
  }

  // ============================================================================
  // CONTROLLER HELPER METHODS
  // ============================================================================

  private addController(
    folder: GUI, 
    object: any, 
    property: string, 
    min?: number, 
    max?: number, 
    step?: number, 
    section?: keyof SceneConfig,
    configPath?: string
  ): void {
    const controller = folder.add(object, property, min, max, step)
    
    if (section) {
      const fullPath = configPath || property
      controller.onChange((value: any) => {
        this.updateConfiguration(section, fullPath, value)
      })
    }

    this.controllers[`${section}.${property}`] = controller
  }

  private addColorController(
    folder: GUI, 
    object: any, 
    property: string, 
    section: keyof SceneConfig
  ): void {
    const controller = folder.addColor(object, property)
    
    controller.onChange((value: string) => {
      this.updateConfiguration(section, property, value)
    })

    this.controllers[`${section}.${property}`] = controller
  }

  private updateConfiguration(section: keyof SceneConfig, path: string, value: any): void {
    const updates: any = {}
    
    // Handle nested properties (e.g., windDirection.x)
    if (path.includes('.')) {
      const [parent, child] = path.split('.')
      updates[parent] = { [child]: value }
    } else {
      updates[path] = value
    }

    // Update configuration
    this.configManager.updateConfig(section, updates, `gui_${path}`)

    // Trigger callback
    const callback = this.callbacks[`on${section.charAt(0).toUpperCase() + section.slice(1)}Update` as keyof GUICallbacks]
    if (callback) {
      callback(this.configManager.getCurrentConfig()[section])
    }
  }

  // ============================================================================
  // CONFIGURATION MANAGEMENT METHODS
  // ============================================================================

  private resetSection(section: keyof SceneConfig): void {
    this.configManager.resetSection(section)
    this.refreshGUISection(section)
    
    // Trigger callback
    const callback = this.callbacks[`on${section.charAt(0).toUpperCase() + section.slice(1)}Update` as keyof GUICallbacks]
    if (callback) {
      callback(this.configManager.getCurrentConfig()[section])
    }
  }

  private resetAllToDefaults(): void {
    this.configManager.resetToDefaults()
    this.refreshAllGUI()
    
    // Trigger all callbacks
    Object.entries(this.callbacks).forEach(([key, callback]) => {
      if (callback && key.startsWith('on') && key.endsWith('Update')) {
        const section = key.slice(2, -6).toLowerCase() as keyof SceneConfig
        if (section === 'ocean' || section === 'land' || section === 'sky' || section === 'lighting') {
          callback(this.configManager.getCurrentConfig()[section])
        }
      }
    })
  }

  private refreshGUISection(section: keyof SceneConfig): void {
    const config = this.configManager.getCurrentConfig()[section]
    
    // Update all controllers for this section
    Object.entries(this.controllers).forEach(([key, controller]) => {
      if (key.startsWith(`${section}.`)) {
        const property = key.split('.')[1]
        if ((config as any)[property] !== undefined) {
          controller.setValue((config as any)[property])
        }
      }
    })
  }

  private refreshAllGUI(): void {
    const config = this.configManager.getCurrentConfig()
    
    Object.keys(config).forEach(section => {
      if (section !== 'id' && section !== 'version' && section !== 'lastModified') {
        this.refreshGUISection(section as keyof SceneConfig)
      }
    })
  }

  private loadGUIState(): void {
    // GUI state is automatically loaded through ConfigManager
    this.refreshAllGUI()
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private exportConfiguration(): void {
    const config = this.configManager.exportConfig()
    const blob = new Blob([config], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = `garden-config-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    console.log('📤 Configuration exported')
  }

  private importConfiguration(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          if (this.configManager.importConfig(content)) {
            this.refreshAllGUI()
            console.log('📥 Configuration imported and applied')
          } else {
            console.error('❌ Failed to import configuration')
          }
        }
        reader.readAsText(file)
      }
    }
    
    input.click()
  }

  private showHistory(): void {
    const history = this.configManager.getHistory()
    console.group('📜 Configuration History')
    history.forEach((entry, index) => {
      const date = new Date(entry.timestamp).toLocaleString()
      console.log(`${index + 1}. ${entry.action} - ${date}`, entry.config)
    })
    console.groupEnd()
  }

  private clearAllData(): void {
    if (confirm('Are you sure you want to clear all saved configuration data? This cannot be undone.')) {
      this.configManager.clearAllData()
      this.refreshAllGUI()
      console.log('🧹 All configuration data cleared')
    }
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  public getGUI(): GUI {
    return this.gui
  }

  public getConfigManager(): ConfigManager {
    return this.configManager
  }

  public show(): void {
    this.gui.domElement.style.display = 'block'
  }

  public hide(): void {
    this.gui.domElement.style.display = 'none'
  }

  public destroy(): void {
    this.gui.destroy()
  }
} 