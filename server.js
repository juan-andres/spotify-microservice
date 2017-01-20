try {
  require('./env'); // Only works for Dev
} catch(e) {}

var http = require('http'); // Needed for dev, maybe remove it for prod
var https = require('https');
var url = require('url');
var cookie = require('cookie');
var async = require('async');

// redis
// brew install redis
// ln -sfv /usr/local/opt/redis/*.plist ~/Library/LaunchAgents
// launchctl load ~/Library/LaunchAgents/homebrew.mxcl.redis.plist
var redis = require('redis');
var redisClient = redis.createClient(process.env.REDIS_URL);
redisClient.on('error', function (err) { console.log('Error', err); });
redisClient.set('user_id', 'juanandresnyc', redis.print);
redisClient.set('playlist_id', '6OGpFu61I7Ylxj4AvkCavd', redis.print); // January 2017
redisClient.set('last_refresh', new Date().toISOString(), redis.print);

var client_id = process.env.CLIENT_ID;
var client_secret = process.env.CLIENT_SECRET;
var redirect_uri = process.env.REDIRECT_URI;

// Datastore lol
var STORE = {
  playlist: null
};

var REQUEST_PLAYLIST_INTERVAL = 1000 * 60 * 5; // every 5 mins

setInterval(function automaticRefresh() {
  async.parallel([
    function (next) { redisClient.get('last_refresh', next); },
    function (next) { redisClient.get('expires_in', next); },
    function (next) { redisClient.get('refresh_token', next); }
  ], function(err, results) {
      if (err) return;
      var diff = new Date() - new Date(results[0]);
      if (diff > (results[1] * 1000)) {
        refreshTokenHandler(results[2], null, null, function(err, authRaw) {
          if (err) return console.log(err);

          console.log('refreshed access token!');
          var auth = JSON.parse(authRaw);
          redisClient.set('access_token', auth.access_token, redis.print);
        });
      }
  });
}, 1000 * 60 * 1); // every 10 minutes

function onResponse(response, callback) {
  var body = [];
  response.on('data', function(chunk) { body.push(chunk); });
  response.on('error', callback);
  response.on('end', function() {
    callback(null, Buffer.concat(body).toString())
  });
}

function requestPlaylist(userId, playlistId, accessToken, req, res, callback) {

  var options = {
    hostname: 'api.spotify.com',
    path: '/v1/users/' + userId + '/playlists/' + playlistId,
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    }
  };

  https.get(options, function(response) {
    if (response.statusCode === 200) {
      onResponse(response, callback);
    } else {
      res.writeHead(response.statusCode);
      res.end(response.statusMessage);
      callback(new Error('Something went wrong requesting the playlist'));
    }
  });
};

function callbackHandler(code, state, req, res, callback) {
  var cookies = cookie.parse(req.headers.cookie);
  var storedState = cookies ? cookies['spotify-cookie-key'] : null;

  if (state === null || state !== storedState) {
    res.writeHead(301, {'Location': '/#error=state_mismatch'});
    res.end();
  } else {
    res.setHeader('Set-Cookie', 'spotify-cookie-key=cleared'); // TODO Test this clearing

    var postData = url.format(
      'code=' + code +
      '&redirect_uri=' + redirect_uri +
      '&grant_type=authorization_code'
    );

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

    var authReq = https.request(authOptions, function(response) {
      if (response.statusCode === 200) {
        onResponse(response, callback);
      } else {
        res.writeHead(response.statusCode);
        res.end(response.statusMessage);
        callback(new Error('Something went wrong authenticating'));
      }
    });

    authReq.on('error', callback);
    authReq.write(postData);
    authReq.end();
  }
}

function refreshTokenHandler(refreshToken, req, res, callback) {
  console.log('refreshing', refreshToken, STORE);
  var postData = url.format(
    'grant_type=refresh_token' +
    '&refresh_token=' + refreshToken
  );

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

  var refreshReq = https.request(authOptions, function(response) {
    if (response.statusCode === 200) {
      onResponse(response, callback);
    } else {
      if (res) {
        res.writeHead(response.statusCode);
        res.end(response.statusMessage);  
      }
      callback(new Error('Something went wrong refreshing'));
    }
  });

  refreshReq.on('error', callback);
  refreshReq.write(postData);
  refreshReq.end();
}

function onRequest(req, res) {
  // We need this for github.io to call our heroku app
  res.setHeader("Access-Control-Allow-Origin", "*"); 
  var urlObj = url.parse(req.url, true);
  
  switch (urlObj.pathname) {
  case '/playlistOfTheMonth':
    async.parallel([
      function(next) { redisClient.get('last_requested', next); },
      function(next) { redisClient.get('user_id', next); },
      function(next) { redisClient.get('playlist_id', next); },
      function(next) { redisClient.get('access_token', next); }
    ], function(err, results) {
      if (err) {
        console.log(err);
        res.writeHead(400);
        res.end('Issues with redis');
        return;
      }

      if (results[0] && STORE.playlist &&  (new Date() - new Date(results[0]) < REQUEST_PLAYLIST_INTERVAL) ) {
        res.setHeader('Content-Type', 'application/json');
        res.end(STORE.playlist);
      } else {
        requestPlaylist(results[1], results[2], results[3], req, res, function(err, playlistRaw) {
          if (err) {
            console.log(err);
            return;
          }

          redisClient.set('last_requested', new Date().toISOString(), redis.print);
          STORE.playlist = playlistRaw;

          res.setHeader('Content-Type', 'application/json');
          res.end(STORE.playlist);
        }); 
      }

    });
    break;
  case '/health':
    res.writeHead(200);
    res.end(STORE.playlist ? 'Good' : 'Ughhhhh');
    break;
  case '/login':
    var state = 'state_' + (Math.random()*10000).toString();
    var scope = ''; // For a given playlist, no scope is needed
    var authUrl = url.format(
      'https://accounts.spotify.com/authorize?' +  
      'response_type=code' +
      '&client_id=' + client_id +
      '&scope=' + scope +
      '&redirect_uri=' + redirect_uri +
      '&state=' + state
    );
    res.writeHead(301, {
      'Location': authUrl,
      'Set-Cookie': 'spotify-cookie-key=' + state
    });
    res.end();
    break;
  case '/callback':
    var code = urlObj.query.code || null;
    var state = urlObj.query.state || null;
    callbackHandler(code, state, req, res, function(err, authRaw) {
      if (err) {
        console.log(err);
        return;
      }
      
      var auth = JSON.parse(authRaw);

      redisClient.set('access_token', auth.access_token, redis.print);
      redisClient.set('refresh_token', auth.refresh_token, redis.print);
      redisClient.set('last_refresh', new Date().toISOString(), redis.print);
      redisClient.set('expires_in', auth.expires_in, redis.print);

      res.writeHead(200);
      res.end('Auth completed!');
    });
    break;
  case '/refresh_token':
    redisClient.get('refresh_token', function(err, refresh_token) {
      if (err) return console.log(err);

      refreshTokenHandler(urlObj.query.refresh_token || refresh_token, req, res, function(err, authRaw) {
        if (err) return console.log(err);

        var auth = JSON.parse(authRaw);
        redisClient.set('access_token', auth.access_token, redis.print);
        res.writeHead(200);
        res.end('Auth refresh completed!');
      });
    });
    break;
  default:
    res.writeHead(400);
    res.end('Bad Request');
  }
}

http
  .createServer(onRequest)
  .listen(process.env.PORT || 8888);