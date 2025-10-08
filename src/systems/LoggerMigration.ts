/**
 * Logger Migration Helper
 * 
 * This file provides utilities to help migrate from console.log statements
 * to the centralized logging system.
 */

import * as THREE from 'three'
import { logger, LogModule } from './Logger'

/**
 * Migration utilities for transitioning from console.log to centralized logging
 */
export class LoggerMigration {
  
  /**
   * Replace console.log with appropriate logger call
   */
  static replaceConsoleLog(module: LogModule, message: string, ...args: any[]): void {
    logger.info(module, message, ...args)
  }

  /**
   * Replace console.warn with appropriate logger call
   */
  static replaceConsoleWarn(module: LogModule, message: string, ...args: any[]): void {
    logger.warn(module, message, ...args)
  }

  /**
   * Replace console.error with appropriate logger call
   */
  static replaceConsoleError(module: LogModule, message: string, ...args: any[]): void {
    logger.error(module, message, ...args)
  }

  /**
   * Replace console.debug with appropriate logger call
   */
  static replaceConsoleDebug(module: LogModule, message: string, ...args: any[]): void {
    logger.debug(module, message, ...args)
  }

  /**
   * Performance measurement helper
   */
  static measurePerformance(module: LogModule, operation: string, fn: () => void): void {
    const startTime = performance.now()
    fn()
    const duration = performance.now() - startTime
    logger.performance(module, operation, duration)
  }

  /**
   * Async performance measurement helper
   */
  static async measureAsyncPerformance(module: LogModule, operation: string, fn: () => Promise<void>): Promise<void> {
    const startTime = performance.now()
    await fn()
    const duration = performance.now() - startTime
    logger.performance(module, operation, duration)
  }
}

/**
 * Common logging patterns for different modules
 */
export class LogPatterns {
  
  // Player-related logging
  static playerInitialized(): void {
    logger.info(LogModule.PLAYER, 'Player controller initialized')
  }

  static playerDisposed(): void {
    logger.info(LogModule.PLAYER, 'Player controller disposed')
  }

  static playerMoved(position: THREE.Vector3, velocity: THREE.Vector3): void {
    logger.debug(LogModule.PLAYER, 'Player moved', { 
      position: { x: position.x.toFixed(1), y: position.y.toFixed(1), z: position.z.toFixed(1) },
      velocity: { x: velocity.x.toFixed(1), y: velocity.y.toFixed(1), z: velocity.z.toFixed(1) }
    })
  }

  static playerCollision(correctedPosition: THREE.Vector3): void {
    logger.debug(LogModule.PLAYER, 'Player collision corrected', { 
      correctedY: correctedPosition.y.toFixed(2) 
    })
  }

  // Camera-related logging
  static cameraModeChanged(fromMode: string, toMode: string): void {
    logger.info(LogModule.CAMERA, 'Camera mode changed', { from: fromMode, to: toMode })
  }

  static cameraPositionUpdated(position: THREE.Vector3): void {
    logger.debug(LogModule.CAMERA, 'Camera position updated', { 
      x: position.x.toFixed(1), y: position.y.toFixed(1), z: position.z.toFixed(1) 
    })
  }

  // Collision-related logging
  static collisionDetected(objectId: string, position: THREE.Vector3): void {
    logger.debug(LogModule.COLLISION, 'Collision detected', { 
      objectId, 
      position: { x: position.x.toFixed(1), y: position.y.toFixed(1), z: position.z.toFixed(1) }
    })
  }

  static collisionSystemInitialized(): void {
    logger.info(LogModule.COLLISION, 'Collision system initialized')
  }

  // Object-related logging
  static objectLoaded(objectId: string, objectType: string): void {
    logger.info(LogModule.OBJECTS, 'Object loaded', { objectId, objectType })
  }

  static objectRemoved(objectId: string): void {
    logger.info(LogModule.OBJECTS, 'Object removed', { objectId })
  }

  // System-related logging
  static systemInitialized(systemName: string): void {
    logger.info(LogModule.SYSTEM, 'System initialized', { systemName })
  }

  static systemDisposed(systemName: string): void {
    logger.info(LogModule.SYSTEM, 'System disposed', { systemName })
  }

  static performanceMeasured(operation: string, duration: number): void {
    logger.performance(LogModule.SYSTEM, operation, duration)
  }
}

/**
 * Migration checklist for each file
 */
export const MIGRATION_CHECKLIST = {
  'src/main.ts': [
    'Replace console.log with logger.info(LogModule.SYSTEM, ...)',
    'Replace console.warn with logger.warn(LogModule.SYSTEM, ...)',
    'Replace console.error with logger.error(LogModule.SYSTEM, ...)',
    'Add performance logging for expensive operations'
  ],
  'src/systems/PlayerController.ts': [
    'Replace console.log with logger.info(LogModule.PLAYER, ...)',
    'Replace console.warn with logger.warn(LogModule.PLAYER, ...)',
    'Replace console.error with logger.error(LogModule.PLAYER, ...)',
    'Add player movement and collision logging'
  ],
  'src/systems/CameraManager.ts': [
    'Replace console.log with logger.info(LogModule.CAMERA, ...)',
    'Replace console.warn with logger.warn(LogModule.CAMERA, ...)',
    'Replace console.error with logger.error(LogModule.CAMERA, ...)',
    'Add camera mode change logging'
  ],
  'src/systems/CollisionSystem.ts': [
    'Replace console.log with logger.info(LogModule.COLLISION, ...)',
    'Replace console.warn with logger.warn(LogModule.COLLISION, ...)',
    'Replace console.error with logger.error(LogModule.COLLISION, ...)',
    'Add collision detection logging'
  ],
  'src/systems/ObjectManager.ts': [
    'Replace console.log with logger.info(LogModule.OBJECTS, ...)',
    'Replace console.warn with logger.warn(LogModule.OBJECTS, ...)',
    'Replace console.error with logger.error(LogModule.OBJECTS, ...)',
    'Add object lifecycle logging'
  ]
}

/**
 * Quick migration examples
 */
export const MIGRATION_EXAMPLES = {
  // Before
  before: {
    consoleLog: 'console.log("Player moved to", position)',
    consoleWarn: 'console.warn("Collision detected")',
    consoleError: 'console.error("Failed to load model", error)',
    performance: 'const start = performance.now(); /* operation */; const duration = performance.now() - start; console.log("Operation took", duration)'
  },
  // After
  after: {
    consoleLog: 'logger.info(LogModule.PLAYER, "Player moved to", position)',
    consoleWarn: 'logger.warn(LogModule.COLLISION, "Collision detected")',
    consoleError: 'logger.error(LogModule.OBJECTS, "Failed to load model", error)',
    performance: 'LoggerMigration.measurePerformance(LogModule.SYSTEM, "Operation", () => { /* operation */ })'
  }
} 