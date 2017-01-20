### Setup

#### Prerequisites
Need a spotify account (free account is fine!)
	- Get Client ID
	- Get Client Secret
	- Set Redirect URL (herokuappurl/callback)
Need a heroku app (free account as well!) (Needs providing credit card info to use redis for free!)
	- Set the environment
		- CLIENT_ID // from spotify app
		- CLIENT_SECRET // from spotify app
		- REDIRECT_URI // herokuappurl/callback
		- USER_ID // Your spotify user id
		- PLAYLIST_ID // Right click on your favorite spotify playlist and get the uri, the Id is there 
	- Install redis add-on

#### Steps

deploy this repo to your heroku app
```sh
heroku git:remote -a [heroku-app-name]
git push heroku master
```

Login with your spotify account
```
heroku-app-url/login
```

Test whether things work
```
heroku-app-url/playlistOfTheMonth
```

Now you can use the endpoint heroku-app-url/playlistOfTheMonth in your app!