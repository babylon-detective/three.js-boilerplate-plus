# TypeScript for Three.js Development: Complete Learning Guide

## Table of Contents
1. [TypeScript vs Vanilla JavaScript](#typescript-vs-vanilla-javascript)
2. [Core TypeScript Concepts](#core-typescript-concepts)
3. [Advanced TypeScript Features](#advanced-typescript-features)
4. [Three.js Specific Patterns](#threejs-specific-patterns)
5. [System Architecture](#system-architecture)
6. [Best Practices](#best-practices)

## TypeScript vs Vanilla JavaScript

### Key Differences

**Vanilla JavaScript:**
```javascript
// No type safety
const cube = new THREE.Mesh(geometry, material)
cube.position.set(x, y, z) // Runtime error if x, y, z are wrong types

// No autocomplete or IntelliSense
camera.lookAt() // What parameters does this take?

// Runtime errors only
function animate(time) {
  // time could be anything!
}
```

**TypeScript:**
```typescript
// Type safety at compile time
const cube: THREE.Mesh = new THREE.Mesh(geometry, material)
cube.position.set(1, 2, 3) // TypeScript knows these should be numbers

// Full autocomplete and IntelliSense
camera.lookAt(target) // TypeScript shows you need Vector3

// Compile-time error checking
function animate(time: number): void {
  // time is guaranteed to be a number
}
```

### Why This Matters for Complex Three.js Projects

1. **Catch Errors Early**: Find bugs before your users do
2. **Better IDE Support**: Autocomplete, refactoring, navigation
3. **Self-Documenting Code**: Types serve as documentation
4. **Safer Refactoring**: Change code with confidence
5. **Team Collaboration**: Clear contracts between components

## Core TypeScript Concepts

### 1. Interfaces - Defining Object Shapes

```typescript
// Define what a camera configuration should look like
interface CameraConfig {
  fov: number
  aspect: number
  near: number
  far: number
  position: THREE.Vector3
}

// Now you can't forget any properties or use wrong types
const config: CameraConfig = {
  fov: 75,
  aspect: window.innerWidth / window.innerHeight,
  near: 0.1,
  far: 1000,
  position: new THREE.Vector3(0, 0, 5)
}
```

### 2. Enums - Type-Safe Constants

```typescript
// Instead of magic strings
enum DeviceType {
  MOBILE = 'mobile',
  TABLET = 'tablet',
  DESKTOP = 'desktop'
}

// Type-safe usage
function adjustCamera(deviceType: DeviceType) {
  switch (deviceType) {
    case DeviceType.MOBILE:
      // Handle mobile
      break
    case DeviceType.DESKTOP:
      // Handle desktop
      break
    // TypeScript ensures you handle all cases
  }
}
```

### 3. Union Types - Multiple Valid Types

```typescript
// A value can be one of several types
type InputMethod = 'touch' | 'mouse' | 'keyboard'

// Function can accept multiple types
function handleInput(method: InputMethod) {
  // TypeScript knows method is one of the three strings
}
```

### 4. Generic Types - Reusable Type Logic

```typescript
// Generic animation system that works with any Three.js object
class Animation<T extends THREE.Object3D = THREE.Object3D> {
  constructor(private target: T) {}
  
  // Methods know about the specific type
  public getTarget(): T {
    return this.target
  }
}

// Usage with specific types
const meshAnimation = new Animation<THREE.Mesh>(myMesh)
const groupAnimation = new Animation<THREE.Group>(myGroup)
```

## Advanced TypeScript Features

### 1. Discriminated Unions - Type-Safe Variants

```typescript
// Different LOD strategies with different properties
type LODStrategy = 
  | { type: 'distance'; camera: THREE.Camera }
  | { type: 'screen-size'; camera: THREE.Camera; renderer: THREE.WebGLRenderer }
  | { type: 'custom'; evaluator: (object: THREE.Object3D) => number }

// TypeScript ensures type safety in switch statements
function evaluateStrategy(strategy: LODStrategy) {
  switch (strategy.type) {
    case 'distance':
      // TypeScript knows strategy.camera exists
      return strategy.camera.position.length()
    case 'screen-size':
      // TypeScript knows both camera and renderer exist
      return calculateScreenSize(strategy.camera, strategy.renderer)
    case 'custom':
      // TypeScript knows evaluator function exists
      return strategy.evaluator(object)
  }
}
```

### 2. Mapped Types - Transform Existing Types

```typescript
// Take an existing type and make all properties optional
type PartialAnimation<T> = {
  [K in keyof T]?: T[K] extends object ? PartialAnimation<T[K]> : T[K]
}

// Usage
type AnimatableProperties = {
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: THREE.Vector3
}

// Now you can animate just some properties
const partialAnimation: PartialAnimation<AnimatableProperties> = {
  position: new THREE.Vector3(1, 0, 0)
  // rotation and scale are optional
}
```

### 3. Conditional Types - Type Logic

```typescript
// Different return types based on input
type ShaderResult<T> = T extends 'vertex' ? string : T extends 'fragment' ? string : never

function getShader<T extends 'vertex' | 'fragment'>(type: T): ShaderResult<T> {
  if (type === 'vertex') {
    return vertexShaderSource as ShaderResult<T>
  } else {
    return fragmentShaderSource as ShaderResult<T>
  }
}
```

### 4. Template Literal Types - String Pattern Types

```typescript
// Type-safe quality presets
type QualityPreset = 'ultra' | 'high' | 'medium' | 'low' | 'potato'

// Use in configuration
type QualityConfig = {
  [K in QualityPreset]: {
    maxDistance: number
    levelCount: number
  }
}
```

## Three.js Specific Patterns

### 1. Type Guards for Three.js Objects

```typescript
function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh
}

function processObject(object: THREE.Object3D) {
  if (isMesh(object)) {
    // TypeScript knows object is THREE.Mesh here
    object.geometry.computeBoundingBox()
    object.material.wireframe = true
  }
}
```

### 2. Event System with Types

```typescript
interface SceneEvents {
  'object-clicked': { object: THREE.Object3D; point: THREE.Vector3 }
  'animation-complete': { target: THREE.Object3D }
  'lod-changed': { object: THREE.Object3D; level: number }
}

class TypedEventEmitter<T extends Record<string, any>> {
  private listeners: Map<keyof T, Function[]> = new Map()
  
  on<K extends keyof T>(event: K, callback: (data: T[K]) => void) {
    // Type-safe event registration
  }
  
  emit<K extends keyof T>(event: K, data: T[K]) {
    // Type-safe event emission
  }
}

const sceneEmitter = new TypedEventEmitter<SceneEvents>()
sceneEmitter.on('object-clicked', (data) => {
  // data is typed as { object: THREE.Object3D; point: THREE.Vector3 }
})
```

### 3. Asset Loading with Types

```typescript
interface AssetManifest {
  models: Record<string, string>
  textures: Record<string, string>
  sounds: Record<string, string>
}

class AssetLoader {
  async loadAssets<T extends AssetManifest>(manifest: T): Promise<LoadedAssets<T>> {
    // Return type is inferred based on manifest structure
  }
}
```

## System Architecture Patterns

### 1. Dependency Injection

```typescript
interface CameraController {
  update(deltaTime: number): void
}

class OrbitCameraController implements CameraController {
  constructor(
    private camera: THREE.Camera,
    private controls: OrbitControls
  ) {}
  
  update(deltaTime: number): void {
    this.controls.update()
  }
}

// Inject dependencies
const controller: CameraController = new OrbitCameraController(camera, controls)
```

### 2. Strategy Pattern with Types

```typescript
interface RenderStrategy {
  render(scene: THREE.Scene, camera: THREE.Camera): void
}

class ForwardRenderStrategy implements RenderStrategy {
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    // Forward rendering logic
  }
}

class DeferredRenderStrategy implements RenderStrategy {
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    // Deferred rendering logic
  }
}

class Renderer {
  constructor(private strategy: RenderStrategy) {}
  
  setStrategy(strategy: RenderStrategy): void {
    this.strategy = strategy
  }
  
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.strategy.render(scene, camera)
  }
}
```

### 3. Observer Pattern

```typescript
interface Observer<T> {
  update(data: T): void
}

class Subject<T> {
  private observers: Observer<T>[] = []
  
  attach(observer: Observer<T>): void {
    this.observers.push(observer)
  }
  
  notify(data: T): void {
    this.observers.forEach(observer => observer.update(data))
  }
}

class PerformanceMonitor implements Observer<LODMetrics> {
  update(metrics: LODMetrics): void {
    console.log(`Performance: ${metrics.visibleObjects}/${metrics.totalObjects} objects visible`)
  }
}
```

## Best Practices for Complex Three.js Projects

### 1. Organize Your Types

```typescript
// types/index.ts
export interface SceneConfig {
  // ...
}

export interface CameraConfig {
  // ...
}

// types/animation.ts
export interface AnimationConfig {
  // ...
}

// types/input.ts
export interface InputState {
  // ...
}
```

### 2. Use Strict TypeScript Settings

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 3. Type Your Three.js Extensions

```typescript
// Extend Three.js types when needed
declare module 'three' {
  interface Object3D {
    userData: {
      id?: string
      type?: string
      [key: string]: any
    }
  }
}

// Now you can use strongly typed userData
object.userData.id = 'my-object'
```

### 4. Use readonly for Immutable Data

```typescript
interface ReadonlyMetrics {
  readonly totalObjects: number
  readonly visibleObjects: number
  readonly triangleCount: number
}

// Prevents accidental mutation
function getMetrics(): Readonly<LODMetrics> {
  return this.metrics
}
```

### 5. Prefer Composition over Inheritance

```typescript
// Instead of deep inheritance hierarchies
class GameObject {
  constructor(
    private transform: TransformComponent,
    private renderer: RenderComponent,
    private physics?: PhysicsComponent
  ) {}
}

// Flexible and testable
const player = new GameObject(
  new TransformComponent(),
  new MeshRenderComponent(playerMesh),
  new RigidBodyComponent()
)
```

## Mobile vs Desktop Considerations

### 1. Device Detection with Types

```typescript
enum DeviceType {
  MOBILE = 'mobile',
  TABLET = 'tablet',
  DESKTOP = 'desktop'
}

interface DeviceCapabilities {
  hasTouch: boolean
  maxTouchPoints: number
  screenSize: 'small' | 'medium' | 'large'
  performanceLevel: 'low' | 'medium' | 'high'
}

class DeviceAdapter {
  static detect(): { type: DeviceType; capabilities: DeviceCapabilities } {
    // Detection logic
  }
  
  static adaptCamera(camera: THREE.Camera, deviceType: DeviceType): void {
    switch (deviceType) {
      case DeviceType.MOBILE:
        // Wider FOV, pull back camera
        break
      case DeviceType.DESKTOP:
        // Standard FOV
        break
    }
  }
}
```

### 2. Performance Scaling

```typescript
interface QualitySettings {
  shadowMapSize: number
  antialias: boolean
  pixelRatio: number
  lodDistance: number
}

const qualityPresets: Record<DeviceType, QualitySettings> = {
  [DeviceType.MOBILE]: {
    shadowMapSize: 512,
    antialias: false,
    pixelRatio: 1,
    lodDistance: 100
  },
  [DeviceType.DESKTOP]: {
    shadowMapSize: 2048,
    antialias: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    lodDistance: 500
  }
}
```

## Summary

TypeScript transforms Three.js development by providing:

1. **Type Safety**: Catch errors at compile time
2. **Better Tooling**: IDE support, refactoring, navigation
3. **Self-Documentation**: Types explain intent
4. **Maintainability**: Easier to maintain large codebases
5. **Team Collaboration**: Clear interfaces between components

The systems we've built demonstrate:
- **Animation System**: Generics, method overloading, easing functions
- **LOD System**: Discriminated unions, mapped types, performance optimization
- **Input System**: Abstract classes, event handling, device detection
- **Main App**: Class-based architecture, dependency injection

Start with basic types and interfaces, then gradually adopt advanced features as your project grows. TypeScript's incremental adoption means you can add types progressively without rewriting everything at once. 