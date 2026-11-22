/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to build the standalone, backend-free demo. */
  readonly VITE_DEMO_MODE?: string;
  /** Dev-only: where the Vite proxy forwards /api. */
  readonly VITE_API_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
