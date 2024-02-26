// Fichier secondaire lancé après le chargement de loading.html, et qui gère le code de l'application
const $ = require('jquery'); // Le jQuery de base
var Promise = require("bluebird"); // Gestion des promesses
const VDF = require('./vdf'); // nécessaire pour lire et écraser le fichier vdf
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
const path = require('path');
const agent = new https.Agent({
    rejectUnauthorized: false,
});
const { shell } = require('electron');
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

var installationPath = null;


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
    //setTimeout(function(){
        $('.main').load('index.html', function() {
            loadElements();
            loadingEvents.emit('loaded'); // On affiche la page !
        });
    //}, 1150);
});

async function loadElements()
{

    let version = require('./package.json');
    $('.setupVersion').html('Version de l\'installateur : ' + version['version']);

    $('.footer').html(config["footerText"]); // On affiche le message du footer

        // On boucle le fichier des projets, on affiche les projets Trails d'abord
        Object.entries(projectsList["trails"]).forEach(([key, value]) => {
            let games = "";

            Object.entries(value['games']).forEach(([keyGame, valueGame]) => {
                let imageURL = "https://cdn.akamai.steamstatic.com/steam/apps/" + valueGame['steamId'] + "/header.jpg";
                if(valueGame['steamId'] == -1) // Si le jeu est un jeu non Steam, honte à vous ! Et on va chercher son image dans le dossier "images"
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
		
		var setupVersion = compareVersions(version['version'], config["latestInstallerVersion"]);
		if (setupVersion == 1){
			 openWindow("popupContainer");
		} 
		//Pas d'autoupdate, c'est impossible en version portable
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

	$('#uninstallAll').removeClass("disabled");
	
    $('#checkVoice').css("display", "block");
    $('#projectBar').css("background", "linear-gradient(to right, #3DB9F5 0%, #3df5c2 0%, #3DB9F500 0%)");
    $('#projectBar').html("");

    $('#file').prop('disabled', false);

    $('.filePath').html("Dossier \"" + gameLoaded['steamFolderName'] + "\" non trouvé.");
    $('.filePath').addClass("noPath");

    // On essaye de trouver où se trouve le jeu, si l'utilisateur l'a d'installé sur Steam
	
	installationPath = getGivenGame(gameLoaded)
	
    /*steamAppsFolders.forEach(element => {
        if($('.filePath').hasClass('noPath') && fs.existsSync(element + directorySeparator + gameLoaded['steamFolderName'] + directorySeparator))
            $('.filePath').removeClass("noPath").addClass("okPath").html(element + directorySeparator + gameLoaded['steamFolderName'] + directorySeparator);
    });*/
    $('.filePath').removeClass("noPath").addClass("okPath").html(installationPath + directorySeparator);
    // On affiche les versions des patchs et des voix que l'utilisateur possède, et celles disponibles
	


	/*
	Soit le patch n'est pas installé, les voix non plus, la case des voix n'est pas cochée => on installe que le patch (scénario le plus simple)
	Soit rien n'est installé mais la case voix est cochée => on installe voix + patch
	soit les voix sont installées mais pas le patch => on installe le patch
	soit le patch est installé mais pas les voix, mais la case est cocheé => on installe les voix
	si y a un problème à un quelconque moment l'utilisateur peut cliquer sur un bouton désinstaller qui va enlever voix et patch (table rase). ensuite il pourra cocher la case des voix et installer et ça lui donnera voix et patch*/
    const currentState = getCurrentState();
	updateGUI(currentState);

	
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
	goHome();
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

function calculateTimeRemaining(targetDate) {
    // Parse the target date string into a JavaScript Date object
    const targetDateTime = new Date(targetDate).getTime();
    
    // Get the current time
    const now = new Date().getTime();

    // Calculate the time difference in milliseconds
    const timeDifference = targetDateTime - now;

    if (timeDifference > 0) {
        // Calculate days and hours remaining
        const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        // Create a formatted string
        const resultString = `Dans ${days} jours et ${hours} heures`;

        return resultString;
    } else {
        return "";
    }
}

function updateGUI(currentState){
	let color = "#6CDC3D";
	let releaseDate = "";
	let isThereACountdown = false;
	
	if (gameLoaded.hasOwnProperty('releaseDate')){
		releaseDate = new Date(gameLoaded['releaseDate']);	
		if (!isNaN(releaseDate.getTime()))
		{
			let remainingTime = calculateTimeRemaining(releaseDate);
			if (remainingTime != ""){
				$('#installPatch').html(remainingTime);
				isThereACountdown = true;
			}
		}
	}
	
	if (!isThereACountdown){
		if ((currentState.patchState == 2) && (!currentState.voicePatchToBeInstalled)){ //seul le patch est à mettre à jour
			$('#installPatch').html("Mettre à jour le patch");
		}
		else if ((currentState.patchState == 1) && (!currentState.voicePatchToBeInstalled)) //le patch n'existe pas, les voix existent déjà
		{
			$('#installPatch').html("Installer patch");
		}
		else if ((currentState.voicePatchToBeInstalled) && (currentState.patchState == 0)) //le patch est OK, mais pas les voix
		{
			$('#installPatch').html("Installer voix");
		}
		else if (!(currentState.voicePatchToBeInstalled) && (currentState.patchState == 0)) //Tout est OK
		{
			color = "#ffffff";
			$('#installPatch').addClass("disabled");
		}
		else if ((currentState.voicePatchToBeInstalled) && (currentState.patchState == 1)) //rien n'existe
		{
			$('#installPatch').html("Installer patch + voix");
		}
		else if ((currentState.voicePatchToBeInstalled) && (currentState.patchState == 2)) //les voix n'existent pas et le patch est vieux
		{
			$('#installPatch').html("MàJ patch et installer voix");
		}
	} else {
		if (currentState.voicePatchToBeInstalled){
			$('#installPatch').html("Installer les voix");
		}
		else{
			$('#installPatch').addClass("disabled");
		}
		
	}
	
    
    $('#versionPatchInstalle').html('   ' + currentState.userVersion);
    $('#versionPatchDispo').html('   ' + gameLoaded['patchVersion']).css('color', color);

	
}

function getCurrentState(){
	
	const vp = isVoicePatchInstalled();
	
	let userVersion = "Aucune"
	if (installationPath !== null){
		
		const versions_path = installationPath + "/data_fr/system/versions.json";
		if(fs.existsSync(versions_path)){
			versions = require(versions_path);
			userVersion = versions['current_patch_id'];
		} 
			
	}
    let availableVersion = gameLoaded['patchVersion']
    let compare = compareVersions(userVersion, availableVersion);
	
	
	const state = {
		voicePatchToBeInstalled: false,
		patchState: 0,
		userVersion: userVersion,
	};

	if ((vp == false) && (document.getElementById('checkBox').checked)){
		//besoin d'installer le patch des voix
		state.voicePatchToBeInstalled = true
	}
	
	if (userVersion == "Aucune"){
		state.patchState = 1;
	}
	else {
		if (compare == 1){
			state.patchState = 2; 
		}
		else if (compare == 3)
		{
			state.patchState = 0;
		}
	}
	return state;
}



async function downloadAndExtractZip(name, ID, gaugeObject, outputFolder) {
    gaugeObject.html("Récupération des infos sur " + name + "...");
    const url = 'https://www.googleapis.com/drive/v3/files/' + ID + '?key=' + config['ApiGD'];

    try {
        const resultatWebVoices = await getFetch(url, 'GET', {}, false);
        if (resultatWebVoices['error'] !== undefined) {
            gaugeObject.html('Erreur ' + resultatWebVoices['error']['code']).css('background', '#ff000080');
            return;
        }
		drawGauge(0,gaugeObject);
        gaugeObject.html("Récupération du zip de " + name + ".");

        const res = await fetch(url + '&alt=media', { agent });
        const fileLength = parseInt(res.headers.get("Content-Length" || "0"), 10);
		
		let currentDir = __dirname;
		
		if (currentDir.endsWith('.asar'))
			currentDir = path.dirname(currentDir); //in a portable build dirrname is an archive so the download will fail
		
        const zipFilePath = currentDir + directorySeparator + resultatWebVoices['name'];

        let seconds = 0.0;
        let inter = setInterval(() => {
            seconds += 0.01;
        }, 10);

        let written = 0;
        let lastWritten = 0;
        let speed = 0;

        let calculSpeed = setInterval(() => {
            speed = written - lastWritten;
            lastWritten = written;
        }, 1000);

        const fileStream = fs.createWriteStream(zipFilePath);
        
        gaugeObject.html('');
        await new Promise((resolve, reject) => {
            res.body.pipe(fileStream);

            res.body.on('data', data => {
                written += data.length;
                const percent = (written / fileLength) * 100;
                drawGauge(percent,gaugeObject);
                gaugeObject.html('Téléchargement - ' + percent.toFixed(2) + '% (' + formatBytes(speed) + ')');
            });

            res.body.on('error', err => {
                console.error('ERREUR : ' + err);
                gaugeObject.html('Téléchargement interrompu !').css('background', '#ff000080');
                reject(err);
            });

            fileStream.on('finish', resolve);
        });
        clearInterval(inter);
        clearInterval(calculSpeed);
        await fct(zipFilePath, outputFolder, gaugeObject);

        fs.unlink(zipFilePath, (err) => {
            if (err) {
                throw err;
            }
        });
		$('#installPatch').removeClass("disabled");
		$('#uninstallAll').removeClass("disabled");

    } catch (error) {
        console.error('Error:', error);
    }
}

// Lancé quand on appuie sur le bouton "Désinstaller"
function uninstall() {

    if($('#uninstallAll').hasClass('disabled'))
        return;
	$('#uninstallAll').addClass("disabled");
	
    const paths = gameLoaded['toBeUninstalled']
	var countFile = 0;
	for (var filePath of paths) {
		
		fullPath = installationPath + directorySeparator + filePath;
		try {
			// Check if the path exists
			const exists = fs.existsSync(fullPath);

			if (exists) {
				const stats = fs.statSync(fullPath);

				if (stats.isDirectory()) {
					fs.rmdirSync(fullPath, { recursive: true });
					console.log(`Removed folder: ${filePath}`);
				} else {
					fs.unlinkSync(fullPath);
					console.log(`Removed file: ${filePath}`);
				}

				// Update gauge after each removal
				drawGauge(countFile/paths.length, $('#projectBar'));
				$('#projectBar').html(filePath + " supprimé");
			} else {
				console.log(`Path does not exist: ${filePath}`);
			}
			countFile = countFile + 1;
		} catch (error) {
			console.error(`Error removing ${filePath}: ${error.message}`);
		}
    }
	
    // On désactive le bouton de désinstallation
    
    

    // On affiche dans la jauge que tout est ok
    drawGauge(100,$('#projectBar'));
    $('#projectBar').html('Patch supprimé !');
    
	currentState = getCurrentState(); // on actualise l'état
	updateGUI(currentState);
}

function isSteamRunning() {
    const platform = process.platform;
    let query = '';

    switch (platform) {
        case 'win32': query = 'steam.exe'; break;
        case 'darwin': query = 'Steam.app'; break;
        case 'linux': query = 'steam'; break;
        default:
            // Unsupported platform
            return false;
    }

    let cmd = '';

    switch (platform) {
        case 'win32': cmd = 'tasklist'; break;
        case 'darwin': cmd = `ps -ax | grep "${query}"`; break;
        case 'linux': cmd = 'ps -A'; break;
        default:
            break;
    }

    try {
        const stdout = execSync(cmd, { encoding: 'utf-8' });
        return stdout.toLowerCase().indexOf(query.toLowerCase()) > -1;
    } catch (err) {
        // Handle errors if any (e.g., command not found)
        return false;
    }
}

// Lancé quand on appuie sur le bouton "Installer/Mise à jour"
async function downloadFiles() {
	
	var currentState = getCurrentState(); // on recheck l'état des fois que ça ait changé en dehors de l'installateur
	console.log(currentState)
	updateGUI(currentState);
	
    // Si le bouton "Installer" est désactivé, on ne fait rien
    if($('#installPatch').hasClass('disabled'))
        return;
	
    $('#installPatch').addClass("disabled");
	$('#uninstallAll').addClass("disabled");
	
	// Avant toute chose en fait, il faut vérifier qu'on est sous Steam Deck pour override la dll dinput8 système avec notre dll ; 
	//Note : on peut la faire pour tous les jeux, c'est pas grave (s'il la trouve pas à l'intérieur du dossier il fallback sur celle de wine)
	//Note 2 : Quand Steam est ouvert il ne calcule plus localconfig.vdf (a priori il édite un fichier sur le cloud), et quand Steam est fermé 
	//localconfig est remplacé par la version sur le cloud. Ce qui veut dire que si Steam est ouvert, impossible d'ajouter de LaunchOption pour override
	//la dll puisqu'elle sera synchronisée avec le cloud à la prochaine fermeture (et de toute façon le changement sera pas effectif vu que Steam ne calcule 
	//que le cloud tant qu'il est ouvert (Système de merde)
	//la seule solution : fermer d'abord Steam puis éditer le vdf.
	//dans ce cas il devrait appliquer la LaunchOption au fichier sur le cloud au démarrage.
	//Note 3 : la moindre erreur dans le fichier vdf conduit Steam à supprimer la section problématique (ex : mettre des " à l'intérieur de " pour un string)
	if (isRunningOnSteamDeck()){//
		const steamUserFolder = "/home/deck/.local/share/Steam/userdata"
		//const steamUserFolder = "C:\\Program Files (x86)\\Steam\\userdata"
		const files = fs.readdirSync(steamUserFolder, { withFileTypes: true });
		
		
		for (const file of files)  {
			const fullPath = path.join(steamUserFolder, file.name);

			if (file.isDirectory()) {
				const userID = file.name;
				
				if (isSteamRunning()){
					var giveUp = false;
					await new Promise((resolve) => {
						openWindow('steamWarning');

						// You can resolve the Promise when the user clicks "Je continue" or "Abandonner"
						// For example, you can have a button click event that resolves the Promise

						// Example using a button click event
						document.getElementById('continueButton').addEventListener('click', () => {
							closeWindow('steamWarning');
							resolve();
						});

						document.getElementById('giveUpButton').addEventListener('click', () => {
							giveUp = true;
							closeWindow('steamWarning');
							$('#installPatch').removeClass("disabled");
							$('#uninstallAll').removeClass("disabled");
							currentState = getCurrentState(); // on actualise l'état
							updateGUI(currentState);
							resolve();
							
							
						});
					});
					if ((giveUp)) return;
					
					const command = process.platform === 'win32' ? 'taskkill' : 'pkill';
					const args = process.platform === 'win32' ? ['/F', '/IM', 'steam.exe'] : ['steam'];

					const steamProcess = spawn(command, args);

					steamProcess.on('close', (code) => {
					  if (code === 0) {
						console.log('Steam has been closed successfully.');
						// Proceed with your code after Steam is closed.
					  } else {
						console.error(`Failed to close Steam. Exit code: ${code}`);
					  }
					});

					steamProcess.on('error', (err) => {
					  console.error(`Error while trying to close Steam: ${err.message}`);
					});
				}

				const vdfFilePath = steamUserFolder + directorySeparator + userID + directorySeparator + "config" + directorySeparator + "localconfig.vdf";
				
				const vdfContent = fs.readFileSync(vdfFilePath, 'utf8');
				// Parse the .vdf content
				const parsedData = VDF.parse(vdfContent);
				
				parsedData.get('UserLocalConfigStore')
				.get('Software')
				.get('Valve')
				.get('Steam')
				.get('apps')
				.get(String(gameLoaded['steamId']))
				.set('LaunchOptions', "WINEDLLOVERRIDES=\\\"dinput8=n,b\\\" %command%");
				// Serialize the modified data back to .vdf format
				const updatedVDFContent = VDF.stringify(parsedData, true);
				//
				//// Write the updated content back to the .vdf file
				fs.writeFileSync(vdfFilePath, updatedVDFContent, 'utf8');
			}
		}
	}
	
	
	
    // On obtient d'abord les infos du fichier, tel que son nom et son poids
	await downloadAndExtractZip("patch", gameLoaded['patchID'],$('#projectBar'), $('.filePath').html());
	if($('#checkBox').is(':checked') && gameLoaded['voicesID'] != ""){
		if (currentState.voicePatchToBeInstalled)
			await downloadAndExtractZip("mod des voix", gameLoaded['voicesID'],$('#projectBar'), $('.filePath').html());
		await downloadAndExtractZip("scénario doublé", gameLoaded['voicedScriptID'],$('#projectBar'), $('.filePath').html());
	}
	
    // On enregistre la version du patch installé ; on sauvegarde aussi les infos utilisateur en local (Dans %APPDATA%/config.json)
    dataUser['projects'][gameLoaded['name']]['patch'] = gameLoaded['patchVersion'];
    writeConfig();

    // On met à jour la version du patch installé sur la page
    $('#versionPatchInstalle').html('   ' + gameLoaded['patchVersion']);
    $('#versionPatchDispo').css('color', '#ffffff');

    // On affiche dans la jauge que tout est ok
    drawGauge(100,$('#projectBar'));
    $('#projectBar').html('Patch téléchargé et installé !');
    console.log("Patch téléchargé et extrait !");

    // On a terminé ! Bravo !
	
	$('#installPatch').removeClass("disabled");
	$('#uninstallAll').removeClass("disabled");
	
	currentState = getCurrentState(); // on actualise l'état
	updateGUI(currentState);
}

function isVoicePatchInstalled(){
	return fs.existsSync(installationPath + "/voice/ed_voice.dll");
}
	
// Permet d'extraire les archives .zip
// TO-DO : Voir pour mettre un mot de passe aux archives, pour éviter le vol (?)
async function fct(pathAbs, outputFolder, gaugeObject){

    // Le chemin absolu (F:/mon_dossier/mon_sous_dossier/fichier.zip) de l'archive .zip
    const zipFilePath = pathAbs;

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
		  
          var targetFile = outputFolder + directorySeparator + entry.fileName;
		  targetFile = targetFile.replace('/', directorySeparator);
			
          if (entry.fileName.endsWith('/')) {
			
            fs.mkdirSync(targetFile, { recursive: true });
            zipfile.readEntry();
          } else {
			var parent_folder = targetFile.substring(0, targetFile.lastIndexOf(directorySeparator));
			console.log("creating "+ targetFile)
			if (!fs.existsSync(parent_folder)) {
				console.log("creating "+ parent_folder)
				fs.mkdirSync(parent_folder, { recursive: true });
            }
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) throw err;
              
              readStream.on('data', (chunk) => {
                bytesRead += chunk.length;
                const progressPercentage = Math.round((bytesRead / totalEntriesBytes) * 100);
                gaugeObject.html(progressPercentage + '%');
                drawGauge(progressPercentage,gaugeObject);
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
function drawGauge(percent = 0, gaugeObject)
{
    if(percent < 0) percent = 0;
    if(percent > 100) percent = 100;

    gaugeObject.css("background", "linear-gradient(to right, #3DB9F5 " + percent/2 + "% , #48b2e5 " + percent + "%, transparent 1%)");
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
const { execSync } = require('child_process');

function getRegistryValue(regKey, data) {
  try {
    // Execute the REG QUERY command synchronously
    const commandOutput = execSync(`REG QUERY "${regKey}" /v "${data}"`, { encoding: 'utf8' });

    // Check if the key exists
    const match = commandOutput.match(/REG_SZ\s+(.*)/);
    if (match) {
      const pathValue = match[1].trim();
      return pathValue;
    } else {
      // Registry key not found, GOG installation not detected
      return null;
    }
  } catch (error) {
    // Handle errors, such as when the registry key is not found
    return null;
  }
}

// TO-DO refactoriser la fonction, car celle-ci est vieille et peu optimisée !
// Crédits : Ashley A. Sekai (C.R.X.)
function getGivenGame(game) {
  let i = 0;

  if (process.platform === 'win32') {
    const steamRegistryKey = `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ${game['steamId']}`;
    const installationPath = getRegistryValue(steamRegistryKey, 'InstallLocation');
    if (installationPath !== null) {
      return installationPath;
    } else {
      const gogRegistryKey = `HKEY_LOCAL_MACHINE\\SOFTWARE\\GOG.com\\Games\\${game['GOGId']}`;
      const gogInstallationPath = getRegistryValue(gogRegistryKey, 'path');

      if (gogInstallationPath !== null) {
        return gogInstallationPath;
      } else {
        const pathsToCheck = [
          "C:\\Program Files\\",
          "C:\\Program Files (x86)\\",
        ];

        for (const path of pathsToCheck) {
          if (fs.existsSync(path + game['steamFolderName'])) {
            return path + game['steamFolderName'];
          }
        }
      }
    }
  } else if (isRunningOnSteamDeck()) { //On va juste gérer le steam deck, le reste c'est trop chiant
    const list = [];

    if (!fs.existsSync('/home/deck/.local/share/Steam/steamapps/libraryfolders.vdf')) {
      list[0] = '/home/deck/.local/share/Steam/steamapps/common';
      list[1] = '/home/steam/.local/share/Steam/steamapps/common';
      list[2] = '/run/media/mmcblk0p1/steamapps/common';
    } else {
      const listing = fs.readFileSync('/home/deck/.local/share/Steam/steamapps/libraryfolders.vdf').toString().split('"path"		');
      listing.forEach((value, index) => {
        if (index > 0) {
          list[i] = value.split('"')[1] + '/steamapps/common';
          i++;
        }
      });
    }
    for (const path of list) {
      if (fs.existsSync(path + game['steamFolderName'])) {
        return path + game['steamFolderName'];
      }
    }
  }
  else{
		console.log("OS incompatible");
  }

  return null; // Return null if no suitable path is found
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

async function installUpdate() {
	const popupContent = document.querySelector('.popup-content');
	// Hide the buttons and show the loading bar container
	document.querySelectorAll('.popup-content button').forEach(button => {
	button.style.display = 'none';
	});
	document.getElementById('loadingBarContainer').style.display = 'block';
	let currentDir = process.env.PORTABLE_EXECUTABLE_DIR;
	await downloadAndExtractZip("installateur", config['setupID'],$('#loadingBar'), currentDir);
	drawGauge(100,$('#loadingBar'));
	$('#loadingBar').html("Mise à jour terminée !");
	const closeButton = document.createElement('button');
	closeButton.textContent = 'Fermer';
	closeButton.onclick = () => {
	  closeWindow('popupContainer'); 
	};
	
	popupContent.appendChild(closeButton);
}

function isRunningOnSteamDeck() {
	try {
	let os = require("os");
	let info = `${os.type()} ${os.release()} ${os.platform()}`.toLowerCase();
	let list = ["valve", "steam"];
	return info.includes("linux") && list.some(x => info.includes(x));
	} catch (e) {
	return false;
	}
}
function openWindow(windowID){
	document.getElementById(windowID).style.display = 'flex';
}
function closeWindow(windowID) {
  document.getElementById(windowID).style.display = 'none';
}
function changeImageByPath(imagePath) {
    document.getElementById('helpButton').src = "./images/" + imagePath;
}

//demandé par Aisoce : toutes les popup qui sont juste informatives, on doit pouvoir les fermer en cliquant dans le vide
window.onclick = function(event) {
  var modalIds = ["HelpWindow", "InfoWindow"];

  for (var i = 0; i < modalIds.length; i++) {
    var modal = document.getElementById(modalIds[i]);
    if (modal && event.target == modal) {
      modal.style.display = "none";
    }
  }
}

	
	
function openinDefaultBrowser(url) {
    shell.openExternal(url);
}
function onChangePath() {
    installationPath = document.getElementById("file").files[0].path
	const stats = fs.statSync(installationPath);

	if (stats.isFile()) {
	  installationPath = path.dirname(installationPath);
	}
	
	console.log(installationPath)
	currentState = getCurrentState(); // on actualise l'état
	updateGUI(currentState);
	$('.filePath').removeClass("noPath").addClass("okPath").html(installationPath);
}
function onChangeCheckbox() {
    currentState = getCurrentState(); // on actualise l'état
	updateGUI(currentState);
}