import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

// Custom plugin to copy services directory and models
function copyServicesPlugin() {
  return {
    name: 'copy-services',
    closeBundle() {
      // Copy services
      const servicesDir = resolve(__dirname, 'out/main/services');
      mkdirSync(servicesDir, { recursive: true });
      
      const servicesToCopy = [
        'llama.js',
        'llama2.js', 
        'tray.js',
        'window.js'
      ];
      
      servicesToCopy.forEach(file => {
        const src = resolve(__dirname, 'src/main/services', file);
        const dest = resolve(servicesDir, file);
        copyFileSync(src, dest);
        console.log(`✓ Copied ${file} to out/main/services/`);
      });

      // Copy modelsInstaller.js
      const installerSrc = resolve(__dirname, 'src/main/modelsInstaller.js');
      const installerDest = resolve(__dirname, 'out/main/modelsInstaller.js');
      copyFileSync(installerSrc, installerDest);
      console.log('✓ Copied modelsInstaller.js');

      // Copy models directory
      const modelsSourceDir = resolve(__dirname, 'models');
      const modelsDestDir = resolve(__dirname, 'out/models');
      
      if (existsSync(modelsSourceDir)) {
        mkdirSync(modelsDestDir, { recursive: true });
        const modelFiles = readdirSync(modelsSourceDir);
        
        modelFiles.forEach(file => {
          if (file.endsWith('.gguf')) {
            const src = resolve(modelsSourceDir, file);
            const dest = resolve(modelsDestDir, file);
            copyFileSync(src, dest);
            console.log(`✓ Copied ${file} to out/models/`);
          }
        });
      } else {
        console.log('⚠ models/ directory not found, skipping model copy');
      }
    }
  };
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: []
      }),
      copyServicesPlugin()
    ],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/main.js')
        },
        external: [
          'node-llama-cpp',
          '@node-llama-cpp/mac-arm64-metal',
          '@reflink/reflink',
          /^@node-llama-cpp\/(linux-.*|win32.*|darwin-x64.*|.*cuda.*|.*vulkan.*)/
        ]
      }
    },
    resolve: {
      browserField: false,
      conditions: ['node'],
      mainFields: ['module', 'jsnext:main', 'jsnext']
    }
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/preload.js')
        }
      }
    }
  },

  renderer: {
    root: 'src/renderer',
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    },
    plugins: [
      react({
        babel: {
          presets: ['@babel/preset-react']
        }
      })
    ],
    resolve: {
      extensions: ['.js', '.jsx', '.json', '.ts', '.tsx']
    },
    css: {
      postcss: {}
    }
  }
});