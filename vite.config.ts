import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Dynamically import lovable-tagger only in development
const getComponentTagger = async () => {
  try {
    const { componentTagger } = await import("lovable-tagger");
    return componentTagger();
  } catch (error: any) {
    console.warn("lovable-tagger not available:", error.message);
    return null;
  }
};

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => ({
  server: {
    host: "::",
    port: 3001,
  },
  preview: {
    host: "::",
    port: 3001,
  },
  plugins: [
    react(),
    mode === 'development' && await getComponentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
