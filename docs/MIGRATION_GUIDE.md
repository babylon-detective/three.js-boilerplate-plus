# Migration Guide: Console.log to Centralized Logging

## Overview

This guide helps you migrate from scattered `console.log` statements to the centralized logging system. The new system provides better performance, filtering, and organization.

## Step 1: Import the Logger

Add this import to the top of your file:

```typescript
import { logger, LogModule } from './systems/Logger'
```

## Step 2: Replace Console Statements

### Basic Replacements

| Before | After |
|--------|-------|
| `console.log("message")` | `logger.info(LogModule.SYSTEM, "message")` |
| `console.warn("warning")` | `logger.warn(LogModule.SYSTEM, "warning")` |
| `console.error("error")` | `logger.error(LogModule.SYSTEM, "error")` |
| `console.debug("debug")` | `logger.debug(LogModule.SYSTEM, "debug")` |

### With Arguments

| Before | After |
|--------|-------|
| `console.log("Player moved", position)` | `logger.info(LogModule.PLAYER, "Player moved", position)` |
| `console.error("Failed to load", error)` | `logger.error(LogModule.OBJECTS, "Failed to load", error)` |

## Step 3: Choose Appropriate Module

Select the most appropriate module for your logging:

- **SYSTEM**: General system operations, initialization
- **PLAYER**: Player controller, movement, physics
- **CAMERA**: Camera management, modes, positioning
- **COLLISION**: Collision detection and response
- **OBJECTS**: Object loading, management, lifecycle
- **INPUT**: Input handling, key events, mouse/touch
- **ANIMATION**: Animation systems, frame updates
- **GUI**: User interface, overlays, controls

## Step 4: Choose Appropriate Log Level

- **ERROR**: Critical errors that prevent normal operation
- **WARN**: Warnings about potential issues
- **INFO**: General information about system state
- **DEBUG**: Detailed debugging information

## Migration Examples

### Example 1: Player Controller

**Before:**
```typescript
console.log("Player initialized")
console.log("Player moved to", position)
console.warn("Player out of bounds")
console.error("Player collision failed", error)
```

**After:**
```typescript
logger.info(LogModule.PLAYER, "Player initialized")
logger.info(LogModule.PLAYER, "Player moved to", position)
logger.warn(LogModule.PLAYER, "Player out of bounds")
logger.error(LogModule.PLAYER, "Player collision failed", error)
```

### Example 2: Camera Manager

**Before:**
```typescript
console.log("Camera mode switched to player")
console.debug("Camera position updated", { x: 10, y: 5, z: 0 })
```

**After:**
```typescript
logger.info(LogModule.CAMERA, "Camera mode switched to player")
logger.debug(LogModule.CAMERA, "Camera position updated", { x: 10, y: 5, z: 0 })
```

### Example 3: Performance Logging

**Before:**
```typescript
const startTime = performance.now()
// ... expensive operation ...
const duration = performance.now() - startTime
console.log("Operation took", duration, "ms")
```

**After:**
```typescript
const startTime = performance.now()
// ... expensive operation ...
const duration = performance.now() - startTime
logger.performance(LogModule.SYSTEM, "Operation", duration)
```

## Step 5: Use Migration Helper (Optional)

For complex migrations, use the migration helper:

```typescript
import { LoggerMigration, LogPatterns } from './systems/LoggerMigration'

// Replace console.log
LoggerMigration.replaceConsoleLog(LogModule.PLAYER, "Player moved", position)

// Use common patterns
LogPatterns.playerInitialized()
LogPatterns.playerMoved(position, velocity)
LogPatterns.cameraModeChanged("system", "player")

// Performance measurement
LoggerMigration.measurePerformance(LogModule.SYSTEM, "Expensive operation", () => {
  // ... operation code ...
})
```

## Step 6: Configure Logging

In your main.ts or initialization file:

```typescript
// Development mode (all logs, debug level)
logger.setDevelopmentMode()

// Or configure manually
logger.setLevel(LogLevel.DEBUG)
logger.enableModule(LogModule.PLAYER)
logger.enableModule(LogModule.CAMERA)
logger.enableModule(LogModule.COLLISION)

// Production mode (errors and warnings only)
logger.setProductionMode()

// Silent mode (no output)
logger.setSilentMode()
```

## File-by-File Migration Checklist

### src/main.ts
- [ ] Replace `console.error` in shader loading
- [ ] Replace ocean system logs with `logger.info(LogModule.SYSTEM, ...)`
- [ ] Replace land system logs with `logger.info(LogModule.SYSTEM, ...)`
- [ ] Replace camera switching logs with `logger.info(LogModule.CAMERA, ...)`
- [ ] Replace lighting/sky logs with `logger.info(LogModule.SYSTEM, ...)`
- [ ] Replace mesh click logs with `logger.debug(LogModule.SYSTEM, ...)`

### src/systems/PlayerController.ts
- [ ] Add logger import
- [ ] Replace any remaining console logs with `logger.info(LogModule.PLAYER, ...)`
- [ ] Add player movement logging
- [ ] Add collision logging

### src/systems/CameraManager.ts
- [ ] Add logger import
- [ ] Replace console logs with `logger.info(LogModule.CAMERA, ...)`
- [ ] Add camera mode change logging

### src/systems/CollisionSystem.ts
- [ ] Add logger import
- [ ] Replace console logs with `logger.info(LogModule.COLLISION, ...)`
- [ ] Add collision detection logging

### src/systems/ObjectManager.ts
- [ ] Add logger import
- [ ] Replace console logs with `logger.info(LogModule.OBJECTS, ...)`
- [ ] Add object lifecycle logging

## Benefits After Migration

1. **Performance**: Conditional logging prevents unnecessary string formatting
2. **Organization**: Logs are categorized by module and level
3. **Filtering**: Enable/disable specific modules or levels
4. **Consistency**: Unified logging format across the application
5. **Debugging**: Better control over what gets logged in different environments

## Testing the Migration

1. **Check for errors**: Ensure all imports are correct
2. **Verify output**: Check that logs appear with the expected format
3. **Test filtering**: Try enabling/disabling modules
4. **Test levels**: Verify that log levels work correctly
5. **Performance test**: Use silent mode to verify no performance impact

## Common Issues

### Import Errors
- Ensure the path to Logger.ts is correct
- Check that LogModule enum is imported

### No Logs Appearing
- Check if silent mode is enabled
- Verify log level is set appropriately
- Confirm module is enabled

### Too Many Logs
- Increase log level (e.g., from DEBUG to INFO)
- Disable specific modules
- Use production mode

## Next Steps

After migration:
1. Configure logging based on environment (dev/prod)
2. Add performance logging for expensive operations
3. Use the migration helper for complex logging patterns
4. Document any custom logging patterns for your team 