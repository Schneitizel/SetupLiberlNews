// Fichier principal lancé au lancement de l'application
const { app, BrowserWindow, ipcMain } = require("electron");
const electron = require('electron');
const path = require('path');
const os = require("os");
const config = require("./package.json");

// Défini la taille de la fenêtre ; une plus grande valeur signifie une fenêtre plus grande (Défaut : 1.1)
const multiplicator = 1.1;

const loadMainWindow = async () => {

    // Permet d'obtenir un effet 16:9 adapté à la taille de la résolution de l'utilisateur
    let widthScreen = Math.floor((electron.screen.getPrimaryDisplay().bounds['height'] * multiplicator) / 0.85);
    let heightScreen = Math.floor(widthScreen * 0.56);
	
    mainWindow = new BrowserWindow({
        width : widthScreen,
        height: heightScreen,
        icon: path.join(__dirname, "/images/icon.png"),
        resizable: false, // False = La fenêtre ne peut pas redimensionnée par l'utilisateur
        webPreferences: {
            nodeIntegration: true, // Nécessaire pour activer jQuery et autres modules de Node
            allowRunningInsecureContent: true,
            defaultEncoding: 'UTF-8',
            contextIsolation: false,
            enableRemoteModule: true
        }
    });

    mainWindow.removeMenu(); // Pas de "Menu", "Options" etc...

    mainWindow.setTitle("Installateur - Liberl News - Version " + config["version"]);
    mainWindow.webContents.openDevTools({ mode: 'detach' }); // Décommenter cette ligne pour afficher les options de développeur ; utiles pour régler l'interface
	mainWindow.loadFile(path.join(__dirname, "loading.html")); // Chargement de la page html principale
}

app.on("ready", () => {
    loadMainWindow();
});

ipcMain.handle('exit', async () => {
    
    if (process.platform !== "darwin") {
        app.quit();
    }

});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
 });

 app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        loadMainWindow();
    }
});