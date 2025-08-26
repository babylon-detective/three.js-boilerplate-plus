// ============================================================================
// CONFIGURATION MANAGEMENT SYSTEM
// ============================================================================

import * as THREE from 'three'

// Base configuration interfaces
export interface BaseConfig {
  id: string
  version: string
  lastModified: number
}

export interface OceanConfig extends BaseConfig {
  amplitude: number
  windDirection: { x: number; z: number }
  windStrength: number
  waveLength: number
  waveSpeed: number
  waterColor: string
  deepWaterColor: string
  foamColor: string
  transparency: number
  reflectionStrength: number
}

export interface LandConfig extends BaseConfig {
  elevation: number
  roughness: number
  scale: number
  landColor: string
  rockColor: string
  sandColor: string
  moisture: number
  islandRadius: number
  coastSmoothness: number
  seaLevel: number
}

export interface SkyConfig extends BaseConfig {
  turbidity: number
  rayleigh: number
  mieCoefficient: number
  mieDirectionalG: number
  elevation: number
  azimuth: number
  exposure: number
}

export interface LightingConfig extends BaseConfig {
  shadowMapSize: number
  shadowRadius: number
  shadowBlur: number
  sunIntensity: number
  ambientIntensity: number
  shadowBias: number
}

export interface CameraConfig extends BaseConfig {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  fov: number
  zoom: number
  target?: { x: number; y: number; z: number }
}

export interface SceneConfig extends BaseConfig {
  ocean: OceanConfig
  land: LandConfig
  sky: SkyConfig
  lighting: LightingConfig
  camera: CameraConfig
}

// Default configurations - immutable reference states
export const DEFAULT_CONFIGS = {
  ocean: {
    id: 'ocean',
    version: '1.0.0',
    lastModified: Date.now(),
    amplitude: 0.5,
    windDirection: { x: 1, z: 0.5 },
    windStrength: 1.0,
    waveLength: 2.0,
    waveSpeed: 1.0,
    waterColor: '#006994',
    deepWaterColor: '#003366',
    foamColor: '#ffffff',
    transparency: 0.8,
    reflectionStrength: 0.6
  } as OceanConfig,

  land: {
    id: 'land',
    version: '1.0.0',
    lastModified: Date.now(),
    elevation: 8.0,
    roughness: 1.2,
    scale: 0.8,
    landColor: '#4a7c59',
    rockColor: '#8b7355',
    sandColor: '#c2b280',
    moisture: 0.3,
    islandRadius: 35.0,
    coastSmoothness: 8.0,
    seaLevel: -4.0
  } as LandConfig,

  sky: {
    id: 'sky',
    version: '1.0.0',
    lastModified: Date.now(),
    turbidity: 10,
    rayleigh: 3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7,
    elevation: 2,
    azimuth: 180,
    exposure: 0.5
  } as SkyConfig,

  lighting: {
    id: 'lighting',
    version: '1.0.0',
    lastModified: Date.now(),
    shadowMapSize: 4096,
    shadowRadius: 10,
    shadowBlur: 25,
    sunIntensity: 1.2,
    ambientIntensity: 0.3,
    shadowBias: -0.0001
  } as LightingConfig
} as const

// Storage keys
const STORAGE_KEYS = {
  USER_CONFIG: 'garden-scene-user-config',
  BACKUP_CONFIG: 'garden-scene-backup-config',
  CONFIG_HISTORY: 'garden-scene-config-history'
} as const

export class ConfigManager {
  private userConfig: Partial<SceneConfig> = {}
  private configHistory: Array<{ timestamp: number; config: Partial<SceneConfig>; action: string }> = []
  private maxHistorySize = 20

  constructor() {
    this.loadUserConfig()
    this.loadConfigHistory()
  }

  // ============================================================================
  // CORE CONFIGURATION METHODS
  // ============================================================================

  /**
   * Get current configuration (defaults merged with user overrides)
   */
  public getCurrentConfig(): SceneConfig {
    return {
      id: 'scene',
      version: '1.0.0',
      lastModified: Date.now(),
      ocean: { ...DEFAULT_CONFIGS.ocean, ...this.userConfig.ocean },
      land: { ...DEFAULT_CONFIGS.land, ...this.userConfig.land },
      sky: { ...DEFAULT_CONFIGS.sky, ...this.userConfig.sky },
      lighting: { ...DEFAULT_CONFIGS.lighting, ...this.userConfig.lighting },
      camera: { ...DEFAULT_CONFIGS.camera, ...this.userConfig.camera }
    }
  }

  /**
   * Get pure default configuration (immutable reference)
   */
  public getDefaultConfig(): SceneConfig {
    return {
      id: 'scene',
      version: '1.0.0',
      lastModified: Date.now(),
      ocean: { ...DEFAULT_CONFIGS.ocean },
      land: { ...DEFAULT_CONFIGS.land },
      sky: { ...DEFAULT_CONFIGS.sky },
      lighting: { ...DEFAULT_CONFIGS.lighting },
      camera: { ...DEFAULT_CONFIGS.camera }
    }
  }

  /**
   * Update specific configuration section
   */
  public updateConfig<T extends keyof SceneConfig>(
    section: T, 
    updates: Partial<SceneConfig[T]>, 
    action: string = 'manual_update'
  ): void {
    // Deep merge updates
    this.userConfig[section] = {
      ...this.userConfig[section],
      ...updates,
      lastModified: Date.now()
    } as any

    // Save to storage
    this.saveUserConfig()
    
    // Add to history
    this.addToHistory(action, { [section]: updates })

    // console.log(`🔧 Config updated: ${section}`, updates)
  }

  // ============================================================================
  // PERSISTENCE METHODS
  // ============================================================================

  /**
   * Save user configuration to localStorage
   */
  private saveUserConfig(): void {
    try {
      const configToSave = {
        ...this.userConfig,
        lastSaved: Date.now()
      }
      localStorage.setItem(STORAGE_KEYS.USER_CONFIG, JSON.stringify(configToSave))
      
      // Create backup
      localStorage.setItem(STORAGE_KEYS.BACKUP_CONFIG, JSON.stringify(configToSave))
      
      // console.log('💾 User configuration saved')
    } catch (error) {
      console.error('❌ Failed to save user configuration:', error)
    }
  }

  /**
   * Load user configuration from localStorage
   */
  private loadUserConfig(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USER_CONFIG)
      if (saved) {
        this.userConfig = JSON.parse(saved)
        // console.log('📂 User configuration loaded')
      }
    } catch (error) {
      console.error('❌ Failed to load user configuration:', error)
      this.tryLoadBackup()
    }
  }

  /**
   * Try to load backup configuration
   */
  private tryLoadBackup(): void {
    try {
      const backup = localStorage.getItem(STORAGE_KEYS.BACKUP_CONFIG)
      if (backup) {
        this.userConfig = JSON.parse(backup)
        // console.log('🔄 Backup configuration loaded')
      }
    } catch (error) {
      console.error('❌ Failed to load backup configuration:', error)
    }
  }

  // ============================================================================
  // HISTORY AND RESTORATION METHODS
  // ============================================================================

  /**
   * Add action to configuration history
   */
  private addToHistory(action: string, config: Partial<SceneConfig>): void {
    this.configHistory.push({
      timestamp: Date.now(),
      config: JSON.parse(JSON.stringify(config)), // Deep copy
      action
    })

    // Limit history size
    if (this.configHistory.length > this.maxHistorySize) {
      this.configHistory.shift()
    }

    this.saveConfigHistory()
  }

  /**
   * Save configuration history
   */
  private saveConfigHistory(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG_HISTORY, JSON.stringify(this.configHistory))
    } catch (error) {
      console.error('❌ Failed to save config history:', error)
    }
  }

  /**
   * Load configuration history
   */
  private loadConfigHistory(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONFIG_HISTORY)
      if (saved) {
        this.configHistory = JSON.parse(saved)
      }
    } catch (error) {
      console.error('❌ Failed to load config history:', error)
    }
  }

  /**
   * Reset specific section to defaults
   */
  public resetSection<T extends keyof SceneConfig>(section: T): void {
    delete this.userConfig[section]
    this.saveUserConfig()
    this.addToHistory(`reset_${section}`, { [section]: DEFAULT_CONFIGS[section] })
    // console.log(`🔄 Reset ${section} to defaults`)
  }

  /**
   * Reset all configuration to defaults
   */
  public resetToDefaults(): void {
    this.userConfig = {}
    this.saveUserConfig()
    this.addToHistory('reset_all', this.getDefaultConfig())
    // console.log('🔄 All configuration reset to defaults')
  }

  /**
   * Export current configuration as JSON
   */
  public exportConfig(): string {
    const exportData = {
      version: '1.0.0',
      exported: Date.now(),
      config: this.getCurrentConfig(),
      userOverrides: this.userConfig
    }
    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Import configuration from JSON
   */
  public importConfig(jsonString: string): boolean {
    try {
      const importData = JSON.parse(jsonString)
      
      if (importData.userOverrides) {
        this.userConfig = importData.userOverrides
        this.saveUserConfig()
        this.addToHistory('import_config', importData.userOverrides)
        // console.log('📥 Configuration imported successfully')
        return true
      }
      
      return false
    } catch (error) {
      console.error('❌ Failed to import configuration:', error)
      return false
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get configuration history
   */
  public getHistory(): Array<{ timestamp: number; config: Partial<SceneConfig>; action: string }> {
    return [...this.configHistory]
  }

  /**
   * Check if configuration has been modified from defaults
   */
  public hasModifications(): boolean {
    return Object.keys(this.userConfig).length > 0
  }

  /**
   * Get list of modified sections
   */
  public getModifiedSections(): Array<keyof SceneConfig> {
    return Object.keys(this.userConfig) as Array<keyof SceneConfig>
  }

  /**
   * Clear all stored data (nuclear option)
   */
  public clearAllData(): void {
    localStorage.removeItem(STORAGE_KEYS.USER_CONFIG)
    localStorage.removeItem(STORAGE_KEYS.BACKUP_CONFIG)
    localStorage.removeItem(STORAGE_KEYS.CONFIG_HISTORY)
    this.userConfig = {}
    this.configHistory = []
    // console.log('🧹 All configuration data cleared')
  }

  /**
   * Convert THREE.Color to hex string
   */
  public static colorToHex(color: THREE.Color): string {
    return `#${color.getHexString()}`
  }

  /**
   * Convert hex string to THREE.Color
   */
  public static hexToColor(hex: string): THREE.Color {
    return new THREE.Color(hex)
  }
} 