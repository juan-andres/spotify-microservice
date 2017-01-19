var http = require('http');
var url = require('url');

// Datastore lol
var store = {
	access_token: '',
	refresh_token: '',
	playlist: null,
	last_requested: ''
};

http.createServer(function(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	if (req.url === '/playlistOfTheMonth') {
		res.end('January2017');
	} else if (req.url === '/health') {
		res.end('Alive!');
	} else {
		res.writeHead(400);
		res.end('Bad Request');
	}
}).listen(process.env.PORT || 8888);