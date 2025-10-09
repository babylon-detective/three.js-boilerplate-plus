# Load State "1" Default System

## Overview

The Three.js Boilerplate now automatically loads **"Load state 1"** as the default startup state. This ensures consistent project initialization with your preferred parameter settings.

## How It Works

### Automatic Startup Behavior

When the application starts:

1. **If state "1" exists**: Automatically loads it and applies all parameters
2. **If state "1" doesn't exist**: Creates it with current default parameters
3. **All systems are updated**: Ocean, land, sky, lighting, camera, and player settings are synchronized

### Key Features

- **Seamless Integration**: Works with existing parameter system
- **Backward Compatible**: Doesn't break existing saved states
- **System Synchronization**: All visual and gameplay systems update automatically
- **Console Management**: Easy-to-use commands for state management

## Console Commands

### New Commands Added

```javascript
// Set current parameters as the new default state "1"
setDefaultState()

// Reset to default state "1" 
resetToDefault()

// List all saved states (shows ⭐ for default state "1")
listStates()
```

### Existing Commands Enhanced

```javascript
// Load any state (now with system synchronization)
loadParameterState("stateName")

// Save current parameters as a named state
saveParameterState("stateName")
```

## Usage Examples

### Setting Up Your Default State

1. **Adjust parameters** using the debug GUI (`#debug` in URL)
2. **Fine-tune** ocean, land, sky, lighting, camera, and player settings
3. **Save as default**: Run `setDefaultState()` in console
4. **Restart** the application to verify it loads your settings

### Managing States

```javascript
// See all your saved states
listStates()
// Output:
// 📋 Saved Parameter States
// ⭐ 1. 1 (default startup state)
//   2. initial
//   3. sunset-scene
//   4. storm-weather

// Reset to your default anytime
resetToDefault()

// Load a specific scene setup
loadParameterState("sunset-scene")

// Save current tweaks as a new state
saveParameterState("my-new-scene")
```

## Technical Implementation

### Startup Sequence

```typescript
// In main.ts createContent() method:
const savedStates = this.parameterManager.getSavedStateNames()
if (savedStates.includes('1')) {
  // Load state "1" as default
  const loaded = this.parameterManager.loadState('1')
  if (loaded) {
    this.parameterIntegration.updateAllSystems()
    logger.info('Load state "1" applied as default startup state')
  }
} else {
  // Create state "1" with current parameters
  this.parameterManager.saveState('1')
  logger.info('Created state "1" as default startup state')
}
```

### System Integration

- **ParameterManager**: Handles state persistence in localStorage
- **ParameterIntegration**: Synchronizes parameters across all systems
- **ConsoleCommands**: Provides user-friendly management interface
- **All Systems**: Ocean, land, sky, lighting, camera, player automatically update

## Storage

States are stored in browser localStorage under:
- Key: `garden-parameters-saved-states`
- Format: JSON object with state configurations
- Persistence: Survives browser restarts and page refreshes

## Benefits

1. **Consistent Experience**: Same settings every time you start
2. **Easy Experimentation**: Save/load different scene configurations
3. **Version Control**: Keep multiple scene setups for different purposes
4. **Quick Reset**: Instantly return to your preferred defaults
5. **Team Collaboration**: Share state configurations via export/import

## Migration

- **Existing projects**: Will automatically create state "1" on first load
- **No data loss**: All existing saved states remain intact
- **Immediate effect**: Works right away without any configuration

## Example Workflow

1. **Initial Setup**:
   ```javascript
   // Start with default parameters, tweak via GUI
   setDefaultState() // Save as state "1"
   ```

2. **Scene Variations**:
   ```javascript
   // Create different moods/times
   saveParameterState("dawn")
   saveParameterState("noon") 
   saveParameterState("dusk")
   saveParameterState("night")
   ```

3. **Quick Switching**:
   ```javascript
   loadParameterState("dawn")   // Morning scene
   loadParameterState("dusk")   // Evening scene
   resetToDefault()             // Back to state "1"
   ```

4. **State Management**:
   ```javascript
   listStates()                 // See all options
   setDefaultState()            // Update default with current settings
   ```

The system is now active and ready to use! Your project will consistently start with "Load state 1" parameters, providing a reliable foundation for development and experimentation.
