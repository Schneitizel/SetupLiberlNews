// Fichier secondaire lancé après le chargement de loading.html, et qui gère le code de l'application
const $ = require('jquery'); // Le jQuery de base
var Promise = require("bluebird"); // Gestion des promesses
const { spawn } = require('node:child_process'); // Permet d'exécuter des commandes batch
const os = require("os"); // Permet de récupérer des infos sur l'OS
const EventEmitter = require('events'); // Nécessaire aux chargements
const loadingEvents = new EventEmitter(); // Pareil
const fs = require('fs'); // Gestion des fichiers/dossiers locaux
const https = require('node:https'); // Gestion du module https (Sécurisé) pour les téléchargements
const fetch = require('node-fetch'); // Meilleure gestion de fetch (pour res.body.pipe et res.body.on)
    // Deux framework pour la gestion des .zip sont nécessaires, l'un pour gérer le nombre de fichiers et leurs poids, et l'autre pour extraire de manière plus optimisée
    // TO-DO : Trouver ou créer un framework unique qui fait les deux
const StreamZip = require('node-stream-zip'); // Gestion des fichiers .zip, nombre de fichiers et méta-données
const yauzl = require('yauzl'); // Gestion des fichiers .zip, extraction détaillée

const agent = new https.Agent({
    rejectUnauthorized: false,
});

// Variables globales

var config;
var projectsList;

var numberPicture = 1; // Le numéro de l'image du projet affiché

var gameLoaded; // Défini quel projet est chargé actuellement

var dataUser = {}; // Les données de l'utilisateur ; soit on les charge depuis config.json (Dans AppData) soit on les créé
var menu; // Contient quel menu est affiché pour un réaffichage futur

var steamAppsFolders = []; // Contient tous les chemins d'installation des jeux Steam.

// Défini où se trouve le dossier "AppData" selon l'OS
var filepath;
var directorySeparator;

if (process.platform === 'win32') {
    filepath = process.env.APPDATA;
    directorySeparator = '\\';
} else {
    filepath = os.homedir();
    directorySeparator = '/';
}

loadingEvents.on('loaded', async () => {
    // Affiche la fenêtre principale en fondu d'ouverture (Default : 1000ms/1s)
    $('.mainWindow').animate({
        opacity: 1
    }, 1000);
});

$(document).ready(async function(){

    await loadConfig();

    // On vide le dossier pour éviter les fichiers résiduels
    cleanFolder();

    // On charge les dossiers Steam
    getSteamFolders();

    if(fs.existsSync(filepath + directorySeparator + 'Liberl News' + directorySeparator + 'config.json')){
        dataUser = JSON.parse(fs.readFileSync(filepath + directorySeparator + 'Liberl News' + directorySeparator + 'config.json'));
    }else{
        dataUser['projects'] = {};
    }

    // Si audioAtStart est true, on lance start.wav au démarrage de l'appli
    if(config["audioAtStart"])
    {
        document.getElementById('startSound').play();
    }

    // Charge le fichier index.html, la fenêtre principale en gros, après 1.150 seconde (Le temps que l'animation ait fini)
    setTimeout(function(){
        $('.main').load('index.html', function() {
            loadElements();
            loadingEvents.emit('loaded'); // On affiche la page !
        });
    }, 1150);
});

async function loadElements()
{

    let version = require('./package.json');
    $('.setupVersion').html('Version ' + version['version']);

    $('.footer').html(config["footerText"]); // On affiche le message du footer

        // On boucle le fichier des projets, on affiche les projets Trails d'abord
        Object.entries(projectsList["trails"]).forEach(([key, value]) => {
            let games = "";

            Object.entries(value['games']).forEach(([keyGame, valueGame]) => {
                let imageURL = "https://cdn.akamai.steamstatic.com/steam/apps/" + valueGame['steamId'] + "/header.jpg";
                if(valueGame['steamId'] == -1) // Si le jeu est un jeu nom Steam, honte à vous ! Et on va chercher son image dans le dossier "images"
                    imageURL = "images/" + valueGame['name'] + ".png";

                if(valueGame['patchVersion'] != '0') // Si un patch est disponible, on l'affiche
                {
                    games = games + '<img onclick="openProject(\'trails\', \'' + key + '\', \'' + keyGame + '\')" src="' + imageURL + '">';
                    if(dataUser['projects'][valueGame["name"]] === undefined) // Si le projet n'existe pas dans les infos utilisateurs, on le créé
                        dataUser['projects'][valueGame["name"]] = {"patch": null, "voice": null};
                }
            });

            if(games !== "") // Si pas de patch disponible, on affiche pas !
                $('#trailsGames').html($('#trailsGames').html() + '<h1> <img src="images/' + value['icon'] + '.png">' + value['title'] + '</h1>' + games);
        });

        // Et on boucle aussi les projets rétro !
        Object.entries(projectsList["retro"]).forEach(([key, value]) => {
            let games = "";

            Object.entries(value['games']).forEach(([keyGame, valueGame]) => {
                let imageURL = "https://cdn.akamai.steamstatic.com/steam/apps/" + valueGame['steamId'] + "/header.jpg";
                if(valueGame['steamId'] == -1) // Si le jeu est un jeu nom Steam, honte à vous ! Et on va chercher son image dans le dossier "images"
                    imageURL = "images/" + valueGame['name'] + ".png";

                if(valueGame['patchVersion'] != '0') // Si un patch est disponible, on l'affiche
                {
                    games = games + '<img onclick="openProject(\'retro\', \'' + key + '\', \'' + keyGame + '\')" src="' + imageURL + '">';
                    if(dataUser['projects'][valueGame["name"]] === undefined) // Si le projet n'existe pas dans les infos utilisateurs, on le créé
                        dataUser['projects'][valueGame["name"]] = {"patch": null, "voice": null};
                }
            });

            if(games !== "") // Si pas de patch disponible, on affiche pas !
                $('#retroGames').html($('#retroGames').html() + '<h1> <img src="images/' + value['icon'] + '.png">' + value['title'] + '</h1>' + games);
        });

        writeConfig();
}

async function loadConfig()
{
    config = require("./config.json");
    if(config["useOnlineConfig"]) // Si useOnlineConfig, on utilise 
        config = await getFetch('https://raw.githubusercontent.com/Schneitizel/SetupLiberlNews/main/config.json', 'GET', {}, true);

    if(fs.existsSync('./projects.json') && !config["useOnlineConfig"]) // Si le fichier projects.json existe dans le répertoire de l'appli ET qu'on se sert des fichiers locaux, on l'utilise
        projectsList = require("./projects.json");
    else // Sinon, on va chercher celui en ligne !
        projectsList = await getFetch('https://raw.githubusercontent.com/Schneitizel/SetupLiberlNews/main/projects.json', 'GET', {}, true);

    return 1;
}

// Écrit la variable dataUser dans config.json
function writeConfig(){
    fs.writeFile(filepath + directorySeparator + 'Liberl News' + directorySeparator + 'config.json', JSON.stringify(dataUser), err => {
        if (err) {
          console.error(err);
        }
    });
}

// Sert à vider entièrement le dossier %APPDATA%/Liberl News/ des fichiers .zip
function cleanFolder(){
    if (!fs.existsSync(filepath + directorySeparator + 'Liberl News'))
        fs.mkdirSync(filepath + directorySeparator + 'Liberl News');

    fs.readdir(filepath + directorySeparator + 'Liberl News', function (err, files) {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        } 

        files.forEach(function (file) {
            if(file.substring(file.length-4) == '.zip'){
                fs.unlink(filepath +  directorySeparator + 'Liberl News' + directorySeparator + file, (err) => {
                    if (err) {
                        throw err;
                    }
                });
            }
        });
    });
}

// Affiche la page du projet
// Type : trails ou retro
// id : Sky, Crossbell etc...
// game : numéro du jeu (0 pour Sky est le premier Sky)
function openProject(type = "trails", id = "Sky", game = 0)
{
    menu = $('.Trails'); // On vérifie quel menu doit disparaître ; et grâce à ça, on sait aussi lequel doit ré-apparaître !
    if(!$('#modeTrails').hasClass('active'))
        menu = $('.Retro');

    $('.gameInfos').css('display', 'inline-block');
    $('.gameCredits').css('display', 'none');

    gameLoaded = projectsList[type][id]['games'][game];
    let gameName = gameLoaded['name'];

    $('#credits').html('• Équipe du projet : <br><br />');

    gameLoaded['staff'].forEach(element => {
        $('#credits').html($('#credits').html() + element + '<br>');
    });

    $('#gameName').html(gameName); // On remplace le nom dans l'en-tête par le nom du jeu
    $('#gameDesc').html(projectsList[type][id]['games'][game]['desc']); // On remplace la description sur la page par celle du jeu
    $('#gamePicture').attr("src", "images/projets/" + id + game + "1.png"); // On affiche la première image du projet, et on réinitialise son affichage
    numberPicture = 1;

    // On réinitialise le bouton de téléchargement, au cas où
    $('#installPatch').removeClass("disabled");
    $('#installPatch').html("Installer");

    $('#checkVoice').css("display", "block");
    $('.gauge').css("background", "linear-gradient(to right, #3DB9F5 0%, #3df5c2 0%, #3DB9F500 0%)");
    $('.gauge').html("");

    $('#file').prop('disabled', false);

    $('.filePath').html("Dossier \"" + gameLoaded['steamFolderName'] + "\" non trouvé.");
    $('.filePath').addClass("noPath");

    // On essaye de trouver où se trouve le jeu, si l'utilisateur l'a d'installé sur Steam
    /*steamAppsFolders.forEach(element => {
        if($('.filePath').hasClass('noPath') && fs.existsSync(element + directorySeparator + gameLoaded['steamFolderName'] + directorySeparator))
            $('.filePath').removeClass("noPath").addClass("okPath").html(element + directorySeparator + gameLoaded['steamFolderName'] + directorySeparator);
    });*/

    // On affiche les versions des patchs et des voix que l'utilisateur possède, et celles disponibles
    let patchVersion = ((dataUser["projects"][gameName]["patch"] == null) ? "Aucune" : dataUser["projects"][gameName]["patch"]);
    let voiceVersion = ((dataUser["projects"][gameName]["voice"] == null) ? "Aucune" : dataUser["projects"][gameName]["voice"]);
    let color = "#6CDC3D";

    let compare = compareVersions(patchVersion, projectsList[type][id]['games'][game]['patchVersion']);

    if(patchVersion != "Aucune")
    {   
        if(compare == 3) // Si l'utilisateur a déjà le dernier patch
        {
            color = "#ffffff";
            $('#installPatch').addClass("disabled");
        }
        else if(compare == 1) // Sinon, il y a une mise à jour
        {
            $('#installPatch').html("Mise à jour");
        }
    }

    $('#file').on('change', async function( e ) {
        let segments = document.getElementById("file").files[0].path.split("\\");
        var nomDossier = segments[segments.length - 2];

        if(nomDossier == gameLoaded['steamFolderName'] && compare != 3)
        {
            $('.filePath').removeClass("noPath").addClass("okPath").html(segments.slice(0, -1).join('\\'));
            $('#file').prop('disabled', true);
            $('#installPatch').removeClass("disabled");
        }
    });

    $('#versionPatchInstalle').html('   ' + patchVersion);
    $('#versionVoiceInstalle').html('   ' + voiceVersion);

    $('#versionPatchDispo').html('   ' + projectsList[type][id]['games'][game]['patchVersion']).css('color', color);
    $('#versionVoiceDispo').html('   ' + ((projectsList[type][id]['games'][game]['voiceVersion']) == '0' ? 'Aucune' : projectsList[type][id]['games'][game]['voiceVersion']));

    if(projectsList[type][id]['games'][game]['voiceVersion'] == '0')
        $('#checkVoice').css("display", "none");

    menu.animate({
        opacity: 0
    }, config["speedAnimation"]);

    setTimeout(function(){
        menu.css('display', 'none');
        $('.displayGame').css('display', 'block');
        $('.displayGame').animate({
            opacity: 1
        }, config["speedAnimation"]);
    }, config["speedAnimation"]);
}

// Permet de retourner à l'écran d'accueil
function goHome()
{
    $('.displayGame').animate({
        opacity: 0
    }, config["speedAnimation"]);

    setTimeout(function(){
        $('.displayGame').css('display', 'none');
        menu.css('display', 'block');
        menu.animate({
            opacity: 1
        }, config["speedAnimation"]);
    }, config["speedAnimation"]);
}

// Change l'image affichée ; mettre un nombre négatif pour afficher l'image précédente
function changeImage(num = 1)
{
    numberPicture += num

    if(numberPicture <= 0)
        numberPicture = 3;
    else if(numberPicture >= 4)
        numberPicture = 1

    let newImageURL = $('#gamePicture').attr("src").slice(0, -5) + numberPicture + $('#gamePicture').attr("src").slice(-4);

    $('#gamePicture').attr("src",  newImageURL);
}

// Permet de passer des jeux Trails aux jeux rétro, et inversement
function changeMode(mode = 'trails')
{

    if($('.displayGame').css('display') != 'none')
        return;

    let buttonTrails = $('#modeTrails');
    let buttonRetro = $('#modeRetro');

    if((mode == 'trails' && buttonTrails.hasClass('active')) || (mode == 'retro' && !buttonTrails.hasClass('active')))
        return;

    if(buttonTrails.hasClass('active')) // Si le mode "Trails" est actif
    {
        buttonTrails.removeClass('active');
        buttonRetro.addClass('active');
        $('.Trails').animate({
            opacity: 0
        }, config["speedAnimation"]);

        setTimeout(function(){
            $('.Trails').css('display', 'none');
            $('.Retro').css('display', 'block');
            $('.Retro').animate({
                opacity: 1
            }, config["speedAnimation"]);
        }, config["speedAnimation"]);
    }
    else // Sinon, c'est que c'est le mode "Rétro" qui est actif
    {
        buttonTrails.addClass('active');
        buttonRetro.removeClass('active');
        $('.Retro').animate({
            opacity: 0
        }, config["speedAnimation"]);

        setTimeout(function(){
            $('.Retro').css('display', 'none');
            $('.Trails').css('display', 'block');
            $('.Trails').animate({
                opacity: 1
            }, config["speedAnimation"]);
        }, config["speedAnimation"]);
    }
}

function compareVersions(version1, version2) {
    const v1 = version1.split('.').map(Number);
    const v2 = version2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if (v1[i] < v2[i]) {
            return 1; // Si version1 est inférieure à version2
        } else if (v1[i] > v2[i]) {
            return 2; // Si version1 est supérieure à version2
        }
    }

    return 3; // Les versions sont égales
}

// Permet d'afficher les crédits, tout simplement
function displayCredits()
{
    if($('.gameCredits').css('display') == 'none')
    {
        $('.gameInfos').css('display', 'none');
        $('.gameCredits').css('display', 'inline-block');
    }
    else
    {
        $('.gameInfos').css('display', 'inline-block');
        $('.gameCredits').css('display', 'none');
    }
}

// Lancé quand on appuie sur le bouton "Installer/Mise à jour"
async function downloadFile() {

    // Si le bouton "Installer" est désactivé, on ne fait rien
    if($('#installPatch').hasClass('disabled'))
        return;

    // On obtient d'abord les infos du fichier, tel que son nom et son poids
    $('.gauge').html('Récupération des infos du patch...');

    var url = 'https://www.googleapis.com/drive/v3/files/' + gameLoaded['patchID'] + '?key=' + config['ApiGD'];//' + '&alt=media';
    const resultatWeb = await getFetch(url, 'GET', {}, false);

    // S'il y a eu une erreur, on l'affiche et on arrête
    // 403 : Accès non autorisé, clé API incorrecte ? ; 404 : Fichier non trouvé ; 500/503 : Serveur indisponible ; autre : Voir Google
    if(resultatWeb['error'] !== undefined)
    {
        $('.gauge').html('Erreur ' + resultatWeb['error']['code'])
        .css('background', '#ff000080');
        return;
    }

    // On obtient le fichier, et on crée sa version locale (Dans AppData/Liberl News)
    $('.gauge').html('Récupération du fichier du patch...');

    let res = await fetch(url + '&alt=media', { agent });
    const fileLength = parseInt(res.headers.get("Content-Length" || "0"), 10);
    let zipFilePath = filepath + directorySeparator + 'Liberl News' + directorySeparator + resultatWeb['name'];

    let fileStream = fs.createWriteStream(zipFilePath);

    // Permet de calculer en combien de temps le fichier a été téléchargé
    var seconds = 0.0;
    var inter = setInterval(function() {
        seconds += 0.01;
    }, 10);

    // Permet de calculer (approximativement) la vitesse de téléchargement
    let written = 0;
    let lastWritten = 0;
    let speed = 0;
    
    var calculSpeed = setInterval(function() {
        speed = written - lastWritten;
        lastWritten = written;
    }, 1000);

    await new Promise((resolve, rejectPromise) => {

        res.body.pipe(fileStream);
        res.body.on('data', data => {
            // Durant le téléchargement, on calcule la progression et on met à jour la jauge
            written += data.length;
            let percent = ((written/fileLength)*100);
            drawGauge(percent);
            $('.gauge').html('Téléchargement - ' + percent.toFixed(2) + '% (' + formatBytes(speed) + ')');
        });
        res.body.on("error", reject => {
            // En cas d'erreur
            console.error('ERREUR : ' + reject);
            $('.gauge').html('Téléchargement interrompu !')
            .css('background', '#ff000080');
            return rejectPromise;
        });
        fileStream.on("finish", resolve);

    });
    
    // On a terminé de télécharger le patch, 
    clearInterval(inter);
    clearInterval(calculSpeed);

    //TO-DO afficher la durée du téléchargement, si voulu (Où ?)
    //console.log('Téléchargement terminé en ' + seconds.toFixed(2) + ' secondes');

    // On débute l'extraction de l'archive
    await fct(zipFilePath);

    // On supprime l'archive .zip téléchargée ; en cas d'erreur, osef, on passe à la suite !
    fs.unlink(zipFilePath, (err) => {
        if (err) {
            throw err;
        }
    });

    // On vérifie si l'utilisateur a demandé à avoir les voix ET qu'une version pour les voix existe
    // TO-DO créer une seule fonction pour télécharger ce que l'on souhaite !
    if($('#checkBox').is(':checked') && gameLoaded['voiceVersion'] != '0' && gameLoaded['voiceID'] != "")
    {
        $('.gauge').html('Récupération des infos du patch des voix...');
        url = 'https://www.googleapis.com/drive/v3/files/' + gameLoaded['voiceID'] + '?key=' + config['ApiGD'];

        const resultatWebVoices = await getFetch(url, 'GET', {}, false);
        if(resultatWebVoices['error'] !== undefined)
        {
            $('.gauge').html('Erreur ' + resultatWebVoices['error']['code'])
            .css('background', '#ff000080');
            return;
        }

        $('.gauge').html('Récupération du fichier des voix...');

        res = await fetch(url + '&alt=media', { agent });
        const fileVoicesLength = parseInt(res.headers.get("Content-Length" || "0"), 10);
        zipFilePath = filepath + directorySeparator + 'Liberl News' + directorySeparator + resultatWebVoices['name'];

        seconds = 0.0;
        inter = setInterval(function() {
            seconds += 0.01;
        }, 10);

        written = 0;
        lastWritten = 0;
        speed = 0;
        
        calculSpeed = setInterval(function() {
            speed = written - lastWritten;
            lastWritten = written;
        }, 1000);

        fileStream = fs.createWriteStream(zipFilePath);
        drawGauge(0);
        $('.gauge').html('');

        await new Promise((resolve, rejectPromise) => {

            res.body.pipe(fileStream);
            res.body.on('data', data => {
                // Durant le téléchargement, on calcule la progression et on met à jour la jauge
                written += data.length;
                let percent = ((written/fileLength)*100);
                drawGauge(percent);
                $('.gauge').html('Téléchargement - ' + percent.toFixed(2) + '% (' + formatBytes(speed) + ')');
            });
            res.body.on("error", reject => {
                // En cas d'erreur
                console.error('ERREUR : ' + reject);
                $('.gauge').html('Téléchargement interrompu !')
                .css('background', '#ff000080');
                return rejectPromise;
            });
            fileStream.on("finish", resolve);
    
        });

        clearInterval(inter);
        clearInterval(calculSpeed);

        await fct(zipFilePath);

        fs.unlink(zipFilePath, (err) => {
            if (err) {
                throw err;
            }
        });

        // On enregistre le version des voix installées
        dataUser['projects'][gameLoaded['name']]['voice'] = gameLoaded['voiceVersion'];

        // On met à jour la version des voix installées sur la page
        $('#versionVoiceInstalle').html('   ' + gameLoaded['voiceVersion']);
    }

    // On enregistre la version du patch installé ; on sauvegarde aussi les infos utilisateur en local (Dans %APPDATA%/config.json)
    dataUser['projects'][gameLoaded['name']]['patch'] = gameLoaded['patchVersion'];
    writeConfig();

    // On met à jour la version du patch installé sur la page
    $('#versionPatchInstalle').html('   ' + gameLoaded['patchVersion']);
    $('#versionPatchDispo').css('color', '#ffffff');

    // On désactive le bouton de téléchargement, l'utilisateur vient d'avoir la dernière version
    $('#installPatch').addClass("disabled");
    $('#installPatch').html("Installer");

    // On affiche dans la jauge que tout est ok
    drawGauge(100);
    $('.gauge').html('Patch téléchargé et installé !');
    console.log("Patch téléchargé et extrait !");

    // On a terminé ! Bravo !
}

// Permet d'extraire les archives .zip
// TO-DO : Voir pour mettre un mot de passe aux archives, pour éviter le vol (?)
async function fct(pathAbs){

    // Le chemin absolu (F:/mon_dossier/mon_sous_dossier/fichier.zip) de l'archive .zip
    const zipFilePath = pathAbs;

    // Le chemin absolu de l'endroit où l'archive sera extraite (Idéalement le dossier racine du jeu)
    let finalPath = $('.filePath').html(); // T'as vu, ça c'est le turfu !

    // On obtient le nombre total de fichiers à extraire, et leurs poids
    const zip = new StreamZip.async({ file: pathAbs });
    const entries = await zip.entries();
    let totalEntriesBytes = 0;
    for (const entry of Object.values(entries)) {
        if(!entry.isDirectory)
            totalEntriesBytes += entry.size; 
    }

    // On ferme "l'ancrage" de l'archive, pour pouvoir la supprimer après ; on a eu les données qu'on voulait
    zip.close();

    // On fait une promesse pour attendre que la fonction ait tout extrait AVANT de passer à la suite
    var bar = new Promise((resolve, reject) => {
    let bytesRead = 0.0;
    yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) throw err;
      
        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          const targetFile = finalPath + directorySeparator + entry.fileName;

          if (entry.fileName.endsWith('/')) {
            fs.mkdirSync(targetFile, { recursive: true });
            zipfile.readEntry();
          } else {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) throw err;
              
              readStream.on('data', (chunk) => {
                bytesRead += chunk.length;
                const progressPercentage = Math.round((bytesRead / totalEntriesBytes) * 100);
                $('.gauge').html(progressPercentage + '%');
                drawGauge(progressPercentage);
              });
      
              readStream.on('end', () => {
                zipfile.readEntry();
              });

              const writeStream = fs.createWriteStream(targetFile);
                readStream.pipe(writeStream);
            });
          }
        });
      
        zipfile.on('end', () => {
            zipfile.close();
            resolve();
        });
      });
    });

    await bar.then();
}

// Permet de "remplir" automatiquement la jauge de progression ; tout est déjà calculé
// Mettre 0 pour la vider, 100 pour la remplir
function drawGauge(percent = 0)
{
    if(percent < 0) percent = 0;
    if(percent > 100) percent = 100;

    $('.gauge').css("background", "linear-gradient(to right, #3DB9F5 " + percent/2 + "% , #48b2e5 " + percent + "%, transparent 1%)");
}

// Permet de convertir une vitesse de téléchargement
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return 'Calcul...'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To', 'Po', 'Eo', 'Zo', 'Yo']

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))}${sizes[i]}/s`
}

// Permet de faire des requêtes web
// Si method est GET, les arguments doivent être mis dans l'url (https://domaine.com/page.php?arg=1&args=2)
async function getFetch(url, method = "POST", args = {}, json = true){
	let result;

    result = await $.ajax({
        url: url,
        type: method,
        data: args,
        async: false,
    }).catch(function(error){
        return JSON.parse('{"error": {"code": ' + error.status + '}}');
    });

    if(json)
        return JSON.parse(result);

    return result;
}

// TO-DO refactoriser la fonction, car celle-ci est vieille et peu optimisée !
// Crédits : Ashley A. Sekai (C.R.X.)
async function getSteamFolders(){

    return new Promise((resolve, reject) => {

    let i = 0;

    setTimeout(function() { // Si au bout de 10 secondes, le programme n'a pas pu trouver les dossiers, il passe à la suite, pour éviter un chargement infini
        resolve();
    }, 1000*10);

    if (process.platform === 'win32' && os.homedir() != 'C:\\users\\steamuser') { // Si l'utilisateur est sous Windows

        const command = spawn('REG', ["QUERY", "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "/v", "InstallPath"]);
        command.stdout.on('data', async output => {

            const textRes = await loopFolder(output.toString().split('\n'));

            if(textRes == '')
            {
                resolve();
                return;
            }

            var text = textRes.split('REG_SZ    ');

            if(text[1] !== undefined){
                text = text[1]
                .replaceAll(/\r?\n|\r/g, "")
                .replaceAll('ProgramFiles(x86)', 'Program Files (x86)')
                .replaceAll('ProgramFiles', 'Program Files');
                let listing = fs.readFileSync(text+'\\steamapps\\libraryfolders.vdf').toString().split('"path"		');
                listing.forEach((value, index) => {
                    if(index > 0){
                        steamAppsFolders[i] = value.split('"')[1].replaceAll('\\\\', directorySeparator) + '\\steamapps\\common';
                        i++;
                    }

                    if(index == listing.length -1)
                    {
                        resolve();
                    }
                    
                });
            }
        });

    } else { // Sinon, il est sous Steam Deck

        if(!fs.existsSync('/home/deck/.local/share/Steam/steamapps/libraryfolders.vdf'))
        {
            steamAppsFolders[0] = '/home/deck/.local/share/Steam/steamapps/common';
            steamAppsFolders[1] = '/home/steam/.local/share/Steam/steamapps/common';
            steamAppsFolders[2] = '/run/media/mmcblk0p1/steamapps/common';
            resolve();
        }
        else
        {
            let listing = fs.readFileSync('/home/deck/.local/share/Steam/steamapps/libraryfolders.vdf').toString().split('"path"		');
                listing.forEach((value, index) => {
                    if(index > 0){
                        steamAppsFolders[i] = value.split('"')[1] + '/steamapps/common';
                        i++;
                    }

                    if(index == listing.length -1)
                    {
                        console.log(steamAppsFolders)
                        resolve();
                    }
                    
                });
        }
    }

    });
}

async function loopFolder(lines)
{
    var text = '1';
    return new Promise((resolve, reject) => {
        if(lines.length == 0)
            resolve(text);
        
        for (var a = 0; a < lines.length; a++) {
            if(lines[a].includes("REG_SZ"))
            {
                text = lines[a];
                resolve(text);
            }    

            if(a == lines.length-1)
                resolve(text);
        }
    });
}