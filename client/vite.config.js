import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  base: "/",
  build: {
    // 构建产物继续放入后端托管的 web 目录，避免改动现有本地启动方式。
    outDir: path.resolve(__dirname, "../web"),
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5178,
    proxy: {
      "/api": "http://127.0.0.1:5177"
    }
  }
});
