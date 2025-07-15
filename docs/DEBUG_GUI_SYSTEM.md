# Debug GUI System

## Overview

The Debug GUI System provides a centralized, modular approach to managing all debug interface elements in the Three.js application. It replaces the scattered GUI setup with a clean, organized system that's easy to maintain and extend.

## Architecture

### DebugGUIManager

The main class that manages all GUI panels and their interactions with the application systems.

```typescript
class DebugGUIManager {
  private mainGUI: GUI | null = null
  private environmentGUI: GUI | null = null
  private performanceGUI: GUI | null = null
  private playerGUI: GUI | null = null
}
```

### GUI Panels

The system is organized into four main panels:

1. **Main GUI** - System controls, device info, camera, animations
2. **Environment GUI** - Sky, ocean, and land system controls
3. **Performance GUI** - Performance monitoring and collision system
4. **Player GUI** - Player controller settings and debug tools

## Features

### 🎯 Centralized Management

- All GUI elements managed in one place
- Consistent styling and positioning
- Easy to enable/disable entire debug system
- Modular design for easy extension

### 📱 Multi-Panel Layout

- **Main Panel** (right: 0px) - System controls
- **Environment Panel** (right: 320px) - World settings
- **Performance Panel** (right: 640px) - Monitoring tools
- **Player Panel** (right: 960px) - Player controls

### 🔧 System Integration

- Automatic integration with all major systems
- Real-time updates and feedback
- Proper cleanup and disposal
- Logger integration for debugging

## Usage

### Enabling Debug Mode

```javascript
// Add #debug to URL or press Ctrl+D
// Debug mode automatically initializes all GUI panels
```

### Programmatic Access

```typescript
// Access the debug GUI manager
const debugGUI = this.debugState.debugGUIManager

// Get all GUI instances
const guis = debugGUI.getGUIs()

// Dispose of all GUI elements
debugGUI.dispose()
```

## GUI Panels

### Main GUI Panel

**Location**: Top-right corner
**Purpose**: Core system controls

#### Sections:
- **📱 Device Info** - Device type, screen size, input methods
- **🎬 Animation System** - Start/stop animations, active count
- **📷 Camera** - Position, FOV, persistence controls
- **🎯 Object Management** - Object count, list, save/clear states

### Environment GUI Panel

**Location**: Right side, second column
**Purpose**: World environment controls

#### Sections:
- **☀️ Sun & Sky System** - Turbidity, Rayleigh, sun position, exposure
- **🌊 Ocean System** - Wave parameters, visual properties, sun effects
- **🏔️ Land System** - Terrain parameters, material colors, island controls

### Performance GUI Panel

**Location**: Right side, third column
**Purpose**: Performance monitoring and system diagnostics

#### Sections:
- **📊 Performance** - Enable/disable monitoring, show stats, reset metrics
- **💥 Collision System** - Show stats, test collisions

### Player GUI Panel

**Location**: Right side, fourth column
**Purpose**: Player controller settings and debugging

#### Sections:
- **Position** - X, Y, Z position controls
- **Configuration** - Move speed, jump speed, gravity, collision dimensions
- **Debug** - Debug wireframe, status display

## Configuration

### Custom Positioning

```typescript
const config: DebugGUIConfig = {
  mainGUIPosition: { top: '0px', right: '0px' },
  environmentGUIPosition: { top: '0px', right: '320px' },
  performanceGUIPosition: { top: '0px', right: '640px' },
  playerGUIPosition: { top: '0px', right: '960px' }
}

const debugGUI = new DebugGUIManager(container, systems, config)
```

### System References

The DebugGUIManager requires references to all major systems:

```typescript
interface SystemReferences {
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  objectManager: ObjectManager
  animationSystem: AnimationSystem
  collisionSystem: CollisionSystem
  cameraManager: CameraManager
  playerController: PlayerController
  oceanLODSystem?: any
  landSystem?: any
  sky?: any
  skyConfig?: any
  deviceType: string
  inputMethods: string[]
}
```

## Player Movement Speed

### Increased Speed

The player movement speed has been increased from **15.0** to **25.0** for faster movement:

```typescript
// In PlayerController.ts
private config: PlayerConfig = {
  position: new THREE.Vector3(0, 20, 0),
  capsuleRadius: 0.5,
  capsuleHeight: 2.0,
  moveSpeed: 25.0, // Increased from 15.0
  jumpSpeed: 8.0,
  gravity: 20.0
}
```

### Real-time Adjustment

The movement speed can be adjusted in real-time through the Player GUI panel:

1. Enable debug mode (`#debug` in URL)
2. Open the Player GUI panel (rightmost column)
3. Navigate to "Configuration" folder
4. Adjust "Move Speed" slider (5-50 range)

## Benefits

### 🧹 Clean Code

- Removes scattered GUI setup code from main.ts
- Centralized configuration and management
- Consistent patterns across all GUI elements

### 🔧 Maintainability

- Easy to add new GUI panels
- Simple to modify existing controls
- Clear separation of concerns

### 🎮 Better UX

- Organized, logical grouping of controls
- Multiple panels for different purposes
- Real-time feedback and monitoring

### 🚀 Performance

- Efficient GUI management
- Proper cleanup and disposal
- Minimal impact on main application

## Migration from Old System

The old GUI system has been completely replaced. All functionality is preserved but now organized in the new centralized system:

- **Legacy GUI**: Removed from main.ts
- **setupGUI()**: Replaced by DebugGUIManager
- **setupEnvironmentGUI()**: Integrated into Environment panel
- **Manual GUI creation**: Now handled automatically

## Future Enhancements

1. **Custom Themes** - Different visual themes for GUI panels
2. **Panel Collapse** - Ability to collapse/expand panels
3. **Keyboard Shortcuts** - Quick access to common controls
4. **Preset Configurations** - Save/load GUI layouts
5. **Mobile Optimization** - Touch-friendly controls for mobile devices

## Troubleshooting

### GUI Not Appearing

1. Check if debug mode is enabled (`#debug` in URL)
2. Verify DebugGUIManager is properly initialized
3. Check browser console for errors

### Controls Not Working

1. Ensure system references are properly passed
2. Check that target systems are initialized
3. Verify event handlers are properly bound

### Performance Issues

1. Disable unused GUI panels
2. Reduce update frequency for real-time controls
3. Use performance monitoring tools to identify bottlenecks 