/// <reference types="vite/client" />

// Declare GLSL modules for TypeScript
declare module '*.glsl' {
  const content: string
  export default content
}

declare module '*.vert' {
  const content: string
  export default content
}

declare module '*.frag' {
  const content: string
  export default content
}

declare module '*.wgsl' {
  const content: string
  export default content
}
