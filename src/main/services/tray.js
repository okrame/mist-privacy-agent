const { app, Tray, nativeImage, Menu } = require('electron');
const path = require('path');
const Positioner = require('electron-positioner');
const fs = require('fs');    
let tray = null;

function firstExisting(paths) {
  return paths.find(p => { try { return fs.existsSync(p); } catch { return false; } });
}

function createTray(mainWindow) {
  if (tray) return tray;

  const staticDir = app.isPackaged
    ? path.join(process.resourcesPath, 'static')
    : path.resolve(__dirname, '../../../static');

  let iconPath;
  
  if (process.platform === 'darwin') {
    iconPath = path.join(staticDir, 'iconTemplate.png');
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(staticDir, 'icon.png');
    }
  } else if (process.platform === 'win32') {
    iconPath = firstExisting([
      path.join(staticDir, 'icon.ico'),
      path.join(staticDir, 'icon.png')
    ]);
  } else {
    iconPath = path.join(staticDir, 'icon.png');
  }

  if (!iconPath || !fs.existsSync(iconPath)) {
    console.error('[tray] icon not found in', staticDir);
    return null;
  }

  const icon = nativeImage.createFromPath(iconPath);

  if (process.platform === 'darwin' && path.basename(iconPath).includes('Template')) {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);

  function toggleWindow(bounds) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      const positioner = new Positioner(mainWindow);
      const position = positioner.calculate('trayCenter', bounds);
      mainWindow.setPosition(position.x, position.y);
      mainWindow.show();
    }
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Privacy Analysis',
      click: () => toggleWindow()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);

  tray.setToolTip('Privacy Analysis');

  tray.on('click', (event, bounds) => {
    if (process.platform !== 'win32' || !event.ctrlKey) {
      toggleWindow(bounds);
    }
  });

  tray.on('right-click', () => {
    tray.popUpContextMenu(contextMenu);
  });

  return tray;
}

module.exports = {
  createTray
};