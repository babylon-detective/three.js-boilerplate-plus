# Centralized Logging System

## Overview

The Three.js Boilerplate uses a centralized logging system that provides:
- **Unified interface** for all logging across the application
- **Log levels** (ERROR, WARN, INFO, DEBUG) for different verbosity
- **Module-based filtering** to enable/disable logs for specific systems
- **Performance optimizations** with conditional logging
- **Development/production modes** for different environments

## Quick Start

```typescript
import { logger, LogModule, LogLevel } from './systems/Logger';

// Basic logging
logger.info(LogModule.PLAYER, 'Player initialized');
logger.debug(LogModule.CAMERA, 'Camera position updated', { x: 10, y: 5, z: 0 });

// Performance logging
logger.performance(LogModule.SYSTEM, 'Frame render', 16.67);

// Error logging
logger.error(LogModule.COLLISION, 'Collision detection failed', error);
```

## Log Levels

### ERROR (0)
Critical errors that prevent normal operation.
```typescript
logger.error(LogModule.SYSTEM, 'Failed to load texture', error);
```

### WARN (1)
Warnings about potential issues or deprecated usage.
```typescript
logger.warn(LogModule.PLAYER, 'Player position out of bounds');
```

### INFO (2)
General information about system state and operations.
```typescript
logger.info(LogModule.CAMERA, 'Camera mode switched to player');
```

### DEBUG (3)
Detailed debugging information for development.
```typescript
logger.debug(LogModule.COLLISION, 'Collision check', { object1, object2 });
```

## Log Modules

The system is organized into logical modules:

- **PLAYER**: Player controller, movement, physics
- **CAMERA**: Camera management, modes, positioning
- **COLLISION**: Collision detection and response
- **OBJECTS**: Object loading, management, lifecycle
- **INPUT**: Input handling, key events, mouse/touch
- **ANIMATION**: Animation systems, frame updates
- **GUI**: User interface, overlays, controls
- **SYSTEM**: General system operations, initialization

## Configuration

### Setting Log Level
```typescript
// Show only errors and warnings
logger.setLevel(LogLevel.WARN);

// Show all logs including debug
logger.setLevel(LogLevel.DEBUG);
```

### Module Filtering
```typescript
// Enable specific modules
logger.enableModule(LogModule.PLAYER);
logger.enableModule(LogModule.CAMERA);

// Disable specific modules
logger.disableModule(LogModule.COLLISION);

// Enable/disable all modules
logger.enableAllModules();
logger.disableAllModules();
```

### Mode Presets

#### Development Mode
```typescript
logger.setDevelopmentMode();
// Sets: DEBUG level, all modules enabled, verbose output
```

#### Production Mode
```typescript
logger.setProductionMode();
// Sets: WARN level, minimal output for performance
```

#### Silent Mode
```typescript
logger.setSilentMode();
// Disables all console output
```

## Performance Considerations

### Conditional Logging
Logs are only processed if they meet the current configuration:
- Log level is sufficient
- Module is enabled
- Silent mode is disabled

This prevents unnecessary string formatting and console calls in production.

### Performance Logging
```typescript
const startTime = performance.now();
// ... expensive operation ...
const duration = performance.now() - startTime;
logger.performance(LogModule.SYSTEM, 'Operation name', duration);
```

## Migration Guide

### From Console.log to Logger

**Before:**
```typescript
console.log('Player moved to', position);
console.warn('Collision detected');
console.error('Failed to load model', error);
```

**After:**
```typescript
logger.info(LogModule.PLAYER, 'Player moved to', position);
logger.warn(LogModule.COLLISION, 'Collision detected');
logger.error(LogModule.OBJECTS, 'Failed to load model', error);
```

### Convenience Functions
For quick access, use the convenience functions:
```typescript
import { logInfo, logWarn, logError, logDebug } from './systems/Logger';

logInfo(LogModule.PLAYER, 'Player initialized');
logWarn(LogModule.CAMERA, 'Camera out of bounds');
logError(LogModule.SYSTEM, 'Initialization failed', error);
logDebug(LogModule.COLLISION, 'Collision check', data);
```

## Best Practices

### 1. Use Appropriate Log Levels
- **ERROR**: Only for actual errors that break functionality
- **WARN**: For recoverable issues or deprecated usage
- **INFO**: For important state changes and operations
- **DEBUG**: For detailed debugging information

### 2. Include Relevant Context
```typescript
// Good
logger.info(LogModule.PLAYER, 'Player moved', { 
  from: oldPosition, 
  to: newPosition, 
  velocity: currentVelocity 
});

// Avoid
logger.info(LogModule.PLAYER, 'Player moved');
```

### 3. Use Performance Logging for Expensive Operations
```typescript
const startTime = performance.now();
const result = expensiveCalculation();
const duration = performance.now() - startTime;
logger.performance(LogModule.SYSTEM, 'Expensive calculation', duration);
```

### 4. Configure Logging Based on Environment
```typescript
// In main.ts
if (import.meta.env.DEV) {
  logger.setDevelopmentMode();
} else {
  logger.setProductionMode();
}
```

### 5. Avoid Logging in Hot Paths
```typescript
// Avoid logging in render loops or frequent updates
// unless it's critical debugging information
```

## Configuration Examples

### Development Setup
```typescript
logger.setDevelopmentMode();
logger.enableModule(LogModule.PLAYER);
logger.enableModule(LogModule.CAMERA);
logger.enableModule(LogModule.COLLISION);
```

### Production Setup
```typescript
logger.setProductionMode();
// Only errors and warnings will be logged
```

### Debugging Specific Module
```typescript
logger.setLevel(LogLevel.DEBUG);
logger.disableAllModules();
logger.enableModule(LogModule.COLLISION);
// Only collision debug logs will appear
```

### Performance Testing
```typescript
logger.setSilentMode();
// No logging overhead during performance testing
```

## Troubleshooting

### No Logs Appearing
1. Check if silent mode is enabled: `logger.getConfig().silentMode`
2. Verify log level: `logger.getConfig().level`
3. Confirm module is enabled: `logger.getConfig().enabledModules`

### Too Many Logs
1. Increase log level: `logger.setLevel(LogLevel.WARN)`
2. Disable specific modules: `logger.disableModule(LogModule.DEBUG)`
3. Use production mode: `logger.setProductionMode()`

### Performance Issues
1. Use silent mode during performance testing
2. Avoid logging in render loops
3. Use performance logging to identify bottlenecks

## API Reference

### Logger Instance Methods
- `setLevel(level: LogLevel): void`
- `enableModule(module: LogModule): void`
- `disableModule(module: LogModule): void`
- `enableAllModules(): void`
- `disableAllModules(): void`
- `setSilentMode(): void`
- `setVerboseMode(): void`
- `setDevelopmentMode(): void`
- `setProductionMode(): void`
- `getConfig(): LogConfig`

### Logging Methods
- `error(module: LogModule, message: string, ...args: any[]): void`
- `warn(module: LogModule, message: string, ...args: any[]): void`
- `info(module: LogModule, message: string, ...args: any[]): void`
- `debug(module: LogModule, message: string, ...args: any[]): void`
- `performance(module: LogModule, operation: string, duration: number): void`

### Convenience Functions
- `logError(module: LogModule, message: string, ...args: any[])`
- `logWarn(module: LogModule, message: string, ...args: any[])`
- `logInfo(module: LogModule, message: string, ...args: any[])`
- `logDebug(module: LogModule, message: string, ...args: any[])`
- `logPerformance(module: LogModule, operation: string, duration: number)` 