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
const svgpanzoom = require('svg-pan-zoom')
const {shell} = require('electron');
const remote = require('@electron/remote');
const dialog = remote.dialog;

// Variables globales
var busy = false;
var currentState;
var config;
var projectsList;
var currentTrailsMode = "classic";
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
var counting = false;
var isRunningOnDeck = false;

var isDragging = false;
var initialX = 0;
var initialY = 0;

loadingEvents.on('loaded', async () => {
    // Affiche la fenêtre principale en fondu d'ouverture (Default : 1000ms/1s)
    $('.mainWindow').animate({
        opacity: 1
    }, 1000);
});


function areWeOnDeck(){
	
	if (!(process.platform === 'win32' && os.homedir() != 'C:\\users\\steamuser')) 
		return true;
}


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
	isRunningOnDeck = areWeOnDeck();
    let version = require('./package.json');
    
	//$('.setupVersion').html('Version de l\'installateur : ' + os.homedir() + " " + process.platform);
    $('.footer').html(config["footerText"]); // On affiche le message du footer
	
	//Par défaut, toujours afficher le mode Trails, mais on charge les jeux rétros pour se préparer au cas où l'utilisateur change de mode
	
	createClassicMenu("trails"); 
	createClassicMenu("retro"); 
	
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
	if ($('#modeTrails').hasClass('active')){
		if (currentTrailsMode == "map"){
			
			menu = $('#map-svg');
			
		}
		$('#trailsModeButton').css('display', 'none');
	}
    else
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

	
    $('#checkVoice').css("display", "block");
    $('#projectBar').css("background", "linear-gradient(to right, #3DB9F5 0%, #3df5c2 0%, #3DB9F500 0%)");
    $('#projectBar').html("");

    $('#file').prop('disabled', false);

    $('.filePath').html("Dossier \"" + gameLoaded['steamFolderName'] + "\" non trouvé.");
    $('.filePath').addClass("noPath");
	
	updateDownloads();
    // On essaye de trouver où se trouve le jeu, si l'utilisateur l'a d'installé sur Steam
	if (installationPath == null)
		installationPath = getGivenGame(gameLoaded)

	/*
	Soit le patch n'est pas installé, les voix non plus, la case des voix n'est pas cochée => on installe que le patch (scénario le plus simple)
	Soit rien n'est installé mais la case voix est cochée => on installe voix + patch
	soit les voix sont installées mais pas le patch => on installe le patch
	soit le patch est installé mais pas les voix, mais la case est cocheé => on installe les voix
	si y a un problème à un quelconque moment l'utilisateur peut cliquer sur un bouton désinstaller qui va enlever voix et patch (table rase). ensuite il pourra cocher la case des voix et installer et ça lui donnera voix et patch*/
    console.log("a");
	onChangePath();
	updateCurrentState(); // on actualise l'état
	updateGUI();
	
    menu.animate({
        opacity: 0
    }, config["speedAnimation"]);
	
    setTimeout(function(){
        $('.displayGame').css('display', 'block').animate({
        opacity: 1
    }, {
        duration: config["speedAnimation"],
        complete: function() {
            // Callback function executed after the animation is complete
            // Hide the menu
			console.log("b");
            menu.css('display', 'none');
			$('.map-tooltip').css('display', 'none');
        }
    });
    }, config["speedAnimation"]);
	
}

function updateDownloads(){
	
	var dls;
	const get_url = config["domain"] + "/get_download_count.php";
    const data = { "name": gameLoaded["name"] };
	$('#nbDls').html('   ');
	getFetch(get_url, "POST", data, false, asy = true)
    .then(response => {
        const dls = response.downloadCount;
        $('#nbDls').html('   ' + dls);
    })
    .catch(error => {
        console.error('Error:', error);
		dls = null;
    });
	
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
	
	$('#trailsModeButton').css('display', 'block');
	if ((currentTrailsMode == "map") && ($('#modeTrails').hasClass('active'))) // Si le mode "Trails" est actif
    {
		$('#map-svg').css('display', 'block');
		
	}
	
}

// Change l'image affichée ; mettre un nombre négatif pour afficher l'image précédente
function changeImage(num = 1)
{
	event.stopPropagation();
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
        if (timeDifference < 60 * 60 * 1000) { // Less than 1 hour
            // Calculate minutes and seconds remaining
            const minutes = Math.floor(timeDifference / (1000 * 60));
            const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);

            // Create a formatted string
            const resultString = `Dans ${minutes} minutes et ${seconds} secondes`;
            return resultString;
        } else if (timeDifference < 24 * 60 * 60 * 1000) { // Less than 24 hours
            // Calculate hours and minutes remaining
            const hours = Math.floor(timeDifference / (1000 * 60 * 60));
            const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));

            // Create a formatted string
            const resultString = `Dans ${hours} heures et ${minutes} minutes`;
            return resultString;
        } else {
            // Calculate days and hours remaining
            const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

            // Create a formatted string
            const resultString = `Dans ${days} jours et ${hours} heures`;
            return resultString;
        }
    } else {
        return "";
    }
}

function calculateAndDisplayTimeRemaining(targetDate) {
    // Function to calculate the remaining time and update the display
    function updateDisplay() {
        const remainingTime = calculateTimeRemaining(targetDate);
        
		if (counting){
			if (remainingTime == ""){
				updateCurrentState();
				updateGUI();
				counting = false;
			}
			else
				$('#installPatch').html(remainingTime);
		}
    }

    // Set up a setInterval to refresh the display every second
    const intervalId = setInterval(() => {
        if (!counting) {
            clearInterval(intervalId); // Stop the interval if the button state changes
			
        } else {
            updateDisplay(); // Otherwise, update the display
        }
    }, 1000);

    // Optionally, you can return the intervalId if you want to be able to clearInterval later
    return intervalId;
}

async function updateGUI(){
	let color = "#6CDC3D";
	if (!currentState.isThereACountdown){
		counting = false;
		
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
			$('#installPatch').html("Lancer le jeu");
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
			
			if (!busy)
				$('#installPatch').removeClass("disabled");
			$('#installPatch').html("Préinstaller les voix");
			counting = false;
		}
		else{
			$('#installPatch').addClass("disabled");
			if (!counting)
				calculateAndDisplayTimeRemaining(gameLoaded["releaseDate"]);
			counting = true;
		}
		
	}
    
    $('#versionPatchInstalle').html('   ' + currentState.userVersion);
    $('#versionPatchDispo').html('   ' + gameLoaded['patchVersion']).css('color', color);
	
	
}

function updateCurrentState(){
	
	const vp = isVoicePatchInstalled();
	let releaseDate = "";
	
	let userVersion = "Aucune"
	if (installationPath !== null){
		
		const versions_path = installationPath + "/data_fr/system/versions.json";
		
		if(fs.existsSync(versions_path)){
			delete require.cache[require.resolve(versions_path)];
			versions = require(versions_path);
			userVersion = versions['current_patch_id'];
			$('#versionPatchInstalle').html('   ' + userVersion);
		} 
			
	}
    let availableVersion = gameLoaded['patchVersion']
    let compare = compareVersions(userVersion, availableVersion);
	
	
	const state = {
		voicePatchToBeInstalled: false,
		patchState: 0,
		userVersion: userVersion,
		isThereACountdown: false
	};
    
	if (gameLoaded.hasOwnProperty('releaseDate')){
		releaseDate = new Date(gameLoaded['releaseDate']);	
		if (!isNaN(releaseDate.getTime()))
		{
			let remainingTime = calculateTimeRemaining(releaseDate);
			if (remainingTime != ""){
				$('#installPatch').html(remainingTime);
				state.isThereACountdown = true;
			}
		}
	}
	
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
	currentState = state;
}



async function downloadAndExtractZip(name, ID, gaugeObject, outputFolder) {
    gaugeObject.html("Récupération des infos sur " + name + "...");
    const url = config["domain"] + "/" + ID;
	const filenameWithExtension = path.basename(url);
	busy = true;
    try {
		drawGauge(0,gaugeObject);
        gaugeObject.html("Récupération du zip de " + name + ".");

        const res = await fetch(url);
        if(!res['ok'])
        {
            try 
            {
                const result = await res.json();
                if(result['error']['errors'][0]['reason'] == "downloadQuotaExceeded")
                    gaugeObject.html('Quota de téléchargement du fichier atteint.').css('background', '#ff000080');
                else
                    gaugeObject.html('Erreur inconnue | ' + result['error']['errors'][0]['reason']).css('background', '#ff000080');
            }
            catch (error)
            {
                gaugeObject.html('Erreur inconnue | ' + error).css('background', '#ff000080');
                console.log(error);
            }

            return;
        }
        const fileLength = parseInt(res.headers.get("Content-Length" || "0"), 10);
		
		let currentDir = __dirname;
		
		if (currentDir.endsWith('.asar'))
			currentDir = path.dirname(currentDir); //in a portable build dirrname is an archive so the download will fail
		
        const zipFilePath = currentDir + directorySeparator + ID;

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
        console.log(res);

        const fileStream = fs.createWriteStream(zipFilePath);
        gaugeObject.html('');
        await new Promise((resolve, reject) => {
            res.body.pipe(fileStream);

            res.body.on('data', data => {
                written += data.length;
                const percent = (written / fileLength) * 100;
                drawGauge(percent,gaugeObject);
                gaugeObject.html(filenameWithExtension + '- ' + percent.toFixed(2) + '% (' + formatBytes(speed) + ')');
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
				gaugeObject.html('Erreur sup de ' + zipFilePath).css('background', '#ff000080');
				return false;
            }
        });
		return true;

    } catch (error) {
		gaugeObject.html('Erreur ' + error ).css('background', '#ff000080');
		busy = false;
		return false;
    }
	busy = false;
}

// Lancé quand on appuie sur le bouton "Désinstaller"
async function uninstall() {
	var result = true;
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
			result = false;
			console.error(`Error removing ${filePath}: ${error.message}`);
		}
    }
    
    $('#uninstallAll').removeClass("disabled");

    // On affiche dans la jauge que tout est ok
	if (result){
		drawGauge(100,$('#projectBar'));
		$('#projectBar').html('Patch supprimé !');
	}
	else{
		drawGauge(0,$('#projectBar'));
		$('#projectBar').html('Erreur');
	}
    
    
	updateCurrentState(); // on actualise l'état
	updateGUI();
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
        console.log(err);
        return false;
    }
}
function writeRegistryValue() {
    regedit.putValue({
      [regKey]: {
        [regValueName]: {
          value: regValue,
          type: 'REG_SZ',
        },
      },
    }, (err) => {
      if (err) {
        console.error('Error writing registry value:', err);
      } else {
        console.log('Registry value written successfully.');
      }
    });
  }
// Lancé quand on appuie sur le bouton "Installer/Mise à jour"
async function downloadFiles() {
	
	updateCurrentState(); // on recheck l'état des fois que ça ait changé en dehors de l'installateur
	updateGUI();
	
    // Si le bouton "Installer" est désactivé, on ne fait rien
    if($('#installPatch').hasClass('disabled'))
        return;
	$('#projectBar').css("display", "block");
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
	if (isRunningOnDeck){
  
		const fs = require('fs');

		var nextStepRequired = SDeckUpdateRegistry();
		
		if (nextStepRequired){
			const steamUserFolder = "Z:\\home\\deck\\.local\\share\\Steam\\userdata"
			try{
				const files = fs.readdirSync(steamUserFolder, { withFileTypes: true });
				
				console.log("On regarde là-dedans dans un premier temps :", steamUserFolder);
				for (const file of files)  {
					const fullPath = path.join(steamUserFolder, file.name);
					
					if (file.isDirectory()) {
						const userID = file.name;
						var giveUp = false;
						//Note : aucun moyen de communiquer avec proton depuis wine (si j'ai bien compris), enfin entre Linux et le Windows sur lequel tourne l'installateur, du coup je peux pas fermer Steam tout seul, du coup on demande à l'utilisateur
						await new Promise((resolve) => {
							openWindow('steamWarning');

							document.getElementById('continueButton').addEventListener('click', () => {
								closeWindow('steamWarning');
								resolve();
							});

							document.getElementById('giveUpButton').addEventListener('click', () => {
								giveUp = true;
								closeWindow('steamWarning');
								$('#installPatch').removeClass("disabled");
								$('#uninstallAll').removeClass("disabled");
								updateCurrentState(); // on actualise l'état
								updateGUI();
								resolve();
								
								
							});
						});
						if ((giveUp)) return;
						

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
			catch(err){
				console.log(err); //si même cette étape foire, je peux plus rien pour vous
			}
		}
	}
	
	
	let result = true;
    // On obtient d'abord les infos du fichier, tel que son nom et son poids
	if ((!currentState.isThereACountdown) && (currentState.patchState != 0)){
		
		for (let i = 0; i < gameLoaded['patchFilenames'].length; i++) {
			const filename = gameLoaded['patchFilenames'][i];
			result = result && await downloadAndExtractZip("patch", filename, $('#projectBar'), $('.filePath').html());
		}
		if (result)
			incrementDownloadCount(gameLoaded['name']);
	}
	if($('#checkBox').is(':checked')){
		if (currentState.voicePatchToBeInstalled){
			for (let i = 0; i < gameLoaded['voicesFilenames'].length; i++) {
				const filename = gameLoaded['voicesFilenames'][i];
				result = result && await downloadAndExtractZip("mod des voix", filename, $('#projectBar'), $('.filePath').html());
			}
		}
		if (!currentState.isThereACountdown){
			for (let i = 0; i < gameLoaded['voicedScriptFilenames'].length; i++) {
				const filename = gameLoaded['voicedScriptFilenames'][i];
				result = result && await downloadAndExtractZip("scénario doublé", filename, $('#projectBar'), $('.filePath').html());
			}
		}
	}
	
    // On enregistre la version du patch installé ; on sauvegarde aussi les infos utilisateur en local (Dans %APPDATA%/config.json)
    dataUser['projects'][gameLoaded['name']]['patch'] = gameLoaded['patchVersion'];
    writeConfig();

    // On met à jour la version du patch installé sur la page
    $('#versionPatchInstalle').html('   ' + gameLoaded['patchVersion']);
    $('#versionPatchDispo').css('color', '#ffffff');

    // On affiche dans la jauge que tout est ok
	if (result){
		drawGauge(100,$('#projectBar'));
		$('#projectBar').html('Patch téléchargé et installé !');
	
	}
    

    // On a terminé ! Bravo !
	
	$('#installPatch').removeClass("disabled");
	$('#uninstallAll').removeClass("disabled");
	
	updateCurrentState(); // on actualise l'état
	updateGUI();
	updateDownloads();
}

function isVoicePatchInstalled(){
	return fs.existsSync(installationPath + "/voice/ed_voice.dll");
}
function removeTheAbomination(){
	var theAbomination = installationPath + "/voice/scena";
	if (fs.existsSync(theAbomination))
		fs.rmdirSync(theAbomination, { recursive: true });
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
			if (!fs.existsSync(parent_folder)) {
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
async function getFetch(url, method = "POST", args = {}, json = true, asy = false){
	let result;

    result = await $.ajax({
        url: url,
        type: method,
        data: args,
        async: asy,
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
  const list = [];
  
  if (!isRunningOnDeck) {
    //const steamRegistryKey = `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App ${game['steamId']}`;
	const steamRegistryKey = "HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Valve\\Steam"
    //const installationPath = getRegistryValue(steamRegistryKey, 'InstallLocation');
	const steamPath = getRegistryValue(steamRegistryKey, 'InstallPath'); //Un truc style C:\Program Files (x86)\Steam
	if (steamPath !== null){
		const libraryvdf = steamPath + directorySeparator + "steamapps" + directorySeparator + "libraryfolders.vdf";
		const vdfContent = fs.readFileSync(libraryvdf, 'utf8');
			const parsedData = VDF.parse(vdfContent);
			
			const pathx = parsedData.get('libraryfolders')
			
			let i = 0;
			for (const [outerKey, outerValue] of pathx) {
				var p = outerValue.get('path');
				
				if (outerValue instanceof Map) {
					list[i] = p + directorySeparator + 'steamapps' + directorySeparator + 'common' + directorySeparator + game['steamFolderName'];
				} 
				i++;
			}
	}
	if (list.length == 0){
		const gogRegistryKey = `HKEY_LOCAL_MACHINE\\SOFTWARE\\GOG.com\\Games\\${game['GOGId']}`;
		const gogInstallationPath = getRegistryValue(gogRegistryKey, 'path');

		if (gogInstallationPath !== null) {
			list.push(gogInstallationPath)
		} else {
			list.push("C:\\Program Files\\" + game['steamFolderName']);
			list.push("C:\\Program Files (x86)\\" + game['steamFolderName']);
		}
	}
  } else {
		
		const vdfFilePath = 'Z:\\home\\deck\\.local\\share\\Steam\\steamapps\\libraryfolders.vdf';
		//const vdfFilePath = "C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf";
		
		if (!fs.existsSync(vdfFilePath)) {
		  list[0] = 'Z:\\home\\deck\\.local\\share\\Steam\\steamapps\\common\\'+ game['steamFolderName'];
		  list[1] = 'Z:\\home\\steam\\.local\\share\\Steam\\steamapps\\common\\'+ game['steamFolderName'];
		  list[2] = 'Z:\\run\\media\\mmcblk0p1\\steamapps\\common\\'+ game['steamFolderName'];
		  list[3] = 'Z:\\home\\deck\\.local\\share\\Steam\\steamapps\\common\\' + game['steamFolderName'];
		} else {
			
			const vdfContent = fs.readFileSync(vdfFilePath, 'utf8');
			const parsedData = VDF.parse(vdfContent);
			
			const pathx = parsedData.get('libraryfolders')
			
			let i = 0;
			for (const [outerKey, outerValue] of pathx) {
				console.log(`Outer key: ${outerKey}`);
				var p = outerValue.get('path');
				p = p.replace(/\//g, '\\');
				p = 'Z:' + p;
				
				if (outerValue instanceof Map) {
					list[i] = p + directorySeparator + 'steamapps' + directorySeparator + 'common' + directorySeparator + game['steamFolderName'];
				} 
				i++;
			}
			
			
		}
		
  }
  for (const path of list) {

		var fullpath = path;
		console.log("On teste " + fullpath);
		if (fs.existsSync(fullpath)) {
			return fullpath;
	  }
	}
  return "Jeu non détecté. Cliquez ici pour spécifier son emplacement."; // Return null if no suitable path is found
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
  var modalIds = ["popupContainer","HelpWindow", "InfoWindow","errorwindow","gamePictureModal"];

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
    // Now you have the selected folder path
	try {
		if (installationPath) {
			const stats = fs.statSync(installationPath);
		
			if (!stats.isDirectory()) {
				$('.filePath').addClass("noPath").html(installationPath);;
			} 
			
			$('.filePath').removeClass("noPath").addClass("okPath").html(installationPath);
		}
		else{
			$('.filePath').addClass("noPath").html(installationPath);;
		}
	} catch (error) {
		$('.filePath').addClass("noPath").html(installationPath);;
		}
	updateCurrentState(); // on actualise l'état
	updateGUI();
}
function onChangeCheckbox() {
    updateCurrentState(); // on actualise l'état
	updateGUI();
}

function playButton() {
	removeTheAbomination();
	currentPath = $('.filePath').html();
	console.log(currentPath);
	try{
		const stats = fs.statSync(currentPath);
		if (!stats.isDirectory()) {
			openWindow('errorwindow');
			return;
		} 
	}
    catch (error) {
		openWindow('errorwindow');
		return;
	}
	
	if (!(currentState.voicePatchToBeInstalled) && (currentState.patchState == 0)){
		const gamePath = $('.filePath').html() + directorySeparator + gameLoaded["exe_name"];

        // Use spawn to execute the game
        const gameProcess = spawn(gamePath, [], { detached: true, stdio: 'ignore' });

        // Detach the child process and let it run independently
        gameProcess.unref();
	}
	else
	{
		downloadFiles();
	}
}

let markersCreated = false;


function createMap() {
	
	let svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgElement.setAttribute("id", "map-svg");

    // Append the SVG element to the "mainMenu" div
    const mainMenuElement = document.getElementById("mainMenu");
	const firstChild = mainMenuElement.firstChild;
	mainMenuElement.insertBefore(svgElement, firstChild);
	
    const imageElement = document.createElementNS("http://www.w3.org/2000/svg", "image");
    imageElement.setAttribute('href', './images/map_test.svg');
    imageElement.setAttribute('width', '100%');
    imageElement.setAttribute('height', '100%');

    svgElement.appendChild(imageElement);
	
	let tooltip = document.querySelector('.map_tooltip');

	if (!tooltip) {
		tooltip = document.createElement('div');
		tooltip.style.display = 'block';
		tooltip.className = 'map_tooltip';
		
		tooltip.style.left = `-9999px`;
        tooltip.style.top = `-9999px`;
		document.body.appendChild(tooltip);
	}
	let count = 0;

	// Create an object to store markers grouped by location
	const markersByLocation = {};

	Object.entries(projectsList["trails"]).forEach(([arcKey, arcValue]) => {
		// Iterate through all arcs
		Object.entries(arcValue["games"]).forEach(([gameKey, gameValue]) => {
			// Iterate through each game in the current arc

			let marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			marker.setAttribute("class", "marker"); // Add a class for identification
			marker.setAttribute("r", "11");
			marker.setAttribute("fill", '#FF0000');
			marker.setAttribute("stroke", "black");
			marker.setAttribute("stroke-width", "2");

			document.getElementById("map-svg").appendChild(marker);

			// Store game data in the Map
			const gameData = {
				gameId: gameKey,
				arcId: arcKey,
				data: gameValue
			};

			const markerDataMap = new Map();
			markerDataMap.set("gameData", gameValue);
			marker.markerDataMap = markerDataMap;

			updateMarkerColor(marker);
			
			marker.setAttribute("cx", `${gameValue.locationOnMap.x}%`);
			marker.setAttribute("cy", `${gameValue.locationOnMap.y}%`);

			marker.addEventListener('mouseenter', handleMarkerEnter);
			marker.addEventListener('mouseleave', handleMarkerLeave);
			marker.addEventListener('click', handleMarkerClick);

			// Group markers based on their location
			const locationKey = `${gameValue.locationOnMap.x}-${gameValue.locationOnMap.y}`;
			if (!markersByLocation[locationKey]) {
				markersByLocation[locationKey] = [];
			}
			markersByLocation[locationKey].push(marker);

			count = count + 1;
		});
	});
	updateMarkersOnCurrentZoom(1.0);
	
	var beforePan = function (oldPan, newPan) {
			var sizes = this.getSizes();
			var gutterWidth = sizes.width;
			var gutterHeight = sizes.height;
			var leftLimit = -((sizes.viewBox.x + sizes.viewBox.width) * sizes.realZoom) + gutterWidth;
			var rightLimit = sizes.width - gutterWidth - (sizes.viewBox.x * sizes.realZoom);
			var topLimit = -((sizes.viewBox.y + sizes.viewBox.height) * sizes.realZoom) + gutterHeight;
			var bottomLimit = sizes.height - gutterHeight - (sizes.viewBox.y * sizes.realZoom);

			var customPan = {
				x: Math.max(leftLimit, Math.min(rightLimit, newPan.x)),
				y: Math.max(topLimit, Math.min(bottomLimit, newPan.y))
			};
			return customPan;
    };
	function onZoom(currZoom) {
		updateMarkersOnCurrentZoom(currZoom);
	}

	function updateMarkersOnCurrentZoom(currZoom) {
		
		const svgContainer = document.getElementById('map-svg');

		// Obtain the width and height of the SVG container
		const svgWidth = svgContainer.clientWidth;
		const svgHeight = svgContainer.clientHeight;
	
	
		Object.values(markersByLocation).forEach(markerGroup => {
			// markerGroup is an array of markers with the same location
			const numMarkers = markerGroup.length;
	
			if (numMarkers > 1) {
			// Get the current position of the first marker
				const fixedPositionX = svgWidth * parseFloat(markerGroup[0].getAttribute('cx'))/100;
				const fixedPositionY = svgHeight * parseFloat(markerGroup[0].getAttribute('cy'))/100 ;
				
				for (let i = 1; i < numMarkers; i++) {
					// Calculate the angle based on the JSON structure or use default angle increment
					let angle;
					const gameData = markerGroup[i].markerDataMap.get("gameData");
					const angleFromJSON = gameData.angle;
			
					if (angleFromJSON !== undefined) {
						// Use the specified angle from the JSON structure
						angle = angleFromJSON;
					} else {
						// Use the default angle increment
						const angleIncrement = (2 * Math.PI) / numMarkers;
						angle = -(i - 1) * angleIncrement;
					}
			
					// Apply angle calculations to absolute coordinates
					const radius = 11 / currZoom; // Adjust radius as needed
					const newX = 2 * radius * Math.cos(angle);
					const newY = 2 * radius * Math.sin(angle);
			
					// Convert back to percentage coordinates and set the new position for each subsequent marker
					const newXPercentage = ((fixedPositionX + newX) / svgWidth) * 100;
					const newYPercentage = ((fixedPositionY + newY) / svgHeight) * 100;
			
					markerGroup[i].setAttribute('cx', `${newXPercentage}%`);
					markerGroup[i].setAttribute('cy', `${newYPercentage}%`);
				}
			}

			// Adjust the size and stroke width for each marker based on the zoom level
			markerGroup.forEach(marker => {
				const markerSize = 11; // Adjust size as needed
				marker.setAttribute('r', markerSize / currZoom);

				const strokeWidth = 2 / currZoom; // Adjust stroke width as needed
				marker.setAttribute('stroke-width', strokeWidth);
			});
		});
	}
		
	//dans un premier temps on crée le zoom/panning de la carte.
	var panZoomMap = svgPanZoom('#map-svg', {
        zoomEnabled: true,
        controlIconsEnabled: false,
        fit: 1,
        center: 1,
        zoomScaleSensitivity: 0.6,
        minZoom: 1,
        beforePan: beforePan,
		onZoom: onZoom,
		preventMouseEventsDefault: true,
		dblClickZoomEnabled: false

    });
	
	
function handleMarkerEnter(event) {
    const marker = event.target;
    const matrix = marker.getScreenCTM();
    const zoomLevel = matrix.a;

    const markerDataMap = marker.markerDataMap;
    const gameData = markerDataMap.get("gameData");

    const name = gameData.name;
    const id = gameData.id;
    const status = gameData.status;
    const inGameDate = gameData.inGameDate;
    const steamId = gameData.steamId;
    const availableLanguages = gameData.availableLanguages;
    let imageURL = steamId === -1
        ? `images/${id}.png`
        : `https://cdn.akamai.steamstatic.com/steam/apps/${steamId}/header.jpg`;

    updateMarkerColor(marker);

    marker.setAttribute('stroke', '#FFFF00');
    marker.setAttribute('stroke-width', 2 / zoomLevel);

    const mouseX = event.clientX;
    const mouseY = event.clientY;
    
	tooltip.innerHTML = `
         <h2 title="${name}">${name}</h2>
         <p style="text-align: left; font-size: 1.2em; margin-left: 15%;">
             <u>Date (Calendrier septien)</u> : ${inGameDate}<br>
             <u>Statut du patch</u> : <span style="color: ${getColorForStatus(status)};">${status}</span><br>
             <u>Langues</u> : ${availableLanguages}
         </p>
         <img src="${imageURL}" id="tooltip_image" alt="Image"/>
     `;
			
	const tooltip_img = document.getElementById('tooltip_image');
    // Add a load event listener for the image
    tooltip_img.addEventListener('load', function () {
        
            tooltip.style.display = 'block';
            positionTooltip(tooltip, marker);
       
    });

}

function updateMarkerColor(marker){
	const markerDataMap = marker.markerDataMap; 
	const gameData = markerDataMap.get("gameData"); 
	const status = gameData.status;
	
	switch (status) {
		case "Indisponible":
			marker.setAttribute('fill', '#a03030cc');
			break;

		case "Disponible bientôt":
			marker.setAttribute('fill', 'orange');
			break;

		case "Disponible":
			marker.setAttribute('fill', '#90EE90cc');
			break;

		default:
			// Handle other status conditions if needed
			marker.setAttribute('fill', '#a03030cc');
			break;
	
		
	}
}

// Helper function to get color based on patch status
function getColorForStatus(status) {
    switch (status) {
        case "Indisponible":
            return 'red';

        case "Disponible bientôt":
            return 'orange';

        case "Disponible":
            return '#90EE90ff';

        default:
            return 'black'; // Default color for other status conditions
    }
}

	function handleMarkerLeave(event) {
		const marker = event.target;
		marker.setAttribute("stroke", "black");
		tooltip.style.display = 'none';
	}

	function handleMarkerClick(event) {
		const marker = event.target;
		const gameId = marker.dataset.gameId;
		const markerDataMap = marker.markerDataMap; 
		const gameData = markerDataMap.get("gameData"); 
		if ((gameData.status == "Disponible bientôt") || (gameData.status == "Disponible"))
			openProject(type = "trails", id = gameId, game = 0);
	}

function positionTooltip(tooltip, marker) {
    const positions = [
        ["top-left", "bottom-right"],
        ["middle-top", "middle-bottom"],
        ["top-right", "bottom-left"],
        ["middle-right", "middle-left"],
        ["bottom-right", "top-left"],
        ["middle-bottom", "middle-top"],
        ["bottom-left", "top-right"],
        ["middle-left", "middle-right"]
    ];

    let bestPosition = null;
    let minSurfaceArea = Infinity;

    for (const [point1, point2] of positions) {
        const tooltipPos = calculateTooltipPosition(marker, tooltip, point1, point2);
		
		//Pour une tooltip complètement visible à l'écran, la fonction suivante doit retourner 0.
		//Sinon elle retourne la surface qui dépasse de la fenêtre, en privilégiant du coup la position qui donne la plus petite surface à l'extérieur de la fenêtre.
        const surfaceArea = calculateSurfaceAreaOutsideContainer(tooltipPos, tooltip.offsetWidth, tooltip.offsetHeight);

        if (surfaceArea < minSurfaceArea) {
            minSurfaceArea = surfaceArea;
            bestPosition = tooltipPos;
        }
    }

    if (bestPosition) {

        tooltip.style.left = `${bestPosition.left}px`;
        tooltip.style.top = `${bestPosition.top}px`;
        
    }

    return bestPosition;
}

function calculateSurfaceAreaOutsideContainer(tooltipPos, tooltipWidth, tooltipHeight) {
    const container = document.getElementById('mainMenu');
    const containerRect = container.getBoundingClientRect();

    const tooltipRect = {
        left: tooltipPos.left,
        top: tooltipPos.top,
        right: tooltipPos.left + tooltipWidth,
        bottom: tooltipPos.top + tooltipHeight
    };

    // Calculate the surface area outside the container
    const outsideLeft = Math.max(0, containerRect.left - tooltipRect.left);
    const outsideRight = Math.max(0, tooltipRect.right - containerRect.right);
    const outsideTop = Math.max(0, containerRect.top - tooltipRect.top);
    const outsideBottom = Math.max(0, tooltipRect.bottom - containerRect.bottom);

    return outsideLeft + outsideRight + outsideTop + outsideBottom;
}
function calculateTooltipPosition(marker, tooltip, point1, point2) {
	
	const safetyOffset = 10;
    const [x1, y1] = getPointCoordinates(marker, point1);
    const [x2, y2] = getPointCoordinates(tooltip, point2);

    const markerRect = marker.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width;
    const tooltipHeight = tooltipRect.height;

    let tooltipPos = {};
    switch (`${point1}-${point2}`) {
        case "top-left-bottom-right":
            tooltipPos = { top: y1 - tooltipHeight - safetyOffset, left: x1 - tooltipWidth - safetyOffset};
            break;
        case "middle-top-middle-bottom":
            tooltipPos = { top: y1 - tooltipHeight - safetyOffset, left: x1 - tooltipWidth / 2 };
            break;
        case "top-right-bottom-left":
            tooltipPos = { top: y1 - tooltipHeight - safetyOffset, left: x1 + safetyOffset };
            break;
        case "middle-right-middle-left":
            tooltipPos = { top: y1 - tooltipHeight / 2, left: x1  + safetyOffset };
            break;
        case "bottom-right-top-left":
            tooltipPos = { top: y1 + safetyOffset, left: x1 + safetyOffset};
            break;
        case "middle-bottom-middle-top":
            tooltipPos = { top: y1 + safetyOffset, left: x1 - tooltipWidth / 2};
            break;
        case "bottom-left-top-right":
            tooltipPos = { top: y1 + safetyOffset, left: x1 - tooltipWidth - safetyOffset};
            break;
        case "middle-left-middle-right":
            tooltipPos = { top: y1 - tooltipHeight / 2, left: x1 - tooltipWidth - safetyOffset};
            break;
        default:
            tooltipPos = { top: 0, left: 0 }; // Default to the bottom-right position
            break;
    }

    return tooltipPos;
}

function getPointCoordinates(element, point) {
    const rect = element.getBoundingClientRect();

    switch (point) {
        case "top-left":
            return [rect.left, rect.top];
        case "middle-top":
            return [rect.left + rect.width / 2, rect.top];
        case "top-right":
            return [rect.right, rect.top];
        case "middle-right":
            return [rect.right, rect.top + rect.height / 2];
        case "bottom-right":
            return [rect.right, rect.bottom];
        case "middle-bottom":
            return [rect.left + rect.width / 2, rect.bottom];
        case "bottom-left":
            return [rect.left, rect.bottom];
        case "middle-left":
            return [rect.left, rect.top + rect.height / 2];
        default:
            return [0, 0];
    }
}

}

function createClassicMenu(games_id){ //games = retro ou trails
	const mainMenuElement = document.getElementById("mainMenu");
	
	const Element = document.createElement("div");
	Element.classList.add("displayList", games_id);

	const GamesElement = document.createElement("div");
	GamesElement.id = games_id + "Games";
	GamesElement.classList.add("game");
	
	Object.entries(projectsList[games_id]).forEach(([key, value]) => {
		let games = "";
	
		Object.entries(value['games']).forEach(([keyGame, valueGame]) => {
			
			if(valueGame['patchVersion'] != '0') // Si un patch est disponible, on l'affiche
			{
				let imageURL = "https://cdn.akamai.steamstatic.com/steam/apps/" + valueGame['steamId'] + "/header.jpg";
				if(valueGame['steamId'] == -1) // Si le jeu est un jeu nom Steam, honte à vous ! Et on va chercher son image dans le dossier "images"
					imageURL = "images/" + valueGame['name'] + ".png";
				games = games + '<img class="game-icon" onclick="openProject(\''+games_id+'\', \'' + key + '\', \'' + keyGame + '\')" src="' + imageURL + '">';
				if(dataUser['projects'][valueGame["name"]] === undefined) // Si le projet n'existe pas dans les infos utilisateurs, on le créé
					dataUser['projects'][valueGame["name"]] = {"patch": null, "voice": null};
			}
		});
		if(games !== "") // Si pas de patch disponible, on affiche pas !
		{
			GamesElement.innerHTML = GamesElement.innerHTML + '<h1> <img src="images/' + value['icon'] + '.png">' + value['title'] + '</h1>' + games;			
			if (games_id == "trails"){
				//Pour les trails on ajoute aussi le mode map comme option d'affichage
				Element.setAttribute("id", "trails-menu");
				const buttonTrails = document.createElement("div");
				buttonTrails.innerHTML = '<img src="images/map_icon.png" id="trailsModeButton" onclick="switchTrailsMode(\'map\')" class="map-icon" style="position: absolute; top: 0; right: 25px; width: auto; height: 50px; border: none;">';
				mainMenuElement.appendChild(buttonTrails);
				
			}
		}
	});
	
	Element.appendChild(GamesElement);
	const firstChild = mainMenuElement.firstChild;
	mainMenuElement.insertBefore(Element, firstChild);
}


/*function logMousePosition(event) {
    const mouseX = event.clientX - 125;
    const mouseY = event.clientY;

    console.log(`Mouse Position: X = ${mouseX}, Y = ${mouseY}`);
}

// Add an event listener to log the mouse position when the mouse moves
document.addEventListener('mousemove', logMousePosition);*/

function selectFolder(){
	
	const showDialog = remote.dialog.showOpenDialogSync({
		properties: ['openDirectory']
	});
	if (showDialog && showDialog.length > 0) {
		installationPath = showDialog[0];
	} else {
	}
	onChangePath();
  }
  
function switchTrailsMode(mode){
	const modeButton = document.getElementById("trailsModeButton");
	const menu = document.getElementById("trails-menu");
	let map = document.getElementById("map-svg");

	
	if (mode == "map"){
		if (map == undefined){
			createMap();
			map = document.getElementById("map-svg");
		}
		map.style.display = "block";
		menu.style.display = "none";
		modeButton.src = "images/menu_icon.png";
		modeButton.onclick = function() {
				switchTrailsMode("menu");
			};
		currentTrailsMode = "map";
	}
	else{
		map.style.display = "none";
		menu.style.display = "block";
		modeButton.src = "images/map_icon.png";
		modeButton.onclick = function() {
				switchTrailsMode("map");
		};
		currentTrailsMode = "classic";
	}
	
	
}

function SDeckUpdateRegistry(){
	var nextStepRequired = true;
	try {
	  //const filePath = "C:\\Users\\Administrator\\Desktop\\user.reg";
	  const filePath = "Z:\\home\\deck\\.local\\share\\Steam\\steamapps\\compatdata\\"+gameLoaded["steamId"]+"\\pfx\\user.reg";
	  const targetKey = '[Software\\\\Wine\\\\DllOverrides]';
	  const newLineToAdd = '"dinput8"="native,builtin"';

	  const data = fs.readFileSync(filePath, 'utf8');

	  if (data.includes(targetKey)) {
		const startIndex = data.indexOf(targetKey);
		const nextKeyIndex = data.indexOf('[', startIndex + 1); 
		const endIndex = nextKeyIndex !== -1 ? nextKeyIndex : data.length;

		const targetBlockContent = data.slice(startIndex, endIndex);

		if (!targetBlockContent.includes('"dinput8"')) {
		  const modifiedBlockContent = `${targetBlockContent.trimRight()}\n${newLineToAdd}\n\n`;
		  const modifiedData = data.replace(targetBlockContent, modifiedBlockContent);
		  fs.writeFileSync(filePath, modifiedData, 'utf8');
		  nextStepRequired = false;
		} else {
		  nextStepRequired = false; //Existe déjà, donc pas besoin de faire autre chose
		}
	  } else {
		const newBlock = `${targetKey} 1696584635\n${newLineToAdd}\n\n`; 

		fs.appendFileSync(filePath, newBlock, 'utf8');
		nextStepRequired = false;
	  }
	} catch (err) {
	  nextStepRequired = false;
	}
	return nextStepRequired;
}

function showCurrentPicture() {
    var currentPictureSrc = document.getElementById('gamePicture').src;
    var modalImg = document.getElementById("modalImage");
    modalImg.src = currentPictureSrc;
    document.getElementById("gamePictureModal").style.display = "block";
}

function openInfo() {
  // Check if the InfoWindow already exists
  const container = document.getElementById('InfoWindow');
  const content = document.getElementById('infoContent');
  if (!content) {
    const newInfoWindow = document.createElement('div');
    newInfoWindow.innerHTML = config['iHtmlContent'];
    container.appendChild(newInfoWindow);
	let version = require('./package.json');
	$('.setupVersion').html('Version de l\'installateur : ' + version['version']);
    // Call openWindow function
    openWindow('InfoWindow');
  } else {
    openWindow('InfoWindow');
  }
}

function openSetupURL() {
	const setupURL = config['setupURL'];
	openinDefaultBrowser(setupURL);
}

function incrementDownloadCount(name) {
	const increment_url = config["domain"] + "/" + 'update_download_count.php';
	getFetch(increment_url, "POST", {"name": name}, false)
}