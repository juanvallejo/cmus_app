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
*       - appbuilder    -> telerik cli tools
*
* TODO: Keep track of tracks requested to be played in order
*		to enable forward / backward functionality
* TODO: Announce received commands via WebSocket to all clients
*/

var serverIsInDebugMode = true;								// false if app is running on production server | true
															// if app is running on test server

// declare runtime constants

var CMUS_HOST 	= '0.0.0.0';								// host running cmus (with --listen <host>)
var CMUS_PASS	= 'password';								// cmus server password
var CMUS_PORT	= 8000;										// port cmus server listens on

var APP_PORT	= 8080;										// port app server will listen on
var APP_HOST	= '0.0.0.0';								// localhost address for hosting app server
var APP_INDEX	= 'views/main.html'							// defines location of main 'index.html' document

// import dependencies and working modules

var fs		= require('fs');
var http	= require('http');
var exec	= require('child_process').exec;

// begin environment setup logic; alter environment constants, etc.

if(serverIsInDebugMode) {
	CMUS_HOST = '192.168.1.7';
}

// declare url request router
// routes all requests to corresponding functions
var httpRequestRouter = {
	// dictionary of  key and values for handling client requests
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

		console.log(stdout);
	});

}

/**
 * @router destination
 * handles requests for root of app '/'
 */
function serveCmusCommand(request, response) {

}

/**
 * @router destination
 * handles requests for app request of playlist data
 */
function serveCmusPlaylistData() {

}

/**
 * @router destination
 * handles requests for and serves static files
 */
function serveStaticFile(request, response, staticFileDestinationOverride) {

	var staticFilePath = staticFileDestinationOverride || request.url;

	// fetch file from the filesystem
	fs.readFile(__dirname + '/' + staticFilePath, function(err, data) {

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
 * handles requests for root of app '/'
 */
function handleCmusCommand(request, response) {

}

/**
 * @utility command-line
 * Handles direct interaction with cmus-remote on command-line
 */
function CmusRemote(flag, command, callback) {

	// handle command parsing
	if(!flag) {
		return console.log('<cmus-remote-error> a flag argument is required.');
	}

	if(command) {
		command = " '" + command + "'";
	} else {
		command = '';
	}

	exec('cmus-remote --server ' + CMUS_HOST + ':' + CMUS_PORT + ' --passwd ' + CMUS_PASS + ' ' + flag + command, function(err, stdout, stderr) {
		callback.call(this, err, stdout, stderr);
	});

}

/**
 * @utility command-line
 * Handles direct interaction with youtube-dl on command-line
 */
function YoutubeDl(flags, command, callback) {

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