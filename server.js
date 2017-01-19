try {
	require('./env');
} catch(e) {}

var http = require('http'); // Needed for dev, maybe remove it for prod
var https = require('https');
var url = require('url');

var client_id = process.env.CLIENT_ID;
var client_secret = process.env.CLIENT_SECRET;
var redirect_uri = process.env.REDIRECT_URI;

// Datastore lol
var STORE = {
	access_token: '',
	refresh_token: '',
	playlist: null,
	last_requested: '',
	playlist_id: '6OGpFu61I7Ylxj4AvkCavd', // January 2017
	user_id: 'juanandresnyc'

};

var REQUEST_PLAYLIST_INTERVAL = 3600;

function onToken(serverRes, resToken) {
  	if (resToken.statusCode === 200) {

	  	var body = '';
	  	resToken.setEncoding('utf8');
	  	resToken.on('data', function(chunk) { body += chunk; });
	  	resToken.on('end', function() {

	  		body = JSON.parse(body);

	  		STORE.access_token = body.access_token;
		  	STORE.refresh_token = body.refresh_token;

		  	requestPlaylist(serverRes);
	  	});
	  	resToken.on('error', function(err) {
	  		console.log(err);
	  		serverRes.end('issues with token response');
	  	})

	} else {
		// Issues with token response
		serverRes.writeHead(serverRes.statusCode);
		serverRes.end(serverRes.statusMessage);
	}
}

function onPlaylist(serverRes, playlistRes) {
	if (playlistRes.statusCode !== 200) {
		serverRes.writeHead(playlistRes.statusCode);
		return serverRes.end(playlistRes.statusMessage);
	}

	var body = '';
	playlistRes.setEncoding('utf8');      
  	playlistRes.on('data', function(chunk) { body += chunk; });

  	playlistRes.on('error', function(err) {
  		console.log(err);
  		serverRes.end('Something went wrong getting the playlist');
  	});

  	playlistRes.on('end', function() {
  		STORE.playlist = body;
  		serverRes.setHeader('Content-Type', 'application/json');
  		serverRes.end(STORE.playlist);
  	});
}


function requestPlaylist(serverRes) {
	var options = {
      hostname: 'api.spotify.com',
      path: '/v1/users/' + STORE.user_id + '/playlists/' + STORE.playlist_id,
      headers: {
      	'Authorization': 'Bearer ' + STORE.access_token,
      	'Content-Type': 'application/json',
      }
    };

    https.get(options, onPlaylist.bind(null, serverRes));
}

http.createServer(function(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");

	var urlObj = url.parse(req.url, true);
	var pathname = urlObj.pathname;

	if (pathname === '/playlistOfTheMonth') {

		if (STORE.playlist) {
			console.log('GETTING OLD DATA');
			res.end(STORE.playlist);
		} else {
			requestPlaylist(res);
		}
		// if (STORE.playlist || (last_requested && Date.now() - last_requested < REQUEST_PLAYLIST_INTERVAL)) {
		// 	res.end(playlist);
		// } else {
			// Get Playlist	
			// requestPlaylist(res);
		// }

	} else if (pathname === '/health') {
		res.end('Alive!'); // TODO
	} else if (pathname === '/login') {

		var state = 'state_' + (Math.random()*10000).toString();
		var scope = '';
		res.setHeader('cookie', 'spotify-cookie-key=' + state);
		res.writeHead(301, {Location: url.format('https://accounts.spotify.com/authorize?' +  
		    'response_type=code' +
		    '&client_id=' + client_id +
		    '&scope=' + scope +
		    '&redirect_uri=' + redirect_uri,
		    '&state=' + state
		)});
		res.end();

	} else if (pathname === '/callback') {
		var code = urlObj.query.code || null;
		var state = urlObj.query.state || null;
		var storedState = req.cookies ? req.cookies['spotify-cookie-key'] : null;

		if (false && (state === null || state !== storedState)) {
			res.writeHead(301, {Location: '/#error=state_mismatch'});
			res.end();
		} else {
			res.setHeader('cookie', '');

			var postData = url.format('code=' + code +
				'&redirect_uri=' + redirect_uri +
				'&grant_type=authorization_code');

			var authOptions = {
				method: 'POST',
				hostname: 'accounts.spotify.com',
				path: '/api/token',
				headers: {
					'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')),
					'Content-Type': 'application/x-www-form-urlencoded',
    				'Content-Length': postData.length
				}
			};

			var tokenReq = https.request(authOptions, onToken.bind(null, res));

			tokenReq.on('error', function(err) {
				console.log(err);
				res.end('Error getting the token');
			});

			tokenReq.write(postData);
			tokenReq.end();
		}
	} else {
		res.writeHead(400);
		res.end('Bad Request');
	}
}).listen(process.env.PORT || 8888);