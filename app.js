/**
* Provided under the MIT License (c) 2014
* See LICENSE @file for details.
*
* @file app.js
*
* @author juanvallejo
* @date 12/30/14
*
* Handles audio processing, relays interface commands to cmus server.
* Serves main web interface for music-server (running cmus) on port 8080.
*
* Note: @callback_params refer to parameters passed to a lambda function
*
* Important: Requires the following dependencies / node.js packages for local testing:
*
*       - socket.io 	-> node.js socket package
*
* TODO: Keep track of tracks requested to be played in order
*		to enable forward / backward functionality
* TODO: Announce received commands via WebSocket to all clients
*/

var serverIsInDebugMode = false;								// false if app is running on production server | true
																// if app is running on test server

// declare runtime constants

var CMUS_HOST 		= '0.0.0.0';								// host running cmus (with --listen <host>)
var CMUS_PASS		= 'password';								// cmus server password
var CMUS_PORT		= 8000;										// port cmus server listens on

var APP_PORT		= 8080;										// port app server will listen on
var APP_HOST		= '0.0.0.0';								// localhost address for hosting app server
var APP_INDEX		= 'views/main.html';						// defines location of main 'index.html' document
var APP_PLAYLIST	= 'test.pl';							// defines location of main playlist file
var APP_TEMP		= '/root/Music/youtube-downloads/temp.mp4';	// defines location of temporary youtube files

// import dependencies and working modules

var fs		= require('fs');
var http	= require('http');
var exec	= require('child_process').exec;
var os 		= require('os');

// begin environment setup logic; alter environment constants, etc.

if((os.hostname() != 'crunchbang2' && process.argv[2] != '--force-no-debug') || process.argv[2] == 'debug') {

	console.log('WARN Debug mode is on.')

	serverIsInDebugMode = true;

	APP_PLAYLIST		= __dirname + '/test.pl';
	APP_TEMP			= __dirname + '/static/temp/temp.mp4'

	CMUS_HOST 			= '192.168.1.7';

}

// declare runtime environment variables

var queueOfPlayedFiles = [];

// declare url request router
// routes all requests to corresponding functions
var httpRequestRouter = {

	'/'						: serveAppIndex,
	'/cmd'					: handleCmusCommand,
	'/status'				: serveCmusStatus,
	'/static_file'			: serveStaticFile,
	'/get_playlist_data'	: serveCmusPlaylistData

};

// declare mime type definitions dictionary.
// looks up file mime type according to file extension
var fileMimeTypeDefinitionsFromFileExtension = {
	'css'	: 'text/css',
	'gif'	: 'image/gif',
	'html'	: 'text/html',
	'ico'	: 'image/x-ico',
	'jpg'	: 'image/jpeg',
	'jpeg'	: 'image/jpeg',
	'json'	: 'application/json',
	'js'	: 'application/javascript',
	'pl'	: 'text/plain',
	'png'	: 'image/png',
	'txt'	: 'text/plain'
};

// holds definitions to route specific file requests to
// different destinations
var staticFileRequestRouter = {

};

// declare main router request functions

/**
 * @router destination
 * handles requests for root of app '/'
 */
function serveAppIndex(request, response) {
	// serve main index interface file
	serveStaticFile(request, response, APP_INDEX);
}

/**
 * @router destination
 * handles requests for app request '/status'
 */
function serveCmusStatus(request, response) {
	
	CmusRemote('-Q', null, function(err, stdout, stderr) {
		if(err) {
			return console.log('<Cmus-Remote> An error occurred executing the status command -> ' + err);
		}

		var cmusStatusResponseAsJSON	= {};
		var cmusStatusResponse			= stdout.split('\n');

		cmusStatusResponseAsJSON['playing'] = false;

		// set 'playing' flag to a boolean value
		if(cmusStatusResponse[0].split(' ')[1] == 'playing') {
			cmusStatusResponseAsJSON['playing'] = true;
		}

		delete cmusStatusResponse[0];

		cmusStatusResponse.forEach(function(property) {

			var propertyKeyValues = property.split(' ');

			// filter out empty key-value pairs
			if(propertyKeyValues == '') {
				return;
			}

			if(propertyKeyValues[2] || propertyKeyValues[0] == 'file') {

				var startingValueIndex				= 2;
				var offsetKeyIndex					= 1;
				var secondValueToBeJoinedBySpaces 	= [];

				if(propertyKeyValues[0] == 'file') {
					startingValueIndex 	= 1;
					offsetKeyIndex	 	= 0;
				}

				// join second value with spaces
				for(var i = startingValueIndex; i < propertyKeyValues.length; i++) {
					secondValueToBeJoinedBySpaces.push(propertyKeyValues[i]);
				}

				// add to JSON response
				cmusStatusResponseAsJSON[propertyKeyValues[offsetKeyIndex]] = secondValueToBeJoinedBySpaces.join(' ');
			} else {
				// add key-value pair to JSON response
				cmusStatusResponseAsJSON[propertyKeyValues[0]] = propertyKeyValues[1];
			}
		});

		// send response back to client
		response.writeHead(200, {
			'Content-Type': 'application/json'
		});

		response.end(JSON.stringify(cmusStatusResponseAsJSON));
	});

}

/**
 * @router destination
 * handles requests for app request of playlist data
 */
function serveCmusPlaylistData(request, response) {
	serveStaticFile(request, response, APP_PLAYLIST);
}

/**
 * @router destination
 * handles requests for and serves static files
 */
function serveStaticFile(request, response, staticFileDestinationOverride) {

	var staticFilePath = staticFileDestinationOverride || __dirname + '/' + request.url;

	// fetch file from the filesystem
	fs.readFile(staticFilePath, function(err, data) {

		if(err) {
			console.log('<File-System> An error occurred reading from file ' + staticFilePath + ' -> ' + err);

			response.writeHead(404);
			return response.end('404. File not found.');
		}

		response.writeHead(200, {
			'Content-Type': getStaticFileMimeTypeFromExtension(staticFilePath)
		});

		response.end(data);
	});

	function getStaticFileMimeTypeFromExtension(pathToFile) {

		// obtain file extension
		var fileExtension 	= pathToFile.split('.');
		fileExtension 		= fileExtension[fileExtension.length - 1];

		var fileMimeType 	= fileMimeTypeDefinitionsFromFileExtension[fileExtension];

		if(!fileMimeType) {
			fileMimeType = 'text/plain';
		}

		return fileMimeType;
	}
}

/**
 * @router destination
 * handles command requests posted through the '/cmd' request
 */
function handleCmusCommand(request, response) {
	
	var postData 	= '';
	var commandData = '';

	var commandResponseAsJSON = {
		'result': '0',
		'output': ''
	};

	request.on('data', function(chunk) {
		postData += chunk;
	});

	request.on('end', function() {

		var postDataVars 	= postData.split('&');
		var command 		= postDataVars[0].split('=')[1];
		var commandData 	= '0';

		command = command.replace(/\+/gi, ' ');

		// check to see if command data was received
		if(postDataVars[1]) {
			commandData = decodeURIComponent(postDataVars[1].split('=')[1]);
			commandData = commandData.replace(/\+/gi, ' ').replace(/\'/gi, "'\"'\"'");

		}

		var cmusCommandFromKeyword = {
			'Play' 				: 'player-play',
			'Stop' 				: 'player-stop',
			'Pause' 			: 'player-pause',
			'Next' 				: 'player-next',
			'Previous' 			: 'player-prev',
			'Increase Volume' 	: 'vol +5%',
			'Reduce Volume' 	: 'vol -5%',
			'Mute' 				: 'vol 0',
			'Set Volume' 		: 'vol ' + commandData,
			'Search' 			: '/' + commandData,
			'Filter' 			: 'filter ' + commandData,
		};

		if(cmusCommandFromKeyword[command]) {

			if(command == 'Filter') {

				CmusRemote('-C', cmusCommandFromKeyword[command]);
            	CmusRemote('-C', 'win-add-q');
            	CmusRemote('-C', 'player-next');
            	CmusRemote('-C', 'filter');

            	// send response to client
				response.writeHead(200, {
					'Content-Type': 'application/json'
				});

				response.end(JSON.stringify(commandResponseAsJSON));

            } else {
            	CmusRemote('-C', cmusCommandFromKeyword[command], function(err, stdout, stderr) {
            		if(err) {
						return console.log('ERR CMUS An error occurred executing the specified command -> ' + err);
					}

					commandResponseAsJSON.output = stdout;

					// send response to client
					response.writeHead(200, {
						'Content-Type': 'application/json'
					});

					response.end(JSON.stringify(commandResponseAsJSON));
				});
        	}			
		} else {

			commandResponseAsJSON.result = '1';

			if(command == 'YouTube') {

				console.log('This is a work in progress');

			} else if(command == 'YouTube-DL') {

				YoutubeDl(commandData, function(err, stdout, stderr) {

					if(err) {
						return console.log('ERR YTDL', err);
					}

					if(serverIsInDebugMode) {
						console.log('<Server-Debug> Ignoring request to add YouTube source audio to queue.');

						response.writeHead(200, {
							'Content-Type': 'application/json'
						});

						return response.end(JSON.stringify(commandResponseAsJSON));
					}

					// add downloaded youtube-video audio to queue
					CmusRemote('-C', 'add -q ' + APP_TEMP, function(err, stdout, stderr) {
	            		if(err) {
							return console.log('ERR CMUS An error occurred executing the specified command -> ' + err);
						}

						CmusRemote('-C', 'player-next');
            			CmusRemote('-C', 'filter');

						commandResponseAsJSON.result = '0';
						commandResponseAsJSON.output = stdout;

						// send response to client
						response.writeHead(200, {
							'Content-Type': 'application/json'
						});

						response.end(JSON.stringify(commandResponseAsJSON));
					});
				});

			} else {
				// send response to client
				response.writeHead(200, {
					'Content-Type': 'application/json'
				});

				response.end(JSON.stringify(commandResponseAsJSON));
			}
		}

	});
}

/**
 * @utility command-line
 * Handles direct interaction with cmus-remote on command-line
 */
function CmusRemote(flag, command, callback) {

	// handle command parsing
	if(!flag) {
		return console.log('ERR CMUS a flag argument is required.');
	}

	if(command) {
		command = ' \'' + command + '\'';
	} else {
		command = '';
	}

	exec('cmus-remote --server ' + CMUS_HOST + ':' + CMUS_PORT + ' --passwd ' + CMUS_PASS + ' ' + flag + command, function(err, stdout, stderr) {

		if(typeof callback == 'function') {
			callback.call(this, err, stdout, stderr);
		}

	});

}

/**
 * @utility command-line
 * Handles direct interaction with youtube-dl on command-line
 */
function YoutubeDl(videoURL, callback) {
	// handle command parsing
	if(!videoURL) {
		return console.log('ERR CMUS a video URL argument is required.');
	}

	exec('youtube-dl -x --audio-quality 0 --exec "mv {} ' + APP_TEMP + '" ' + videoURL, function(err, stdout, stderr) {

		if(typeof callback == 'function') {
			callback.call(this, err, stdout, stderr);
		}

	});
}

// create web-interface server, run main app loop
http.createServer(function(request, response) {
	// check to see that handling exists in router
	// for current request

	if(httpRequestRouter[request.url]) {
		// if router has handler for current request, let router handle it
		httpRequestRouter[request.url].call(this, request, response);
	} else {
		// else treat request as request for filesystem file
		httpRequestRouter['/static_file'].call(this, request, response);
	}

}).listen(APP_PORT, APP_HOST);