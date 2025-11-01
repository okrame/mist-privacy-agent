const { app, Tray, nativeImage, Menu } = require('electron');
const path = require('path');
const Positioner = require('electron-positioner');

let tray = null;

function createTray(mainWindow) {
  if (tray !== null) {
    return tray;
  }

  const iconPath = path.join(app.getAppPath(), 'static', process.platform === 'darwin' ? 'iconTemplate.png' : 'icon.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  if (icon.isEmpty()) {
    icon = nativeImage.createFromPath(path.join(__dirname, '../../static/icon.png'));
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